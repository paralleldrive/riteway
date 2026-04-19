import { describe, test, vi, beforeEach } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { handleAIErrors, allNoop } from './ai-errors.js';

vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

// Import after mock is registered
const { spawn } = await import('child_process');
const { executeAgent } = await import('./execute-agent.js');

/**
 * Build a mock child process that emits stdout/stderr data then closes.
 * @param {Object} options
 * @param {string} [options.stdout=''] - Data to emit on stdout
 * @param {string} [options.stderr=''] - Data to emit on stderr
 * @param {number} [options.exitCode=0] - Exit code for the close event
 */
const createMockProcess = ({ stdout = '', stderr = '', exitCode = 0 } = {}) => {
  const listeners = { stdout: {}, stderr: {}, proc: {} };

  const proc = {
    stdout: {
      on: (event, cb) => {
        listeners.stdout[event] = cb;
      }
    },
    stderr: {
      on: (event, cb) => {
        listeners.stderr[event] = cb;
      }
    },
    stdin: { end: vi.fn() },
    on: (event, cb) => {
      listeners.proc[event] = cb;
    }
  };

  // Emit events asynchronously after the next tick so all listeners are registered
  setTimeout(() => {
    if (stdout && listeners.stdout.data) listeners.stdout.data(stdout);
    if (stderr && listeners.stderr.data) listeners.stderr.data(stderr);
    if (listeners.proc.close) listeners.proc.close(exitCode);
  }, 0);

  return proc;
};

const agentConfig = {
  command: 'claude',
  args: ['-p', '--output-format', 'json', '--no-session-persistence']
};

const cursorAgentConfig = {
  command: 'agent',
  args: ['--print', '--output-format', 'json'],
  outputFormat: 'json'
};

