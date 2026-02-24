import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { init } from '@paralleldrive/cuid2';
import { readTestFile, runAITests } from './ai-runner.js';

const createSlug = init({ length: 5 });

// Mock agent for two-agent pattern:
// - Extraction calls (containing '<test-file-contents>') return extraction result (JSON)
// - Result agent calls (containing 'CONTEXT (Prompt Under Test)') return plain text
// - Judge agent calls (containing 'ACTUAL RESULT TO EVALUATE') return TAP YAML
const createTwoAgentMockArgs = ({
  extractedTests,
  importPaths = ['prompt.mdc'],
  resultText = 'Mock result from agent',
  judgmentPassed = true,
  judgmentScore = 85
} = {}) => {
  const extractionResult = {
    userPrompt: 'What is 2+2?',
    importPaths,
    assertions: extractedTests
  };
  const tapYAML = `---
passed: ${judgmentPassed}
actual: "Mock actual output"
expected: "Mock expected output"
score: ${judgmentScore}
---`;

  return [
    '-e',
    `const prompt = process.argv[process.argv.length - 1];
    if (prompt.includes('<test-file-contents>')) {
      console.log(JSON.stringify(${JSON.stringify(extractionResult)}));
    } else if (prompt.includes('ACTUAL RESULT TO EVALUATE')) {
      console.log(\`${tapYAML}\`);
    } else if (prompt.includes('CONTEXT (Prompt Under Test)')) {
      console.log(${JSON.stringify(resultText)});
    }`
  ];
};

describe('readTestFile()', () => {
  test('reads file contents from path', async () => {
    const testDir = join(tmpdir(), 'riteway-test-' + createSlug());

    try {
      mkdirSync(testDir, { recursive: true });
      const testFile = join(testDir, 'test.sudo');
      const contents = 'describe("test", { requirements: ["should work"] })';
      writeFileSync(testFile, contents);

      assert({
        given: 'a test file path',
        should: 'return the file contents',
        actual: await readTestFile(testFile),
        expected: contents
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('reads any file extension', async () => {
    const testDir = join(tmpdir(), 'riteway-test-' + createSlug());

    try {
      mkdirSync(testDir, { recursive: true });
      const testFile = join(testDir, 'test.md');
      const contents = '# My Test\n\nSome markdown content';
      writeFileSync(testFile, contents);

      assert({
        given: 'a markdown file path',
        should: 'return the file contents regardless of extension',
        actual: await readTestFile(testFile),
        expected: contents
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});

describe('runAITests()', () => {
  test('extracts tests and returns per-assertion results', async () => {
    const testDir = join(tmpdir(), 'riteway-test-' + createSlug());

    try {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'prompt.mdc'), 'Test prompt context');
      const testFile = join(testDir, 'test.sudo');
      writeFileSync(testFile, '- Given addition, should add\n- Given format, should output JSON');

      const extractedTests = [
        { id: 1, requirement: 'Given addition, should add' },
        { id: 2, requirement: 'Given format, should output JSON' }
      ];

      const result = await runAITests({
        filePath: testFile,
        runs: 2,
        threshold: 50,
        projectRoot: testDir,
        agentConfig: {
          command: 'node',
          args: createTwoAgentMockArgs({ extractedTests })
        }
      });

      assert({
        given: 'multi-assertion test file with all runs passing at 50% threshold',
        should: 'return passed: true',
        actual: result.passed,
        expected: true
      });

      assert({
        given: 'two extracted assertions',
        should: 'return assertions array of length 2',
        actual: result.assertions.length,
        expected: 2
      });

      assert({
        given: 'first extracted assertion',
        should: 'preserve the requirement text',
        actual: result.assertions[0].requirement,
        expected: 'Given addition, should add'
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('tracks pass count across N runs for each assertion', async () => {
    const testDir = join(tmpdir(), 'riteway-test-' + createSlug());

    try {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'prompt.mdc'), 'Test prompt context');
      const testFile = join(testDir, 'test.sudo');
      writeFileSync(testFile, '- Given a test, should pass');

      const extractedTests = [{ id: 1, requirement: 'Given a test, should pass' }];

      const result = await runAITests({
        filePath: testFile,
        runs: 3,
        threshold: 75,
        projectRoot: testDir,
        agentConfig: {
          command: 'node',
          args: createTwoAgentMockArgs({ extractedTests })
        }
      });

      assert({
        given: 'runs: 3 with one assertion',
        should: 'execute 3 runs for the assertion',
        actual: result.assertions[0].totalRuns,
        expected: 3
      });

      assert({
        given: 'all 3 runs passing',
        should: 'have passCount 3',
        actual: result.assertions[0].passCount,
        expected: 3
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('fails when assertion does not meet threshold', async () => {
    const testDir = join(tmpdir(), 'riteway-test-' + createSlug());

    try {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'prompt.mdc'), 'Test prompt context');
      const testFile = join(testDir, 'test.sudo');
      writeFileSync(testFile, '- Given a test, should fail');

      const extractedTests = [{ id: 1, requirement: 'Given a test, should fail' }];

      const result = await runAITests({
        filePath: testFile,
        runs: 2,
        threshold: 75,
        projectRoot: testDir,
        agentConfig: {
          command: 'node',
          args: createTwoAgentMockArgs({
            extractedTests,
            judgmentPassed: false,
            judgmentScore: 25
          })
        }
      });

      assert({
        given: 'all runs failing at 75% threshold',
        should: 'return passed: false',
        actual: result.passed,
        expected: false
      });

      assert({
        given: 'the failing assertion',
        should: 'have passCount 0',
        actual: result.assertions[0].passCount,
        expected: 0
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('includes averageScore across all runs for each assertion', async () => {
    const testDir = join(tmpdir(), 'riteway-test-' + createSlug());

    try {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'prompt.mdc'), 'Test prompt context');
      const testFile = join(testDir, 'test.sudo');
      writeFileSync(testFile, '- Given a test, should pass');

      const extractedTests = [{ id: 1, requirement: 'Given a test, should pass' }];

      const result = await runAITests({
        filePath: testFile,
        runs: 2,
        threshold: 50,
        projectRoot: testDir,
        agentConfig: {
          command: 'node',
          args: createTwoAgentMockArgs({ extractedTests, judgmentScore: 85 })
        }
      });

      assert({
        given: 'judgment score of 85 on both runs',
        should: 'include averageScore as a number',
        actual: typeof result.assertions[0].averageScore,
        expected: 'number'
      });

      assert({
        given: 'judgment score of 85 on both runs',
        should: 'calculate correct average score',
        actual: result.assertions[0].averageScore,
        expected: 85
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
