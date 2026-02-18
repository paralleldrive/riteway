import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { getAgentConfig, loadAgentConfig } from './agent-config.js';

describe('getAgentConfig()', () => {
  test('returns claude configuration for "claude" agent', () => {
    const config = getAgentConfig('claude');

    assert({
      given: 'agent name "claude"',
      should: 'return command "claude"',
      actual: config.command,
      expected: 'claude'
    });

    assert({
      given: 'agent name "claude"',
      should: 'return correct args array',
      actual: config.args,
      expected: ['-p', '--output-format', 'json', '--no-session-persistence']
    });
  });

  test('returns opencode configuration with parseOutput function', () => {
    const config = getAgentConfig('opencode');

    assert({
      given: 'agent name "opencode"',
      should: 'return command "opencode"',
      actual: config.command,
      expected: 'opencode'
    });

    assert({
      given: 'agent name "opencode"',
      should: 'return correct args array',
      actual: config.args,
      expected: ['run', '--format', 'json']
    });

    assert({
      given: 'agent name "opencode"',
      should: 'provide parseOutput function',
      actual: typeof config.parseOutput,
      expected: 'function'
    });
  });

  test('returns cursor configuration for "cursor" agent', () => {
    const config = getAgentConfig('cursor');

    assert({
      given: 'agent name "cursor"',
      should: 'return command "agent"',
      actual: config.command,
      expected: 'agent'
    });

    assert({
      given: 'agent name "cursor"',
      should: 'return args including --trust flag for non-interactive execution',
      actual: config.args,
      expected: ['--print', '--output-format', 'json', '--trust']
    });
  });

  test('returns default claude configuration when no agent name provided', () => {
    const config = getAgentConfig();

    assert({
      given: 'no agent name',
      should: 'default to claude command',
      actual: config.command,
      expected: 'claude'
    });

    assert({
      given: 'no agent name',
      should: 'return correct args array',
      actual: config.args,
      expected: ['-p', '--output-format', 'json', '--no-session-persistence']
    });
  });

  test('handles case-insensitive agent names', () => {
    const config = getAgentConfig('OpenCode');

    assert({
      given: 'mixed-case "OpenCode"',
      should: 'normalize to "opencode" command',
      actual: config.command,
      expected: 'opencode'
    });

    assert({
      given: 'mixed-case "OpenCode"',
      should: 'return correct args array',
      actual: config.args,
      expected: ['run', '--format', 'json']
    });

    assert({
      given: 'mixed-case "OpenCode"',
      should: 'provide parseOutput function',
      actual: typeof config.parseOutput,
      expected: 'function'
    });
  });

  test('throws ValidationError for invalid agent name', () => {
    const error = Try(getAgentConfig, 'invalid-agent');

    assert({
      given: 'invalid agent name',
      should: 'throw Error with cause',
      actual: error instanceof Error && error.cause !== undefined,
      expected: true
    });

    assert({
      given: 'invalid agent name',
      should: 'have ValidationError name in cause',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: 'invalid agent name',
      should: 'mention "claude" in error message',
      actual: error?.cause?.message?.includes('claude'),
      expected: true
    });

    assert({
      given: 'invalid agent name',
      should: 'mention "opencode" in error message',
      actual: error?.cause?.message?.includes('opencode'),
      expected: true
    });

    assert({
      given: 'invalid agent name',
      should: 'mention "cursor" in error message',
      actual: error?.cause?.message?.includes('cursor'),
      expected: true
    });
  });
});

describe('loadAgentConfig()', () => {
  test('loads and parses valid agent config JSON file', async () => {
    const config = await loadAgentConfig('./source/fixtures/test-agent-config.json');

    assert({
      given: 'valid agent config JSON file',
      should: 'return command "my-agent"',
      actual: config.command,
      expected: 'my-agent'
    });

    assert({
      given: 'valid agent config JSON file',
      should: 'return correct args array',
      actual: JSON.stringify(config.args),
      expected: JSON.stringify(['--print', '--format', 'json'])
    });
  });

  test('throws ValidationError with AGENT_CONFIG_PARSE_ERROR for invalid JSON', async () => {
    const error = await Try(loadAgentConfig, './source/fixtures/invalid-agent-config.txt');

    assert({
      given: 'invalid JSON file',
      should: 'throw Error with cause',
      actual: error instanceof Error && error.cause !== undefined,
      expected: true
    });

    assert({
      given: 'invalid JSON file',
      should: 'have ValidationError name in cause',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: 'invalid JSON file',
      should: 'have AGENT_CONFIG_PARSE_ERROR code in cause',
      actual: error?.cause?.code,
      expected: 'AGENT_CONFIG_PARSE_ERROR'
    });
  });

  test('throws ValidationError with AGENT_CONFIG_VALIDATION_ERROR when command field missing', async () => {
    const error = await Try(loadAgentConfig, './source/fixtures/no-command-agent-config.json');

    assert({
      given: 'config file missing command field',
      should: 'throw Error with cause',
      actual: error instanceof Error && error.cause !== undefined,
      expected: true
    });

    assert({
      given: 'config file missing command field',
      should: 'have ValidationError name in cause',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: 'config file missing command field',
      should: 'have AGENT_CONFIG_VALIDATION_ERROR code in cause',
      actual: error?.cause?.code,
      expected: 'AGENT_CONFIG_VALIDATION_ERROR'
    });
  });

  test('throws ValidationError with AGENT_CONFIG_READ_ERROR for nonexistent file', async () => {
    const error = await Try(loadAgentConfig, './nonexistent/path.json');

    assert({
      given: 'nonexistent file path',
      should: 'throw Error with cause',
      actual: error instanceof Error && error.cause !== undefined,
      expected: true
    });

    assert({
      given: 'nonexistent file path',
      should: 'have ValidationError name in cause',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: 'nonexistent file path',
      should: 'have AGENT_CONFIG_READ_ERROR code in cause',
      actual: error?.cause?.code,
      expected: 'AGENT_CONFIG_READ_ERROR'
    });
  });
});
