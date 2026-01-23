import { describe, test, vi } from 'vitest';
import { assert } from './vitest.js';
import {
  readTestFile,
  calculateRequiredPasses,
  aggregateResults,
  executeAgent,
  runAITests
} from './ai-runner.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ai-runner', () => {
  describe('readTestFile()', () => {
    test('reads file contents from path', async () => {
      const testDir = join(tmpdir(), 'riteway-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
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
      const testDir = join(tmpdir(), 'riteway-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
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

  describe('calculateRequiredPasses()', () => {
    test('calculates required passes using ceiling', () => {
      assert({
        given: '4 runs with 75% threshold',
        should: 'require 3 passes (ceiling of 3)',
        actual: calculateRequiredPasses({ runs: 4, threshold: 75 }),
        expected: 3
      });

      assert({
        given: '5 runs with 75% threshold',
        should: 'require 4 passes (ceiling of 3.75)',
        actual: calculateRequiredPasses({ runs: 5, threshold: 75 }),
        expected: 4
      });

      assert({
        given: '10 runs with 80% threshold',
        should: 'require 8 passes',
        actual: calculateRequiredPasses({ runs: 10, threshold: 80 }),
        expected: 8
      });
    });

    test('uses default values', () => {
      assert({
        given: 'no arguments',
        should: 'use defaults (4 runs, 75% threshold) requiring 3 passes',
        actual: calculateRequiredPasses(),
        expected: 3
      });
    });

    test('validates threshold is between 0 and 100', () => {
      assert({
        given: 'threshold > 100',
        should: 'throw an error',
        actual: (() => {
          try {
            calculateRequiredPasses({ runs: 4, threshold: 150 });
            return 'no error';
          } catch (err) {
            return err.message;
          }
        })(),
        expected: 'threshold must be between 0 and 100'
      });

      assert({
        given: 'negative threshold',
        should: 'throw an error',
        actual: (() => {
          try {
            calculateRequiredPasses({ runs: 4, threshold: -10 });
            return 'no error';
          } catch (err) {
            return err.message;
          }
        })(),
        expected: 'threshold must be between 0 and 100'
      });
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
      
      let error;
      try {
        await executeAgent({
          agentConfig: mockAgentConfig,
          prompt: 'test'
        });
      } catch (err) {
        error = err;
      }

      assert({
        given: 'agent returns invalid JSON',
        should: 'throw an error',
        actual: error !== undefined,
        expected: true
      });

      assert({
        given: 'JSON parsing error',
        should: 'include stdout preview in error message',
        actual: error?.message.includes('Stdout preview:'),
        expected: true
      });

      assert({
        given: 'JSON parsing error',
        should: 'include command in error message',
        actual: error?.message.includes('Command:'),
        expected: true
      });
    });

    test('throws error on non-zero exit code with debugging context', async () => {
      const mockAgentConfig = {
        command: 'node',
        args: ['-e', 'console.error("error message"); process.exit(1)']
      };
      
      let error;
      try {
        await executeAgent({
          agentConfig: mockAgentConfig,
          prompt: 'test'
        });
      } catch (err) {
        error = err;
      }

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
    });

    test('times out long-running processes', async () => {
      const mockAgentConfig = {
        command: 'node',
        args: ['-e', 'setTimeout(() => console.log(JSON.stringify({ done: true })), 10000)']
      };
      
      let error;
      try {
        await executeAgent({
          agentConfig: mockAgentConfig,
          prompt: 'test',
          timeout: 100 // 100ms timeout
        });
      } catch (err) {
        error = err;
      }

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
  });

  describe('runAITests()', () => {
    test('orchestrates full test workflow', async () => {
      const testDir = join(tmpdir(), 'riteway-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      let testFile;
      
      try {
        mkdirSync(testDir, { recursive: true });
        testFile = join(testDir, 'test.sudo');
        writeFileSync(testFile, 'test prompt content');

        // Use node to return JSON
        const result = await runAITests({
          filePath: testFile,
          runs: 2,
          threshold: 50,
          agentConfig: {
            command: 'node',
            args: ['-e', 'console.log(JSON.stringify({ passed: true }))']
          }
        });

        assert({
          given: 'test file and configuration',
          should: 'return aggregated results',
          actual: typeof result,
          expected: 'object'
        });

        assert({
          given: 'successful test runs',
          should: 'return passed: true',
          actual: result.passed,
          expected: true
        });

        assert({
          given: 'runs: 2',
          should: 'execute 2 runs',
          actual: result.totalRuns,
          expected: 2
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('executes runs in parallel', async () => {
      const testDir = join(tmpdir(), 'riteway-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      let testFile;
      
      try {
        mkdirSync(testDir, { recursive: true });
        testFile = join(testDir, 'test.sudo');
        writeFileSync(testFile, 'test prompt');

        const startTime = Date.now();
        
        await runAITests({
          filePath: testFile,
          runs: 3,
          threshold: 75,
          agentConfig: {
            command: 'node',
            args: ['-e', 'setTimeout(() => console.log(JSON.stringify({ passed: true })), 100)']
          }
        });

        const duration = Date.now() - startTime;

        assert({
          given: '3 runs with 100ms delay each',
          should: 'complete in less than 500ms (parallel execution, sequential would be 300ms+)',
          actual: duration < 500,
          expected: true
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('uses default configuration', async () => {
      const testDir = join(tmpdir(), 'riteway-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      let testFile;
      
      try {
        mkdirSync(testDir, { recursive: true });
        testFile = join(testDir, 'test.sudo');
        writeFileSync(testFile, 'test');

        const result = await runAITests({
          filePath: testFile,
          agentConfig: {
            command: 'node',
            args: ['-e', 'console.log(JSON.stringify({ passed: true }))']
          }
        });

        assert({
          given: 'no runs specified',
          should: 'default to 4 runs',
          actual: result.totalRuns,
          expected: 4
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('fails when threshold not met', async () => {
      const testDir = join(tmpdir(), 'riteway-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      let testFile;
      
      try {
        mkdirSync(testDir, { recursive: true });
        testFile = join(testDir, 'test.sudo');
        writeFileSync(testFile, 'test');

        const result = await runAITests({
          filePath: testFile,
          runs: 4,
          threshold: 75, // requires 3 passes
          agentConfig: {
            command: 'node',
            args: ['-e', 'console.log(JSON.stringify({ passed: false }))'] // all fail
          }
        });

        assert({
          given: 'all runs fail with 75% threshold',
          should: 'return passed: false',
          actual: result.passed,
          expected: false
        });

        assert({
          given: 'failed runs',
          should: 'have passCount: 0',
          actual: result.passCount,
          expected: 0
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('aggregateResults()', () => {
    test('passes when pass count meets threshold', () => {
      const runResults = [
        { passed: true },
        { passed: true },
        { passed: true },
        { passed: false }
      ];
      
      const result = aggregateResults({
        runResults,
        threshold: 75, // requires 3 passes
        runs: 4
      });

      assert({
        given: '3 passes out of 4 runs with 75% threshold',
        should: 'return passed: true',
        actual: result.passed,
        expected: true
      });

      assert({
        given: 'aggregated results',
        should: 'include pass count',
        actual: result.passCount,
        expected: 3
      });

      assert({
        given: 'aggregated results',
        should: 'include total runs',
        actual: result.totalRuns,
        expected: 4
      });
    });

    test('fails when pass count below threshold', () => {
      const runResults = [
        { passed: true },
        { passed: false },
        { passed: false },
        { passed: false }
      ];
      
      const result = aggregateResults({
        runResults,
        threshold: 75, // requires 3 passes
        runs: 4
      });

      assert({
        given: '1 pass out of 4 runs with 75% threshold',
        should: 'return passed: false',
        actual: result.passed,
        expected: false
      });

      assert({
        given: 'aggregated results',
        should: 'include pass count',
        actual: result.passCount,
        expected: 1
      });
    });

    test('includes individual run results', () => {
      const runResults = [
        { passed: true, output: 'Test 1' },
        { passed: false, output: 'Test 2' }
      ];
      
      const result = aggregateResults({
        runResults,
        threshold: 50,
        runs: 2
      });

      assert({
        given: 'run results with outputs',
        should: 'include runResults array',
        actual: result.runResults,
        expected: runResults
      });
    });
  });
});
