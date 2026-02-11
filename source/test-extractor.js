import { executeAgent, validateFilePath } from './ai-runner.js';
import { createError } from 'error-causes';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

/**
 * Test Extractor Module
 * 
 * ARCHITECTURE OVERVIEW: Two-Phase Extraction with Template-Based Evaluation
 * 
 * This module solves a critical problem in AI prompt testing: how to reliably
 * extract individual assertions from multi-assertion test files and execute
 * them in isolated contexts while guaranteeing consistent response formats.
 * 
 * The Problem:
 * - Multi-assertion test files share LLM attention context
 * - Earlier assertions influence later ones (test isolation violation)
 * - Asking LLMs to create "self-evaluating prompts" produces inconsistent formats
 * - Inconsistent formats break test aggregation ({passed: boolean} required)
 * 
 * The Solution - Two-Phase Architecture:
 * 
 * Phase 1: Structured Extraction (buildExtractionPrompt)
 * - LLM parses test file into structured data: {id, description, userPrompt, requirement}
 * - Returns metadata only, NOT executable prompts
 * - Allows inspection and validation of extracted data
 * 
 * Phase 2: Template-Based Evaluation (buildEvaluationPrompt)
 * - Transform metadata into controlled, testable evaluation prompts
 * - Template guarantees {passed: boolean, output: string} response format
 * - Inject promptUnderTest context from imports
 * - Enable deterministic, reliable test execution
 * 
 * Why Template-Based Instead of LLM-Generated Prompts?
 * 1. Reliability: Templates produce consistent prompt structure
 * 2. Testability: Template output is deterministic and verifiable
 * 3. Debuggability: Easy to inspect/modify evaluation prompt format
 * 4. Maintainability: Changes require code updates (explicit, versioned)
 * 
 * Historical Context:
 * - Initial implementation asked extraction agents to create evaluation prompts
 * - Result: Agents returned markdown strings instead of {passed: boolean} objects
 * - Root cause: No control over what instructions agents would include
 * - Fix: This two-phase architecture with controlled templates
 * 
 * This pattern is common in production LLM systems where reliability and
 * predictability are more important than flexibility.
 */

/**
 * Build a prompt that instructs an LLM agent to extract individual
 * assertions from a multi-assertion test file.
 *
 * IMPORTANT: This extraction prompt asks the agent to return STRUCTURED DATA,
 * not executable prompts. This is a deliberate architectural decision:
 *
 * Why not ask the extraction agent to create executable prompts?
 * 1. Reliability: Extraction agents may create prompts in inconsistent formats
 * 2. Format control: We need guaranteed JSON response format ({passed: boolean})
 * 3. Testability: Template-based prompts are deterministic and testable
 * 4. Debugging: Structured data allows us to inspect what was extracted
 *
 * Instead, we use a two-phase approach:
 * Phase 1 (this function): Extract structured metadata (userPrompt, requirement, importPaths)
 * Phase 2: Transform metadata into executable prompts for result and judge agents
 *
 * This pattern solved the critical bug where extraction agents would create
 * prompts that returned markdown strings instead of {passed: boolean} objects.
 *
 * @param {string} testContent - The raw contents of the test file
 * @returns {string} An extraction prompt for the agent
 */
export const buildExtractionPrompt = (testContent) => {
  return `You are a test extraction agent. Analyze the following test file and extract structured information.

For each assertion or requirement in the test file (these may be formatted as
"Given X, should Y", bullet points, YAML entries, natural language sentences,
SudoLang expressions, or any other format):

1. Identify the userPrompt (the prompt to be tested)
2. Extract the specific requirement from the assertion
3. Identify any import file paths (e.g., import 'path/to/file.mdc')

Return a JSON object with:
- "userPrompt": the test prompt to execute (string)
- "importPaths": array of import file paths found in the test file (e.g., ["ai/rules/ui.mdc"])
- "assertions": array of assertion objects, each with:
  - "id": sequential integer starting at 1
  - "description": the full assertion text
  - "requirement": the specific requirement being tested

Return ONLY valid JSON. No markdown fences, no explanation.

<test-file-contents>
${testContent}
</test-file-contents>`;
};

