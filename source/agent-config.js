import { readFile } from 'fs/promises';
import { z } from 'zod';
import { createError } from 'error-causes';
import { ValidationError, AgentConfigReadError, AgentConfigParseError, AgentConfigValidationError } from './ai-errors.js';

/**
 * Get agent configuration based on agent name.
 * Supports 'claude', 'opencode', and 'cursor' agents.
 * All agents use their standard OAuth authentication flows.
 * @param {string} agentName - Name of the agent ('claude', 'opencode', 'cursor')
 * @returns {Object} Agent configuration with command and args
 */
export const getAgentConfig = (agentName = 'claude') => {
  const agentConfigs = {
    claude: {
      command: 'claude',
      args: ['-p', '--output-format', 'json', '--no-session-persistence'],
      outputFormat: 'json'
    },
    opencode: {
      command: 'opencode',
      args: ['run', '--format', 'json'],
      outputFormat: 'ndjson'
    },
    cursor: {
      command: 'agent',
      args: ['--print', '--output-format', 'json', '--trust'],
      outputFormat: 'json'
    }
  };

  const config = agentConfigs[agentName.toLowerCase()];
  if (!config) {
    throw createError({
      ...ValidationError,
      message: `Unknown agent: ${agentName}. Supported agents: ${Object.keys(agentConfigs).join(', ')}`
    });
  }

  return config;
};

const agentConfigFileSchema = z.object({
  command: z.string().min(1, { error: 'command is required' }),
  args: z.array(z.string()).default([]),
  outputFormat: z.enum(['json', 'ndjson', 'text']).default('json')
});

const readAgentConfigFile = async ({ configPath }) => {
  try {
    return await readFile(configPath, 'utf-8');
  } catch (err) {
    throw createError({
      ...AgentConfigReadError,
      message: `Failed to read agent config file: ${configPath}`,
      cause: err
    });
  }
};

const parseJson = ({ configPath, raw }) => {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw createError({
      ...AgentConfigParseError,
      message: `Agent config file is not valid JSON: ${configPath}`,
      cause: err
    });
  }
};

const validateAgentConfig = (parsed) => {
  const result = agentConfigFileSchema.safeParse(parsed);
  if (!result.success) {
    throw createError({
      ...AgentConfigValidationError,
      message: `Invalid agent config: ${z.prettifyError(result.error)}`,
      cause: result.error
    });
  }
  return result.data;
};

/**
 * Load and validate an agent configuration from a JSON file.
 *
 * Trust boundary: `configPath` must point to a developer-controlled file.
 * The `command` field is executed as a subprocess without command whitelist validation.
 * Never pass a path derived from untrusted user input.
 *
 * @param {string} configPath - Path to the JSON config file
 * @returns {Promise<Object>} Validated agent config with command and args
 */
export const loadAgentConfig = async (configPath) => {
  const raw = await readAgentConfigFile({ configPath });
  const parsed = parseJson({ configPath, raw });
  return validateAgentConfig(parsed);
};
