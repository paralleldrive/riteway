import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { handleAIErrors, allNoop } from './ai-errors.js';
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

const createTempDir = () => {
  const slug = createSlug();
  return join(tmpdir(), `riteway-extractor-test-${slug}`);
};

describe('buildExtractionPrompt()', () => {
  test('returns complete extraction prompt with test content embedded in delimiters', () => {
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
  test('returns complete result prompt with context section when promptUnderTest provided', () => {
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

  test('omits context section when promptUnderTest is not provided', () => {
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
      should: 'return prompt without context section',
      actual: result,
      expected
    });
  });
});

describe('buildJudgePrompt()', () => {
  test('returns complete judge prompt with all sections', () => {
    const userPrompt = 'What is 2 + 2?';
    const promptUnderTest = 'You are a math helper.';
    const result = 'The answer is 4.';
    const requirement = 'Given simple addition, should return 4';

    const judgePrompt = buildJudgePrompt({ userPrompt, promptUnderTest, result, requirement });

    const expected = `You are an AI judge. Evaluate whether a given result satisfies a specific requirement.

CONTEXT (Prompt Under Test):
You are a math helper.

ORIGINAL USER PROMPT:
What is 2 + 2?

ACTUAL RESULT TO EVALUATE:
The answer is 4.

REQUIREMENT:
Given simple addition, should return 4

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
      given: 'all required fields',
      should: 'return complete judge prompt with all sections',
      actual: judgePrompt,
      expected
    });
  });
});

describe('extractTests()', () => {
  test('extracts and returns validated test structure from agent output', async () => {
    const testDir = createTempDir();

    try {
      mkdirSync(testDir, { recursive: true });

      const promptFile = join(testDir, 'prompt.mdc');
      writeFileSync(promptFile, 'You are a math helper.');

      const testFile = join(testDir, 'test.sudo');
      writeFileSync(testFile, 'import "prompt.mdc"\n\n- Given addition, should add correctly');

      const extractedData = {
        userPrompt: 'What is 2+2?',
        importPaths: ['prompt.mdc'],
        assertions: [
          { id: 1, requirement: 'Given addition, should add correctly' }
        ]
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const result = await extractTests({
        testContent: 'import "prompt.mdc"\n\n- Given addition, should add correctly',
        testFilePath: testFile,
        agentConfig: mockAgentConfig,
        timeout: 5000,
        projectRoot: testDir
      });

      assert({
        given: 'valid extraction output with import file on disk',
        should: 'return extracted userPrompt',
        actual: result.userPrompt,
        expected: 'What is 2+2?'
      });

      assert({
        given: 'valid extraction output with import file on disk',
        should: 'return promptUnderTest from resolved import',
        actual: result.promptUnderTest,
        expected: 'You are a math helper.'
      });

      assert({
        given: 'valid extraction output with one assertion',
        should: 'return assertions array of length 1',
        actual: result.assertions.length,
        expected: 1
      });

      assert({
        given: 'valid extraction output',
        should: 'preserve the requirement text in assertions',
        actual: result.assertions[0].requirement,
        expected: 'Given addition, should add correctly'
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('concatenates multiple imported prompt files', async () => {
    const testDir = createTempDir();

    try {
      mkdirSync(testDir, { recursive: true });

      writeFileSync(join(testDir, 'rules1.mdc'), 'Rule 1: Be concise');
      writeFileSync(join(testDir, 'rules2.mdc'), 'Rule 2: Be accurate');

      const extractedData = {
        userPrompt: 'Test prompt',
        importPaths: ['rules1.mdc', 'rules2.mdc'],
        assertions: [{ id: 1, requirement: 'Given rules, should follow' }]
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const result = await extractTests({
        testContent: 'import "rules1.mdc"\nimport "rules2.mdc"\n\n- Given rules, should follow',
        testFilePath: join(testDir, 'test.sudo'),
        agentConfig: mockAgentConfig,
        timeout: 5000,
        projectRoot: testDir
      });

      assert({
        given: 'two import files',
        should: 'concatenate both file contents into promptUnderTest',
        actual: result.promptUnderTest.includes('Rule 1') && result.promptUnderTest.includes('Rule 2'),
        expected: true
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('resolves import paths relative to projectRoot, not test file location', async () => {
    const testDir = createTempDir();

    try {
      mkdirSync(testDir, { recursive: true });
      const nestedDir = join(testDir, 'nested', 'deep');
      mkdirSync(nestedDir, { recursive: true });

      writeFileSync(join(testDir, 'root-prompt.mdc'), 'Root level prompt');

      const extractedData = {
        userPrompt: 'Test',
        importPaths: ['root-prompt.mdc'],
        assertions: [{ id: 1, requirement: 'Given test, should pass' }]
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const result = await extractTests({
        testContent: 'import "root-prompt.mdc"\n\n- Given test, should pass',
        testFilePath: join(nestedDir, 'test.sudo'),
        agentConfig: mockAgentConfig,
        timeout: 5000,
        projectRoot: testDir
      });

      assert({
        given: 'import path relative to project root',
        should: 'resolve and read file from project root, not test file directory',
        actual: result.promptUnderTest,
        expected: 'Root level prompt'
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('allows imports from paths outside project root', async () => {
    const testDir = createTempDir();

    try {
      mkdirSync(testDir, { recursive: true });

      const externalDir = join(testDir, 'external');
      mkdirSync(externalDir, { recursive: true });
      writeFileSync(join(externalDir, 'shared-prompt.mdc'), 'External shared prompt content');

      const projectDir = join(testDir, 'project');
      mkdirSync(projectDir, { recursive: true });

      const extractedData = {
        userPrompt: 'test',
        importPaths: ['../external/shared-prompt.mdc'],
        assertions: [{ id: 1, requirement: 'Given test, should pass' }]
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const result = await extractTests({
        testContent: 'import "../external/shared-prompt.mdc"\n\n- Given test, should pass',
        testFilePath: join(projectDir, 'test.sudo'),
        agentConfig: mockAgentConfig,
        timeout: 5000,
        projectRoot: projectDir
      });

      assert({
        given: 'import path traversing outside project root',
        should: 'resolve and read the external file without error',
        actual: result.promptUnderTest,
        expected: 'External shared prompt content'
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('throws ValidationError when promptUnderTest import is missing', async () => {
    const extractedData = {
      userPrompt: 'What is 2+2?',
      importPaths: [],
      assertions: [{ id: 1, requirement: 'Given a test, should pass' }]
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

    const invoked = [];
    handleAIErrors({ ...allNoop, ValidationError: () => invoked.push('ValidationError') })(error);

    assert({
      given: 'no import paths (no promptUnderTest)',
      should: 'throw an error that routes to the ValidationError handler',
      actual: invoked,
      expected: ['ValidationError']
    });

    assert({
      given: 'no promptUnderTest import declared',
      should: 'include MISSING_PROMPT_UNDER_TEST code in error',
      actual: error?.cause?.code,
      expected: 'MISSING_PROMPT_UNDER_TEST'
    });
  });

  test('throws ValidationError when userPrompt is empty', async () => {
    const extractedData = {
      userPrompt: '',
      importPaths: ['package.json'],
      assertions: [{ id: 1, requirement: 'Given a test, should pass' }]
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

    const invoked = [];
    handleAIErrors({ ...allNoop, ValidationError: () => invoked.push('ValidationError') })(error);

    assert({
      given: 'empty userPrompt in extraction result',
      should: 'throw an error that routes to the ValidationError handler',
      actual: invoked,
      expected: ['ValidationError']
    });

    assert({
      given: 'empty userPrompt',
      should: 'include MISSING_USER_PROMPT code in error',
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

    const invoked = [];
    handleAIErrors({ ...allNoop, ValidationError: () => invoked.push('ValidationError') })(error);

    assert({
      given: 'empty assertions array',
      should: 'throw an error that routes to the ValidationError handler',
      actual: invoked,
      expected: ['ValidationError']
    });

    assert({
      given: 'empty assertions array',
      should: 'include NO_ASSERTIONS_FOUND code in error',
      actual: error?.cause?.code,
      expected: 'NO_ASSERTIONS_FOUND'
    });
  });

  test('throws ValidationError with PROMPT_READ_FAILED when import file does not exist', async () => {
    const testDir = createTempDir();

    try {
      mkdirSync(testDir, { recursive: true });

      const extractedData = {
        userPrompt: 'Test',
        importPaths: ['nonexistent.mdc'],
        assertions: [{ id: 1, requirement: 'Given test, should pass' }]
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const error = await Try(extractTests, {
        testContent: 'import "nonexistent.mdc"\n\n- Given test, should pass',
        testFilePath: join(testDir, 'test.sudo'),
        agentConfig: mockAgentConfig,
        timeout: 5000,
        projectRoot: testDir
      });

      const invoked = [];
      handleAIErrors({ ...allNoop, ValidationError: () => invoked.push('ValidationError') })(error);

      assert({
        given: 'missing import file on disk',
        should: 'throw an error that routes to the ValidationError handler',
        actual: invoked,
        expected: ['ValidationError']
      });

      assert({
        given: 'missing import file on disk',
        should: 'include PROMPT_READ_FAILED code in error',
        actual: error?.cause?.code,
        expected: 'PROMPT_READ_FAILED'
      });

      assert({
        given: 'missing import file on disk',
        should: 'preserve original ENOENT error as cause',
        actual: error?.cause?.cause?.code,
        expected: 'ENOENT'
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
