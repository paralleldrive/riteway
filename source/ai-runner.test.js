import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { init } from '@paralleldrive/cuid2';
import { runAITests } from './ai-runner.js';

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
        should: 'return aggregated result with all assertions passing',
        actual: result,
        expected: {
          passed: true,
          assertions: [
            {
              requirement: 'Given addition, should add',
              passed: true,
              passCount: 2,
              totalRuns: 2,
              averageScore: 85,
              runResults: [
                { passed: true, actual: 'Mock actual output', expected: 'Mock expected output', score: 85 },
                { passed: true, actual: 'Mock actual output', expected: 'Mock expected output', score: 85 }
              ]
            },
            {
              requirement: 'Given format, should output JSON',
              passed: true,
              passCount: 2,
              totalRuns: 2,
              averageScore: 85,
              runResults: [
                { passed: true, actual: 'Mock actual output', expected: 'Mock expected output', score: 85 },
                { passed: true, actual: 'Mock actual output', expected: 'Mock expected output', score: 85 }
              ]
            }
          ]
        }
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
        given: 'runs: 3 with one assertion and all runs passing',
        should: 'return result with assertion tracking 3 runs and passCount 3',
        actual: result,
        expected: {
          passed: true,
          assertions: [
            {
              requirement: 'Given a test, should pass',
              passed: true,
              passCount: 3,
              totalRuns: 3,
              averageScore: 85,
              runResults: [
                { passed: true, actual: 'Mock actual output', expected: 'Mock expected output', score: 85 },
                { passed: true, actual: 'Mock actual output', expected: 'Mock expected output', score: 85 },
                { passed: true, actual: 'Mock actual output', expected: 'Mock expected output', score: 85 }
              ]
            }
          ]
        }
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
        should: 'return result with assertion failing and passCount 0',
        actual: result,
        expected: {
          passed: false,
          assertions: [
            {
              requirement: 'Given a test, should fail',
              passed: false,
              passCount: 0,
              totalRuns: 2,
              averageScore: 25,
              runResults: [
                { passed: false, actual: 'Mock actual output', expected: 'Mock expected output', score: 25 },
                { passed: false, actual: 'Mock actual output', expected: 'Mock expected output', score: 25 }
              ]
            }
          ]
        }
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
        should: 'return result with correct averageScore of 85',
        actual: result,
        expected: {
          passed: true,
          assertions: [
            {
              requirement: 'Given a test, should pass',
              passed: true,
              passCount: 2,
              totalRuns: 2,
              averageScore: 85,
              runResults: [
                { passed: true, actual: 'Mock actual output', expected: 'Mock expected output', score: 85 },
                { passed: true, actual: 'Mock actual output', expected: 'Mock expected output', score: 85 }
              ]
            }
          ]
        }
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
