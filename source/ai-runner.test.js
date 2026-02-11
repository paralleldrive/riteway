import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import {
  readTestFile,
  executeAgent,
  runAITests
} from './ai-runner.js';
import { parseOpenCodeNDJSON } from './agent-parser.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { init } from '@paralleldrive/cuid2';

const createSlug = init({ length: 5 });

describe('ai-runner', () => {
  describe('readTestFile()', () => {
    test('reads file contents from path', async () => {
      const testDir = join(tmpdir(), 'riteway-test-' + createSlug());
      let testFile;
      
      try {
        mkdirSync(testDir, { recursive: true });
        testFile = join(testDir, 'test.sudo');
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
      let testFile;
      
      try {
        mkdirSync(testDir, { recursive: true });
        testFile = join(testDir, 'test.md');
        const contents = '# My Test\n\nSome markdown content';
        writeFileSync(testFile, contents);

        assert({
          given: 'a markdown file path',
          should: 'return the file contents',
          actual: await readTestFile(testFile),
          expected: contents
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('executeAgent()', () => {
    test('handles JSON output from agent', async () => {
      // Use node -e to output JSON without echoing the prompt
      const mockAgentConfig = {
        command: 'node',
        args: ['-e', 'console.log(JSON.stringify({ passed: true, output: "test" }))']
      };
      
      const result = await executeAgent({
        agentConfig: mockAgentConfig,
        prompt: 'ignored by node -e script'
      });

      assert({
        given: 'agent returns JSON',
        should: 'parse and return the JSON',
        actual: result,
        expected: { passed: true, output: 'test' }
      });
    });

    test('passes prompt as final argument to agent', async () => {
      // Use node -p to print the last argument (prompt)
      const mockAgentConfig = {
        command: 'node',
        args: ['-p', 'JSON.stringify({ prompt: process.argv[process.argv.length - 1] })']
      };
      
      const result = await executeAgent({
        agentConfig: mockAgentConfig,
        prompt: 'my test prompt'
      });

      assert({
        given: 'a prompt',
        should: 'pass it as the final argument to the subprocess',
        actual: result.prompt,
        expected: 'my test prompt'
      });
    });

    test('throws error on invalid JSON with debugging context', async () => {
      const mockAgentConfig = {
        command: 'node',
        args: ['-e', 'console.log("not json")']
      };

      const error = await Try(executeAgent, {
        agentConfig: mockAgentConfig,
        prompt: 'test'
      });

      assert({
        given: 'agent returns invalid JSON',
        should: 'throw an error',
        actual: error !== undefined,
        expected: true
      });

      assert({
        given: 'JSON parsing error',
        should: 'wrap in ParseError with structured metadata',
        actual: error?.cause?.name,
        expected: 'ParseError'
      });

      assert({
        given: 'JSON parsing error',
        should: 'include stdout preview in error metadata',
        actual: error?.cause?.stdoutPreview !== undefined,
        expected: true
      });

      assert({
        given: 'JSON parsing error',
        should: 'include command in error metadata',
        actual: error?.cause?.command !== undefined,
        expected: true
      });
    });

    test('throws error on non-zero exit code with debugging context', async () => {
      const mockAgentConfig = {
        command: 'node',
        args: ['-e', 'console.error("error message"); process.exit(1)']
      };

      const error = await Try(executeAgent, {
        agentConfig: mockAgentConfig,
        prompt: 'test'
      });

      assert({
        given: 'agent exits with non-zero code',
        should: 'throw an error',
        actual: error?.message.includes('exited with code 1'),
        expected: true
      });

      assert({
        given: 'non-zero exit code',
        should: 'include stderr in error message',
        actual: error?.message.includes('Stderr:'),
        expected: true
      });

      assert({
        given: 'non-zero exit code',
        should: 'include command in error message',
        actual: error?.message.includes('Command:'),
        expected: true
      });

      assert({
        given: 'non-zero exit code',
        should: 'have AgentProcessError name in cause',
        actual: error?.cause?.name,
        expected: 'AgentProcessError'
      });

      assert({
        given: 'non-zero exit code',
        should: 'have AGENT_PROCESS_FAILURE code in cause',
        actual: error?.cause?.code,
        expected: 'AGENT_PROCESS_FAILURE'
      });
    });

    test('times out long-running processes', async () => {
      const mockAgentConfig = {
        command: 'node',
        args: ['-e', 'setTimeout(() => console.log(JSON.stringify({ done: true })), 10000)']
      };

      const error = await Try(executeAgent, {
        agentConfig: mockAgentConfig,
        prompt: 'test',
        timeout: 100 // 100ms timeout
      });

      assert({
        given: 'process that exceeds timeout',
        should: 'throw timeout error',
        actual: error?.message.includes('timed out after 100ms'),
        expected: true
      });

      assert({
        given: 'timeout error',
        should: 'include command in error message',
        actual: error?.message.includes('Command:'),
        expected: true
      });

      assert({
        given: 'process that exceeds timeout',
        should: 'have TimeoutError name in cause',
        actual: error?.cause?.name,
        expected: 'TimeoutError'
      });

      assert({
        given: 'process that exceeds timeout',
        should: 'have AGENT_TIMEOUT code in cause',
        actual: error?.cause?.code,
        expected: 'AGENT_TIMEOUT'
      });
    });

    test('uses default timeout of 5 minutes', async () => {
      const mockAgentConfig = {
        command: 'node',
        args: ['-e', 'console.log(JSON.stringify({ passed: true }))']
      };
      
      // This should complete quickly and not timeout
      const result = await executeAgent({
        agentConfig: mockAgentConfig,
        prompt: 'test'
        // No timeout specified - should use default of 300000ms
      });

      assert({
        given: 'no timeout specified',
        should: 'use default and complete successfully',
        actual: result.passed,
        expected: true
      });
    });

    test('processes NDJSON output when parseOutput is provided', async () => {
      // Mock script that outputs NDJSON format
      const mockScript = `
        const line1 = JSON.stringify({type:"step_start",timestamp:1770245956364});
        const line2 = JSON.stringify({type:"text",part:{text:'{\\"passed\\": true, \\"output\\": \\"test\\"}'}});
        const line3 = JSON.stringify({type:"step_finish",timestamp:1770245956211});
        console.log(line1);
        console.log(line2);
        console.log(line3);
      `;

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', mockScript],
        parseOutput: (stdout, logger) => parseOpenCodeNDJSON(stdout, logger)
      };
      
      const result = await executeAgent({
        agentConfig: mockAgentConfig,
        prompt: 'test'
      });

      assert({
        given: 'agent config with parseOutput for NDJSON',
        should: 'parse NDJSON and return parsed result',
        actual: result,
        expected: { passed: true, output: 'test' }
      });
    });

    test('bypasses parseOutput when not provided', async () => {
      const mockAgentConfig = {
        command: 'node',
        args: ['-e', 'console.log(JSON.stringify({ passed: true, output: "direct" }))']
        // No parseOutput function
      };
      
      const result = await executeAgent({
        agentConfig: mockAgentConfig,
        prompt: 'test'
      });

      assert({
        given: 'agent config without parseOutput',
        should: 'parse JSON directly',
        actual: result,
        expected: { passed: true, output: 'direct' }
      });
    });

    test('handles parseOutput errors gracefully', async () => {
      const mockAgentConfig = {
        command: 'node',
        args: ['-e', 'console.log("not-ndjson")'],
        parseOutput: () => {
          throw new Error('Failed to parse NDJSON');
        }
      };

      const error = await Try(executeAgent, {
        agentConfig: mockAgentConfig,
        prompt: 'test'
      });

      assert({
        given: 'parseOutput throws error',
        should: 'wrap in ParseError with structured metadata',
        actual: error?.cause?.name,
        expected: 'ParseError'
      });

      assert({
        given: 'parseOutput throws error',
        should: 'include error code',
        actual: error?.cause?.code,
        expected: 'AGENT_OUTPUT_PARSE_ERROR'
      });

      assert({
        given: 'parseOutput throws error',
        should: 'preserve original error as cause',
        actual: error?.cause?.cause?.message,
        expected: 'Failed to parse NDJSON'
      });

      assert({
        given: 'parseOutput throws error',
        should: 'include command context',
        actual: error?.cause?.command !== undefined,
        expected: true
      });
    });
  });

  describe('runAITests()', () => {
    // Mock agent for two-agent pattern:
    // - Extraction calls (containing '<test-file-contents>') return extraction result (JSON)
    // - Result agent calls (containing 'CONTEXT (Prompt Under Test)') return plain text
    // - Judge agent calls (containing 'ACTUAL RESULT TO EVALUATE') return TAP YAML
    const createTwoAgentMockArgs = ({
      extractedTests,
      resultText = 'Mock result from agent',
      judgmentPassed = true,
      judgmentScore = 85
    } = {}) => {
      const extractionResult = {
        userPrompt: 'What is 2+2?',
        importPaths: ['package.json'], // Use existing file from project root
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

    test('extracts tests and returns per-assertion results', async () => {
      const testDir = join(tmpdir(), 'riteway-test-' + createSlug());

      try {
        mkdirSync(testDir, { recursive: true });
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
          agentConfig: {
            command: 'node',
            args: createTwoAgentMockArgs({ extractedTests })
          }
        });

        assert({
          given: 'a multi-assertion test file',
          should: 'return passed: true when all assertions meet threshold',
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
          given: 'first assertion with all passes',
          should: 'preserve the requirement',
          actual: result.assertions[0].requirement,
          expected: 'Given addition, should add'
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('runs each assertion independently with N runs', async () => {
      const testDir = join(tmpdir(), 'riteway-test-' + createSlug());

      try {
        mkdirSync(testDir, { recursive: true });
        const testFile = join(testDir, 'test.sudo');
        writeFileSync(testFile, '- Given a test, should pass');

        const extractedTests = [
          { id: 1, requirement: 'Given a test, should pass' }
        ];

        const result = await runAITests({
          filePath: testFile,
          runs: 3,
          threshold: 75,
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
          given: 'all runs passing',
          should: 'have passCount 3',
          actual: result.assertions[0].passCount,
          expected: 3
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('fails when an assertion does not meet threshold', async () => {
      const testDir = join(tmpdir(), 'riteway-test-' + createSlug());

      try {
        mkdirSync(testDir, { recursive: true });
        const testFile = join(testDir, 'test.sudo');
        writeFileSync(testFile, '- Given a test, should fail');

        const extractedTests = [
          { id: 1, requirement: 'Given a test, should fail' }
        ];

        const result = await runAITests({
          filePath: testFile,
          runs: 2,
          threshold: 75,
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
          given: 'all runs fail with 75% threshold',
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

    test('includes averageScore in result', async () => {
      const testDir = join(tmpdir(), 'riteway-test-' + createSlug());

      try {
        mkdirSync(testDir, { recursive: true });
        const testFile = join(testDir, 'test.sudo');
        writeFileSync(testFile, '- Given a test, should pass');

        const extractedTests = [
          { id: 1, requirement: 'Given a test, should pass' }
        ];

        const result = await runAITests({
          filePath: testFile,
          runs: 2,
          threshold: 50,
          agentConfig: {
            command: 'node',
            args: createTwoAgentMockArgs({ extractedTests, judgmentScore: 85 })
          }
        });

        assert({
          given: 'test with score 85 on both runs',
          should: 'include averageScore property',
          actual: typeof result.assertions[0].averageScore,
          expected: 'number'
        });

        assert({
          given: 'test with score 85 on both runs',
          should: 'calculate correct average score',
          actual: result.assertions[0].averageScore,
          expected: 85
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

});
