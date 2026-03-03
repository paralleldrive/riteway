import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { handleAIErrors, allNoop } from './ai-errors.js';
import { getAgentConfig, loadAgentConfig } from './agent-config.js';


describe('getAgentConfig()', () => {
  test('returns claude configuration for "claude" agent', () => {
    const config = getAgentConfig('claude');

    assert({
      given: 'agent name "claude"',
      should: 'return correct agent configuration with json outputFormat',
      actual: config,
      expected: { command: 'claude', args: ['-p', '--output-format', 'json', '--no-session-persistence'], outputFormat: 'json' }
    });
  });

  test('returns opencode configuration with ndjson outputFormat', () => {
    const config = getAgentConfig('opencode');

    assert({
      given: 'agent name "opencode"',
      should: 'return correct agent configuration with ndjson outputFormat',
      actual: config,
      expected: { command: 'opencode', args: ['run', '--format', 'json'], outputFormat: 'ndjson' }
    });
  });

  test('returns cursor configuration for "cursor" agent', () => {
    const config = getAgentConfig('cursor');

    assert({
      given: 'agent name "cursor"',
      should: 'return correct agent configuration with json outputFormat',
      actual: config,
      expected: { command: 'agent', args: ['--print', '--output-format', 'json', '--trust'], outputFormat: 'json' }
    });
  });

  test('returns default claude configuration when no agent name provided', () => {
    const config = getAgentConfig();

    assert({
      given: 'no agent name',
      should: 'default to claude configuration with json outputFormat',
      actual: config,
      expected: { command: 'claude', args: ['-p', '--output-format', 'json', '--no-session-persistence'], outputFormat: 'json' }
    });
  });

  test('handles case-insensitive agent names', () => {
    const config = getAgentConfig('OpenCode');

    assert({
      given: 'mixed-case "OpenCode"',
      should: 'return opencode configuration with ndjson outputFormat',
      actual: config,
      expected: { command: 'opencode', args: ['run', '--format', 'json'], outputFormat: 'ndjson' }
    });
  });

  test('throws ValidationError for invalid agent name', () => {
    const error = Try(getAgentConfig, 'invalid-agent');

    const invoked = [];
    handleAIErrors({ ...allNoop, ValidationError: () => invoked.push('ValidationError') })(error);

    assert({
      given: 'invalid agent name',
      should: 'throw an error that routes to the ValidationError handler',
      actual: invoked,
      expected: ['ValidationError']
    });

    assert({
      given: 'invalid agent name',
      should: 'include all supported agent names in error message',
      actual: error?.cause?.message,
      expected: 'Unknown agent: invalid-agent. Supported agents: claude, opencode, cursor'
    });
  });
});

describe('loadAgentConfig()', () => {
  test('loads and parses valid agent config JSON file with default outputFormat', async () => {
    const config = await loadAgentConfig('./source/fixtures/test-agent-config.json');

    assert({
      given: 'valid agent config JSON file without outputFormat field',
      should: 'return parsed config with outputFormat defaulting to json',
      actual: config,
      expected: { command: 'my-agent', args: ['--print', '--format', 'json'], outputFormat: 'json' }
    });
  });

  test('loads agent config with explicit ndjson outputFormat', async () => {
    const config = await loadAgentConfig('./source/fixtures/ndjson-agent-config.json');

    assert({
      given: 'agent config file with outputFormat: ndjson',
      should: 'return config preserving the ndjson outputFormat',
      actual: config,
      expected: { command: 'my-agent', args: ['--format', 'ndjson'], outputFormat: 'ndjson' }
    });
  });

  test('throws AgentConfigParseError for invalid JSON', async () => {
    const error = await Try(loadAgentConfig, './source/fixtures/invalid-agent-config.txt');

    const invoked = [];
    handleAIErrors({ ...allNoop, AgentConfigParseError: () => invoked.push('AgentConfigParseError') })(error);

    assert({
      given: 'invalid JSON file',
      should: 'throw an error that routes to the AgentConfigParseError handler',
      actual: invoked,
      expected: ['AgentConfigParseError']
    });
  });

  test('throws AgentConfigValidationError when command field missing', async () => {
    const error = await Try(loadAgentConfig, './source/fixtures/no-command-agent-config.json');

    const invoked = [];
    handleAIErrors({ ...allNoop, AgentConfigValidationError: () => invoked.push('AgentConfigValidationError') })(error);

    assert({
      given: 'config file missing command field',
      should: 'throw an error that routes to the AgentConfigValidationError handler',
      actual: invoked,
      expected: ['AgentConfigValidationError']
    });
  });

  test('throws AgentConfigReadError for nonexistent file', async () => {
    const error = await Try(loadAgentConfig, './nonexistent/path.json');

    const invoked = [];
    handleAIErrors({ ...allNoop, AgentConfigReadError: () => invoked.push('AgentConfigReadError') })(error);

    assert({
      given: 'nonexistent file path',
      should: 'throw an error that routes to the AgentConfigReadError handler',
      actual: invoked,
      expected: ['AgentConfigReadError']
    });
  });
});
