import { createError } from 'error-causes';
import { ValidationError } from './ai-errors.js';
import { executeAgent } from './execute-agent.js';
import { parseExtractionResult, resolveImportPaths } from './extraction-parser.js';

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
 * Phase 1 (this function): Extract structured metadata (userPrompt, importPaths, requirement)
 * Phase 2: Transform metadata into executable prompts for result and judge agents
 */
export const buildExtractionPrompt = (testContent) =>
  `You are a test extraction agent. Analyze the following test file and extract structured information.

EXTRACTION RULES (follow strictly):

1. "userPrompt": Extract ONLY if explicitly declared in the test file (e.g., \`userPrompt = """..."""\`).
   Do NOT infer, synthesize, or derive a userPrompt from import file contents, assertion text, or context.
   If no explicit userPrompt declaration exists, return "".

2. "importPaths": Extract any import file paths declared in the test file (e.g., import 'path/to/file.mdc').
   If no imports are declared, return [].

3. "assertions": Extract ONLY requirement/assertion lines that appear explicitly in the test file body
   (e.g., "- Given X, should Y", bullet points, or numbered requirements).
   Do NOT extract requirements from imported file contents — only from the test file itself.
   If no assertion lines appear in the test file body, return [].

Return a JSON object with:
- "userPrompt": the explicitly declared test prompt, or "" if absent
- "importPaths": array of import file paths (e.g., ["ai/rules/ui.mdc"])
- "assertions": array of assertion objects found in the test file body, each with:
  - "id": sequential integer starting at 1
  - "requirement": the assertion text (e.g., "Given X, should Y")

Return ONLY valid JSON. No markdown fences, no explanation.

<test-file-contents>
${testContent}
</test-file-contents>`;

/**
 * Build a result prompt that instructs an LLM to execute a user prompt
 * and return plain text output (no JSON, no evaluation).
 *
 * This is part of the two-agent pattern where:
 * - Result agent (this prompt): Execute the user prompt, return plain text
 * - Judge agent (separate prompt): Evaluate the result against requirements
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
 * This is part of the two-agent pattern where:
 * - Result agent: Execute the user prompt, return plain text
 * - Judge agent (this prompt): Evaluate the result against ONE requirement
 */
export const buildJudgePrompt = ({ userPrompt, promptUnderTest, result, requirement }) => {
  const contextSection = promptUnderTest
    ? `CONTEXT (Prompt Under Test):\n${promptUnderTest}\n\n`
    : '';

  return `You are an AI judge. Evaluate whether a given result satisfies a specific requirement.

${contextSection}ORIGINAL USER PROMPT:
${userPrompt}

ACTUAL RESULT TO EVALUATE:
${result}

REQUIREMENT:
${requirement}

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
 * Extract individual test assertions from a multi-assertion test file
 * by calling an LLM agent with a specialized extraction prompt.
 *
 * Pipeline:
 * Phase 1: Extraction agent parses test file → {userPrompt, importPaths, assertions}
 * Phase 1.5: Read agent-identified import files → promptUnderTest string
 * Phase 2: Return validated structured data for two-agent execution
 *
 * The extraction prompt instructs the agent to return "" / [] for missing fields
 * rather than inferring them — making the validation below reliable end-to-end.
 *
 * Validation:
 * - Missing userPrompt → ValidationError MISSING_USER_PROMPT
 * - No assertions → ValidationError NO_ASSERTIONS_FOUND
 * - Missing promptUnderTest import → ValidationError MISSING_PROMPT_UNDER_TEST
 * - Missing import file on disk → ValidationError PROMPT_READ_FAILED (with cause)
 *
 * @param {Object} options
 * @param {string} options.testContent - Raw contents of the test file
 * @param {string} [options.testFilePath] - Path to the test file (for resolving imports)
 * @param {Object} options.agentConfig - Agent CLI configuration
 * @param {number} [options.timeout=300000] - Timeout in milliseconds
 * @param {string} [options.projectRoot=process.cwd()] - Project root for resolving import paths
 * @returns {Promise<{ userPrompt: string, promptUnderTest: string, assertions: Array<{ id: number, requirement: string }> }>}
 */
export const extractTests = async ({
  testContent,
  testFilePath,
  agentConfig,
  timeout = 300000,
  projectRoot = process.cwd()
}) => {
  console.log('\nCalling extraction agent...');

  const extractionPrompt = buildExtractionPrompt(testContent);
  const result = await executeAgent({ agentConfig, prompt: extractionPrompt, timeout });
  const extracted = parseExtractionResult(result);

  const { userPrompt, assertions } = extracted;

  if (!userPrompt || userPrompt.trim() === '') {
    throw createError({
      ...ValidationError,
      message: 'Extraction agent returned no userPrompt. Ensure the test file declares a userPrompt (e.g., `userPrompt = """..."""`) in a format the agent can recognize.',
      code: 'MISSING_USER_PROMPT',
      testFile: testFilePath
    });
  }

  if (assertions.length === 0) {
    throw createError({
      ...ValidationError,
      message: 'Extraction agent returned no assertions. Ensure the test file includes assertion lines (e.g., "- Given X, should Y") that the agent can extract.',
      code: 'NO_ASSERTIONS_FOUND',
      testFile: testFilePath
    });
  }

  const promptUnderTest = extracted.importPaths.length > 0
    ? await resolveImportPaths({ importPaths: extracted.importPaths, projectRoot })
    : '';

  if (!promptUnderTest || promptUnderTest.trim() === '') {
    throw createError({
      ...ValidationError,
      message: 'Test file does not declare a promptUnderTest import. Every test file must import the prompt under test.',
      code: 'MISSING_PROMPT_UNDER_TEST',
      testFile: testFilePath
    });
  }

  return {
    userPrompt,
    promptUnderTest,
    assertions: assertions.map(({ id, requirement }) => ({ id, requirement }))
  };
};
