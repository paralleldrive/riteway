import { describe, test, vi } from 'vitest';
import { assert } from './vitest.js';
import {
  readTestFile,
  calculateRequiredPasses,
  aggregatePerAssertionResults,
  executeAgent,
  runAITests,
  validateFilePath,
  verifyAgentAuthentication,
  parseStringResult,
  parseOpenCodeNDJSON,
  normalizeJudgment
} from './ai-runner.js';
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

  describe('parseStringResult()', () => {
    const createMockLogger = () => {
      const logs = [];
      return {
        log: (...args) => logs.push(args.join(' ')),
        logs
      };
    };

    test('parses direct JSON when string starts with {', () => {
      const logger = createMockLogger();
      const input = '{"passed": true, "output": "test"}';
      
      const result = parseStringResult(input, logger);
      
      assert({
        given: 'JSON string starting with {',
        should: 'parse as JSON object',
        actual: JSON.stringify(result),
        expected: '{"passed":true,"output":"test"}'
      });

      assert({
        given: 'successful JSON parse',
        should: 'log success message',
        actual: logger.logs.some(log => log.includes('Successfully parsed string as JSON')),
        expected: true
      });
    });

    test('parses direct JSON when string starts with [', () => {
      const logger = createMockLogger();
      const input = '[{"id": 1}, {"id": 2}]';
      
      const result = parseStringResult(input, logger);
      
      assert({
        given: 'JSON string starting with [',
        should: 'parse as JSON array',
        actual: result.length,
        expected: 2
      });
    });

    test('extracts markdown-wrapped JSON when direct parse fails', () => {
      const logger = createMockLogger();
      const input = '```json\n{"passed": true, "output": "test"}\n```';
      
      const result = parseStringResult(input, logger);
      
      assert({
        given: 'markdown-wrapped JSON',
        should: 'extract and parse JSON',
        actual: JSON.stringify(result),
        expected: '{"passed":true,"output":"test"}'
      });

      assert({
        given: 'markdown extraction',
        should: 'log markdown extraction',
        actual: logger.logs.some(log => log.includes('markdown-wrapped JSON')),
        expected: true
      });
    });

    test('extracts markdown-wrapped JSON without json language tag', () => {
      const logger = createMockLogger();
      const input = '```\n{"passed": true}\n```';
      
      const result = parseStringResult(input, logger);
      
      assert({
        given: 'markdown without json tag',
        should: 'extract and parse JSON',
        actual: result.passed,
        expected: true
      });
    });

    test('tries markdown extraction even if string starts with {', () => {
      const logger = createMockLogger();
      // Intentionally malformed JSON that starts with { but isn't valid
      const input = '{ broken json ```json\n{"passed": true}\n```';
      
      const result = parseStringResult(input, logger);
      
      assert({
        given: 'malformed JSON with markdown fallback',
        should: 'extract from markdown block',
        actual: result.passed,
        expected: true
      });

      assert({
        given: 'fallback scenario',
        should: 'log failed parse and markdown extraction',
        actual: logger.logs.some(log => log.includes('trying markdown extraction')),
        expected: true
      });
    });

    test('returns plain text when no parsing succeeds', () => {
      const logger = createMockLogger();
      const input = 'This is just plain text with no JSON';
      
      const result = parseStringResult(input, logger);
      
      assert({
        given: 'plain text string',
        should: 'return original string',
        actual: result,
        expected: input
      });

      assert({
        given: 'no valid JSON',
        should: 'log keeping as plain text',
        actual: logger.logs.some(log => log.includes('keeping as plain text')),
        expected: true
      });
    });

    test('handles malformed markdown gracefully', () => {
      const logger = createMockLogger();
      const input = '```json\n{ broken: json }\n```';
      
      const result = parseStringResult(input, logger);
      
      assert({
        given: 'markdown with invalid JSON',
        should: 'return original string',
        actual: result,
        expected: input
      });

      assert({
        given: 'failed markdown parse',
        should: 'log failure',
        actual: logger.logs.some(log => log.includes('Failed to parse markdown content')),
        expected: true
      });
    });

    test('trims whitespace before parsing', () => {
      const logger = createMockLogger();
      const input = '  \n  {"passed": true}  \n  ';
      
      const result = parseStringResult(input, logger);
      
      assert({
        given: 'JSON with surrounding whitespace',
        should: 'parse successfully',
        actual: result.passed,
        expected: true
      });
    });
  });

  describe('parseOpenCodeNDJSON()', () => {
    const createMockLogger = () => {
      const logs = [];
      return {
        log: (...args) => logs.push(args.join(' ')),
        logs
      };
    };

    test('extracts text from single text event', () => {
      const logger = createMockLogger();
      const ndjson = '{"type":"step_start","timestamp":1770245956364}\n' +
        '{"type":"text","part":{"text":"```json\\n{\\"status\\": \\"ok\\"}\\n```"}}\n' +
        '{"type":"step_finish","timestamp":1770245956211}';
      
      const result = parseOpenCodeNDJSON(ndjson, logger);
      
      assert({
        given: 'NDJSON with single text event',
        should: 'extract text content',
        actual: result,
        expected: '```json\n{"status": "ok"}\n```'
      });

      assert({
        given: 'successful text extraction',
        should: 'log found text event',
        actual: logger.logs.some(log => log.includes('Found text event')),
        expected: true
      });
    });

    test('concatenates multiple text events', () => {
      const logger = createMockLogger();
      const ndjson = '{"type":"text","part":{"text":"Part 1"}}\n' +
        '{"type":"text","part":{"text":" Part 2"}}\n' +
        '{"type":"text","part":{"text":" Part 3"}}';
      
      const result = parseOpenCodeNDJSON(ndjson, logger);
      
      assert({
        given: 'NDJSON with multiple text events',
        should: 'concatenate all text content',
        actual: result,
        expected: 'Part 1 Part 2 Part 3'
      });
    });

    test('filters out non-text events', () => {
      const logger = createMockLogger();
      const ndjson = '{"type":"step_start","data":"ignored"}\n' +
        '{"type":"text","part":{"text":"Hello"}}\n' +
        '{"type":"step_finish","data":"ignored"}\n' +
        '{"type":"text","part":{"text":" World"}}';
      
      const result = parseOpenCodeNDJSON(ndjson, logger);
      
      assert({
        given: 'NDJSON with mixed event types',
        should: 'extract only text events',
        actual: result,
        expected: 'Hello World'
      });
    });

    test('skips malformed JSON lines', () => {
      const logger = createMockLogger();
      const ndjson = '{invalid json}\n' +
        '{"type":"text","part":{"text":"Valid text"}}\n' +
        'not json at all';
      
      const result = parseOpenCodeNDJSON(ndjson, logger);
      
      assert({
        given: 'NDJSON with malformed lines',
        should: 'skip invalid lines and process valid ones',
        actual: result,
        expected: 'Valid text'
      });

      assert({
        given: 'malformed JSON',
        should: 'log warning for failed parse',
        actual: logger.logs.some(log => log.includes('Failed to parse NDJSON line')),
        expected: true
      });
    });

    test('throws error when no text events found', () => {
      const logger = createMockLogger();
      const ndjson = '{"type":"step_start","data":"no text here"}\n' +
        '{"type":"step_finish","data":"still no text"}';
      
      let error;
      try {
        parseOpenCodeNDJSON(ndjson, logger);
      } catch (e) {
        error = e;
      }
      
      assert({
        given: 'NDJSON with no text events',
        should: 'throw Error with cause',
        actual: error instanceof Error && error.cause !== undefined,
        expected: true
      });

      assert({
        given: 'NDJSON with no text events',
        should: 'have ParseError name in cause',
        actual: error?.cause?.name,
        expected: 'ParseError'
      });

      assert({
        given: 'NDJSON with no text events',
        should: 'have NO_TEXT_EVENTS code in cause',
        actual: error?.cause?.code,
        expected: 'NO_TEXT_EVENTS'
      });

      assert({
        given: 'NDJSON with no text events',
        should: 'include ndjsonLength in cause',
        actual: typeof error?.cause?.ndjsonLength === 'number',
        expected: true
      });

      assert({
        given: 'NDJSON with no text events',
        should: 'include linesProcessed in cause',
        actual: error?.cause?.linesProcessed,
        expected: 2
      });
    });

    test('handles empty lines in NDJSON', () => {
      const logger = createMockLogger();
      const ndjson = '\n\n{"type":"text","part":{"text":"Hello"}}\n\n\n{"type":"text","part":{"text":" World"}}\n\n';
      
      const result = parseOpenCodeNDJSON(ndjson, logger);
      
      assert({
        given: 'NDJSON with empty lines',
        should: 'filter empty lines and process valid events',
        actual: result,
        expected: 'Hello World'
      });
    });

    test('preserves markdown-wrapped JSON in text', () => {
      const logger = createMockLogger();
      const ndjson = '{"type":"text","part":{"text":"```json\\n{\\"passed\\":true}\\n```"}}';
      
      const result = parseOpenCodeNDJSON(ndjson, logger);
      
      assert({
        given: 'text event with markdown-wrapped JSON',
        should: 'preserve markdown formatting',
        actual: result,
        expected: '```json\n{"passed":true}\n```'
      });
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

    test('validates runs is a positive integer', () => {
      const invalidRunsValues = [
        { value: 0, label: 'zero' },
        { value: -1, label: 'negative' },
        { value: NaN, label: 'NaN' },
        { value: 1.5, label: 'non-integer' }
      ];

      for (const { value, label } of invalidRunsValues) {
        let error;
        try {
          calculateRequiredPasses({ runs: value, threshold: 75 });
        } catch (err) {
          error = err;
        }

        assert({
          given: `runs value of ${label} (${value})`,
          should: 'throw an error with message',
          actual: error?.message,
          expected: 'runs must be a positive integer'
        });

        assert({
          given: `runs value of ${label} (${value})`,
          should: 'have ValidationError name in cause',
          actual: error?.cause?.name,
          expected: 'ValidationError'
        });

        assert({
          given: `runs value of ${label} (${value})`,
          should: 'have INVALID_RUNS code in cause',
          actual: error?.cause?.code,
          expected: 'INVALID_RUNS'
        });
      }
    });

    test('validates threshold is between 0 and 100', () => {
      let error1;
      try {
        calculateRequiredPasses({ runs: 4, threshold: 150 });
      } catch (err) {
        error1 = err;
      }

      assert({
        given: 'threshold > 100',
        should: 'throw an error with message',
        actual: error1?.message,
        expected: 'threshold must be between 0 and 100'
      });

      assert({
        given: 'threshold > 100',
        should: 'have ValidationError name in cause',
        actual: error1?.cause?.name,
        expected: 'ValidationError'
      });

      assert({
        given: 'threshold > 100',
        should: 'have INVALID_THRESHOLD code in cause',
        actual: error1?.cause?.code,
        expected: 'INVALID_THRESHOLD'
      });

      let error2;
      try {
        calculateRequiredPasses({ runs: 4, threshold: -10 });
      } catch (err) {
        error2 = err;
      }

      assert({
        given: 'negative threshold',
        should: 'throw an error with message',
        actual: error2?.message,
        expected: 'threshold must be between 0 and 100'
      });

      assert({
        given: 'negative threshold',
        should: 'have ValidationError name in cause',
        actual: error2?.cause?.name,
        expected: 'ValidationError'
      });

      assert({
        given: 'negative threshold',
        should: 'have INVALID_THRESHOLD code in cause',
        actual: error2?.cause?.code,
        expected: 'INVALID_THRESHOLD'
      });
    });

    test('validates threshold is a finite number', () => {
      let error;
      try {
        calculateRequiredPasses({ runs: 4, threshold: NaN });
      } catch (err) {
        error = err;
      }

      assert({
        given: 'NaN threshold',
        should: 'throw ValidationError',
        actual: error?.cause?.name,
        expected: 'ValidationError'
      });

      assert({
        given: 'NaN threshold',
        should: 'have INVALID_THRESHOLD code',
        actual: error?.cause?.code,
        expected: 'INVALID_THRESHOLD'
      });

      assert({
        given: 'NaN threshold',
        should: 'have clear error message',
        actual: error?.message,
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

  describe('validateFilePath()', () => {
    test('accepts paths within base directory', () => {
      const baseDir = '/home/user/project';

      assert({
        given: 'a path within the base directory',
        should: 'return the resolved absolute path',
        actual: validateFilePath('tests/test.sudo', baseDir),
        expected: '/home/user/project/tests/test.sudo'
      });
    });

    test('accepts absolute paths within base directory', () => {
      const baseDir = '/home/user/project';

      assert({
        given: 'an absolute path within the base directory',
        should: 'return the resolved absolute path',
        actual: validateFilePath('/home/user/project/tests/test.sudo', baseDir),
        expected: '/home/user/project/tests/test.sudo'
      });
    });

    test('rejects path traversal attempts', () => {
      const baseDir = '/home/user/project';
      let error;
      
      try {
        validateFilePath('../../etc/passwd', baseDir);
      } catch (err) {
        error = err;
      }

      assert({
        given: 'a path that escapes the base directory',
        should: 'throw an error with message',
        actual: error?.message,
        expected: 'File path escapes base directory'
      });

      assert({
        given: 'a path that escapes the base directory',
        should: 'have SecurityError name in cause',
        actual: error?.cause?.name,
        expected: 'SecurityError'
      });

      assert({
        given: 'a path that escapes the base directory',
        should: 'have PATH_TRAVERSAL code in cause',
        actual: error?.cause?.code,
        expected: 'PATH_TRAVERSAL'
      });
    });

    test('rejects absolute path outside base directory', () => {
      const baseDir = '/home/user/project';
      let error;
      
      try {
        validateFilePath('/etc/passwd', baseDir);
      } catch (err) {
        error = err;
      }

      assert({
        given: 'an absolute path outside the base directory',
        should: 'throw an error with message',
        actual: error?.message,
        expected: 'File path escapes base directory'
      });

      assert({
        given: 'an absolute path outside the base directory',
        should: 'have SecurityError name in cause',
        actual: error?.cause?.name,
        expected: 'SecurityError'
      });

      assert({
        given: 'an absolute path outside the base directory',
        should: 'have PATH_TRAVERSAL code in cause',
        actual: error?.cause?.code,
        expected: 'PATH_TRAVERSAL'
      });
    });
  });

  describe('aggregatePerAssertionResults()', () => {
    test('aggregates per-assertion results when all assertions pass', () => {
      const perAssertionResults = [
        {
          requirement: 'Given simple addition, should add correctly',
          runResults: [
            { passed: true, output: 'ok' },
            { passed: true, output: 'ok' }
          ]
        },
        {
          requirement: 'Given format, should output JSON',
          runResults: [
            { passed: true, output: 'ok' },
            { passed: true, output: 'ok' }
          ]
        }
      ];

      const result = aggregatePerAssertionResults({
        perAssertionResults,
        threshold: 75,
        runs: 2
      });

      assert({
        given: 'all assertions meeting threshold',
        should: 'return passed: true',
        actual: result.passed,
        expected: true
      });

      assert({
        given: 'two assertions',
        should: 'return assertions array of length 2',
        actual: result.assertions.length,
        expected: 2
      });

      assert({
        given: 'first assertion with all passes',
        should: 'mark the assertion as passed',
        actual: result.assertions[0].passed,
        expected: true
      });

      assert({
        given: 'first assertion with 2 passes',
        should: 'report passCount 2',
        actual: result.assertions[0].passCount,
        expected: 2
      });

      assert({
        given: 'first assertion requirement',
        should: 'preserve the requirement',
        actual: result.assertions[0].requirement,
        expected: 'Given simple addition, should add correctly'
      });
    });

    test('fails when any assertion does not meet threshold', () => {
      const perAssertionResults = [
        {
          requirement: 'Given addition, should add correctly',
          runResults: [
            { passed: true, output: 'ok' },
            { passed: true, output: 'ok' }
          ]
        },
        {
          requirement: 'Given format, should output JSON',
          runResults: [
            { passed: false, output: 'fail' },
            { passed: false, output: 'fail' }
          ]
        }
      ];

      const result = aggregatePerAssertionResults({
        perAssertionResults,
        threshold: 75,
        runs: 2
      });

      assert({
        given: 'one assertion failing threshold',
        should: 'return passed: false',
        actual: result.passed,
        expected: false
      });

      assert({
        given: 'the passing assertion',
        should: 'mark it as passed',
        actual: result.assertions[0].passed,
        expected: true
      });

      assert({
        given: 'the failing assertion',
        should: 'mark it as failed',
        actual: result.assertions[1].passed,
        expected: false
      });

      assert({
        given: 'the failing assertion',
        should: 'have passCount 0',
        actual: result.assertions[1].passCount,
        expected: 0
      });
    });

    test('includes per-assertion run results', () => {
      const runResults = [
        { passed: true, output: 'run 1' },
        { passed: false, output: 'run 2' }
      ];
      const perAssertionResults = [
        { requirement: 'test assertion', runResults }
      ];

      const result = aggregatePerAssertionResults({
        perAssertionResults,
        threshold: 50,
        runs: 2
      });

      assert({
        given: 'per-assertion run results',
        should: 'include run results in the assertion',
        actual: result.assertions[0].runResults,
        expected: runResults
      });

      assert({
        given: 'per-assertion run results',
        should: 'include totalRuns per assertion',
        actual: result.assertions[0].totalRuns,
        expected: 2
      });
    });

    test('calculates averageScore from run results', () => {
      const perAssertionResults = [
        {
          requirement: 'test with scores',
          runResults: [
            { passed: true, score: 85 },
            { passed: true, score: 95 },
            { passed: true, score: 90 }
          ]
        }
      ];

      const result = aggregatePerAssertionResults({
        perAssertionResults,
        threshold: 50,
        runs: 3
      });

      assert({
        given: 'run results with scores 85, 95, 90',
        should: 'calculate average score as 90',
        actual: result.assertions[0].averageScore,
        expected: 90
      });
    });

    test('rounds averageScore to 2 decimal places', () => {
      const perAssertionResults = [
        {
          requirement: 'test with fractional average',
          runResults: [
            { passed: true, score: 85 },
            { passed: true, score: 90 },
            { passed: false, score: 88 }
          ]
        }
      ];

      const result = aggregatePerAssertionResults({
        perAssertionResults,
        threshold: 50,
        runs: 3
      });

      // Average: (85 + 90 + 88) / 3 = 87.666... rounds to 87.67
      assert({
        given: 'run results with scores 85, 90, 88',
        should: 'round average score to 87.67',
        actual: result.assertions[0].averageScore,
        expected: 87.67
      });
    });

    test('defaults missing score values to 0 in average', () => {
      const perAssertionResults = [
        {
          requirement: 'test with some missing scores',
          runResults: [
            { passed: true, score: 90 },
            { passed: true }, // missing score
            { passed: true, score: 80 }
          ]
        }
      ];

      const result = aggregatePerAssertionResults({
        perAssertionResults,
        threshold: 50,
        runs: 3
      });

      // Average: (90 + 0 + 80) / 3 = 56.666... rounds to 56.67
      assert({
        given: 'run results with one missing score',
        should: 'treat missing score as 0 and calculate average as 56.67',
        actual: result.assertions[0].averageScore,
        expected: 56.67
      });
    });

    test('handles all missing scores by defaulting to 0', () => {
      const perAssertionResults = [
        {
          requirement: 'test with all missing scores',
          runResults: [
            { passed: true },
            { passed: false },
            { passed: true }
          ]
        }
      ];

      const result = aggregatePerAssertionResults({
        perAssertionResults,
        threshold: 50,
        runs: 3
      });

      assert({
        given: 'run results with all missing scores',
        should: 'calculate average score as 0',
        actual: result.assertions[0].averageScore,
        expected: 0
      });
    });

    test('handles empty runResults without division by zero', () => {
      const perAssertionResults = [
        {
          requirement: 'test with no run results',
          runResults: []
        }
      ];

      const result = aggregatePerAssertionResults({
        perAssertionResults,
        threshold: 50,
        runs: 1
      });

      assert({
        given: 'empty runResults array',
        should: 'return averageScore of 0 without error',
        actual: result.assertions[0].averageScore,
        expected: 0
      });

      assert({
        given: 'empty runResults array',
        should: 'not be NaN',
        actual: Number.isNaN(result.assertions[0].averageScore),
        expected: false
      });
    });
  });

  describe('normalizeJudgment()', () => {
    const createMockLogger = () => ({
      log: vi.fn()
    });

    test('is exported as a function', () => {
      assert({
        given: 'ai-runner module',
        should: 'export normalizeJudgment',
        actual: typeof normalizeJudgment,
        expected: 'function'
      });
    });

    test('passes through complete valid input unchanged', () => {
      const logger = createMockLogger();
      const raw = {
        passed: true,
        actual: 'Result from agent',
        expected: 'Expected output',
        score: 85
      };

      const result = normalizeJudgment(raw, {
        requirement: 'test assertion',
        runIndex: 0,
        logger
      });

      assert({
        given: 'complete valid judgment with passed: true',
        should: 'preserve passed as true',
        actual: result.passed,
        expected: true
      });

      assert({
        given: 'complete valid judgment',
        should: 'preserve actual value',
        actual: result.actual,
        expected: 'Result from agent'
      });

      assert({
        given: 'complete valid judgment',
        should: 'preserve expected value',
        actual: result.expected,
        expected: 'Expected output'
      });

      assert({
        given: 'complete valid judgment with score 85',
        should: 'preserve score value',
        actual: result.score,
        expected: 85
      });
    });

    test('defaults passed to false when missing', () => {
      const logger = createMockLogger();
      const raw = {
        actual: 'Result',
        expected: 'Expected',
        score: 50
      };

      const result = normalizeJudgment(raw, {
        requirement: 'test',
        runIndex: 0,
        logger
      });

      assert({
        given: 'judgment missing passed field',
        should: 'default passed to false',
        actual: result.passed,
        expected: false
      });
    });

    test('defaults passed to false when explicitly false', () => {
      const logger = createMockLogger();
      const raw = {
        passed: false,
        actual: 'Result',
        expected: 'Expected',
        score: 50
      };

      const result = normalizeJudgment(raw, {
        requirement: 'test',
        runIndex: 0,
        logger
      });

      assert({
        given: 'judgment with passed: false',
        should: 'keep passed as false',
        actual: result.passed,
        expected: false
      });
    });

    test('defaults missing actual and expected fields with warning', () => {
      const logger = createMockLogger();
      const raw = {
        passed: true,
        score: 100
      };

      const result = normalizeJudgment(raw, {
        requirement: 'test assertion',
        runIndex: 2,
        logger
      });

      assert({
        given: 'judgment missing actual',
        should: 'default actual to "No actual provided"',
        actual: result.actual,
        expected: 'No actual provided'
      });

      assert({
        given: 'judgment missing expected',
        should: 'default expected to "No expected provided"',
        actual: result.expected,
        expected: 'No expected provided'
      });

      assert({
        given: 'judgment missing actual and expected',
        should: 'log warning with requirement and run number',
        actual: logger.log.mock.calls[0][0],
        expected: 'Warning: Judge response missing fields for "test assertion" run 3'
      });
    });

    test('logs warning when only actual is missing', () => {
      const logger = createMockLogger();
      const raw = {
        passed: true,
        expected: 'Expected value',
        score: 90
      };

      normalizeJudgment(raw, {
        requirement: 'my test',
        runIndex: 0,
        logger
      });

      assert({
        given: 'judgment missing actual',
        should: 'log warning',
        actual: logger.log.mock.calls.length > 0,
        expected: true
      });
    });

    test('logs warning when only expected is missing', () => {
      const logger = createMockLogger();
      const raw = {
        passed: true,
        actual: 'Actual value',
        score: 90
      };

      normalizeJudgment(raw, {
        requirement: 'my test',
        runIndex: 1,
        logger
      });

      assert({
        given: 'judgment missing expected',
        should: 'log warning',
        actual: logger.log.mock.calls.length > 0,
        expected: true
      });
    });

    test('clamps score above 100 to 100', () => {
      const logger = createMockLogger();
      const raw = {
        passed: true,
        actual: 'Result',
        expected: 'Expected',
        score: 150
      };

      const result = normalizeJudgment(raw, {
        requirement: 'test',
        runIndex: 0,
        logger
      });

      assert({
        given: 'judgment with score 150',
        should: 'clamp to 100',
        actual: result.score,
        expected: 100
      });
    });

    test('clamps negative score to 0', () => {
      const logger = createMockLogger();
      const raw = {
        passed: false,
        actual: 'Result',
        expected: 'Expected',
        score: -50
      };

      const result = normalizeJudgment(raw, {
        requirement: 'test',
        runIndex: 0,
        logger
      });

      assert({
        given: 'judgment with score -50',
        should: 'clamp to 0',
        actual: result.score,
        expected: 0
      });
    });

    test('defaults non-finite score to 0', () => {
      const logger = createMockLogger();
      const raw = {
        passed: true,
        actual: 'Result',
        expected: 'Expected',
        score: NaN
      };

      const result = normalizeJudgment(raw, {
        requirement: 'test',
        runIndex: 0,
        logger
      });

      assert({
        given: 'judgment with NaN score',
        should: 'default to 0',
        actual: result.score,
        expected: 0
      });
    });

    test('defaults missing score to 0', () => {
      const logger = createMockLogger();
      const raw = {
        passed: true,
        actual: 'Result',
        expected: 'Expected'
      };

      const result = normalizeJudgment(raw, {
        requirement: 'test',
        runIndex: 0,
        logger
      });

      assert({
        given: 'judgment missing score',
        should: 'default to 0',
        actual: result.score,
        expected: 0
      });
    });

    test('throws ParseError on null input', () => {
      const logger = createMockLogger();
      let error;

      try {
        normalizeJudgment(null, {
          requirement: 'test assertion',
          runIndex: 1,
          logger
        });
      } catch (e) {
        error = e;
      }

      assert({
        given: 'null input',
        should: 'throw Error with cause',
        actual: error instanceof Error && error.cause !== undefined,
        expected: true
      });

      assert({
        given: 'null input',
        should: 'have ParseError name in cause',
        actual: error?.cause?.name,
        expected: 'ParseError'
      });

      assert({
        given: 'null input',
        should: 'have JUDGE_INVALID_RESPONSE code in cause',
        actual: error?.cause?.code,
        expected: 'JUDGE_INVALID_RESPONSE'
      });

      assert({
        given: 'null input',
        should: 'include requirement in cause',
        actual: error?.cause?.requirement,
        expected: 'test assertion'
      });

      assert({
        given: 'null input',
        should: 'include runIndex in cause',
        actual: error?.cause?.runIndex,
        expected: 1
      });

      assert({
        given: 'null input',
        should: 'include rawResponse in cause',
        actual: error?.cause?.rawResponse,
        expected: null
      });
    });

    test('throws ParseError on string input', () => {
      const logger = createMockLogger();
      let error;

      try {
        normalizeJudgment('not an object', {
          requirement: 'test',
          runIndex: 0,
          logger
        });
      } catch (e) {
        error = e;
      }

      assert({
        given: 'string input',
        should: 'have ParseError name in cause',
        actual: error?.cause?.name,
        expected: 'ParseError'
      });

      assert({
        given: 'string input',
        should: 'have JUDGE_INVALID_RESPONSE code in cause',
        actual: error?.cause?.code,
        expected: 'JUDGE_INVALID_RESPONSE'
      });
    });

    test('throws ParseError on undefined input', () => {
      const logger = createMockLogger();
      let error;

      try {
        normalizeJudgment(undefined, {
          requirement: 'test',
          runIndex: 0,
          logger
        });
      } catch (e) {
        error = e;
      }

      assert({
        given: 'undefined input',
        should: 'have ParseError name in cause',
        actual: error?.cause?.name,
        expected: 'ParseError'
      });

      assert({
        given: 'undefined input',
        should: 'have JUDGE_INVALID_RESPONSE code in cause',
        actual: error?.cause?.code,
        expected: 'JUDGE_INVALID_RESPONSE'
      });
    });
  });

  describe('verifyAgentAuthentication()', () => {
    test('succeeds when agent returns valid JSON', async () => {
      const agentConfig = {
        command: 'node',
        args: ['-e', 'console.log(JSON.stringify({ status: "authenticated" }))']
      };

      const result = await verifyAgentAuthentication({ agentConfig });

      assert({
        given: 'agent returning valid JSON',
        should: 'return success true',
        actual: result.success,
        expected: true
      });
    });

    test('fails when agent exits with non-zero code', async () => {
      const agentConfig = {
        command: 'node',
        args: ['-e', 'process.exit(1)']
      };

      const result = await verifyAgentAuthentication({ agentConfig, timeout: 1000 });

      assert({
        given: 'agent exiting with error code',
        should: 'return success false',
        actual: result.success,
        expected: false
      });

      assert({
        given: 'agent authentication failure',
        should: 'include error message',
        actual: result.error !== undefined,
        expected: true
      });
    });

    test('fails when agent returns invalid JSON', async () => {
      const agentConfig = {
        command: 'node',
        args: ['-e', 'console.log("not json")']
      };

      const result = await verifyAgentAuthentication({ agentConfig, timeout: 1000 });

      assert({
        given: 'agent returning invalid JSON',
        should: 'return success false',
        actual: result.success,
        expected: false
      });

      assert({
        given: 'JSON parsing failure',
        should: 'include error in result',
        actual: result.error !== undefined,
        expected: true
      });
    });

    test('fails when agent times out', async () => {
      const agentConfig = {
        command: 'node',
        args: ['-e', 'setTimeout(() => console.log(JSON.stringify({ok: true})), 5000)']
      };

      const result = await verifyAgentAuthentication({ agentConfig, timeout: 100 });

      assert({
        given: 'agent exceeding timeout',
        should: 'return success false',
        actual: result.success,
        expected: false
      });

      assert({
        given: 'timeout error',
        should: 'include error message',
        actual: result.error !== undefined && result.error.includes('timed out'),
        expected: true
      });
    });

    test('uses default timeout of 30 seconds', async () => {
      const agentConfig = {
        command: 'node',
        args: ['-e', 'console.log(JSON.stringify({ ok: true }))']
      };

      const result = await verifyAgentAuthentication({ agentConfig });

      assert({
        given: 'no timeout specified',
        should: 'complete successfully with default timeout',
        actual: result.success,
        expected: true
      });
    });

    test('provides helpful error message for authentication errors', async () => {
      const agentConfig = {
        command: 'node',
        args: ['-e', 'console.error("authentication failed"); process.exit(1)']
      };

      const result = await verifyAgentAuthentication({ agentConfig, timeout: 1000 });

      assert({
        given: 'authentication error in stderr',
        should: 'include helpful guidance in error',
        actual: result.error.includes('authentication') || result.error.includes('Make sure your agent CLI is authenticated'),
        expected: true
      });
    });
  });
});
