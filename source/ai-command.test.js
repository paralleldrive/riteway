import { describe, test, expect } from 'vitest';
import { parseAIArgs, formatAssertionReport, runAICommand, defaults } from './ai-command.js';

describe('defaults', () => {
  test('exports centralized default values', () => {
    expect(defaults).toEqual({
      runs: 4,
      threshold: 75,
      concurrency: 4,
      agent: 'claude',
      color: false,
      debug: false,
      debugLog: false
    });
  });
});

describe('parseAIArgs()', () => {
  test('parses file path as first argument with defaults', () => {
    const result = parseAIArgs(['test.sudo']);
    expect(result).toEqual({
      filePath: 'test.sudo',
      runs: defaults.runs,
      threshold: defaults.threshold,
      agent: defaults.agent,
      debug: defaults.debug,
      debugLog: defaults.debugLog,
      color: defaults.color,
      concurrency: defaults.concurrency,
      cwd: process.cwd()
    });
  });

  test('parses custom runs value', () => {
    const result = parseAIArgs(['--runs', '10', 'test.sudo']);
    expect(result.runs).toBe(10);
  });

  test('parses custom threshold value', () => {
    const result = parseAIArgs(['--threshold', '80', 'test.sudo']);
    expect(result.threshold).toBe(80);
  });

  test('parses custom agent value', () => {
    const result = parseAIArgs(['--agent', 'opencode', 'test.sudo']);
    expect(result.agent).toBe('opencode');
  });

  test('parses all custom values', () => {
    const result = parseAIArgs(['--runs', '5', '--threshold', '60', '--agent', 'cursor', 'test.sudo']);
    expect(result).toMatchObject({
      filePath: 'test.sudo',
      runs: 5,
      threshold: 60,
      agent: 'cursor'
    });
  });

  test('throws ValidationError when no file path provided', () => {
    try {
      parseAIArgs([]);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error instanceof Error).toBe(true);
      expect(error.cause).toBeDefined();
      expect(error.cause.name).toBe('ValidationError');
      expect(error.cause.code).toBe('INVALID_AI_ARGS');
      expect(error.cause.message.toLowerCase()).toMatch(/filepath|file path/);
    }
  });

  test('parses debug flag as true', () => {
    const result = parseAIArgs(['--debug', 'test.sudo']);
    expect(result.debug).toBe(true);
  });

  test('parses debug-log flag and enables debug mode', () => {
    const result = parseAIArgs(['--debug-log', 'test.sudo']);
    expect(result.debug).toBe(true);
    expect(result.debugLog).toBe(true);
  });

  test('parses color flag as true', () => {
    const result = parseAIArgs(['--color', 'test.sudo']);
    expect(result.color).toBe(true);
  });

  test('defaults color to false when no flag specified', () => {
    const result = parseAIArgs(['test.sudo']);
    expect(result.color).toBe(defaults.color);
  });

  test('throws ValidationError for threshold > 100', () => {
    try {
      parseAIArgs(['--threshold', '150', 'test.sudo']);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.cause.name).toBe('ValidationError');
    }
  });

  test('throws ValidationError for negative threshold', () => {
    try {
      parseAIArgs(['--threshold', '-10', 'test.sudo']);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.cause.name).toBe('ValidationError');
    }
  });

  test('throws ValidationError for runs = 0', () => {
    try {
      parseAIArgs(['--runs', '0', 'test.sudo']);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.cause.name).toBe('ValidationError');
    }
  });

  test('throws ValidationError for negative concurrency', () => {
    try {
      parseAIArgs(['--concurrency', '-5', 'test.sudo']);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.cause.name).toBe('ValidationError');
    }
  });

  test('throws ValidationError for unsupported agent', () => {
    try {
      parseAIArgs(['--agent', 'invalid-agent', 'test.sudo']);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.cause.name).toBe('ValidationError');
    }
  });

  test('includes agentConfigPath when --agent-config flag provided', () => {
    const result = parseAIArgs(['--agent-config', './my-agent.json', 'test.sudo']);
    expect(result.agentConfigPath).toBe('./my-agent.json');
  });

  test('throws ValidationError when both --agent and --agent-config provided', () => {
    try {
      parseAIArgs(['--agent', 'opencode', '--agent-config', './my-agent.json', 'test.sudo']);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.cause.name).toBe('ValidationError');
      expect(error.cause.code).toBe('INVALID_AI_ARGS');
    }
  });

  test('does not include agentConfigPath when --agent-config not provided', () => {
    const result = parseAIArgs(['test.sudo']);
    expect(result.agentConfigPath).toBeUndefined();
  });
});

describe('formatAssertionReport()', () => {
  test('formats passing assertion with PASS status', () => {
    const result = formatAssertionReport({
      passed: true,
      description: 'test assertion',
      passCount: 4,
      totalRuns: 4
    });
    expect(result).toBe('  [PASS] test assertion (4/4 runs)');
  });

  test('formats failing assertion with FAIL status', () => {
    const result = formatAssertionReport({
      passed: false,
      description: 'test assertion',
      passCount: 2,
      totalRuns: 4
    });
    expect(result).toBe('  [FAIL] test assertion (2/4 runs)');
  });

  test('formats assertion with partial success', () => {
    const result = formatAssertionReport({
      passed: false,
      description: 'partial pass',
      passCount: 3,
      totalRuns: 5
    });
    expect(result).toBe('  [FAIL] partial pass (3/5 runs)');
  });

  test('wraps PASS status in green ANSI code when color enabled', () => {
    const result = formatAssertionReport({
      passed: true,
      description: 'test assertion',
      passCount: 4,
      totalRuns: 4,
      color: true
    });
    expect(result).toBe('  \x1b[32m[PASS]\x1b[0m test assertion (4/4 runs)');
  });

  test('wraps FAIL status in red ANSI code when color enabled', () => {
    const result = formatAssertionReport({
      passed: false,
      description: 'test assertion',
      passCount: 2,
      totalRuns: 4,
      color: true
    });
    expect(result).toBe('  \x1b[31m[FAIL]\x1b[0m test assertion (2/4 runs)');
  });

  test('does not include ANSI codes when color not enabled', () => {
    const result = formatAssertionReport({
      passed: true,
      description: 'test assertion',
      passCount: 4,
      totalRuns: 4
    });
    expect(result.includes('\x1b[')).toBe(false);
  });
});

describe('runAICommand()', () => {
  test('throws ValidationError when filePath is undefined', async () => {
    try {
      await runAICommand({ filePath: undefined, runs: 4, threshold: 75, cwd: process.cwd() });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error instanceof Error).toBe(true);
      expect(error.cause).toBeDefined();
      expect(error.cause.name).toBe('ValidationError');
      expect(error.cause.code).toBe('VALIDATION_FAILURE');
      expect(error.cause.message).toContain('file path');
    }
  });

  test('throws SecurityError for path traversal attempt', async () => {
    try {
      await runAICommand({
        filePath: '../../../etc/passwd',
        runs: 4,
        threshold: 75,
        agent: 'claude',
        cwd: process.cwd()
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.cause.name).toBe('SecurityError');
      expect(error.cause.code).toBe('PATH_TRAVERSAL');
    }
  });
});
