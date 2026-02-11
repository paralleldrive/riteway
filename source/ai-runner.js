import { readFile } from 'fs/promises';
import { spawn } from 'child_process';
import { resolve, relative } from 'path';
import { errorCauses, createError } from 'error-causes';
import { extractTests, buildResultPrompt, buildJudgePrompt, parseTAPYAML } from './test-extractor.js';
import { createDebugLogger } from './debug-logger.js';

// Module-level error types for AI runner operations.
// Generic codes here (e.g., SECURITY_VIOLATION) may be overridden
// with specific codes (e.g., PATH_TRAVERSAL) at individual throw sites.
const [aiErrors, handleAIErrors] = errorCauses({
  SecurityError: { code: 'SECURITY_VIOLATION', message: 'Security violation detected' },
  ParseError: { code: 'PARSE_FAILURE', message: 'Failed to parse AI response' },
  ValidationError: { code: 'VALIDATION_FAILURE', message: 'Invalid input parameters' },
  TimeoutError: { code: 'AGENT_TIMEOUT', message: 'AI agent timed out' },
  AgentProcessError: { code: 'AGENT_PROCESS_FAILURE', message: 'AI agent process failed' },
});

const { SecurityError, ParseError, ValidationError, TimeoutError, AgentProcessError } = aiErrors;

export { handleAIErrors };

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
 * Parse a string result from an agent, attempting multiple strategies.
 * Strategies (in order):
 * 1. Direct JSON parse if string starts with { or [
 * 2. Extract and parse markdown-wrapped JSON (```json\n...\n```)
 * 3. Keep as plain text if neither works
 * @param {string} result - String to parse
 * @param {Object} logger - Debug logger instance
 * @returns {Object|string} Parsed object or original string
 */
export const parseStringResult = (result, logger) => {
  const trimmed = result.trim();
  
  // Strategy 1: Try parsing as direct JSON if it looks like JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      logger.log('Successfully parsed string as JSON');
      return parsed;
    } catch {
      // Fall through to try markdown extraction
      logger.log('Direct JSON parse failed, trying markdown extraction');
    }
  }
  
  // Strategy 2: Try extracting markdown-wrapped JSON
  const markdownMatch = result.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (markdownMatch) {
    logger.log('Found markdown-wrapped JSON, extracting...');
    try {
      const parsed = JSON.parse(markdownMatch[1]);
      logger.log('Successfully parsed markdown-wrapped JSON');
      return parsed;
    } catch {
      logger.log('Failed to parse markdown content, keeping original string');
    }
  }
  
  // Strategy 3: Keep as plain text
  logger.log('String is not valid JSON, keeping as plain text');
  return result;
};

/**
 * Parse OpenCode's NDJSON (newline-delimited JSON) output format.
 * OpenCode emits multiple JSON objects separated by newlines, with different event types.
 * We extract and concatenate all "text" events to get the final response.
 * @param {string} ndjson - NDJSON output from OpenCode
 * @param {Object} logger - Debug logger instance
 * @returns {string} Concatenated text from all text events
 */
export const parseOpenCodeNDJSON = (ndjson, logger) => {
  logger.log('Parsing OpenCode NDJSON output...');
  
  const lines = ndjson.trim().split('\n').filter(line => line.trim());
  
  const textEvents = lines.reduce((acc, line) => {
    try {
      const event = JSON.parse(line);
      if (event.type === 'text' && event.part?.text) {
        logger.log(`Found text event with ${event.part.text.length} characters`);
        acc.push(event.part.text);
      }
    } catch (err) {
      logger.log(`Warning: Failed to parse NDJSON line: ${err.message}`);
    }
    return acc;
  }, []);
  
  if (textEvents.length === 0) {
    throw createError({
      ...ParseError,
      message: 'No text events found in OpenCode output',
      code: 'NO_TEXT_EVENTS',
      ndjsonLength: ndjson.length,
      linesProcessed: lines.length
    });
  }
  
  const combinedText = textEvents.join('');
  logger.log(`Combined ${textEvents.length} text event(s) into ${combinedText.length} characters`);
  
  return combinedText;
};

/**
 * Read the contents of a test file.
 * @param {string} filePath - Path to the test file
 * @returns {Promise<string>} File contents
 */
export const readTestFile = (filePath) => readFile(filePath, 'utf-8');

/**
 * Normalize a judge response with safe defaults, logging, and error handling.
 * This function normalizes a judge response (already parsed from TAP YAML) to ensure
 * consistent structure with safe defaults for missing fields.
 * @param {Object} raw - Raw judge response (already parsed from TAP YAML)
 * @param {Object} options
 * @param {string} options.description - Test assertion description
 * @param {number} options.runIndex - Zero-based run index
 * @param {Object} options.logger - Logger instance with log() method
 * @returns {Object} Normalized judgment with passed, actual, expected, score fields
 * @throws {Error} If raw is not an object (null, string, undefined, etc.)
 */
export const normalizeJudgment = (raw, { description, runIndex, logger }) => {
  // Fail loud on non-object input per error-causes.md
  if (typeof raw !== 'object' || raw === null) {
    throw createError({
      ...ParseError,
      message: 'Judge returned non-object response',
      code: 'JUDGE_INVALID_RESPONSE',
      description,
      runIndex,
      rawResponse: raw
    });
  }

  // Log warning when applying defaults for missing fields
  if (raw?.actual === undefined || raw?.expected === undefined) {
    logger.log(`Warning: Judge response missing fields for "${description}" run ${runIndex + 1}`);
  }

  return {
    passed: raw?.passed === true,
    actual: raw?.actual ?? 'No actual provided',
    expected: raw?.expected ?? 'No expected provided',
    score: Number.isFinite(raw?.score) ? Math.max(0, Math.min(100, raw.score)) : 0
  };
};

