import { readFile } from 'fs/promises';
import { spawn } from 'child_process';
import { createError } from 'error-causes';
import { extractTests, buildResultPrompt, buildJudgePrompt, parseTAPYAML } from './test-extractor.js';
import { createDebugLogger } from './debug-logger.js';
import { limitConcurrency } from './limit-concurrency.js';
import { normalizeJudgment, aggregatePerAssertionResults } from './aggregation.js';
import { verifyAgentAuthentication as verifyAuth } from './validation.js';
import { unwrapAgentResult } from './agent-parser.js';
import { ParseError, TimeoutError, AgentProcessError, handleAIErrors } from './ai-errors.js';

export { handleAIErrors };
export { limitConcurrency } from './limit-concurrency.js';
export { normalizeJudgment, calculateRequiredPasses, aggregatePerAssertionResults } from './aggregation.js';
export { validateFilePath } from './validation.js';
export { parseStringResult, parseOpenCodeNDJSON } from './agent-parser.js';

export const readTestFile = (filePath) => readFile(filePath, 'utf-8');
export const verifyAgentAuthentication = (options) => verifyAuth({ ...options, executeAgent });

/**
 * Execute an agent CLI subprocess and return parsed JSON output or raw string.
 * @param {Object} options
 * @param {Object} options.agentConfig - Agent configuration
 * @param {string} options.agentConfig.command - Command to execute
 * @param {Array<string>} [options.agentConfig.args=[]] - Command arguments
 * @param {Function} [options.agentConfig.parseOutput] - Optional function to preprocess stdout before JSON parsing
 * @param {string} options.prompt - Prompt to send to the agent
 * @param {number} [options.timeout=300000] - Timeout in milliseconds (default: 5 minutes)
 * @param {boolean} [options.debug=false] - Enable debug logging
 * @param {string} [options.logFile] - Optional log file path for debug output
 * @param {boolean} [options.rawOutput=false] - If true, return raw stdout string without JSON parsing
 * @returns {Promise<Object|string>} Parsed JSON response from agent or raw string if rawOutput is true
 * @throws {Error} If JSON parsing fails (when rawOutput=false) or subprocess errors
 */
export const executeAgent = ({ agentConfig, prompt, timeout = 300000, debug = false, logFile, rawOutput = false }) => {
  return new Promise((resolve, reject) => {
    const { command, args = [], parseOutput } = agentConfig;
    const allArgs = [...args, prompt];
    const logger = createDebugLogger({ debug, logFile });

    logger.log('\nExecuting agent command:');
    logger.command(command, args);
    logger.log(`Prompt length: ${prompt.length} characters`);

    const proc = spawn(command, allArgs);
    proc.stdin.end(); // Close stdin immediately - CLI waits for this

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill();
      logger.log('Process timed out');
      logger.flush();
      reject(createError({
        ...TimeoutError,
        message: `Agent process timed out after ${timeout}ms. Command: ${command} ${args.join(' ')}`,
        command,
        args: args.join(' '),
        timeout
      }));
    }, timeout);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      
      if (timedOut) return; // Already rejected with timeout error

      logger.log(`Process exited with code: ${code}`);
      logger.log(`Stdout length: ${stdout.length} characters`);
      logger.log(`Stderr length: ${stderr.length} characters`);

      if (code !== 0) {
        const truncatedStdout = stdout.length > 500 ? stdout.slice(0, 500) + '...' : stdout;
        const truncatedStderr = stderr.length > 500 ? stderr.slice(0, 500) + '...' : stderr;

        logger.log('Process failed with non-zero exit code');
        logger.flush();

        return reject(createError({
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
        }));
      }

      try {
        // Apply parseOutput function if provided (e.g., for NDJSON preprocessing)
        const processedOutput = parseOutput ? parseOutput(stdout, logger) : stdout;

        // If rawOutput is requested, unwrap JSON envelope and return as raw string
        if (rawOutput) {
          logger.log('Raw output requested - unwrapping JSON envelope');

          // Claude CLI --output-format json wraps plain text responses in { result: "..." }
          let result = processedOutput;

          if (processedOutput.trim().startsWith('{')) {
            try {
              const parsed = JSON.parse(processedOutput);
              if (parsed.result !== undefined) {
                result = parsed.result;
                logger.log('Unwrapped JSON envelope');
              }
            } catch {
              // Not JSON — use raw output as-is
              logger.log('Not a JSON envelope, using raw output');
            }
          }

          if (typeof result !== 'string') {
            throw createError({
              ...ParseError,
              message: `Raw output requested but result is not a string: ${typeof result}`,
              resultType: typeof result
            });
          }

          logger.log(`Returning raw output (${result.length} characters)`);
          logger.flush();
          return resolve(result);
        }

        // Parse and unwrap the processed output - handles envelope unwrapping and nested JSON
        const result = unwrapAgentResult(processedOutput, logger);

        logger.result(result);
        logger.flush();

        resolve(result);
      } catch (err) {
        const truncatedStdout = stdout.length > 500 ? stdout.slice(0, 500) + '...' : stdout;
        logger.log('JSON parsing failed:', err.message);
        logger.flush();

        reject(createError({
          ...ParseError,
          message: `Failed to parse agent output as JSON: ${err.message}`,
          code: 'AGENT_OUTPUT_PARSE_ERROR',
          command,
          args: args.join(' '),
          stdoutPreview: truncatedStdout,
          cause: err
        }));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      logger.log('Process spawn error:', err.message);
      logger.flush();

      reject(createError({
        ...AgentProcessError,
        message: `Failed to spawn agent process: ${err.message}`,
        command,
        args: args.join(' '),
        cause: err
      }));
    });
  });
};

