import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { handleAIErrors, allNoop } from './ai-errors.js';
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
  const tapYAML = `---\npassed: ${judgmentPassed}\nactual: "Mock actual output"\nexpected: "Mock expected output"\nscore: ${judgmentScore}\n---`;

  return [
    '-e',
    `const prompt = process.argv[process.argv.length - 1];
    if (prompt.includes('<test-file-contents>')) {
      console.log(JSON.stringify(${JSON.stringify(extractionResult)}));
    } else if (prompt.includes('ACTUAL RESULT TO EVALUATE')) {
      console.log(${JSON.stringify(tapYAML)});
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
        should: 'return aggregated result with all assertions passing and raw responses',
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
          ],
          responses: [
            'Mock result from agent\n',
            'Mock result from agent\n'
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
          ],
          responses: [
            'Mock result from agent\n',
            'Mock result from agent\n',
            'Mock result from agent\n'
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
          ],
          responses: [
            'Mock result from agent\n',
            'Mock result from agent\n'
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
          ],
          responses: [
            'Mock result from agent\n',
            'Mock result from agent\n'
          ]
        }
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('captures raw result agent responses for each run', async () => {
    const testDir = join(tmpdir(), 'riteway-test-' + createSlug());

    try {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'prompt.mdc'), 'Test prompt context');
      const testFile = join(testDir, 'test.sudo');
      writeFileSync(testFile, '- Given a test, should pass');

      const extractedTests = [{ id: 1, requirement: 'Given a test, should pass' }];
      const customResponse = 'Custom agent response for debugging';

      const result = await runAITests({
        filePath: testFile,
        runs: 2,
        threshold: 50,
        projectRoot: testDir,
        agentConfig: {
          command: 'node',
          args: createTwoAgentMockArgs({ extractedTests, resultText: customResponse })
        }
      });

      assert({
        given: '2 runs with a custom result agent response',
        should: 'capture the raw response from each run',
        actual: result.responses,
        expected: [
          customResponse + '\n',
          customResponse + '\n'
        ]
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('attaches partialResults to error when a run times out after others complete', async () => {
    const testDir = join(tmpdir(), 'riteway-test-' + createSlug());

    try {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'prompt.mdc'), 'Test prompt context');
      const testFile = join(testDir, 'test.sudo');
      writeFileSync(testFile, '- Given a test, should pass');

      const extractedTests = [{ id: 1, requirement: 'Given a test, should pass' }];
      const counterFile = join(testDir, 'call-count.txt');
      writeFileSync(counterFile, '0');

      // Mock agent that succeeds on first result call, hangs on second.
      // Extraction and judge calls respond immediately.
      const extractionResult = {
        userPrompt: 'What is 2+2?',
        importPaths: ['prompt.mdc'],
        assertions: extractedTests
      };
      const tapYAML = '---\npassed: true\nactual: "ok"\nexpected: "ok"\nscore: 85\n---';

      const mockScript = `
        const fs = require('fs');
        const prompt = process.argv[process.argv.length - 1];
        if (prompt.includes('<test-file-contents>')) {
          console.log(JSON.stringify(${JSON.stringify(extractionResult)}));
        } else if (prompt.includes('ACTUAL RESULT TO EVALUATE')) {
          console.log(${JSON.stringify(tapYAML)});
        } else if (prompt.includes('CONTEXT (Prompt Under Test)')) {
          const count = parseInt(fs.readFileSync(${JSON.stringify(counterFile)}, 'utf-8'));
          fs.writeFileSync(${JSON.stringify(counterFile)}, String(count + 1));
          if (count === 0) {
            console.log('First run response');
          } else {
            process.stdout.write('Partial output from run 2 before timeout');
            setTimeout(() => {}, 60000);
          }
        }
      `;

      const error = await Try(runAITests, {
        filePath: testFile,
        runs: 2,
        threshold: 50,
        concurrency: 1,
        timeout: 2000,
        projectRoot: testDir,
        agentConfig: {
          command: 'node',
          args: ['-e', mockScript]
        }
      });

      assert({
        given: 'run 1 completes but run 2 times out',
        should: 'throw an error with partialResults attached',
        actual: error?.cause?.partialResults !== undefined,
        expected: true
      });

      const responses = error?.cause?.partialResults?.responses;

      assert({
        given: 'run 1 completed successfully',
        should: 'include the completed response as first entry',
        actual: responses?.[0],
        expected: 'First run response\n'
      });

      assert({
        given: 'run 2 timed out with partial output',
        should: 'include a second response with timeout marker',
        actual: responses?.[1]?.includes('[RITEWAY TIMEOUT]'),
        expected: true
      });

      assert({
        given: 'partial results from 1 completed run',
        should: 'include aggregated assertions',
        actual: error?.cause?.partialResults?.assertions?.length,
        expected: 1
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('includes partial stdout and timeout marker when all runs time out', async () => {
    const testDir = join(tmpdir(), 'riteway-test-' + createSlug());

    try {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'prompt.mdc'), 'Test prompt context');
      const testFile = join(testDir, 'test.sudo');
      writeFileSync(testFile, '- Given a test, should pass');

      const extractedTests = [{ id: 1, requirement: 'Given a test, should pass' }];
      const extractionResult = {
        userPrompt: 'What is 2+2?',
        importPaths: ['prompt.mdc'],
        assertions: extractedTests
      };

      // Mock agent that writes partial output then hangs
      const mockScript = `
        const prompt = process.argv[process.argv.length - 1];
        if (prompt.includes('<test-file-contents>')) {
          console.log(JSON.stringify(${JSON.stringify(extractionResult)}));
        } else if (prompt.includes('CONTEXT (Prompt Under Test)')) {
          process.stdout.write('Partial agent thoughts before timeout');
          setTimeout(() => {}, 60000);
        }
      `;

      const error = await Try(runAITests, {
        filePath: testFile,
        runs: 1,
        threshold: 50,
        concurrency: 1,
        timeout: 2000,
        projectRoot: testDir,
        agentConfig: {
          command: 'node',
          args: ['-e', mockScript]
        }
      });

      assert({
        given: 'all runs time out but produce partial output',
        should: 'include partialResults with the partial stdout',
        actual: error?.cause?.partialResults?.responses?.[0]?.includes('Partial agent thoughts before timeout'),
        expected: true
      });

      assert({
        given: 'timed out run',
        should: 'include timeout marker in the response',
        actual: error?.cause?.partialResults?.responses?.[0]?.includes('[RITEWAY TIMEOUT]'),
        expected: true
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('throws when test file does not exist', async () => {
    const error = await Try(runAITests, {
      filePath: '/nonexistent/path/to/test.sudo',
      agentConfig: { command: 'node', args: ['-e', 'console.log("{}")'] },
      timeout: 5000
    });

    assert({
      given: 'nonexistent test file path',
      should: 'reject with a file-not-found error',
      actual: error?.code,
      expected: 'ENOENT'
    });
  });

  test('propagates AgentProcessError when extraction agent exits non-zero', async () => {
    const testDir = join(tmpdir(), 'riteway-test-' + createSlug());

    try {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, 'prompt.mdc'), 'Test context');
      const testFile = join(testDir, 'test.sudo');
      writeFileSync(testFile, '- Given a test, should pass');

      const error = await Try(runAITests, {
        filePath: testFile,
        runs: 1,
        projectRoot: testDir,
        agentConfig: {
          command: 'node',
          args: ['-e', 'process.exit(1)']
        },
        timeout: 5000
      });

      const invoked = [];
      handleAIErrors({ ...allNoop, AgentProcessError: () => invoked.push('AgentProcessError') })(error);

      assert({
        given: 'extraction agent exits with nonzero code',
        should: 'throw an error that routes to the AgentProcessError handler',
        actual: invoked,
        expected: ['AgentProcessError']
      });
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
