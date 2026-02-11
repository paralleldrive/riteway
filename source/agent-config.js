import { readFile } from 'fs/promises';
import { z } from 'zod';
import { createError } from 'error-causes';
import { ValidationError } from './ai-errors.js';
import { parseOpenCodeNDJSON } from './agent-parser.js';

/**
 * Format Zod validation errors into a human-readable message.
 * @param {any} zodError - Zod validation error
 * @returns {string} Formatted error message
 */
export const formatZodError = (zodError) => {
  const issues = zodError.issues || zodError.errors;
  return issues
    ? issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
    : zodError.message || 'Validation failed';
};

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
      args: ['-p', '--output-format', 'json', '--no-session-persistence']
    },
    opencode: {
      command: 'opencode',
      args: ['run', '--format', 'json'],
      parseOutput: (stdout, logger) => parseOpenCodeNDJSON(stdout, logger)
    },
    cursor: {
      command: 'agent',
      args: ['--print', '--output-format', 'json']
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

/**
 * Zod schema for agent config file validation.
 * Only command and args are supported — Zod strips unknown keys by default,
 * so properties like parseOutput (which is a function, not serializable to JSON)
 * are silently ignored. Custom agents use default stdout parsing.
 */
const agentConfigFileSchema = z.object({
  command: z.string().min(1, { error: 'command is required' }),
  args: z.array(z.string()).default([])
});

/**
 * Load and validate an agent configuration from a JSON file.
 * @param {string} configPath - Path to the JSON config file
 * @returns {Promise<Object>} Validated agent config with command and args
 */
export const loadAgentConfig = async (configPath) => {
  let raw;
  try {
    raw = await readFile(configPath, 'utf-8');
  } catch (err) {
    throw createError({
      ...ValidationError,
      message: `Failed to read agent config file: ${configPath}`,
      code: 'AGENT_CONFIG_READ_ERROR',
      cause: err
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw createError({
      ...ValidationError,
      message: `Agent config file is not valid JSON: ${configPath}`,
      code: 'AGENT_CONFIG_PARSE_ERROR',
      cause: err
    });
  }

  try {
    return agentConfigFileSchema.parse(parsed);
  } catch (zodError) {
    throw createError({
      ...ValidationError,
      message: `Invalid agent config: ${formatZodError(zodError)}`,
      code: 'AGENT_CONFIG_VALIDATION_ERROR',
      cause: zodError
    });
  }
};