/**
 * Run AI tests with two-agent pattern: result agent + judge agent.
 * Pipeline: readTestFile → extractTests → result agent (once per run) → judge agents (per assertion, parallel) → aggregation.
 * @param {Object} options
 * @param {string} options.filePath - Path to test file
 * @param {number} [options.runs=4] - Number of test runs per assertion
 * @param {number} [options.threshold=75] - Required pass percentage (0-100)
 * @param {Object} options.agentConfig - Agent CLI configuration
 * @param {string} options.agentConfig.command - Command to execute
 * @param {Array<string>} [options.agentConfig.args=[]] - Command arguments
 * @param {number} [options.timeout=300000] - Timeout in milliseconds (default: 5 minutes)
 * @param {number} [options.concurrency=4] - Maximum concurrent test executions (across runs)
 * @param {boolean} [options.debug=false] - Enable debug logging
 * @param {string} [options.logFile] - Optional log file path for debug output
 * @param {string} [options.projectRoot=process.cwd()] - Project root directory for resolving import paths
 * @returns {Promise<Object>} Aggregated per-assertion test results
 */
export const runAITests = async ({
  filePath,
  runs = 4,
  threshold = 75,
  timeout = 300000,
  concurrency = 4,
  debug = false,
  logFile,
  projectRoot = process.cwd(),
  agentConfig = {
    command: 'claude',
    args: ['-p', '--output-format', 'json', '--no-session-persistence']
  }
}) => {
  const logger = createDebugLogger({ debug, logFile });

  const testContent = await readFile(filePath, 'utf-8');

  logger.log(`\nExtracting tests from: ${filePath}`);
  logger.log(`Test content length: ${testContent.length} characters`);

  // Phase 1: Extract structured test data with agent-directed imports
  const { userPrompt, promptUnderTest, assertions } = await extractTests({
    testContent,
    testFilePath: filePath,
    agentConfig,
    timeout,
    debug,
    projectRoot
  });

  logger.log(`Extracted ${assertions.length} assertions`);

  // Build result prompt once (shared across all runs)
  const resultPrompt = buildResultPrompt({ userPrompt, promptUnderTest });

  // Build run tasks - limitConcurrency ACROSS runs only
  const runTasks = Array.from({ length: runs }, (_, runIndex) => async () => {
    logger.log(`\nRun ${runIndex + 1}/${runs}: Calling result agent...`);

    // Step 1: Call result agent ONCE per run - returns plain text (no JSON parsing)
    const result = await executeAgent({
      agentConfig,
      prompt: resultPrompt,
      timeout,
      debug,
      logFile,
      rawOutput: true
    });

    logger.log(`Result obtained (${result.length} chars). Judging ${assertions.length} assertions...`);

    // Step 2: Call judge agent for EACH assertion - ALL PARALLEL within a run
    const judgments = await Promise.all(
      assertions.map(async (assertion, assertionIndex) => {
        const judgePrompt = buildJudgePrompt({
          userPrompt,
          promptUnderTest,
          result,
          requirement: assertion.requirement
        });

        logger.log(`  Assertion ${assertionIndex + 1}/${assertions.length}: ${assertion.requirement}`);

        const judgeOutput = await executeAgent({
          agentConfig,
          prompt: judgePrompt,
          timeout,
          debug,
          logFile,
          rawOutput: true
        });

        // Parse TAP YAML and normalize
        const parsed = parseTAPYAML(judgeOutput);
        return normalizeJudgment(parsed, {
          requirement: assertion.requirement,
          runIndex,
          logger
        });
      })
    );

    return judgments;
  });

  // Limit concurrency ACROSS runs, not within runs
  const allRunJudgments = await limitConcurrency(runTasks, concurrency);

  // Group by assertion across all runs
  const perAssertionResults = assertions.map(({ requirement }, assertionIndex) => ({
    requirement,
    runResults: allRunJudgments.map(runJudgments => runJudgments[assertionIndex])
  }));

  logger.flush();
  return aggregatePerAssertionResults({ perAssertionResults, threshold, runs });
};
