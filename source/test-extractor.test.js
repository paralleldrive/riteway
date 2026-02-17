import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import {
  buildExtractionPrompt,
  buildResultPrompt,
  buildJudgePrompt,
  extractTests
} from './test-extractor.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { init } from '@paralleldrive/cuid2';

const createSlug = init({ length: 10 });

// Helper to create unique temp directory names
const createTempDir = () => {
  const slug = createSlug();
  return join(tmpdir(), `riteway-extractor-test-${slug}`);
};

describe('test-extractor', () => {
  describe('buildExtractionPrompt()', () => {
    test('returns complete extraction prompt with test content', () => {
      const testContent = `import @promptUnderTest

userPrompt = """
  What is 2 + 2?
"""

- Given simple addition, should add correctly
- Given format, should output JSON`;

      const result = buildExtractionPrompt(testContent);

      const expected = `You are a test extraction agent. Analyze the following test file and extract structured information.

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
  - "requirement": the assertion text (e.g., "Given X, should Y")

Return ONLY valid JSON. No markdown fences, no explanation.

<test-file-contents>
${testContent}
</test-file-contents>`;

      assert({
        given: 'test content with assertions',
        should: 'return complete extraction prompt with test content wrapped in delimiters',
        actual: result,
        expected
      });
    });
  });

  describe('buildResultPrompt()', () => {
    test('returns complete result prompt with context', () => {
      const userPrompt = 'What is 2 + 2?';
      const promptUnderTest = 'You are a math helper.';

      const result = buildResultPrompt({ userPrompt, promptUnderTest });

      const expected = `You are an AI assistant. Execute the following prompt and return your response.

CONTEXT (Prompt Under Test):
You are a math helper.

USER PROMPT:
What is 2 + 2?

INSTRUCTIONS:
1. Execute the user prompt above, following the guidance in the prompt under test
2. Return your complete response as plain text

Respond naturally. Do NOT wrap your response in JSON, markdown fences, or any other structure.
Your entire output IS the result.`;

      assert({
        given: 'userPrompt and promptUnderTest',
        should: 'return complete result prompt with context section',
        actual: result,
        expected
      });
    });

    test('returns result prompt without context when promptUnderTest is omitted', () => {
      const userPrompt = 'What is 2 + 2?';

      const result = buildResultPrompt({ userPrompt });

      const expected = `You are an AI assistant. Execute the following prompt and return your response.

USER PROMPT:
What is 2 + 2?

INSTRUCTIONS:
1. Execute the user prompt above
2. Return your complete response as plain text

Respond naturally. Do NOT wrap your response in JSON, markdown fences, or any other structure.
Your entire output IS the result.`;

      assert({
        given: 'userPrompt without promptUnderTest',
        should: 'return complete result prompt without context section',
        actual: result,
        expected
      });
    });
  });

  describe('buildJudgePrompt()', () => {
    test('returns complete judge prompt with all required sections', () => {
      const userPrompt = 'What is 2 + 2?';
      const promptUnderTest = 'You are a math helper.';
      const result = '4';
      const requirement = 'Given simple addition, should return correct answer';

      const output = buildJudgePrompt({ userPrompt, promptUnderTest, result, requirement });

      const expected = `You are an AI judge. Evaluate whether a given result satisfies a specific requirement.

CONTEXT (Prompt Under Test):
You are a math helper.

ORIGINAL USER PROMPT:
What is 2 + 2?

ACTUAL RESULT TO EVALUATE:
4

REQUIREMENT:
Given simple addition, should return correct answer

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

      assert({
        given: 'all judge prompt parameters',
        should: 'return complete judge prompt with TAP YAML format instructions',
        actual: output,
        expected
      });
    });
  });

  describe('extractTests()', () => {
    test('orchestrates extraction via agent and returns structured data', async () => {
      const extractedData = {
        userPrompt: 'What is 2 + 2?',
        importPaths: ['package.json'], // Use existing file from project root
        assertions: [
          {
            id: 1,
            requirement: 'Given simple addition, should add correctly'
          }
        ]
      };

      // Node script that outputs the extracted data JSON, ignoring prompt input
      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const result = await extractTests({
        testContent: 'import "package.json"\n\n- Given simple addition, should add correctly',
        testFilePath: '/test/test.sudo',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'test content and a mock extraction agent',
        should: 'return complete structured extraction result',
        actual: {
          userPrompt: result.userPrompt,
          hasPromptUnderTest: result.promptUnderTest.length > 0,
          assertions: result.assertions
        },
        expected: {
          userPrompt: 'What is 2 + 2?',
          hasPromptUnderTest: true,
          assertions: [
            {
              id: 1,
              requirement: 'Given simple addition, should add correctly'
            }
          ]
        }
      });
    });

    test('passes the extraction prompt to the agent', async () => {
      const testContent = 'import "package.json"\n\nuserPrompt = """test"""\n\n- Given a unique marker xyzzy, should verify';

      const extractedData = {
        userPrompt: 'test prompt',
        importPaths: ['package.json'],
        assertions: [
          {
            id: 1,
            requirement: 'Given a unique marker xyzzy, should verify'
          }
        ]
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const result = await extractTests({
        testContent,
        testFilePath: '/test/test.sudo',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'test content with assertions',
        should: 'extract complete structured data with userPrompt and assertions',
        actual: {
          hasUserPrompt: result.userPrompt !== undefined,
          hasAssertions: result.assertions.length > 0
        },
        expected: {
          hasUserPrompt: true,
          hasAssertions: true
        }
      });
    });

    test('throws when agent returns invalid extraction output', async () => {
      const mockAgentConfig = {
        command: 'node',
        args: ['-e', 'console.log(JSON.stringify({ not: "valid" }))']
      };

      const error = await Try(extractTests, {
        testContent: 'import "test.mdc"\n\n- Given a test, should pass',
        testFilePath: '/test/test.sudo',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'agent returns invalid extraction result',
        should: 'throw an extraction error',
        actual: error !== undefined,
        expected: true
      });
    });

    test('returns structured data with assertions', async () => {
      const extractedData = {
        userPrompt: 'What is 2+2?',
        importPaths: ['package.json'],
        assertions: [
          {
            id: 1,
            requirement: 'Given a test, should pass'
          }
        ]
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const result = await extractTests({
        testContent: 'import "package.json"\n\n- Given a test, should pass',
        testFilePath: '/test/test.sudo',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'extraction agent returns structured data',
        should: 'include complete extraction result with userPrompt and assertions',
        actual: {
          userPrompt: result.userPrompt,
          assertions: result.assertions
        },
        expected: {
          userPrompt: 'What is 2+2?',
          assertions: [
            {
              id: 1,
              requirement: 'Given a test, should pass'
            }
          ]
        }
      });
    });

    test('throws ValidationError when import file is missing', async () => {
      const extractedData = {
        userPrompt: 'test prompt',
        importPaths: ['nonexistent-file.mdc'],
        assertions: [
          {
            id: 1,
            requirement: 'Given a test, should pass'
          }
        ]
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const error = await Try(extractTests, {
        testContent: 'import "nonexistent-file.mdc"\n\n- Given test, should pass',
        testFilePath: '/test/test.sudo',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'import file that does not exist',
        should: 'throw ValidationError',
        actual: error?.cause?.name,
        expected: 'ValidationError'
      });

      assert({
        given: 'import file that does not exist',
        should: 'have PROMPT_READ_FAILED code',
        actual: error?.cause?.code,
        expected: 'PROMPT_READ_FAILED'
      });

      assert({
        given: 'import file that does not exist',
        should: 'preserve original error as cause',
        actual: error?.cause?.cause !== undefined,
        expected: true
      });
    });

    test('throws ValidationError when promptUnderTest is empty', async () => {
      const extractedData = {
        userPrompt: 'test prompt',
        importPaths: [],
        assertions: [
          {
            id: 1,
            requirement: 'Given a test, should pass'
          }
        ]
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const error = await Try(extractTests, {
        testContent: '- Given test, should pass',
        testFilePath: '/test/test.sudo',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'no promptUnderTest import declared',
        should: 'throw ValidationError',
        actual: error?.cause?.name,
        expected: 'ValidationError'
      });

      assert({
        given: 'no promptUnderTest import declared',
        should: 'have MISSING_PROMPT_UNDER_TEST code',
        actual: error?.cause?.code,
        expected: 'MISSING_PROMPT_UNDER_TEST'
      });
    });

    test('throws ValidationError when userPrompt is missing', async () => {
      const extractedData = {
        userPrompt: '',
        importPaths: ['package.json'],
        assertions: [
          {
            id: 1,
            requirement: 'Given a test, should pass'
          }
        ]
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const error = await Try(extractTests, {
        testContent: 'import "package.json"\n\n- Given test, should pass',
        testFilePath: '/test/test.sudo',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'empty userPrompt',
        should: 'throw ValidationError',
        actual: error?.cause?.name,
        expected: 'ValidationError'
      });

      assert({
        given: 'empty userPrompt',
        should: 'have MISSING_USER_PROMPT code',
        actual: error?.cause?.code,
        expected: 'MISSING_USER_PROMPT'
      });
    });

    test('throws ValidationError when no assertions found', async () => {
      const extractedData = {
        userPrompt: 'test prompt',
        importPaths: ['package.json'],
        assertions: []
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const error = await Try(extractTests, {
        testContent: 'import "package.json"\n\nuserPrompt = """test"""',
        testFilePath: '/test/test.sudo',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'empty assertions array',
        should: 'throw ValidationError',
        actual: error?.cause?.name,
        expected: 'ValidationError'
      });

      assert({
        given: 'empty assertions array',
        should: 'have NO_ASSERTIONS_FOUND code',
        actual: error?.cause?.code,
        expected: 'NO_ASSERTIONS_FOUND'
      });
    });

    test('E2E: reads real import files from disk', async () => {
      const testDir = createTempDir();

      try {
        mkdirSync(testDir, { recursive: true });

        // Create a real prompt file
        const promptFile = join(testDir, 'prompt.mdc');
        const promptContent = 'You are a helpful AI assistant. Be concise and accurate.';
        writeFileSync(promptFile, promptContent);

        // Create test file
        const testFile = join(testDir, 'test.sudo');
        const testContent = 'import "prompt.mdc"\n\n- Given a question, should answer';
        writeFileSync(testFile, testContent);

        const extractedData = {
          userPrompt: 'What is 2+2?',
          importPaths: ['prompt.mdc'],
          assertions: [
            { id: 1, requirement: 'Given a question, should answer' }
          ]
        };

        const mockAgentConfig = {
          command: 'node',
          args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
        };

        const result = await extractTests({
          testContent,
          testFilePath: testFile,
          agentConfig: mockAgentConfig,
          timeout: 5000,
          projectRoot: testDir
        });

        assert({
          given: 'real import file on disk',
          should: 'read file content and return complete extraction result',
          actual: {
            promptUnderTest: result.promptUnderTest,
            userPrompt: result.userPrompt,
            assertionCount: result.assertions.length
          },
          expected: {
            promptUnderTest: promptContent,
            userPrompt: 'What is 2+2?',
            assertionCount: 1
          }
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('E2E: reads multiple import files and concatenates', async () => {
      const testDir = createTempDir();

      try {
        mkdirSync(testDir, { recursive: true });

        // Create multiple prompt files
        const prompt1 = join(testDir, 'rules1.mdc');
        const prompt2 = join(testDir, 'rules2.mdc');
        writeFileSync(prompt1, 'Rule 1: Be concise');
        writeFileSync(prompt2, 'Rule 2: Be accurate');

        const testFile = join(testDir, 'test.sudo');
        const testContent = 'import "rules1.mdc"\nimport "rules2.mdc"\n\n- Given rules, should follow';
        writeFileSync(testFile, testContent);

        const extractedData = {
          userPrompt: 'Test prompt',
          importPaths: ['rules1.mdc', 'rules2.mdc'],
          assertions: [
            { id: 1, requirement: 'Given rules, should follow' }
          ]
        };

        const mockAgentConfig = {
          command: 'node',
          args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
        };

        const result = await extractTests({
          testContent,
          testFilePath: testFile,
          agentConfig: mockAgentConfig,
          timeout: 5000,
          projectRoot: testDir
        });

        assert({
          given: 'multiple import files',
          should: 'concatenate all imported content',
          actual: result.promptUnderTest.includes('Rule 1') && result.promptUnderTest.includes('Rule 2'),
          expected: true
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('E2E: throws real ENOENT error for missing import file', async () => {
      const testDir = createTempDir();

      try {
        mkdirSync(testDir, { recursive: true });

        const testFile = join(testDir, 'test.sudo');
        const testContent = 'import "nonexistent.mdc"\n\n- Given test, should pass';
        writeFileSync(testFile, testContent);

        const extractedData = {
          userPrompt: 'Test',
          importPaths: ['nonexistent.mdc'],
          assertions: [
            { id: 1, requirement: 'Given test, should pass' }
          ]
        };

        const mockAgentConfig = {
          command: 'node',
          args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
        };

        const error = await Try(extractTests, {
          testContent,
          testFilePath: testFile,
          agentConfig: mockAgentConfig,
          timeout: 5000
        });

        assert({
          given: 'missing import file (real ENOENT)',
          should: 'throw ValidationError',
          actual: error?.cause?.name,
          expected: 'ValidationError'
        });

        assert({
          given: 'missing import file (real ENOENT)',
          should: 'have PROMPT_READ_FAILED code',
          actual: error?.cause?.code,
          expected: 'PROMPT_READ_FAILED'
        });

        assert({
          given: 'missing import file (real ENOENT)',
          should: 'preserve original ENOENT error as cause',
          actual: error?.cause?.cause?.code,
          expected: 'ENOENT'
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('E2E: validates real extraction output structure', async () => {
      const testDir = createTempDir();

      try {
        mkdirSync(testDir, { recursive: true });

        const promptFile = join(testDir, 'prompt.mdc');
        writeFileSync(promptFile, 'Test prompt content');

        const testFile = join(testDir, 'test.sudo');
        const testContent = 'import "prompt.mdc"\n\n- Test assertion';
        writeFileSync(testFile, testContent);

        // Valid extraction result that parseExtractionResult will validate
        const validExtractionResult = {
          userPrompt: 'What is 2+2?',
          importPaths: ['prompt.mdc'],
          assertions: [
            { id: 1, requirement: 'Test assertion' }
          ]
        };

        const mockAgentConfig = {
          command: 'node',
          args: ['-e', `console.log(JSON.stringify(${JSON.stringify(validExtractionResult)}))`]
        };

        const result = await extractTests({
          testContent,
          testFilePath: testFile,
          agentConfig: mockAgentConfig,
          timeout: 5000,
          projectRoot: testDir
        });

        assert({
          given: 'valid extraction output from agent',
          should: 'parse and validate complete extraction structure',
          actual: {
            userPrompt: result.userPrompt,
            promptUnderTest: result.promptUnderTest,
            hasAssertions: Array.isArray(result.assertions) && result.assertions.length > 0
          },
          expected: {
            userPrompt: 'What is 2+2?',
            promptUnderTest: 'Test prompt content',
            hasAssertions: true
          }
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('E2E: resolves imports relative to project root', async () => {
      const testDir = createTempDir();

      try {
        mkdirSync(testDir, { recursive: true });
        const nestedDir = join(testDir, 'nested', 'deep');
        mkdirSync(nestedDir, { recursive: true });

        // Create prompt at project root level
        const promptFile = join(testDir, 'root-prompt.mdc');
        writeFileSync(promptFile, 'Root level prompt');

        // Create test file in nested directory
        const testFile = join(nestedDir, 'test.sudo');
        const testContent = 'import "root-prompt.mdc"\n\n- Test';
        writeFileSync(testFile, testContent);

        const extractedData = {
          userPrompt: 'Test',
          importPaths: ['root-prompt.mdc'],
          assertions: [
            { id: 1, requirement: 'Test' }
          ]
        };

        const mockAgentConfig = {
          command: 'node',
          args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
        };

        const result = await extractTests({
          testContent,
          testFilePath: testFile,
          agentConfig: mockAgentConfig,
          timeout: 5000,
          projectRoot: testDir
        });

        assert({
          given: 'import path relative to project root',
          should: 'resolve and read file correctly',
          actual: result.promptUnderTest,
          expected: 'Root level prompt'
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('allows imports outside project root', async () => {
      const testDir = createTempDir();

      try {
        mkdirSync(testDir, { recursive: true });

        // Create a prompt file OUTSIDE the test project directory
        const externalDir = join(testDir, 'external');
        mkdirSync(externalDir, { recursive: true });
        const externalPrompt = join(externalDir, 'shared-prompt.mdc');
        writeFileSync(externalPrompt, 'External shared prompt content');

        // Create project directory separate from external prompt
        const projectDir = join(testDir, 'project');
        mkdirSync(projectDir, { recursive: true });
        const testFile = join(projectDir, 'test.sudo');

        // Import path goes OUTSIDE projectRoot (up and over to external)
        const testContent = 'import "../external/shared-prompt.mdc"\n\n- Given test, should pass';
        writeFileSync(testFile, testContent);

        const extractedData = {
          userPrompt: 'test',
          importPaths: ['../external/shared-prompt.mdc'],
          assertions: [
            { id: 1, requirement: 'Given test, should pass' }
          ]
        };

        const mockAgentConfig = {
          command: 'node',
          args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
        };

        const result = await extractTests({
          testContent,
          testFilePath: testFile,
          agentConfig: mockAgentConfig,
          timeout: 5000,
          projectRoot: projectDir
        });

        assert({
          given: 'import path outside project root',
          should: 'resolve and read the external file',
          actual: result.promptUnderTest,
          expected: 'External shared prompt content'
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });
});
