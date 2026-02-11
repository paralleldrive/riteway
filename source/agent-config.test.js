import { describe, test, expect } from 'vitest';
import { getAgentConfig, loadAgentConfig } from './agent-config.js';

describe('getAgentConfig()', () => {
  test('returns claude configuration for "claude" agent', () => {
    const config = getAgentConfig('claude');
    expect(config).toMatchObject({
      command: 'claude',
      args: ['-p', '--output-format', 'json', '--no-session-persistence']
    });
  });

  test('returns opencode configuration with parseOutput function', () => {
    const config = getAgentConfig('opencode');
    expect(config).toMatchObject({
      command: 'opencode',
      args: ['run', '--format', 'json']
    });
    expect(typeof config.parseOutput).toBe('function');
  });

  test('returns cursor configuration for "cursor" agent', () => {
    const config = getAgentConfig('cursor');
    expect(config).toMatchObject({
      command: 'agent',
      args: ['--print', '--output-format', 'json']
    });
  });

  test('returns default claude configuration when no agent name provided', () => {
    const config = getAgentConfig();
    expect(config).toMatchObject({
      command: 'claude',
      args: ['-p', '--output-format', 'json', '--no-session-persistence']
    });
  });

  test('handles case-insensitive agent names', () => {
    const config = getAgentConfig('OpenCode');
    expect(config).toMatchObject({
      command: 'opencode',
      args: ['run', '--format', 'json']
    });
    expect(typeof config.parseOutput).toBe('function');
  });

  test('throws ValidationError for invalid agent name', () => {
    expect(() => getAgentConfig('invalid-agent')).toThrow();

    try {
      getAgentConfig('invalid-agent');
    } catch (error) {
      expect(error.cause.name).toBe('ValidationError');
      expect(error.cause.message).toContain('claude');
      expect(error.cause.message).toContain('opencode');
      expect(error.cause.message).toContain('cursor');
    }
  });
});

describe('loadAgentConfig()', () => {
  test('loads and parses valid agent config JSON file', async () => {
    const config = await loadAgentConfig('./source/fixtures/test-agent-config.json');
    expect(config).toEqual({
      command: 'my-agent',
      args: ['--print', '--format', 'json']
    });
  });

  test('throws ValidationError with AGENT_CONFIG_PARSE_ERROR for invalid JSON', async () => {
    try {
      await loadAgentConfig('./source/fixtures/invalid-agent-config.txt');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.cause.name).toBe('ValidationError');
      expect(error.cause.code).toBe('AGENT_CONFIG_PARSE_ERROR');
    }
  });

  test('throws ValidationError with AGENT_CONFIG_VALIDATION_ERROR when command field missing', async () => {
    try {
      await loadAgentConfig('./source/fixtures/no-command-agent-config.json');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.cause.name).toBe('ValidationError');
      expect(error.cause.code).toBe('AGENT_CONFIG_VALIDATION_ERROR');
    }
  });

  test('throws ValidationError with AGENT_CONFIG_READ_ERROR for nonexistent file', async () => {
    try {
      await loadAgentConfig('./nonexistent/path.json');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error.cause.name).toBe('ValidationError');
      expect(error.cause.code).toBe('AGENT_CONFIG_READ_ERROR');
    }
  });
});
