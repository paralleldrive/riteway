import { resolve, relative } from 'path';
import { createError } from 'error-causes';
import { SecurityError } from './ai-errors.js';

/**
 * Validate that a file path does not escape the base directory.
 * @param {string} filePath - Path to validate
 * @param {string} baseDir - Base directory to restrict paths to
 * @returns {string} Resolved absolute path
 * @throws {Error} If path escapes the base directory
 */
export const validateFilePath = (filePath, baseDir) => {
  const resolved = resolve(baseDir, filePath);
  const rel = relative(baseDir, resolved);
  if (rel.startsWith('..')) {
    throw createError({
      ...SecurityError,
      message: 'File path escapes base directory',
      code: 'PATH_TRAVERSAL',
      filePath,
      baseDir
    });
  }
  return resolved;
};

/**
 * Verify that an agent is properly configured and authenticated.
 * Performs a minimal smoke test by sending a simple prompt and checking for valid response.
 * @param {Object} options
 * @param {Object} options.agentConfig - Agent configuration
 * @param {string} options.agentConfig.command - Command to execute
 * @param {Array<string>} [options.agentConfig.args=[]] - Command arguments
 * @param {Function} options.executeAgent - Function to execute agent commands
 * @param {number} [options.timeout=30000] - Timeout in milliseconds (default: 30 seconds)
 * @returns {Promise<Object>} Result object with success boolean and optional error message
 */
export const verifyAgentAuthentication = async ({ agentConfig, executeAgent, timeout = 30000 }) => {
  console.log('Verifying agent authentication...');

  try {
    await executeAgent({
      agentConfig,
      prompt: 'Respond with valid JSON: {"status": "ok"}',
      timeout
    });

    console.log('Agent authentication verified successfully');
    return { success: true };
  } catch (err) {
    console.log('Agent authentication failed:', err.message);

    return {
      success: false,
      error: `${err.message}\n\n💡 Agent authentication required. Run the appropriate setup command:\n   - Claude:  "claude setup-token" - https://docs.anthropic.com/en/docs/claude-code\n   - Cursor:  "agent login" - https://docs.cursor.com/context/rules-for-ai\n   - OpenCode: See https://opencode.ai/docs/cli/ for authentication setup`
    };
  }
};