/**
 * Calculate the number of passes required to meet the threshold.
 * Uses ceiling to ensure threshold is met or exceeded.
 * @param {Object} options
 * @param {number} [options.runs=4] - Total number of test runs
 * @param {number} [options.threshold=75] - Required pass percentage (0-100)
 * @returns {number} Number of passes required
 * @throws {Error} If threshold is not between 0 and 100
 */
export const calculateRequiredPasses = ({ runs = 4, threshold = 75 } = {}) => {
  if (!Number.isInteger(runs) || runs <= 0) {
    throw createError({
      ...ValidationError,
      message: 'runs must be a positive integer',
      code: 'INVALID_RUNS',
      runs
    });
  }
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw createError({
      ...ValidationError,
      message: 'threshold must be between 0 and 100',
      code: 'INVALID_THRESHOLD',
      threshold
    });
  }
  return Math.ceil((runs * threshold) / 100);
};

/**
 * Verify that an agent is properly configured and authenticated.
 * Performs a minimal smoke test by sending a simple prompt and checking for valid response.
 * @param {Object} options
 * @param {Object} options.agentConfig - Agent configuration
 * @param {string} options.agentConfig.command - Command to execute
 * @param {Array<string>} [options.agentConfig.args=[]] - Command arguments
 * @param {number} [options.timeout=30000] - Timeout in milliseconds (default: 30 seconds)
 * @param {boolean} [options.debug=false] - Enable debug logging
 * @returns {Promise<Object>} Result object with success boolean and optional error message
 */
export const verifyAgentAuthentication = async ({ agentConfig, timeout = 30000, debug = false }) => {
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

        // Parse the processed output - handles both raw JSON and markdown-wrapped JSON
        let result = parseStringResult(processedOutput, logger);

        // If result is still a string (not parsed as JSON), that's an error
        if (typeof result === 'string') {
          throw createError({
            ...ParseError,
            message: `Agent output is not valid JSON: ${result.slice(0, 100)}`,
            outputPreview: result.slice(0, 100)
          });
        }

        // Claude CLI wraps response in envelope with "result" field
        if (result.result !== undefined) {
          result = result.result;
        }

        // If result is a string after unwrapping, try to parse it again
        logger.log(`Parsed result type: ${typeof result}`);
        if (typeof result === 'string') {
          logger.log('Result is string, attempting to parse as JSON');
          result = parseStringResult(result, logger);
        }

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
 * Simple concurrency limiter to avoid resource exhaustion.
 * Executes tasks with a maximum concurrency limit.
 * @param {Array<Function>} tasks - Array of async task functions
 * @param {number} limit - Maximum number of concurrent tasks
 * @returns {Promise<Array>} Results from all tasks
 */
const limitConcurrency = async (tasks, limit) => {
  const results = [];
  const executing = [];

  for (const task of tasks) {
    const promise = task().then(result => {
      executing.splice(executing.indexOf(promise), 1);
      return result;
    });

    results.push(promise);
    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
};

/**
 * Aggregate results from per-assertion test runs.
 * Each assertion is independently evaluated against the threshold.
 * Overall pass requires all assertions to meet the threshold.
 * @param {Object} options
 * @param {Array<{ description: string, runResults: Array<Object> }>} options.perAssertionResults
 * @param {number} options.threshold - Required pass percentage (0-100)
 * @param {number} options.runs - Number of runs per assertion
 * @returns {Object} Aggregated results with per-assertion breakdown
 */
export const aggregatePerAssertionResults = ({ perAssertionResults, threshold, runs }) => {
  const requiredPasses = calculateRequiredPasses({ runs, threshold });

  const assertions = perAssertionResults.map(({ description, runResults }) => {
    const passCount = runResults.filter(r => r.passed).length;

    // Calculate average score across all runs, treating missing/invalid scores as 0
    const totalScore = runResults.reduce((sum, r) => sum + (r.score ?? 0), 0);
    const averageScore = runResults.length > 0
      ? Math.round((totalScore / runResults.length) * 100) / 100
      : 0;

    return {
      description,
      passed: passCount >= requiredPasses,
      passCount,
      totalRuns: runs,
      averageScore,
      runResults
    };
  });

  return {
    passed: assertions.every(a => a.passed),
    assertions
  };
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
  agentConfig = {
    command: 'claude',
    args: ['-p', '--output-format', 'json', '--no-session-persistence']
  }
}) => {
  const logger = createDebugLogger({ debug, logFile });

  const testContent = await readTestFile(filePath);

  logger.log(`\nExtracting tests from: ${filePath}`);
  logger.log(`Test content length: ${testContent.length} characters`);

  // Phase 1: Extract structured test data with agent-directed imports
  const { userPrompt, promptUnderTest, assertions } = await extractTests({
    testContent,
    testFilePath: filePath,
    agentConfig,
    timeout,
    debug
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
          requirement: assertion.requirement,
          description: assertion.description
        });

        logger.log(`  Assertion ${assertionIndex + 1}/${assertions.length}: ${assertion.description}`);

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
          description: assertion.description,
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
  const perAssertionResults = assertions.map(({ description }, assertionIndex) => ({
    description,
    runResults: allRunJudgments.map(runJudgments => runJudgments[assertionIndex])
  }));

  logger.flush();
  return aggregatePerAssertionResults({ perAssertionResults, threshold, runs });
};
