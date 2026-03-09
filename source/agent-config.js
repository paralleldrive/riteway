import { readFile } from 'fs/promises';
import { join } from 'path';
import { z } from 'zod';
import { createError } from 'error-causes';
import { ValidationError, AgentConfigReadError, AgentConfigParseError, AgentConfigValidationError } from './ai-errors.js';

export const registryFileName = 'riteway.agent-config.json';
export const builtInAgentNames = ['claude', 'opencode', 'cursor'];

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
    args: ['--print', '--output-format', 'json'],
    outputFormat: 'json'
  }
};

/**
 * Get agent configuration based on agent name.
 * Supports 'claude', 'opencode', and 'cursor' agents.
 * All agents use their standard OAuth authentication flows.
 * @param {string} agentName - Name of the agent ('claude', 'opencode', 'cursor')
 * @returns {Object} Agent configuration with command, args, and outputFormat
 */
export const getAgentConfig = (agentName = 'claude') => {
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
  outputFormat: z.enum(['json', 'ndjson']).default('json')
});

// Throws AgentConfigReadError on any read failure, including ENOENT.
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

// Returns null on ENOENT; throws AgentConfigReadError on other failures.
const readFileOrNull = async (filePath) => {
  try {
    return await readFile(filePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw createError({
      ...AgentConfigReadError,
      message: `Failed to read file: ${filePath}`,
      cause: err
    });
  }
};

const parseJsonContent = ({ path, raw }) => {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw createError({
      ...AgentConfigParseError,
      message: `Not valid JSON: ${path}`,
      cause: err
    });
  }
};

const validateWithSchema = (schema, label, parsed) => {
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw createError({
      ...AgentConfigValidationError,
      message: `Invalid ${label}: ${z.prettifyError(result.error)}`,
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
 * @returns {Promise<Object>} Validated agent config with command, args, and outputFormat
 */
export const loadAgentConfig = async (configPath) => {
  const raw = await readAgentConfigFile({ configPath });
  const parsed = parseJsonContent({ path: configPath, raw });
  return validateWithSchema(agentConfigFileSchema, 'agent config', parsed);
};

const agentRegistrySchema = z.record(z.string().min(1), agentConfigFileSchema);

/**
 * Load and validate a riteway.agent-config.json registry from a directory.
 * Returns null when the file is not found — callers decide the fallback behavior.
 * Throws on read permission errors, invalid JSON, or schema violations so
 * misconfigured registries surface immediately rather than silently falling through.
 *
 * Trust boundary: registry entries are developer-controlled. The `command` field in
 * each entry is executed as a subprocess without whitelist validation.
 *
 * @param {string} cwd - Directory to look for riteway.agent-config.json
 * @returns {Promise<Object|null>} Registry map keyed by agent name, or null if not found
 */
export const loadAgentRegistry = async (cwd) => {
  const registryPath = join(cwd, registryFileName);
  const raw = await readFileOrNull(registryPath);
  if (raw === null) return null;
  const parsed = parseJsonContent({ path: registryPath, raw });
  return validateWithSchema(agentRegistrySchema, 'agent registry', parsed);
};

/**
 * Resolve agent configuration using a three-level priority chain:
 * 1. `agentConfigPath` — explicit flat config file (highest priority)
 * 2. `riteway.agent-config.json` in `cwd` — project registry (if present)
 * 3. Built-in `getAgentConfig(agent)` — library defaults (fallback)
 *
 * Trust boundary: all config sources ultimately produce a `command` executed as a
 * subprocess without whitelist validation. All paths must be developer-controlled.
 *
 * @param {Object} options
 * @param {string} options.agent - Agent name
 * @param {string} [options.agentConfigPath] - Path to a flat single-agent config file
 * @param {string} options.cwd - Working directory to search for the project registry
 * @returns {Promise<Object>} Resolved agent configuration
 */
export const resolveAgentConfig = async ({ agent, agentConfigPath, cwd }) => {
  if (agentConfigPath) {
    return loadAgentConfig(agentConfigPath);
  }

  const registry = await loadAgentRegistry(cwd);

  if (registry !== null) {
    const config = registry[agent];
    if (!config) {
      throw createError({
        ...ValidationError,
        code: 'AGENT_NOT_IN_REGISTRY',
        message: `Agent "${agent}" not found in riteway.agent-config.json. Add it to the registry, use --agent-config for a custom file, or remove the file to use built-in defaults.`
      });
    }
    return config;
  }

  return getAgentConfig(agent);
};
