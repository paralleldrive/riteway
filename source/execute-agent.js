import { spawn } from 'child_process';
import { createError } from 'error-causes';
import { ParseError, TimeoutError, AgentProcessError } from './ai-errors.js';
import { createDebugLogger } from './debug-logger.js';
import { unwrapEnvelope, unwrapAgentResult } from './agent-parser.js';

const withTimeout = (promise, ms, errorFactory) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(createError(errorFactory())), ms)
    )
  ]);

const collectProcessOutput = (proc) =>
  new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('close', (code) => { resolve({ stdout, stderr, code }); });
    proc.on('error', reject);
  });

/**
 * Spawn an agent CLI subprocess and collect output.
 * Logger is injected to avoid coupling: it is created once at executeAgent level.
 */
const spawnProcess = async ({ agentConfig, prompt, logger }) => {
  const { command, args = [] } = agentConfig;
  const allArgs = [...args, prompt];

  logger.log('\nExecuting agent command:');
  logger.command(command, args);
  logger.log(`Prompt length: ${prompt.length} characters`);

  try {
    const proc = spawn(command, allArgs);
    proc.stdin.end();
    return await collectProcessOutput(proc);
  } catch (err) {
    throw createError({
      ...AgentProcessError,
      message: `Failed to spawn agent process: ${err.message}`,
      command,
      args: args.join(' '),
      cause: err
    });
  }
};

/**
 * Try to unwrap a JSON envelope { result: ... } from a raw string, returning the
 * inner value as a string. Falls back to the original string if not JSON or no envelope.
 */
const unwrapRawOutput = (output) => {
  if (!output.trim().startsWith('{')) return output;
  try {
    return unwrapEnvelope(JSON.parse(output));
  } catch {
    return output;
  }
};

/**
 * Process agent stdout: apply optional parseOutput preprocessing, then either
 * return raw unwrapped string (rawOutput=true) or parse full JSON result.
 */
const processAgentOutput = ({ agentConfig, rawOutput, logger }) => ({ stdout }) => {
  const { command, args = [], parseOutput } = agentConfig;

  try {
    const processedOutput = parseOutput ? parseOutput(stdout, logger) : stdout;

    if (rawOutput) {
      logger.log('Raw output requested - unwrapping JSON envelope');
      const result = unwrapRawOutput(processedOutput);

      if (typeof result !== 'string') {
        throw createError({
          ...ParseError,
          message: `Raw output requested but result is not a string: ${typeof result}`,
          resultType: typeof result
        });
      }

      logger.log(`Returning raw output (${result.length} characters)`);
      logger.flush();
      return result;
    }

    const result = unwrapAgentResult(processedOutput, logger);
    logger.result(result);
    logger.flush();
    return result;
  } catch (err) {
    const truncatedStdout = stdout.length > 500 ? `${stdout.slice(0, 500)}...` : stdout;
    logger.log('JSON parsing failed:', err.message);
    logger.flush();

    throw createError({
      ...ParseError,
      message: `Failed to parse agent output as JSON: ${err.message}`,
      code: 'AGENT_OUTPUT_PARSE_ERROR',
      command,
      args: args.join(' '),
      stdoutPreview: truncatedStdout,
      cause: err
    });
  }
};

const runAgentProcess = async ({ agentConfig, prompt, timeout, logger }) => {
  const { command, args = [] } = agentConfig;

  const { stdout, stderr, code } = await withTimeout(
    spawnProcess({ agentConfig, prompt, logger }),
    timeout,
    () => ({
      ...TimeoutError,
      message: `Agent process timed out after ${timeout}ms. Command: ${command} ${args.join(' ')}`,
      command,
      args: args.join(' '),
      timeout
    })
  );

  logger.log(`Process exited with code: ${code}`);
  logger.log(`Stdout length: ${stdout.length} characters`);
  logger.log(`Stderr length: ${stderr.length} characters`);

  if (code !== 0) {
    const truncatedStdout = stdout.length > 500 ? `${stdout.slice(0, 500)}...` : stdout;
    const truncatedStderr = stderr.length > 500 ? `${stderr.slice(0, 500)}...` : stderr;

    logger.log('Process failed with non-zero exit code');
    logger.flush();

    throw createError({
      ...AgentProcessError,
      message: `Agent process exited with code ${code}\n` +
               `Command: ${command} ${args.join(' ')}\n` +
               `Stderr: ${truncatedStderr}\n` +
               `Stdout preview: ${truncatedStdout}`,
      command,
      args: args.join(' '),
      exitCode: code,
      stderr: truncatedStderr,
      stdoutPreview: truncatedStdout
    });
  }

  return { stdout };
};

/**
 * Execute an agent CLI subprocess and return parsed JSON output or raw string.
 * @param {Object} options
 * @param {Object} options.agentConfig - Agent configuration
 * @param {string} options.agentConfig.command - Command to execute
 * @param {Array<string>} [options.agentConfig.args=[]] - Command arguments
 * @param {Function} [options.agentConfig.parseOutput] - Optional stdout preprocessor
 * @param {string} options.prompt - Prompt to send to the agent
 * @param {number} [options.timeout=300000] - Timeout in ms (default: 5 minutes)
 * @param {boolean} [options.debug=false] - Enable debug logging
 * @param {string} [options.logFile] - Optional log file path for debug output
 * @param {boolean} [options.rawOutput=false] - Return raw stdout string without JSON parsing
 * @returns {Promise<Object|string>} Parsed JSON response or raw string if rawOutput=true
 */
export const executeAgent = async ({
  agentConfig,
  prompt,
  timeout = 300000,
  debug = false,
  logFile,
  rawOutput = false
}) => {
  const logger = createDebugLogger({ debug, logFile });
  const processResult = await runAgentProcess({ agentConfig, prompt, timeout, logger });
  return processAgentOutput({ agentConfig, rawOutput, logger })(processResult);
};
