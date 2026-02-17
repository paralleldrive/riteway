import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { parseAIArgs, formatAssertionReport, runAICommand, defaults } from './ai-command.js';

describe('defaults', () => {
  test('exports centralized default values', () => {
    assert({
      given: 'defaults export',
      should: 'contain all default values',
      actual: defaults,
      expected: {
        runs: 4,
        threshold: 75,
        concurrency: 4,
        agent: 'claude',
        color: false,
        debug: false,
        debugLog: false
      }
    });
  });
});

describe('parseAIArgs()', () => {
  test('parses file path as first argument with defaults', () => {
    const result = parseAIArgs(['test.sudo']);

    assert({
      given: 'only a file path argument',
      should: 'return file path with all defaults',
      actual: result,
      expected: {
        filePath: 'test.sudo',
        runs: defaults.runs,
        threshold: defaults.threshold,
        agent: defaults.agent,
        debug: defaults.debug,
        debugLog: defaults.debugLog,
        color: defaults.color,
        concurrency: defaults.concurrency,
        cwd: process.cwd()
      }
    });
  });

  test('parses custom runs value', () => {
    const result = parseAIArgs(['--runs', '10', 'test.sudo']);

    assert({
      given: '--runs flag with value 10',
      should: 'parse runs as 10',
      actual: result.runs,
      expected: 10
    });
  });

  test('parses custom threshold value', () => {
    const result = parseAIArgs(['--threshold', '80', 'test.sudo']);

    assert({
      given: '--threshold flag with value 80',
      should: 'parse threshold as 80',
      actual: result.threshold,
      expected: 80
    });
  });

  test('parses custom agent value', () => {
    const result = parseAIArgs(['--agent', 'opencode', 'test.sudo']);

    assert({
      given: '--agent flag with "opencode"',
      should: 'parse agent as "opencode"',
      actual: result.agent,
      expected: 'opencode'
    });
  });

  test('parses all custom values', () => {
    const result = parseAIArgs(['--runs', '5', '--threshold', '60', '--agent', 'cursor', 'test.sudo']);

    assert({
      given: 'multiple custom flags',
      should: 'parse all custom values correctly',
      actual: {
        filePath: result.filePath,
        runs: result.runs,
        threshold: result.threshold,
        agent: result.agent
      },
      expected: {
        filePath: 'test.sudo',
        runs: 5,
        threshold: 60,
        agent: 'cursor'
      }
    });
  });

  test('throws ValidationError when no file path provided', () => {
    const error = Try(parseAIArgs, []);

    assert({
      given: 'no file path argument',
      should: 'throw Error with cause',
      actual: error instanceof Error && error.cause !== undefined,
      expected: true
    });

    assert({
      given: 'no file path argument',
      should: 'have ValidationError name in cause',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: 'no file path argument',
      should: 'have INVALID_AI_ARGS code in cause',
      actual: error?.cause?.code,
      expected: 'INVALID_AI_ARGS'
    });

    assert({
      given: 'no file path argument',
      should: 'mention file path in error message',
      actual: /filepath|file path/i.test(error?.cause?.message),
      expected: true
    });
  });

  test('parses debug flag as true', () => {
    const result = parseAIArgs(['--debug', 'test.sudo']);

    assert({
      given: '--debug flag',
      should: 'set debug to true',
      actual: result.debug,
      expected: true
    });
  });

  test('parses debug-log flag and enables debug mode', () => {
    const result = parseAIArgs(['--debug-log', 'test.sudo']);

    assert({
      given: '--debug-log flag',
      should: 'enable debug mode',
      actual: result.debug,
      expected: true
    });

    assert({
      given: '--debug-log flag',
      should: 'set debugLog to true',
      actual: result.debugLog,
      expected: true
    });
  });

  test('parses color flag as true', () => {
    const result = parseAIArgs(['--color', 'test.sudo']);

    assert({
      given: '--color flag',
      should: 'set color to true',
      actual: result.color,
      expected: true
    });
  });

  test('defaults color to false when no flag specified', () => {
    const result = parseAIArgs(['test.sudo']);

    assert({
      given: 'no --color flag',
      should: 'default color to false',
      actual: result.color,
      expected: defaults.color
    });
  });

  test('throws ValidationError for threshold > 100', () => {
    const error = Try(parseAIArgs, ['--threshold', '150', 'test.sudo']);

    assert({
      given: 'threshold > 100',
      should: 'have ValidationError name in cause',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });
  });

  test('throws ValidationError for negative threshold', () => {
    const error = Try(parseAIArgs, ['--threshold', '-10', 'test.sudo']);

    assert({
      given: 'negative threshold',
      should: 'have ValidationError name in cause',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });
  });

  test('throws ValidationError for runs = 0', () => {
    const error = Try(parseAIArgs, ['--runs', '0', 'test.sudo']);

    assert({
      given: 'runs = 0',
      should: 'have ValidationError name in cause',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });
  });

  test('throws ValidationError for negative concurrency', () => {
    const error = Try(parseAIArgs, ['--concurrency', '-5', 'test.sudo']);

    assert({
      given: 'negative concurrency',
      should: 'have ValidationError name in cause',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });
  });

  test('throws ValidationError for unsupported agent', () => {
    const error = Try(parseAIArgs, ['--agent', 'invalid-agent', 'test.sudo']);

    assert({
      given: 'unsupported agent name',
      should: 'have ValidationError name in cause',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });
  });

  test('includes agentConfigPath when --agent-config flag provided', () => {
    const result = parseAIArgs(['--agent-config', './my-agent.json', 'test.sudo']);

    assert({
      given: '--agent-config flag with path',
      should: 'set agentConfigPath',
      actual: result.agentConfigPath,
      expected: './my-agent.json'
    });
  });

  test('throws ValidationError when both --agent and --agent-config provided', () => {
    const error = Try(parseAIArgs, ['--agent', 'opencode', '--agent-config', './my-agent.json', 'test.sudo']);

    assert({
      given: 'both --agent and --agent-config flags',
      should: 'have ValidationError name in cause',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: 'both --agent and --agent-config flags',
      should: 'have INVALID_AI_ARGS code in cause',
      actual: error?.cause?.code,
      expected: 'INVALID_AI_ARGS'
    });
  });

  test('does not include agentConfigPath when --agent-config not provided', () => {
    const result = parseAIArgs(['test.sudo']);

    assert({
      given: 'no --agent-config flag',
      should: 'not include agentConfigPath',
      actual: result.agentConfigPath,
      expected: undefined
    });
  });
});

