import { URL, fileURLToPath } from 'url';
import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { handleAIErrors, allNoop } from './ai-errors.js';
import { getAgentConfig, loadAgentConfig, loadAgentRegistry, resolveAgentConfig } from './agent-config.js';

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));
// source/ has no riteway.agent-config.json by design — used for the "no registry" path
const sourceDir = fileURLToPath(new URL('.', import.meta.url));


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
      expected: { command: 'agent', args: ['--print', '--output-format', 'json'], outputFormat: 'json' }
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

describe('loadAgentRegistry()', () => {
  test('returns null when riteway.agent-config.json is not present in cwd', async () => {
    const result = await loadAgentRegistry(sourceDir);

    assert({
      given: 'cwd with no riteway.agent-config.json',
      should: 'return null',
      actual: result,
      expected: null
    });
  });

  test('loads and returns parsed registry map from cwd', async () => {
    const registry = await loadAgentRegistry(fixturesDir);

    assert({
      given: 'cwd containing a valid riteway.agent-config.json',
      should: 'return parsed registry with testAgent entry',
      actual: registry,
      expected: { testAgent: { command: 'my-test-agent', args: ['--json'], outputFormat: 'json' } }
    });
  });

  test('throws AgentConfigParseError for invalid JSON in registry file', async () => {
    const error = await Try(loadAgentRegistry, `${fixturesDir}/invalid-registry`);

    const invoked = [];
    handleAIErrors({ ...allNoop, AgentConfigParseError: () => invoked.push('AgentConfigParseError') })(error);

    assert({
      given: 'riteway.agent-config.json containing invalid JSON',
      should: 'throw an error that routes to the AgentConfigParseError handler',
      actual: invoked,
      expected: ['AgentConfigParseError']
    });
  });

  test('throws AgentConfigValidationError for invalid registry schema', async () => {
    const error = await Try(loadAgentRegistry, `${fixturesDir}/bad-schema-registry`);

    const invoked = [];
    handleAIErrors({ ...allNoop, AgentConfigValidationError: () => invoked.push('AgentConfigValidationError') })(error);

    assert({
      given: 'riteway.agent-config.json with invalid schema (agent values not objects)',
      should: 'throw an error that routes to the AgentConfigValidationError handler',
      actual: invoked,
      expected: ['AgentConfigValidationError']
    });
  });
});

describe('resolveAgentConfig()', () => {
  test('resolves from flat config file when agentConfigPath is provided', async () => {
    const config = await resolveAgentConfig({
      agent: 'claude',
      agentConfigPath: './source/fixtures/test-agent-config.json',
      cwd: sourceDir
    });

    assert({
      given: 'agentConfigPath pointing to a flat config file',
      should: 'return the config from that file, ignoring agent name and registry',
      actual: config,
      expected: { command: 'my-agent', args: ['--print', '--format', 'json'], outputFormat: 'json' }
    });
  });

  test('resolves from registry when file present and agent key exists', async () => {
    const config = await resolveAgentConfig({
      agent: 'testAgent',
      agentConfigPath: undefined,
      cwd: fixturesDir
    });

    assert({
      given: 'riteway.agent-config.json present with testAgent key',
      should: 'return the agent config from the registry',
      actual: config,
      expected: { command: 'my-test-agent', args: ['--json'], outputFormat: 'json' }
    });
  });

  test('throws ValidationError when registry present but agent key absent', async () => {
    const error = await Try(resolveAgentConfig, {
      agent: 'nonexistent',
      agentConfigPath: undefined,
      cwd: fixturesDir
    });

    const invoked = [];
    handleAIErrors({ ...allNoop, ValidationError: () => invoked.push('ValidationError') })(error);

    assert({
      given: 'registry file present but requested agent key missing',
      should: 'throw an error that routes to the ValidationError handler',
      actual: invoked,
      expected: ['ValidationError']
    });

    assert({
      given: 'registry file present but requested agent key missing',
      should: 'include AGENT_NOT_IN_REGISTRY code in error',
      actual: error?.cause?.code,
      expected: 'AGENT_NOT_IN_REGISTRY'
    });
  });

  test('falls back to built-in config when no registry present', async () => {
    const config = await resolveAgentConfig({
      agent: 'claude',
      agentConfigPath: undefined,
      cwd: sourceDir
    });

    assert({
      given: 'no registry file and a built-in agent name',
      should: 'return the built-in agent config',
      actual: config,
      expected: { command: 'claude', args: ['-p', '--output-format', 'json', '--no-session-persistence'], outputFormat: 'json' }
    });
  });

  test('throws ValidationError for unknown agent when no registry present', async () => {
    const error = await Try(resolveAgentConfig, {
      agent: 'custom-tool',
      agentConfigPath: undefined,
      cwd: sourceDir
    });

    const invoked = [];
    handleAIErrors({ ...allNoop, ValidationError: () => invoked.push('ValidationError') })(error);

    assert({
      given: 'unknown agent name and no registry file',
      should: 'throw an error that routes to the ValidationError handler',
      actual: invoked,
      expected: ['ValidationError']
    });
  });
});
