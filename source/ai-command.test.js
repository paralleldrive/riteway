import { describe, test, vi, beforeEach, onTestFinished } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { parseAIArgs, formatAssertionReport, runAICommand, resolveAITestFiles } from './ai-command.js';
import { runAITests, verifyAgentAuthentication } from './ai-runner.js';
import { resolveAgentConfig } from './agent-config.js';
import { recordTestOutput } from './test-output.js';

vi.mock('glob', () => ({
  globSync: vi.fn((pattern) => [pattern])
}));
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
        patterns: ['test.sudo'],
        runs: 4,
        threshold: 75,
        timeout: 300000,
        agent: 'claude',
        color: false,
        saveResponses: false,
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
        patterns: result.patterns,
        runs: result.runs,
        threshold: result.threshold,
        agent: result.agent
      },
      expected: {
        patterns: ['test.sudo'],
        runs: 5,
        threshold: 60,
        agent: 'cursor'
      }
    });
  });

  test('parses multiple file patterns as positional arguments', () => {
    const result = parseAIArgs(['tests/*.sudo', 'evals/**/*.sudo']);

    assert({
      given: 'multiple positional arguments',
      should: 'collect all patterns',
      actual: result.patterns,
      expected: ['tests/*.sudo', 'evals/**/*.sudo']
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
      actual: /file path|pattern/i.test(error?.cause?.message),
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

  test('parses --save-responses flag as true', () => {
    const result = parseAIArgs(['--save-responses', 'test.sudo']);

    assert({
      given: '--save-responses flag',
      should: 'set saveResponses to true',
      actual: result.saveResponses,
      expected: true
    });
  });

  test('defaults saveResponses to false when no flag specified', () => {
    const result = parseAIArgs(['test.sudo']);

    assert({
      given: 'no --save-responses flag',
      should: 'default saveResponses to false',
      actual: result.saveResponses,
      expected: false
    });
  });

  test('throws ValidationError for unrecognized flags', () => {
    const error = Try(parseAIArgs, ['--agentConfig', './my-agent.json', 'test.sudo']);

    assert({
      given: 'an unrecognized camelCase flag instead of --agent-config',
      should: 'throw a ValidationError naming the unknown flag',
      actual: error?.cause,
      expected: {
        name: 'ValidationError',
        code: 'INVALID_AI_ARGS',
        message: 'Unknown flag(s): --agentConfig'
      }
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
  test('throws ValidationError when patterns is empty', async () => {
    const error = await Try(runAICommand, { patterns: [], runs: 4, threshold: 75, cwd: process.cwd() });

    assert({
      given: 'empty patterns array',
      should: 'throw ValidationError with missing file path message',
      actual: error?.cause,
      expected: {
        name: 'ValidationError',
        code: 'VALIDATION_FAILURE',
        message: 'Test file path is required'
      }
    });
  });

  test('throws AITestError wrapping SecurityError for path traversal attempt', async () => {
    vi.mocked(resolveAgentConfig).mockResolvedValue({ command: 'claude', args: [] });
    vi.mocked(verifyAgentAuthentication).mockResolvedValue({ success: true });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    const cwd = process.cwd();
    const error = await Try(runAICommand, {
      patterns: ['../../../etc/passwd'],
      runs: 4,
      threshold: 75,
      timeout: 300000,
      agent: 'claude',
      concurrency: 4,
      color: false,
      saveResponses: false,
      cwd
    });

    assert({
      given: 'path traversal attempt',
      should: 'throw AITestError with aggregate message containing security detail',
      actual: error?.cause?.name,
      expected: 'AITestError'
    });

    assert({
      given: 'path traversal attempt',
      should: 'include path traversal message in aggregate',
      actual: error?.cause?.message?.includes('File path escapes base directory'),
      expected: true
    });
  });
});

describe('resolveAITestFiles()', () => {
  test('throws ValidationError when no files match', async () => {
    const { globSync } = await import('glob');
    vi.mocked(globSync).mockReturnValueOnce([]);

    const error = Try(resolveAITestFiles, ['nonexistent/**/*.sudo']);

    assert({
      given: 'a pattern matching no files',
      should: 'throw ValidationError',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: 'a pattern matching no files',
      should: 'include the pattern in the error message',
      actual: error?.cause?.message,
      expected: 'No test files found matching: nonexistent/**/*.sudo'
    });
  });

  test('returns expanded file paths from glob patterns', async () => {
    const { globSync } = await import('glob');
    vi.mocked(globSync).mockReturnValueOnce(['tests/a.sudo', 'tests/b.sudo']);

    const result = resolveAITestFiles(['tests/*.sudo']);

    assert({
      given: 'a glob pattern matching two files',
      should: 'return both file paths',
      actual: result,
      expected: ['tests/a.sudo', 'tests/b.sudo']
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
  const args = { patterns: ['./test.sudo'], runs: 4, threshold: 75, timeout: 300000, agent: 'claude', color: false, concurrency: 4, cwd: process.cwd() };

  beforeEach(() => {
    vi.mocked(resolveAgentConfig).mockResolvedValue(agentConfig);
    vi.mocked(verifyAgentAuthentication).mockResolvedValue({ success: true });
    vi.mocked(runAITests).mockResolvedValue(passedResults);
    vi.mocked(recordTestOutput).mockResolvedValue(outputPath);
  });

  test('returns output paths when tests pass', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    const result = await runAICommand(args);

    assert({
      given: 'valid test file and authenticated agent with passing results',
      should: 'return array of paths to TAP output files',
      actual: result,
      expected: [outputPath]
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
      should: 'throw AITestError with aggregate failure message',
      actual: error?.cause?.name,
      expected: 'AITestError'
    });

    assert({
      given: 'test suite with pass rate below threshold',
      should: 'report 1/1 file(s) failed',
      actual: error?.cause?.message?.includes('1/1 test file(s) failed'),
      expected: true
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

  test('throws AITestError wrapping OutputError when recordTestOutput fails', async () => {
    vi.mocked(recordTestOutput).mockRejectedValue(new Error('disk full'));
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    const error = await Try(runAICommand, args);

    assert({
      given: 'output recording failure',
      should: 'throw AITestError with aggregate message',
      actual: error?.cause?.name,
      expected: 'AITestError'
    });

    assert({
      given: 'output recording failure',
      should: 'include disk error message in aggregate',
      actual: error?.cause?.message?.includes('Failed to record test output: disk full'),
      expected: true
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
      should: 'include (0%) in the per-file error detail',
      actual: error?.cause?.message?.includes('(0%)'),
      expected: true
    });
  });

  test('passes saveResponses to recordTestOutput', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    await runAICommand({ ...args, saveResponses: true });

    assert({
      given: 'saveResponses: true',
      should: 'forward saveResponses to recordTestOutput',
      actual: vi.mocked(recordTestOutput).mock.lastCall?.[0].saveResponses,
      expected: true
    });
  });

  test('writes partial results when error carries partialResults', async () => {
    const partialResults = {
      passed: false,
      assertions: [{ requirement: 'Given a test, should pass', passed: true, passCount: 1, totalRuns: 1 }],
      responses: ['Partial response from run 1']
    };
    const errorWithPartials = new Error('outer');
    errorWithPartials.cause = {
      name: 'TimeoutError',
      code: 'AGENT_TIMEOUT',
      message: 'Agent timed out after 300000ms',
      partialResults
    };
    vi.mocked(runAITests).mockRejectedValue(errorWithPartials);
    vi.mocked(recordTestOutput).mockClear();
    vi.mocked(recordTestOutput).mockResolvedValue('/ai-evals/partial.tap.md');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    await Try(runAICommand, { ...args, saveResponses: true });

    assert({
      given: 'error with partialResults from a timeout',
      should: 'call recordTestOutput with the partial results',
      actual: vi.mocked(recordTestOutput).mock.lastCall?.[0].results,
      expected: partialResults
    });

    assert({
      given: 'error with partialResults and saveResponses: true',
      should: 'forward saveResponses to recordTestOutput',
      actual: vi.mocked(recordTestOutput).mock.lastCall?.[0].saveResponses,
      expected: true
    });
  });

  test('does not write partial results when error has no partialResults', async () => {
    const plainError = new Error('outer');
    plainError.cause = {
      name: 'TimeoutError',
      code: 'AGENT_TIMEOUT',
      message: 'Agent timed out'
    };
    vi.mocked(runAITests).mockRejectedValue(plainError);
    vi.mocked(recordTestOutput).mockClear();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    await Try(runAICommand, args);

    assert({
      given: 'error without partialResults',
      should: 'not call recordTestOutput',
      actual: vi.mocked(recordTestOutput).mock.calls.length,
      expected: 0
    });
  });

  test('wraps unexpected errors in AITestError', async () => {
    vi.mocked(runAITests).mockRejectedValue(new Error('connection refused'));
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    const error = await Try(runAICommand, args);

    assert({
      given: 'unexpected error without a structured cause',
      should: 'wrap in AITestError with aggregate failure message',
      actual: error?.cause?.name,
      expected: 'AITestError'
    });

    assert({
      given: 'unexpected error without a structured cause',
      should: 'include the original error message in the aggregate',
      actual: error?.cause?.message?.includes('connection refused'),
      expected: true
    });
  });

  test('runs all files and returns all output paths when multiple files pass', async () => {
    const { globSync } = await import('glob');
    vi.mocked(globSync).mockReturnValueOnce(['./a.sudo', './b.sudo']);
    vi.mocked(recordTestOutput)
      .mockResolvedValueOnce('/ai-evals/a.tap.md')
      .mockResolvedValueOnce('/ai-evals/b.tap.md');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    const result = await runAICommand(args);

    assert({
      given: 'two passing test files',
      should: 'return output paths for both files',
      actual: result,
      expected: ['/ai-evals/a.tap.md', '/ai-evals/b.tap.md']
    });
  });

  test('continues running remaining files when one fails', async () => {
    const { globSync } = await import('glob');
    vi.mocked(globSync).mockReturnValueOnce(['./a.sudo', './b.sudo']);
    vi.mocked(runAITests).mockReset();
    vi.mocked(runAITests)
      .mockResolvedValueOnce({
        passed: false,
        assertions: [{ requirement: 'test a', passed: false, passCount: 0, totalRuns: 4 }]
      })
      .mockResolvedValueOnce(passedResults);
    vi.mocked(recordTestOutput)
      .mockResolvedValueOnce('/ai-evals/a.tap.md')
      .mockResolvedValueOnce('/ai-evals/b.tap.md');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    const error = await Try(runAICommand, args);

    assert({
      given: 'first file fails and second file passes',
      should: 'still run the second file',
      actual: vi.mocked(runAITests).mock.calls.length,
      expected: 2
    });

    assert({
      given: 'first file fails and second file passes',
      should: 'report 1/2 file(s) failed',
      actual: error?.cause?.message?.includes('1/2 test file(s) failed'),
      expected: true
    });

    assert({
      given: 'first file fails and second file passes',
      should: 'include the passing file output in outputPaths',
      actual: error?.cause?.outputPaths,
      expected: ['/ai-evals/b.tap.md']
    });
  });

  test('uses correct filename for partial results per file', async () => {
    const { globSync } = await import('glob');
    vi.mocked(globSync).mockReturnValueOnce(['./first.sudo', './second.sudo']);
    const partialResults = {
      passed: false,
      assertions: [{ requirement: 'test', passed: true, passCount: 1, totalRuns: 1 }],
      responses: ['partial']
    };
    const timeoutError = new Error('outer');
    timeoutError.cause = {
      name: 'TimeoutError',
      code: 'AGENT_TIMEOUT',
      message: 'Agent timed out after 300000ms',
      partialResults
    };
    vi.mocked(runAITests)
      .mockResolvedValueOnce(passedResults)
      .mockRejectedValueOnce(timeoutError);
    vi.mocked(recordTestOutput).mockClear();
    vi.mocked(recordTestOutput)
      .mockResolvedValueOnce('/ai-evals/first.tap.md')
      .mockResolvedValueOnce('/ai-evals/second-partial.tap.md');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    await Try(runAICommand, { ...args, saveResponses: true });

    assert({
      given: 'second file times out with partial results',
      should: 'record partial results under the second file name, not the first',
      actual: vi.mocked(recordTestOutput).mock.calls[1]?.[0]?.testFilename,
      expected: 'second.sudo'
    });
  });
});