/**
 * Build a result prompt that instructs an LLM to execute a user prompt
 * and return plain text output (no JSON, no evaluation).
 *
 * This is part of the two-agent refactor where:
 * - Result agent (this prompt): Execute the user prompt, return plain text
 * - Judge agent (separate prompt): Evaluate the result against requirements
 *
 * @param {Object} options
 * @param {string} options.userPrompt - The test prompt to execute
 * @param {string} [options.promptUnderTest] - Optional context/guide for execution
 * @returns {string} A prompt for the result agent
 */
export const buildResultPrompt = ({ userPrompt, promptUnderTest }) => {
  const contextSection = promptUnderTest
    ? `CONTEXT (Prompt Under Test):\n${promptUnderTest}\n\n`
    : '';

  return `You are an AI assistant. Execute the following prompt and return your response.

${contextSection}USER PROMPT:
${userPrompt}

INSTRUCTIONS:
1. Execute the user prompt above${promptUnderTest ? ', following the guidance in the prompt under test' : ''}
2. Return your complete response as plain text

Respond naturally. Do NOT wrap your response in JSON, markdown fences, or any other structure.
Your entire output IS the result.`;
};

/**
 * Build a judge prompt that instructs an LLM to evaluate a specific result
 * against a single requirement. Returns TAP YAML diagnostic format.
 *
 * This is part of the two-agent refactor where:
 * - Result agent: Execute the user prompt, return plain text
 * - Judge agent (this prompt): Evaluate the result against ONE requirement
 *
 * @param {Object} options
 * @param {string} options.userPrompt - The original user prompt that produced the result
 * @param {string} options.promptUnderTest - The imported prompt content (context/guide)
 * @param {string} options.result - The raw output from the result agent (plain text)
 * @param {string} options.requirement - The specific requirement to evaluate
 * @param {string} options.description - Full assertion text
 * @returns {string} A prompt for the judge agent
 */
export const buildJudgePrompt = ({ userPrompt, promptUnderTest, result, description }) => {
  return `You are an AI judge. Evaluate whether a given result satisfies a specific requirement.

CONTEXT (Prompt Under Test):
${promptUnderTest}

ORIGINAL USER PROMPT:
${userPrompt}

ACTUAL RESULT TO EVALUATE:
${result}

REQUIREMENT:
${description}

INSTRUCTIONS:
1. Read the actual result above
2. Determine whether it satisfies the requirement
3. Summarize what was actually produced (actual) vs what was expected (expected)
4. Assign a quality score from 0 (completely fails) to 100 (perfectly satisfies)

Return your judgment as a TAP YAML diagnostic block:
---
passed: true
actual: "summary of what was produced"
expected: "what was expected"
score: 85
---

CRITICAL: Return ONLY the TAP YAML block. Start with --- on its own line,
end with --- on its own line. No markdown fences, no explanation outside the block.`;
};

/**
 * Parse the judge agent's TAP YAML diagnostic output into a structured object.
 *
 * @param {string} output - Raw output from judge agent containing TAP YAML block
 * @returns {{ passed: boolean, actual: string, expected: string, score: number }}
 * @throws {Error} If no valid TAP YAML block found
 */