describe('formatAssertionReport()', () => {
  test('formats passing assertion with PASS status', () => {
    const result = formatAssertionReport({
      passed: true,
      requirement: 'test assertion',
      passCount: 4,
      totalRuns: 4
    });

    assert({
      given: 'passing assertion (4/4 runs)',
      should: 'format with [PASS] status',
      actual: result,
      expected: '  [PASS] test assertion (4/4 runs)'
    });
  });

  test('formats failing assertion with FAIL status', () => {
    const result = formatAssertionReport({
      passed: false,
      requirement: 'test assertion',
      passCount: 2,
      totalRuns: 4
    });

    assert({
      given: 'failing assertion (2/4 runs)',
      should: 'format with [FAIL] status',
      actual: result,
      expected: '  [FAIL] test assertion (2/4 runs)'
    });
  });

  test('formats assertion with partial success', () => {
    const result = formatAssertionReport({
      passed: false,
      requirement: 'partial pass',
      passCount: 3,
      totalRuns: 5
    });

    assert({
      given: 'partial success (3/5 runs)',
      should: 'format with [FAIL] status',
      actual: result,
      expected: '  [FAIL] partial pass (3/5 runs)'
    });
  });

  test('wraps PASS status in green ANSI code when color enabled', () => {
    const result = formatAssertionReport({
      passed: true,
      requirement: 'test assertion',
      passCount: 4,
      totalRuns: 4,
      color: true
    });

    assert({
      given: 'passing assertion with color enabled',
      should: 'wrap PASS in green ANSI code',
      actual: result,
      expected: '  \x1b[32m[PASS]\x1b[0m test assertion (4/4 runs)'
    });
  });

  test('wraps FAIL status in red ANSI code when color enabled', () => {
    const result = formatAssertionReport({
      passed: false,
      requirement: 'test assertion',
      passCount: 2,
      totalRuns: 4,
      color: true
    });

    assert({
      given: 'failing assertion with color enabled',
      should: 'wrap FAIL in red ANSI code',
      actual: result,
      expected: '  \x1b[31m[FAIL]\x1b[0m test assertion (2/4 runs)'
    });
  });

  test('does not include ANSI codes when color not enabled', () => {
    const result = formatAssertionReport({
      passed: true,
      requirement: 'test assertion',
      passCount: 4,
      totalRuns: 4
    });

    assert({
      given: 'color not enabled',
      should: 'not include ANSI escape codes',
      actual: result.includes('\x1b['),
      expected: false
    });
  });
});

describe('runAICommand()', () => {
  test('throws ValidationError when filePath is undefined', async () => {
    const error = await Try(runAICommand, { filePath: undefined, runs: 4, threshold: 75, cwd: process.cwd() });

    assert({
      given: 'undefined filePath',
      should: 'throw Error with cause',
      actual: error instanceof Error && error.cause !== undefined,
      expected: true
    });

    assert({
      given: 'undefined filePath',
      should: 'have ValidationError name in cause',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: 'undefined filePath',
      should: 'have VALIDATION_FAILURE code in cause',
      actual: error?.cause?.code,
      expected: 'VALIDATION_FAILURE'
    });

    assert({
      given: 'undefined filePath',
      should: 'mention file path in error message',
      actual: error?.cause?.message?.includes('file path'),
      expected: true
    });
  });

  test('throws SecurityError for path traversal attempt', async () => {
    const error = await Try(runAICommand, {
      filePath: '../../../etc/passwd',
      runs: 4,
      threshold: 75,
      agent: 'claude',
      cwd: process.cwd()
    });

    assert({
      given: 'path traversal attempt',
      should: 'have SecurityError name in cause',
      actual: error?.cause?.name,
      expected: 'SecurityError'
    });

    assert({
      given: 'path traversal attempt',
      should: 'have PATH_TRAVERSAL code in cause',
      actual: error?.cause?.code,
      expected: 'PATH_TRAVERSAL'
    });
  });
});
