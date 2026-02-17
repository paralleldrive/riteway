import { readFile } from 'fs/promises';
import { spawn } from 'child_process';
import { createError } from 'error-causes';
import { extractTests, buildResultPrompt, buildJudgePrompt, parseTAPYAML } from './test-extractor.js';
import { createDebugLogger } from './debug-logger.js';
import { limitConcurrency } from './limit-concurrency.js';
import { normalizeJudgment, aggregatePerAssertionResults } from './aggregation.js';
import { verifyAgentAuthentication as verifyAuth } from './validation.js';
import { unwrapAgentResult } from './agent-parser.js';
import { ParseError, TimeoutError, AgentProcessError } from './ai-errors.js';

export const readTestFile = (filePath) => readFile(filePath, 'utf-8');
export const verifyAgentAuthentication = (options) => verifyAuth({ ...options, executeAgent });

/**
 * Wrap a promise with a timeout that rejects if the promise doesn't resolve in time.
 * @param {Promise} promise - Promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @param {Function} errorFactory - Function that returns error object when timeout occurs
 * @returns {Promise} Promise that rejects with timeout error if ms exceeded
 */
const withTimeout = (promise, ms, errorFactory) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(createError(errorFactory())), ms)
    )
  ]);
};

/**
 * Collect stdout and stderr from a child process.
 * @param {import('child_process').ChildProcess} proc - Child process to collect output from
 * @returns {Promise<{stdout: string, stderr: string, code: number}>} Collected output
 */
const collectProcessOutput = (proc) => {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
};

/**
 * Spawn an agent CLI subprocess and return promise that resolves with output.
 * @param {Object} options
 * @param {Object} options.agentConfig - Agent configuration
 * @param {string} options.prompt - Prompt to send to agent
 * @param {boolean} options.debug - Enable debug logging
 * @param {string} options.logFile - Optional log file path
 * @returns {Promise<{stdout: string, stderr: string, code: number, logger: Object}>}
 */
