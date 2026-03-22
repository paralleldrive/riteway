import { spawn } from 'child_process';
import { createError } from 'error-causes';
import { ParseError, TimeoutError, AgentProcessError } from './ai-errors.js';
import { unwrapEnvelope, unwrapAgentResult, parseOpenCodeNDJSON } from './agent-parser.js';

const outputFormatParsers = {
  json: (stdout) => stdout,
  ndjson: parseOpenCodeNDJSON
};

const maxOutputPreviewLength = 500;

const truncateOutput = (str) =>
  str.length > maxOutputPreviewLength ? `${str.slice(0, maxOutputPreviewLength)}...` : str;

const withTimeout = (promise, ms, errorFactory) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(createError(errorFactory())), ms)
    )
  ]);

const collectProcessOutput = (proc, partialOutput) =>
  new Promise((resolve, reject) => {
    let stderr = '';

    proc.stdout.on('data', (data) => { partialOutput.stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('close', (code) => { resolve({ stdout: partialOutput.stdout, stderr, code }); });
    proc.on('error', reject);
  });

const spawnProcess = ({ agentConfig, prompt }) => {
  const { command, args = [] } = agentConfig;
  const allArgs = [...args, prompt];

  const partialOutput = { stdout: '' };

  try {
    const proc = spawn(command, allArgs);
    proc.stdin.end();

    return {
      promise: collectProcessOutput(proc, partialOutput),
      partialOutput,
      proc
    };
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

const processAgentOutput = ({ agentConfig, rawOutput }) => ({ stdout }) => {
  const { command, args = [], outputFormat = 'json' } = agentConfig;

  try {
    const parse = outputFormatParsers[outputFormat];
    const processedOutput = parse(stdout);

    if (rawOutput) {
      const result = unwrapRawOutput(processedOutput);

      if (typeof result !== 'string') {
        throw createError({
          ...ParseError,
          message: `Raw output requested but result is not a string: ${typeof result}`,
          resultType: typeof result
        });
      }

      return result;
    }

    return unwrapAgentResult(processedOutput);
  } catch (err) {
    const truncatedStdout = truncateOutput(stdout);

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

const runAgentProcess = async ({ agentConfig, prompt, timeout }) => {
  const { command, args = [] } = agentConfig;

  const { promise, partialOutput, proc } = spawnProcess({ agentConfig, prompt });

  let result;
  try {
    result = await withTimeout(
      promise,
      timeout,
      () => ({
        ...TimeoutError,
        message: `Agent process timed out after ${timeout}ms. Command: ${command} ${args.join(' ')}`,
        command,
        args: args.join(' '),
        timeout,
        partialStdout: partialOutput.stdout
      })
    );
  } catch (error) {
    try { proc.kill(); } catch { /* best-effort */ }
    throw error;
  }

  const { stdout, stderr, code } = result;

  if (code !== 0) {
    const truncatedStdout = truncateOutput(stdout);
    const truncatedStderr = truncateOutput(stderr);

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
 * @param {'json'|'ndjson'} [options.agentConfig.outputFormat='json'] - Output format for parsing
 * @param {string} options.prompt - Prompt to send to the agent
 * @param {number} [options.timeout=300000] - Timeout in ms (default: 5 minutes)
 * @param {boolean} [options.rawOutput=false] - Return raw stdout string without JSON parsing
 * @returns {Promise<Object|string>} Parsed JSON response or raw string if rawOutput=true
 */
export const executeAgent = async ({
  agentConfig,
  prompt,
  timeout = 300000,
  rawOutput = false
}) => {
  const processResult = await runAgentProcess({ agentConfig, prompt, timeout });
  return processAgentOutput({ agentConfig, rawOutput })(processResult);
};
