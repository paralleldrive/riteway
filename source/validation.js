import { resolve, relative } from 'path';
import { errorCauses, createError } from 'error-causes';
import { createDebugLogger } from './debug-logger.js';

// Module-level error types for validation operations
const [validationErrors] = errorCauses({
  SecurityError: { code: 'SECURITY_VIOLATION', message: 'Security violation detected' }
});

const { SecurityError } = validationErrors;

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
 * @param {boolean} [options.debug=false] - Enable debug logging
 * @returns {Promise<Object>} Result object with success boolean and optional error message
 */
export const verifyAgentAuthentication = async ({ agentConfig, executeAgent, timeout = 30000, debug = false }) => {
  const logger = createDebugLogger({ debug });

  logger.log('Verifying agent authentication...');
  logger.command(agentConfig.command, agentConfig.args);

  try {
    // Simple smoke test prompt that should work with any agent
    const testPrompt = 'Respond with valid JSON: {"status": "ok"}';

    await executeAgent({
      agentConfig,
      prompt: testPrompt,
      timeout,
      debug: false // Don't clutter output during smoke test
    });

    logger.log('Agent authentication verified successfully');
    return { success: true };
  } catch (err) {
    logger.log('Agent authentication failed:', err.message);

    // Provide helpful error message with authentication guidance
    let errorMessage = err.message;

    if (err.message.includes('authentication') || err.message.includes('auth') ||
        err.message.includes('token') || err.message.includes('login')) {
      errorMessage += '\n\n💡 Agent authentication required. Run the appropriate setup command:\n' +
                     '   - Claude:  "claude setup-token" - https://docs.anthropic.com/en/docs/claude-code\n' +
                     '   - Cursor:  "agent login" - https://docs.cursor.com/context/rules-for-ai\n' +
                     '   - OpenCode: See https://opencode.ai/docs/cli/ for authentication setup';
    }

    return { success: false, error: errorMessage };
  }
};