const spawnProcess = async ({ agentConfig, prompt, debug, logFile }) => {
  const { command, args = [] } = agentConfig;
  const allArgs = [...args, prompt];
  const logger = createDebugLogger({ debug, logFile });

  logger.log('\nExecuting agent command:');
  logger.command(command, args);
  logger.log(`Prompt length: ${prompt.length} characters`);

  try {
    const proc = spawn(command, allArgs);
    proc.stdin.end(); // Close stdin immediately - CLI waits for this

    const result = await collectProcessOutput(proc);
    return { ...result, logger };
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
 * Unwrap JSON envelope format (e.g., { result: "..." }) and return raw string content.
 * @param {string} output - Raw output string
 * @returns {string} Unwrapped string content
 */
const unwrapRawEnvelope = (output) => {
  if (output.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(output);
      if (parsed.result !== undefined) {
        return parsed.result;
      }
    } catch {
      // Not JSON — use raw output as-is
    }
  }
  return output;
};

/**
 * Handle successful agent execution by processing output based on rawOutput flag.
 * @param {Object} options
 * @param {Object} options.agentConfig - Agent configuration
 * @param {boolean} options.rawOutput - If true, return raw string; else parse JSON
 * @returns {(result: {stdout: string, logger: Object}) => (Object|string)} Handler function that processes {stdout, logger}
 */
const handleAgentSuccess = ({ agentConfig, rawOutput }) => ({ stdout, logger }) => {
  const { command, args = [], parseOutput } = agentConfig;
  
  try {
    // Apply parseOutput function if provided (e.g., for NDJSON preprocessing)
    const processedOutput = parseOutput ? parseOutput(stdout, logger) : stdout;

    // If rawOutput is requested, unwrap JSON envelope and return as raw string
    if (rawOutput) {
      logger.log('Raw output requested - unwrapping JSON envelope');
      const result = unwrapRawEnvelope(processedOutput);

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

    // Parse and unwrap the processed output - handles envelope unwrapping and nested JSON
    const result = unwrapAgentResult(processedOutput, logger);
    logger.result(result);
    logger.flush();
    return result;
  } catch (err) {
    const truncatedStdout = stdout.length > 500 ? stdout.slice(0, 500) + '...' : stdout;
    logger.log('JSON parsing failed:', err.message);
    logger.flush();
    
    // If this error was created by createError(), it has structured metadata in .cause
    // We need to wrap it with our debugging context
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

/**
 * Run agent CLI subprocess with timeout and output collection.
 * @param {Object} options
 * @param {Object} options.agentConfig - Agent configuration
 * @param {string} options.prompt - Prompt to send to agent
 * @param {number} options.timeout - Timeout in milliseconds
 * @param {boolean} options.debug - Enable debug logging
 * @param {string} options.logFile - Optional log file path
 * @returns {Promise<{stdout: string, logger: Object}>}
 */
const runAgentProcess = async ({ agentConfig, prompt, timeout, debug, logFile }) => {
  const { command, args = [] } = agentConfig;
  
  const processPromise = spawnProcess({ agentConfig, prompt, debug, logFile });
  
  const { stdout, stderr, code, logger } = await withTimeout(
    processPromise,
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
    const truncatedStdout = stdout.length > 500 ? stdout.slice(0, 500) + '...' : stdout;
    const truncatedStderr = stderr.length > 500 ? stderr.slice(0, 500) + '...' : stderr;

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

  return { stdout, logger };
};

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
export const executeAgent = async ({ agentConfig, prompt, timeout = 300000, debug = false, logFile, rawOutput = false }) => {
  const processResult = await runAgentProcess({ agentConfig, prompt, timeout, debug, logFile });
  return handleAgentSuccess({ agentConfig, rawOutput })(processResult);
};

/**
 * Extract structured test data with agent-directed imports and log progress.
 * @param {Object} options
 * @param {string} options.testContent - Raw test file content
 * @param {string} options.testFilePath - Path to test file
 * @param {Object} options.agentConfig - Agent CLI configuration
 * @param {number} options.timeout - Timeout in milliseconds
 * @param {boolean} options.debug - Enable debug logging
 * @param {string} options.projectRoot - Project root directory for resolving import paths
 * @param {Object} options.logger - Debug logger instance
 * @returns {Promise<{userPrompt: string, promptUnderTest: string, assertions: Array, resultPrompt: string}>}
 */
const extractStructuredTests = async ({ testContent, testFilePath, agentConfig, timeout, debug, projectRoot, logger }) => {
  logger.log(`\nExtracting tests from: ${testFilePath}`);
  logger.log(`Test content length: ${testContent.length} characters`);

  const { userPrompt, promptUnderTest, assertions } = await extractTests({
    testContent,
    testFilePath,
    agentConfig,
    timeout,
    debug,
    projectRoot
  });

  logger.log(`Extracted ${assertions.length} assertions`);

  // Build result prompt once (shared across all runs)
  const resultPrompt = buildResultPrompt({ userPrompt, promptUnderTest });

  return { userPrompt, promptUnderTest, assertions, resultPrompt };
};

/**
 * Judge one assertion against the result using the judge agent.
 * @param {Object} options
 * @param {Object} options.assertion - Assertion to judge
 * @param {string} options.result - Result text from result agent
 * @param {string} options.userPrompt - User prompt from test extraction
 * @param {string} options.promptUnderTest - Prompt under test from extraction
 * @param {number} options.runIndex - Current run index
 * @param {number} options.assertionIndex - Current assertion index
 * @param {number} options.totalAssertions - Total number of assertions
 * @param {Object} options.agentConfig - Agent CLI configuration
 * @param {number} options.timeout - Timeout in milliseconds
 * @param {boolean} options.debug - Enable debug logging
 * @param {string} options.logFile - Optional log file path
 * @param {Object} options.logger - Debug logger instance
 * @returns {Promise<Object>} Normalized judgment
 */
const judgeAssertion = async ({
  assertion,
  result,
  userPrompt,
  promptUnderTest,
  runIndex,
  assertionIndex,
  totalAssertions,
  agentConfig,
  timeout,
  debug,
  logFile,
  logger
}) => {
  const judgePrompt = buildJudgePrompt({
    userPrompt,
    promptUnderTest,
    result,
    requirement: assertion.requirement
  });

  logger.log(`  Assertion ${assertionIndex + 1}/${totalAssertions}: ${assertion.requirement}`);

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
};

/**
 * Execute a single run: call result agent once, then judge all assertions in parallel.
 * @param {Object} options
 * @param {number} options.runIndex - Current run index
 * @param {Object} options.extracted - Extracted test data with assertions and prompts
 * @param {string} options.resultPrompt - Pre-built result prompt
 * @param {number} options.runs - Total number of runs
 * @param {Object} options.agentConfig - Agent CLI configuration
 * @param {number} options.timeout - Timeout in milliseconds
 * @param {boolean} options.debug - Enable debug logging
 * @param {string} options.logFile - Optional log file path
 * @param {Object} options.logger - Debug logger instance
 * @returns {Promise<Array>} Array of judgments for all assertions in this run
 */
const executeSingleRun = async ({
  runIndex,
  extracted,
  resultPrompt,
  runs,
  agentConfig,
  timeout,
  debug,
  logFile,
  logger
}) => {
  const { userPrompt, promptUnderTest, assertions } = extracted;

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
    assertions.map((assertion, assertionIndex) =>
      judgeAssertion({
        assertion,
        result,
        userPrompt,
        promptUnderTest,
        runIndex,
        assertionIndex,
        totalAssertions: assertions.length,
        agentConfig,
        timeout,
        debug,
        logFile,
        logger
      })
    )
  );

  return judgments;
};

/**
 * Execute all runs with limited concurrency.
 * @param {Object} options
 * @param {Object} options.extracted - Extracted test data with assertions and prompts
 * @param {string} options.resultPrompt - Pre-built result prompt
 * @param {number} options.runs - Number of test runs
 * @param {number} options.concurrency - Maximum concurrent runs
 * @param {Object} options.agentConfig - Agent CLI configuration
 * @param {number} options.timeout - Timeout in milliseconds
 * @param {boolean} options.debug - Enable debug logging
 * @param {string} options.logFile - Optional log file path
 * @param {Object} options.logger - Debug logger instance
 * @returns {Promise<Array>} Array of run results (each run is an array of judgments)
 */
const executeRuns = async ({
  extracted,
  resultPrompt,
  runs,
  concurrency,
  agentConfig,
  timeout,
  debug,
  logFile,
  logger
}) => {
  // Build run tasks - limitConcurrency ACROSS runs only
  const runTasks = Array.from({ length: runs }, (_, runIndex) => async () =>
    executeSingleRun({
      runIndex,
      extracted,
      resultPrompt,
      runs,
      agentConfig,
      timeout,
      debug,
      logFile,
      logger
    })
  );

  // Limit concurrency ACROSS runs, not within runs
  return limitConcurrency(runTasks, concurrency);
};

/**
 * Aggregate results from all runs into per-assertion results.
 * @param {Object} options
 * @param {Array} options.assertions - Array of assertions
 * @param {Array} options.allRunJudgments - Array of run results (each run is an array of judgments)
 * @param {number} options.threshold - Required pass percentage (0-100)
 * @param {number} options.runs - Number of test runs
 * @returns {Object} Aggregated per-assertion test results
 */
const aggregateResults = ({ assertions, allRunJudgments, threshold, runs }) => {
  // Group by assertion across all runs
  const perAssertionResults = assertions.map(({ requirement }, assertionIndex) => ({
    requirement,
    runResults: allRunJudgments.map(runJudgments => runJudgments[assertionIndex])
  }));

  return aggregatePerAssertionResults({ perAssertionResults, threshold, runs });
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

  const extracted = await extractStructuredTests({
    testContent,
    testFilePath: filePath,
    agentConfig,
    timeout,
    debug,
    projectRoot,
    logger
  });

  const { resultPrompt, assertions } = extracted;

  const allRunJudgments = await executeRuns({
    extracted,
    resultPrompt,
    runs,
    concurrency,
    agentConfig,
    timeout,
    debug,
    logFile,
    logger
  });

  logger.flush();
  return aggregateResults({ assertions, allRunJudgments, threshold, runs });
};