describe('executeAgent()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns parsed JSON from agent stdout', async () => {
    const agentResponse = JSON.stringify({ passed: true, score: 90 });
    spawn.mockReturnValue(createMockProcess({ stdout: agentResponse }));

    const result = await executeAgent({
      agentConfig,
      prompt: 'test prompt'
    });

    assert({
      given: 'agent stdout with valid JSON',
      should: 'return parsed result object',
      actual: result,
      expected: { passed: true, score: 90 }
    });
  });

  test('unwraps Claude CLI envelope and returns parsed inner result', async () => {
    const innerResult = { passed: true, score: 85 };
    const envelope = JSON.stringify({ result: JSON.stringify(innerResult) });
    spawn.mockReturnValue(createMockProcess({ stdout: envelope }));

    const result = await executeAgent({
      agentConfig,
      prompt: 'test prompt'
    });

    assert({
      given: 'Claude CLI JSON envelope wrapping a stringified result',
      should: 'unwrap and parse the inner result',
      actual: result,
      expected: innerResult
    });
  });

  test('returns raw string when rawOutput is true', async () => {
    const rawText = 'This is raw agent output';
    spawn.mockReturnValue(createMockProcess({ stdout: rawText }));

    const result = await executeAgent({
      agentConfig,
      prompt: 'test prompt',
      rawOutput: true
    });

    assert({
      given: 'rawOutput: true and plain text stdout',
      should: 'return the raw string as-is',
      actual: result,
      expected: rawText
    });
  });

  test('unwraps envelope when rawOutput is true', async () => {
    const innerText = 'raw output from agent';
    const envelope = JSON.stringify({ result: innerText });
    spawn.mockReturnValue(createMockProcess({ stdout: envelope }));

    const result = await executeAgent({
      agentConfig,
      prompt: 'test prompt',
      rawOutput: true
    });

    assert({
      given: 'rawOutput: true and JSON envelope wrapping a string',
      should: 'unwrap and return the inner string',
      actual: result,
      expected: innerText
    });
  });

  test('processes ndjson outputFormat using OpenCode NDJSON parser', async () => {
    const ndjsonOutput = '{"type":"text","part":{"text":"{\\"passed\\":true}"}}\n{"type":"other"}';
    spawn.mockReturnValue(createMockProcess({ stdout: ndjsonOutput }));

    const result = await executeAgent({
      agentConfig: { ...agentConfig, outputFormat: 'ndjson' },
      prompt: 'test prompt'
    });

    assert({
      given: 'agentConfig with outputFormat ndjson and valid NDJSON stdout',
      should: 'parse NDJSON and return the extracted JSON result',
      actual: result,
      expected: { passed: true }
    });
  });

  test('throws AgentProcessError when exit code is non-zero', async () => {
    spawn.mockReturnValue(createMockProcess({
      stdout: '',
      stderr: 'Permission denied',
      exitCode: 1
    }));

    const err = await Try(executeAgent, { agentConfig, prompt: 'test prompt' });

    const invoked = [];
    handleAIErrors({ ...allNoop, AgentProcessError: () => invoked.push('AgentProcessError') })(err);

    assert({
      given: 'non-zero exit code from agent process',
      should: 'throw an error that routes to the AgentProcessError handler',
      actual: invoked,
      expected: ['AgentProcessError']
    });
  });

  test('throws AgentProcessError when spawn itself fails', async () => {
    spawn.mockImplementation(() => { throw new Error('spawn ENOENT'); });

    const err = await Try(executeAgent, { agentConfig, prompt: 'test' });

    const invoked = [];
    handleAIErrors({ ...allNoop, AgentProcessError: () => invoked.push('AgentProcessError') })(err);

    assert({
      given: 'spawn that throws synchronously',
      should: 'throw an error that routes to AgentProcessError handler',
      actual: invoked,
      expected: ['AgentProcessError']
    });
  });

  test('returns malformed JSON as raw string when rawOutput is true', async () => {
    spawn.mockReturnValue(createMockProcess({ stdout: '{ not valid json }' }));

    const result = await executeAgent({ agentConfig, prompt: 'test', rawOutput: true });

    assert({
      given: 'rawOutput: true and stdout starting with { but malformed',
      should: 'return the raw string as fallback',
      actual: result,
      expected: '{ not valid json }'
    });
  });

  test('throws ParseError when rawOutput is true but envelope result is not a string', async () => {
    const envelope = JSON.stringify({ result: { nested: 'object' } });
    spawn.mockReturnValue(createMockProcess({ stdout: envelope }));

    const err = await Try(executeAgent, { agentConfig, prompt: 'test', rawOutput: true });

    const invoked = [];
    handleAIErrors({ ...allNoop, ParseError: () => invoked.push('ParseError') })(err);

    assert({
      given: 'rawOutput: true and envelope wrapping a non-string object',
      should: 'throw an error that routes to the ParseError handler',
      actual: invoked,
      expected: ['ParseError']
    });
  });

  test('throws TimeoutError when timeout is exceeded', async () => {
    // Process that never closes
    const proc = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      stdin: { end: vi.fn() },
      on: vi.fn()
    };
    spawn.mockReturnValue(proc);

    const err = await Try(executeAgent, { agentConfig, prompt: 'test prompt', timeout: 1 });

    const invoked = [];
    handleAIErrors({ ...allNoop, TimeoutError: () => invoked.push('TimeoutError') })(err);

    assert({
      given: 'agent process that exceeds timeout',
      should: 'throw an error that routes to the TimeoutError handler',
      actual: invoked,
      expected: ['TimeoutError']
    });
  });

  test('throws ParseError when stdout is not valid JSON (rawOutput: false)', async () => {
    spawn.mockReturnValue(createMockProcess({ stdout: 'not valid json output' }));

    const err = await Try(executeAgent, { agentConfig, prompt: 'test prompt' });

    const invoked = [];
    handleAIErrors({ ...allNoop, ParseError: () => invoked.push('ParseError') })(err);

    assert({
      given: 'stdout that is not valid JSON',
      should: 'throw an error that routes to the ParseError handler',
      actual: invoked,
      expected: ['ParseError']
    });
  });

  test('spawns the agent with command, args, and prompt appended', async () => {
    spawn.mockReturnValue(createMockProcess({ stdout: '{"ok":true}' }));

    await executeAgent({
      agentConfig,
      prompt: 'my prompt'
    });

    const [command, args] = spawn.mock.calls[0];

    assert({
      given: 'valid agentConfig with command and args',
      should: 'spawn process with command and args including prompt appended',
      actual: [command, args],
      expected: ['claude', ['-p', '--output-format', 'json', '--no-session-persistence', 'my prompt']]
    });
  });

  test('passes a unique CURSOR_CONFIG_DIR env to each cursor agent spawn', async () => {
    spawn.mockImplementation(() => createMockProcess({ stdout: '{"ok":true}' }));

    await executeAgent({ agentConfig: cursorAgentConfig, prompt: 'prompt 1' });
    await executeAgent({ agentConfig: cursorAgentConfig, prompt: 'prompt 2' });

    const dir1 = spawn.mock.calls[0][2]?.env?.CURSOR_CONFIG_DIR;
    const dir2 = spawn.mock.calls[1][2]?.env?.CURSOR_CONFIG_DIR;

    assert({
      given: 'two sequential cursor agent calls',
      should: 'pass a CURSOR_CONFIG_DIR env to the spawn options',
      actual: typeof dir1,
      expected: 'string'
    });

    assert({
      given: 'two sequential cursor agent calls',
      should: 'use different CURSOR_CONFIG_DIR values for each spawn',
      actual: dir1 !== dir2,
      expected: true
    });
  });

  test('concurrent cursor agent spawns receive unique CURSOR_CONFIG_DIR values', async () => {
    spawn.mockImplementation(() => createMockProcess({ stdout: '{"ok":true}' }));

    await Promise.all([
      executeAgent({ agentConfig: cursorAgentConfig, prompt: 'concurrent 1' }),
      executeAgent({ agentConfig: cursorAgentConfig, prompt: 'concurrent 2' }),
      executeAgent({ agentConfig: cursorAgentConfig, prompt: 'concurrent 3' })
    ]);

    const dirs = spawn.mock.calls.map(call => call[2]?.env?.CURSOR_CONFIG_DIR);
    const uniqueDirs = new Set(dirs);

    assert({
      given: 'three concurrent cursor agent calls',
      should: 'assign a unique CURSOR_CONFIG_DIR to each',
      actual: uniqueDirs.size,
      expected: 3
    });
  });

  test('does not set CURSOR_CONFIG_DIR for non-cursor agents', async () => {
    spawn.mockReturnValue(createMockProcess({ stdout: '{"ok":true}' }));

    await executeAgent({ agentConfig, prompt: 'test prompt' });

    const options = spawn.mock.calls[0][2];

    assert({
      given: 'a claude agent (non-cursor)',
      should: 'not pass spawn options with CURSOR_CONFIG_DIR',
      actual: options?.env?.CURSOR_CONFIG_DIR,
      expected: undefined
    });
  });
});