export const parseTAPYAML = (output) => {
  const match = output.match(/^---\s*\n([\s\S]*?)\n---\s*$/m);
  if (!match) {
    throw createError({
      name: 'ParseError',
      message: 'Judge output does not contain a valid TAP YAML block (--- delimited)',
      code: 'JUDGE_INVALID_TAP_YAML',
      rawOutput: output
    });
  }

  const yaml = match[1];
  const lines = yaml.split('\n');
  const result = {};

  for (const line of lines) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (kvMatch) {
      const [, key, rawValue] = kvMatch;
      // Strip surrounding quotes if present
      const value = rawValue.replace(/^["']|["']$/g, '').trim();
      if (key === 'passed') result.passed = value === 'true';
      else if (key === 'score') result.score = Number(value);
      else result[key] = value;
    }
  }

  return result;
};


const assertionRequiredFields = ['id', 'description', 'requirement'];

/**
 * Extract JSON from markdown code fences if present.
 * @param {string} str - String that might contain markdown code fences
 * @returns {string} Extracted JSON string
 */
const extractJSONFromMarkdown = (str) => {
  // Match ```json\n...\n``` or ```\n...\n```
  const match = str.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  return match ? match[1] : str;
};

/**
 * Try to parse a string as JSON, extracting from markdown code fences if needed.
 * @param {string} str - String to parse as JSON
 * @returns {any} Parsed JSON
 * @throws {Error} If parsing fails
 */
const tryParseJSON = (str) => {
  try {
    const cleaned = extractJSONFromMarkdown(str);
    return JSON.parse(cleaned);
  } catch {
    throw new Error('Failed to parse extraction result as JSON');
  }
};

/**
 * Parse and validate extraction output from the agent.
 * Accepts either a raw JSON string or an already-parsed object
 * (since executeAgent returns parsed JSON).
 * Handles markdown code fences if present.
 *
 * @param {string|Object} rawOutput - Raw string or parsed output from the agent
 * @returns {{ userPrompt: string, importPaths: string[], assertions: Array<{ id: number, description: string, requirement: string }> }}
 * @throws {Error} If output is invalid or missing required fields
 */
export const parseExtractionResult = (rawOutput) => {
  const parsed = typeof rawOutput === 'string'
    ? tryParseJSON(rawOutput)
    : rawOutput;

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Extraction result must be a JSON object');
  }

  if (parsed.userPrompt === undefined || parsed.userPrompt === null) {
    throw new Error('Extraction result is missing required field: userPrompt');
  }

  if (!Array.isArray(parsed.importPaths)) {
    throw new Error('Extraction result is missing required field: importPaths (must be an array)');
  }

  if (!Array.isArray(parsed.assertions)) {
    throw new Error('Extraction result is missing required field: assertions (must be an array)');
  }

  // for loop preferred: early throw on first invalid item avoids
  // processing the rest, and the index is needed for the error message.
  for (let i = 0; i < parsed.assertions.length; i++) {
    for (const field of assertionRequiredFields) {
      if (parsed.assertions[i][field] === undefined || parsed.assertions[i][field] === null) {
        throw new Error(`Assertion at index ${i} is missing required field: ${field}`);
      }
    }
  }

  return parsed;
};

/**
 * Extract individual test assertions from a multi-assertion test file
 * by calling an LLM agent with a specialized extraction prompt.
 *
 * ARCHITECTURE: Agent-Directed Imports + Structured Data Return
 *
 * This function implements the complete extraction pipeline:
 *
 * Phase 1: Structured Extraction
 * - Call extraction agent to parse test file into structured data
 * - Agent DECLARATIVELY identifies import paths (replaces parseImports regex)
 * - Get: {userPrompt, importPaths, assertions[{id, description, requirement}]}
 *
 * Phase 1.5: Import Resolution
 * - Read agent-identified import files
 * - Validate import paths against project root
 * - Concatenate imported content into promptUnderTest
 *
 * Phase 2: Return Structured Data
 * - Return {userPrompt, promptUnderTest, assertions}
 * - NO buildEvaluationPrompt mapping (two-agent refactor handles this separately)
 *
 * Import handling:
 * - Agent identifies import file paths declaratively (no regex parsing)
 * - Import syntax: `import 'path'` (not `import @var from 'path'`)
 * - Resolves paths relative to project root (cwd)
 * - Validates paths to prevent path traversal
 * - Reads and concatenates imported file contents
 *
 * Validation:
 * - Missing promptUnderTest → ValidationError MISSING_PROMPT_UNDER_TEST
 * - Missing userPrompt → ValidationError MISSING_USER_PROMPT
 * - No assertions → ValidationError NO_ASSERTIONS_FOUND
 * - Missing import file → ValidationError PROMPT_READ_FAILED (with cause)
 *
 * @param {Object} options
 * @param {string} options.testContent - Raw contents of the test file
 * @param {string} [options.testFilePath] - Path to the test file (for resolving imports)
 * @param {Object} options.agentConfig - Agent CLI configuration
 * @param {number} [options.timeout=300000] - Timeout in milliseconds
 * @param {boolean} [options.debug=false] - Enable debug logging
 * @returns {Promise<{ userPrompt: string, promptUnderTest: string, assertions: Array<{ id: number, description: string, requirement: string }> }>}
 */
