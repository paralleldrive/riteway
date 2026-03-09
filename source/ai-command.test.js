import { describe, test, vi, beforeEach, onTestFinished } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { parseAIArgs, formatAssertionReport, runAICommand } from './ai-command.js';
import { runAITests, verifyAgentAuthentication } from './ai-runner.js';
import { resolveAgentConfig } from './agent-config.js';
import { recordTestOutput } from './test-output.js';

vi.mock('./ai-runner.js', () => ({
  runAITests: vi.fn(),
  verifyAgentAuthentication: vi.fn()
}));
vi.mock('./agent-config.js', () => ({
  resolveAgentConfig: vi.fn()
}));
vi.mock('./test-output.js', () => ({
  recordTestOutput: vi.fn()
}));

describe('parseAIArgs()', () => {
  test('parses file path as first argument with defaults', () => {
    const result = parseAIArgs(['test.sudo']);

    assert({
      given: 'only a file path argument',
      should: 'apply default runs, threshold, timeout, agent, color, and concurrency',
      actual: result,
      expected: {
        filePath: 'test.sudo',
        runs: 4,
        threshold: 75,
        timeout: 300000,
        agent: 'claude',
        color: false,
        concurrency: 4,
        cwd: process.cwd()
      }
    });
  });

  test('parses custom timeout value', () => {
    const result = parseAIArgs(['--timeout', '60000', 'test.sudo']);

    assert({
      given: '--timeout flag with value 60000',
      should: 'parse timeout as 60000',
      actual: result.timeout,
      expected: 60000
    });
  });

  test('throws ValidationError for timeout below minimum', () => {
    const error = Try(parseAIArgs, ['--timeout', '500', 'test.sudo']);

    assert({
      given: 'timeout below 1000ms minimum',
      should: 'have ValidationError name in cause',
      actual: error?.cause?.name,
      expected: 'ValidationError'
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
      expected: false
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

  test('accepts custom agent names for registry-based resolution', () => {
    const result = parseAIArgs(['--agent', 'custom-tool', 'test.sudo']);

    assert({
      given: 'a custom agent name not in the built-in list',
      should: 'parse successfully — resolution happens at run time via the registry',
      actual: result.agent,
      expected: 'custom-tool'
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
      should: 'throw ValidationError with missing file path message',
      actual: error?.cause,
      expected: {
        name: 'ValidationError',
        code: 'VALIDATION_FAILURE',
        message: 'Test file path is required'
      }
    });
  });

  test('throws SecurityError for path traversal attempt', async () => {
    const cwd = process.cwd();
    const error = await Try(runAICommand, {
      filePath: '../../../etc/passwd',
      runs: 4,
      threshold: 75,
      agent: 'claude',
      cwd
    });

    assert({
      given: 'path traversal attempt',
      should: 'throw SecurityError with path traversal details',
      actual: error?.cause,
      expected: {
        name: 'SecurityError',
        code: 'PATH_TRAVERSAL',
        message: 'File path escapes base directory',
        filePath: '../../../etc/passwd',
        baseDir: cwd
      }
    });
  });
});

describe('runAICommand() orchestration', () => {
  const outputPath = '/ai-evals/2026-01-23-test-abc.tap.md';
  const agentConfig = { command: 'claude', args: ['--print', '--no-color'] };
  const passedResults = {
    passed: true,
    assertions: [{ requirement: 'Given a test, should pass', passed: true, passCount: 4, totalRuns: 4 }]
  };
  const args = { filePath: './test.sudo', runs: 4, threshold: 75, timeout: 300000, agent: 'claude', color: false, concurrency: 4, cwd: process.cwd() };

  beforeEach(() => {
    vi.mocked(resolveAgentConfig).mockResolvedValue(agentConfig);
    vi.mocked(verifyAgentAuthentication).mockResolvedValue({ success: true });
    vi.mocked(runAITests).mockResolvedValue(passedResults);
    vi.mocked(recordTestOutput).mockResolvedValue(outputPath);
  });

  test('returns output path when tests pass', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    const result = await runAICommand(args);

    assert({
      given: 'valid test file and authenticated agent with passing results',
      should: 'return path to TAP output file',
      actual: result,
      expected: outputPath
    });
  });

  test('resolves agent config and passes it to runAITests', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    await runAICommand(args);

    assert({
      given: 'agent name "claude" and no agentConfigPath',
      should: 'call resolveAgentConfig with agent, agentConfigPath, and cwd',
      actual: vi.mocked(resolveAgentConfig).mock.lastCall?.[0],
      expected: { agent: 'claude', agentConfigPath: undefined, cwd: process.cwd() }
    });

    assert({
      given: 'resolved agent config',
      should: 'pass it to runAITests',
      actual: vi.mocked(runAITests).mock.lastCall?.[0].agentConfig,
      expected: agentConfig
    });
  });

  test('passes agentConfigPath to resolveAgentConfig when provided', async () => {
    const customConfig = { command: 'my-agent', args: ['--custom'], outputFormat: 'json' };
    vi.mocked(resolveAgentConfig).mockResolvedValue(customConfig);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    await runAICommand({ ...args, agentConfigPath: './my-agent.json' });

    assert({
      given: 'agentConfigPath provided',
      should: 'pass it to resolveAgentConfig',
      actual: vi.mocked(resolveAgentConfig).mock.lastCall?.[0].agentConfigPath,
      expected: './my-agent.json'
    });

    assert({
      given: 'resolved custom agent config',
      should: 'pass it to runAITests',
      actual: vi.mocked(runAITests).mock.lastCall?.[0].agentConfig,
      expected: customConfig
    });
  });

  test('throws AITestError when test suite fails', async () => {
    vi.mocked(runAITests).mockResolvedValue({
      passed: false,
      assertions: [{ requirement: 'Given a test, should pass', passed: false, passCount: 1, totalRuns: 4 }]
    });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    const error = await Try(runAICommand, args);

    assert({
      given: 'test suite with pass rate below threshold',
      should: 'throw AITestError with suite failure message',
      actual: error?.cause,
      expected: {
        name: 'AITestError',
        code: 'AI_TEST_ERROR',
        message: 'Test suite failed: 0/1 assertions passed (0%)',
        passRate: 0,
        threshold: 75
      }
    });
  });

  test('throws ValidationError when agent authentication fails', async () => {
    vi.mocked(verifyAgentAuthentication).mockResolvedValue({ success: false, error: 'Not authenticated' });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    const error = await Try(runAICommand, args);

    assert({
      given: 'agent authentication failure',
      should: 'throw ValidationError with auth failure message',
      actual: error?.cause,
      expected: {
        name: 'ValidationError',
        code: 'VALIDATION_FAILURE',
        message: 'Agent authentication failed: Not authenticated'
      }
    });
  });

  test('throws OutputError when recordTestOutput fails', async () => {
    vi.mocked(recordTestOutput).mockRejectedValue(new Error('disk full'));
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    const error = await Try(runAICommand, args);

    assert({
      given: 'output recording failure',
      should: 'throw OutputError wrapping the disk error',
      actual: error?.cause,
      expected: {
        name: 'OutputError',
        code: 'OUTPUT_ERROR',
        message: 'Failed to record test output: disk full',
        cause: new Error('disk full')
      }
    });
  });

  test('reports 0% pass rate (not NaN) when assertions array is empty', async () => {
    vi.mocked(runAITests).mockResolvedValue({ passed: false, assertions: [] });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    const error = await Try(runAICommand, args);

    assert({
      given: 'runAITests returns zero assertions',
      should: 'report 0% pass rate in the error message, not NaN',
      actual: error?.cause?.message?.includes('NaN'),
      expected: false
    });

    assert({
      given: 'runAITests returns zero assertions',
      should: 'include (0%) in the AITestError message',
      actual: error?.cause?.message,
      expected: 'Test suite failed: 0/0 assertions passed (0%)'
    });
  });

  test('wraps unexpected errors in AITestError', async () => {
    vi.mocked(runAITests).mockRejectedValue(new Error('connection refused'));
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    const error = await Try(runAICommand, args);

    assert({
      given: 'unexpected error without a structured cause',
      should: 'wrap in AITestError preserving the original error',
      actual: error?.cause,
      expected: {
        name: 'AITestError',
        code: 'AI_TEST_ERROR',
        message: 'Failed to run AI tests: connection refused',
        cause: new Error('connection refused')
      }
    });
  });
});
