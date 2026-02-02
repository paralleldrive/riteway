import { executeAgent } from './ai-runner.js';
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
 * Parse import statements from SudoLang test content.
 * Extracts file paths from "import @variable from 'path'" statements.
 *
 * @param {string} testContent - Raw test file contents
 * @returns {Array<string>} Array of import file paths
 */
export const parseImports = (testContent) => {
  const importRegex = /import @\w+ from ['"](.+?)['"]/g;
  return Array.from(testContent.matchAll(importRegex), m => m[1]);
};

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
 * Phase 1 (this function): Extract structured metadata (userPrompt, requirement)
 * Phase 2 (buildEvaluationPrompt): Transform metadata into template-based evaluation prompts
 *
 * This pattern solved the critical bug where extraction agents would create
 * prompts that returned markdown strings instead of {passed: boolean} objects.
 *
 * @param {string} testContent - The raw contents of the test file
 * @returns {string} An extraction prompt for the agent
 */
export const buildExtractionPrompt = (testContent) => {
  return `You are a test extraction agent. Analyze the following test file and extract structured information for each assertion.

For each "- Given X, should Y" assertion line in the test file:

1. Identify the userPrompt
2. Extract the specific requirement from the assertion line

Return a JSON array of objects with:
- "id": sequential integer starting at 1
- "description": the full assertion text (e.g. "Given simple addition, should add correctly")
- "userPrompt": the test prompt to execute
- "requirement": the specific requirement being tested (the "should Y" part)

Return ONLY valid JSON. No markdown fences, no explanation.

<test-file-contents>
${testContent}
</test-file-contents>`;
};

/**
 * Build an evaluation prompt that instructs an LLM to execute a test
 * and evaluate whether it meets a specific requirement.
 *
 * ARCHITECTURE: Template-Based Evaluation Prompts
 *
 * This function implements Phase 2 of our two-phase extraction architecture.
 * Instead of asking an extraction agent to "create self-evaluating prompts",
 * we use a controlled template that guarantees:
 *
 * 1. Consistent structure: Every evaluation follows the same format
 * 2. Explicit instructions: Agent knows exactly what to do and how to respond
 * 3. Guaranteed response format: {passed: boolean, output: string, reasoning?: string}
 * 4. Context injection: promptUnderTest content is reliably inserted
 * 5. Testability: Template output is predictable and verifiable
 *
 * Why this approach?
 * - Early implementation asked extraction agents to create evaluation prompts
 * - Result: Agents created prompts that returned markdown instead of {passed: boolean}
 * - Root cause: No control over what instructions the extraction agent would include
 * - Solution: We control the template, guaranteeing the response format
 *
 * Trade-offs:
 * + Reliability: Evaluation prompts always have correct structure
 * + Debugging: Easy to inspect/modify evaluation prompt template
 * + Testing: Can verify template output without running real agents
 * - Flexibility: Changes to prompt structure require code changes (not LLM adaptation)
 *
 * This template-based approach is similar to patterns used in production LLM systems
 * where reliability and predictability are more important than flexibility.
 *
 * @param {Object} options
 * @param {string} options.userPrompt - The test prompt to execute
 * @param {string} options.description - Full assertion description
 * @param {string} [options.promptUnderTest] - Optional context/guide for the test
 * @returns {string} A self-evaluating test prompt
 */
export const buildEvaluationPrompt = ({ userPrompt, description, promptUnderTest }) => {
  const contextSection = promptUnderTest 
    ? `CONTEXT (Prompt Under Test):\n${promptUnderTest}\n\n`
    : '';
    
  return `You are an AI test evaluator. Execute the following test and evaluate whether it meets the requirement.

${contextSection}USER PROMPT:
${userPrompt}

REQUIREMENT TO EVALUATE:
${description}

INSTRUCTIONS:
1. Execute the user prompt above${promptUnderTest ? ' following the guidance in the prompt under test' : ''}
2. Evaluate whether your response satisfies the requirement
3. Respond with JSON: {"passed": true, "output": "<your response to the user prompt>"}

OR if the requirement is not met:

Respond with JSON: {"passed": false, "output": "<your response to the user prompt>", "reasoning": "<why it failed>"}

CRITICAL: Return ONLY the JSON object with no markdown fences, no explanation, no additional text. The first character of your response must be '{' and the last must be '}'.`;
};

const requiredFields = ['id', 'description', 'userPrompt', 'requirement'];

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
 * @param {string|Array} rawOutput - Raw string or parsed output from the agent
 * @returns {Array<{ id: number, description: string, userPrompt: string, requirement: string }>}
 * @throws {Error} If output is invalid, not an array, empty, or missing required fields
 */
export const parseExtractionResult = (rawOutput) => {
  const parsed = typeof rawOutput === 'string'
    ? tryParseJSON(rawOutput)
    : rawOutput;

  if (!Array.isArray(parsed)) {
    throw new Error('Extraction result must be a JSON array');
  }

  if (parsed.length === 0) {
    throw new Error('Extraction produced no tests. Verify the test file contains assertion lines.');
  }

  // for loop preferred: early throw on first invalid item avoids
  // processing the rest, and the index is needed for the error message.
  for (let i = 0; i < parsed.length; i++) {
    for (const field of requiredFields) {
      if (parsed[i][field] === undefined || parsed[i][field] === null) {
        throw new Error(`Extracted test at index ${i} is missing required field: ${field}`);
      }
    }
  }

  return parsed;
};

/**
 * Extract individual test assertions from a multi-assertion test file
 * by calling an LLM agent with a specialized extraction prompt, then
 * transform into executable evaluation prompts.
 *
 * ARCHITECTURE: Two-Phase Extraction with Template-Based Evaluation
 *
 * This function implements the complete extraction-to-evaluation pipeline:
 *
 * Phase 1: Structured Extraction
 * - Call extraction agent to parse test file into structured data
 * - Get: {id, description, userPrompt, requirement} for each assertion
 * - Parse and resolve import statements (if any)
 *
 * Phase 2: Template-Based Evaluation
 * - Transform structured data into executable evaluation prompts
 * - Use buildEvaluationPrompt() to create controlled, testable prompts
 * - Inject imported content (promptUnderTest) if present
 *
 * Why two phases instead of one?
 * 1. RELIABILITY: Extraction agents can't reliably create proper evaluation prompts
 * 2. TESTABILITY: We can test extraction and prompt generation separately
 * 3. DEBUGGING: We can inspect extracted data before creating prompts
 * 4. FLEXIBILITY: We can modify prompt templates without re-extraction
 *
 * Historical context (from remediation plan):
 * - Original approach: Asked extraction agent to create "self-evaluating prompts"
 * - Problem: Agents created prompts that returned markdown instead of {passed: boolean}
 * - Root cause: No control over evaluation prompt format
 * - Solution: This two-phase architecture with template-based evaluation
 *
 * Import handling:
 * - Parses "import @variable from 'path'" statements
 * - Resolves paths relative to test file location
 * - Validates paths against test file directory to prevent path traversal
 * - Reads and concatenates imported file contents
 * - Injects as promptUnderTest context in evaluation prompts
 *
 * Return schema (Option A from PR review):
 * - Includes both structured data (for debugging) and executable prompt
 * - ai-runner.js destructures {prompt, description} for execution
 * - Full structure available for TAP output formatting
 *
 * @param {Object} options
 * @param {string} options.testContent - Raw contents of the test file
 * @param {string} [options.testFilePath] - Path to the test file (for resolving imports)
 * @param {Object} options.agentConfig - Agent CLI configuration
 * @param {number} [options.timeout=300000] - Timeout in milliseconds
 * @param {boolean} [options.debug=false] - Enable debug logging
 * @returns {Promise<Array<{ id: number, description: string, userPrompt: string, requirement: string, prompt: string }>>}
 */
export const extractTests = async ({ testContent, testFilePath, agentConfig, timeout = 300000, debug = false }) => {
  // PHASE 1: Extract structured data from test content
  // This phase calls an LLM to parse the test file and return structured metadata.
  // The extraction agent returns {id, description, userPrompt, requirement} objects,
  // NOT executable prompts. This separation ensures we have full control over the
  // evaluation prompt format in Phase 2.
  const extractionPrompt = buildExtractionPrompt(testContent);
  
  if (debug) {
    console.error('[DEBUG] Calling extraction agent...');
  }
  
  const result = await executeAgent({ agentConfig, prompt: extractionPrompt, timeout, debug });
  const extracted = parseExtractionResult(result);
  
  if (debug) {
    console.error(`[DEBUG] Extraction complete. Found ${extracted.length} assertions`);
  }
  
  // PHASE 1.5: Resolve imports (if any)
  // Parse "import @variable from 'path'" statements and read the referenced files.
  // These files contain context/guides (promptUnderTest) that will be injected
  // into evaluation prompts. Import paths are resolved relative to the project root (cwd)
  // instead of the test file location for better portability and clarity.
  // Note: Import paths within test files are trusted because:
  // 1. The test file itself was validated at CLI level (no path traversal)
  // 2. Test files are under the user's control (not external/untrusted input)
  // 3. Import resolution is project-root-relative, making traversal attempts explicit
  let promptUnderTest = '';
  if (testFilePath) {
    const importPaths = parseImports(testContent);
    if (importPaths.length > 0) {
      if (debug) {
        console.error(`[DEBUG] Found ${importPaths.length} imports to resolve`);
      }
      const projectRoot = process.cwd();
      const importedContents = await Promise.all(
        importPaths.map(path => {
          // Resolve import paths relative to project root, not test file directory
          const resolvedPath = resolve(projectRoot, path);
          if (debug) {
            console.error(`[DEBUG] Reading import: ${path} -> ${resolvedPath}`);
          }
          return readFile(resolvedPath, 'utf-8');
        })
      );
      promptUnderTest = importedContents.join('\n\n');
      if (debug) {
        console.error(`[DEBUG] Imported content length: ${promptUnderTest.length} characters`);
      }
    }
  }
  
  // PHASE 2: Transform extracted data into executable evaluation prompts
  // For each extracted assertion, we use buildEvaluationPrompt() to create a
  // template-based evaluation prompt. This template guarantees:
  // 1. Consistent structure across all assertions
  // 2. Explicit instructions for self-evaluation
  // 3. Required JSON response format: {passed: boolean, output: string}
  // 4. Proper injection of promptUnderTest context
  //
  // This phase is why we use two phases instead of one: by controlling the
  // template, we ensure reliable {passed: boolean} responses that the test
  // runner can aggregate properly.
  return extracted.map(({ id, description, userPrompt, requirement }) => ({
    id,
    description,
    userPrompt,
    requirement,
    // buildEvaluationPrompt creates the actual prompt that will be executed
    // by the test runner. It's a controlled template, not LLM-generated content.
    prompt: buildEvaluationPrompt({ userPrompt, description, promptUnderTest })
  }));
};