export const extractTests = async ({ testContent, testFilePath, agentConfig, timeout = 300000, debug = false }) => {
  // PHASE 1: Extract structured data from test content
  // The extraction agent returns {userPrompt, importPaths, assertions}
  const extractionPrompt = buildExtractionPrompt(testContent);

  if (debug) {
    console.error('[DEBUG] Calling extraction agent...');
  }

  const result = await executeAgent({ agentConfig, prompt: extractionPrompt, timeout, debug });
  const extracted = parseExtractionResult(result);

  if (debug) {
    console.error(`[DEBUG] Extraction complete. Found ${extracted.assertions.length} assertions`);
  }

  // PHASE 1.5: Resolve agent-identified imports
  // The agent declaratively identifies import paths; we read the files
  let promptUnderTest = '';
  if (testFilePath && extracted.importPaths.length > 0) {
    if (debug) {
      console.error(`[DEBUG] Found ${extracted.importPaths.length} imports to resolve`);
    }
    const projectRoot = process.cwd();
    const importedContents = await Promise.all(
      extracted.importPaths.map(async importPath => {
        // Resolve import paths relative to project root
        const resolvedPath = resolve(projectRoot, importPath);
        if (debug) {
          console.error(`[DEBUG] Reading import: ${importPath} -> ${resolvedPath}`);
        }
        // Validate import path to prevent path traversal attacks
        try {
          validateFilePath(resolvedPath, projectRoot);
        } catch (error) {
          throw createError({
            name: 'SecurityError',
            message: `Import path traversal detected: ${importPath}`,
            code: 'IMPORT_PATH_TRAVERSAL',
            path: importPath,
            resolvedPath,
            cause: error
          });
        }
        // Read file with error wrapping (preserves original error as cause)
        try {
          const content = await readFile(resolvedPath, 'utf-8');
          return content;
        } catch (originalError) {
          throw createError({
            name: 'ValidationError',
            message: `Failed to read imported prompt file: ${importPath}`,
            code: 'PROMPT_READ_FAILED',
            path: importPath,
            resolvedPath,
            cause: originalError
          });
        }
      })
    );
    promptUnderTest = importedContents.join('\n\n');
    if (debug) {
      console.error(`[DEBUG] Imported content length: ${promptUnderTest.length} characters`);
    }
  }

  // Validate required fields (fail fast on authoring errors)
  const { userPrompt, assertions } = extracted;

  if (!userPrompt || userPrompt.trim() === '') {
    throw createError({
      name: 'ValidationError',
      message: 'Test file does not define a userPrompt. Every test file must include a user prompt (inline or imported).',
      code: 'MISSING_USER_PROMPT',
      testFile: testFilePath
    });
  }

  if (!promptUnderTest || promptUnderTest.trim() === '') {
    throw createError({
      name: 'ValidationError',
      message: 'Test file does not declare a promptUnderTest import. Every test file must import the prompt under test.',
      code: 'MISSING_PROMPT_UNDER_TEST',
      testFile: testFilePath
    });
  }

  if (!assertions || assertions.length === 0) {
    throw createError({
      name: 'ValidationError',
      message: 'Test file does not contain any assertions. Every test file must include at least one assertion (e.g., "Given X, should Y").',
      code: 'NO_ASSERTIONS_FOUND',
      testFile: testFilePath
    });
  }

  // PHASE 2: Return validated structured data for two-agent execution
  return {
    userPrompt,
    promptUnderTest,
    assertions: assertions.map(({ id, description, requirement }) => ({
      id,
      description,
      requirement
    }))
  };
};
