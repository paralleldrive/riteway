import { readFile } from 'fs/promises';
import { z } from 'zod';
import { createError } from 'error-causes';
import { ValidationError, AgentConfigReadError, AgentConfigParseError, AgentConfigValidationError, formatZodError } from './ai-errors.js';
import { parseOpenCodeNDJSON } from './agent-parser.js';

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
      args: ['--print', '--output-format', 'json', '--trust']
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

// YAGNI: only command + args — parseOutput is a runtime function, not a serializable config field
const agentConfigFileSchema = z.object({
  command: z.string().min(1, { error: 'command is required' }),
  args: z.array(z.string()).default([])
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
  try {
    return agentConfigFileSchema.parse(parsed);
  } catch (zodError) {
    throw createError({
      ...AgentConfigValidationError,
      message: `Invalid agent config: ${formatZodError(zodError)}`,
      cause: zodError
    });
  }
};

/**
 * Load and validate an agent configuration from a JSON file.
 * @param {string} configPath - Path to the JSON config file
 * @returns {Promise<Object>} Validated agent config with command and args
 */
export const loadAgentConfig = async (configPath) => {
  const raw = await readAgentConfigFile({ configPath });
  const parsed = parseJson({ configPath, raw });
  return validateAgentConfig(parsed);
};
