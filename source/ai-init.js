import { writeFile } from 'fs/promises';
import { join } from 'path';
import { createError } from 'error-causes';
import { ValidationError, OutputError } from './ai-errors.js';
import { getAgentConfig, registryFileName, builtInAgentNames } from './agent-config.js';

/**
 * Write a riteway.agent-config.json registry to `cwd` containing all built-in
 * agent configurations. Teams can add custom agents or modify existing entries.
 * Any agent defined in the registry supersedes the library's built-in defaults.
 *
 * @param {Object} [options]
 * @param {boolean} [options.force=false] - Overwrite existing file without error
 * @param {string} [options.cwd=process.cwd()] - Directory to write the registry into
 * @returns {Promise<string>} Absolute path of the written file
 */
export const initAgentRegistry = async ({ force = false, cwd = process.cwd() } = {}) => {
  const outputPath = join(cwd, registryFileName);
  const registry = Object.fromEntries(builtInAgentNames.map(name => [name, getAgentConfig(name)]));
  const content = JSON.stringify(registry, null, 2) + '\n';

  try {
    await writeFile(outputPath, content, { flag: force ? 'w' : 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      throw createError({
        ...ValidationError,
        code: 'REGISTRY_EXISTS',
        message: `${registryFileName} already exists. Use --force to overwrite.`
      });
    }
    throw createError({
      ...OutputError,
      message: `Failed to write ${registryFileName}`,
      cause: err
    });
  }

  return outputPath;
};
