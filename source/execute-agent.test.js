import { describe, test, vi, beforeEach } from 'vitest';
import { assert } from './vitest.js';

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

  test('applies parseOutput preprocessor before parsing result', async () => {
    const ndjsonOutput = '{"type":"text","part":{"text":"{\\"passed\\":true}"}}';
    const parseOutput = vi.fn(() => '{"passed":true}');
    spawn.mockReturnValue(createMockProcess({ stdout: ndjsonOutput }));

    const result = await executeAgent({
      agentConfig: { ...agentConfig, parseOutput },
      prompt: 'test prompt'
    });

    assert({
      given: 'agentConfig with parseOutput function',
      should: 'call parseOutput exactly once',
      actual: parseOutput.mock.calls.length,
      expected: 1
    });

    assert({
      given: 'agentConfig with parseOutput function',
      should: 'pass the raw stdout as first argument',
      actual: parseOutput.mock.calls[0][0],
      expected: ndjsonOutput
    });

    assert({
      given: 'agentConfig with parseOutput function',
      should: 'pass the logger as second argument (WIP fix #8 — logger threading)',
      actual: typeof parseOutput.mock.calls[0][1]?.log,
      expected: 'function'
    });

    assert({
      given: 'parseOutput returns valid JSON',
      should: 'return the parsed result',
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

    try {
      await executeAgent({ agentConfig, prompt: 'test prompt' });
      assert({
        given: 'non-zero exit code',
        should: 'have thrown an error',
        actual: false,
        expected: true
      });
    } catch (err) {
      assert({
        given: 'non-zero exit code from agent process',
        should: 'throw Error with AgentProcessError cause',
        actual: err?.cause?.name,
        expected: 'AgentProcessError'
      });

      assert({
        given: 'non-zero exit code',
        should: 'have AGENT_PROCESS_FAILURE code',
        actual: err?.cause?.code,
        expected: 'AGENT_PROCESS_FAILURE'
      });

      assert({
        given: 'non-zero exit code',
        should: 'include exit code in cause',
        actual: err?.cause?.exitCode,
        expected: 1
      });
    }
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

    try {
      await executeAgent({
        agentConfig,
        prompt: 'test prompt',
        timeout: 1
      });
      assert({
        given: 'timeout exceeded',
        should: 'have thrown an error',
        actual: false,
        expected: true
      });
    } catch (err) {
      assert({
        given: 'agent process that exceeds timeout',
        should: 'throw Error with TimeoutError cause',
        actual: err?.cause?.name,
        expected: 'TimeoutError'
      });

      assert({
        given: 'timeout exceeded',
        should: 'have AGENT_TIMEOUT code',
        actual: err?.cause?.code,
        expected: 'AGENT_TIMEOUT'
      });
    }
  });

  test('throws ParseError when stdout is not valid JSON (rawOutput: false)', async () => {
    spawn.mockReturnValue(createMockProcess({ stdout: 'not valid json output' }));

    try {
      await executeAgent({ agentConfig, prompt: 'test prompt' });
      assert({
        given: 'invalid JSON stdout',
        should: 'have thrown an error',
        actual: false,
        expected: true
      });
    } catch (err) {
      assert({
        given: 'stdout that is not valid JSON',
        should: 'throw Error with ParseError cause',
        actual: err?.cause?.name,
        expected: 'ParseError'
      });
    }
  });

  test('spawns the agent with command, args, and prompt appended', async () => {
    spawn.mockReturnValue(createMockProcess({ stdout: '{"ok":true}' }));

    await executeAgent({
      agentConfig,
      prompt: 'my prompt'
    });

    assert({
      given: 'valid agentConfig with command and args',
      should: 'spawn with the command',
      actual: spawn.mock.calls[0][0],
      expected: 'claude'
    });

    assert({
      given: 'valid agentConfig with command and args',
      should: 'spawn with args including the prompt at the end',
      actual: spawn.mock.calls[0][1],
      expected: ['-p', '--output-format', 'json', '--no-session-persistence', 'my prompt']
    });
  });
});
