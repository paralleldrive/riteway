import { readFile } from 'fs/promises';
import { spawn } from 'child_process';
import { resolve, relative } from 'path';
import { createError } from 'error-causes';
import { extractTests } from './test-extractor.js';
import { createDebugLogger } from './debug-logger.js';

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
      name: 'SecurityError',
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
      name: 'ParseError',
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
      name: 'ValidationError',
      message: 'runs must be a positive integer',
      code: 'INVALID_RUNS',
      runs
    });
  }
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw createError({
      name: 'ValidationError',
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
 * Execute an agent CLI subprocess and return parsed JSON output.
 * @param {Object} options
 * @param {Object} options.agentConfig - Agent configuration
 * @param {string} options.agentConfig.command - Command to execute
 * @param {Array<string>} [options.agentConfig.args=[]] - Command arguments
 * @param {Function} [options.agentConfig.parseOutput] - Optional function to preprocess stdout before JSON parsing
 * @param {string} options.prompt - Prompt to send to the agent
 * @param {number} [options.timeout=300000] - Timeout in milliseconds (default: 5 minutes)
 * @param {boolean} [options.debug=false] - Enable debug logging
 * @param {string} [options.logFile] - Optional log file path for debug output
 * @returns {Promise<Object>} Parsed JSON response from agent
 * @throws {Error} If JSON parsing fails or subprocess errors
 */
export const executeAgent = ({ agentConfig, prompt, timeout = 300000, debug = false, logFile }) => {
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
      reject(new Error(`Agent process timed out after ${timeout}ms. Command: ${command} ${args.join(' ')}`));
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
        
        return reject(new Error(
          `Agent process exited with code ${code}\n` +
          `Command: ${command} ${args.join(' ')}\n` +
          `Stderr: ${truncatedStderr}\n` +
          `Stdout preview: ${truncatedStdout}`
        ));
      }

      try {
        // Apply parseOutput function if provided (e.g., for NDJSON preprocessing)
        const processedOutput = parseOutput ? parseOutput(stdout, logger) : stdout;
        
        // Parse the processed output - handles both raw JSON and markdown-wrapped JSON
        let result = parseStringResult(processedOutput, logger);
        
        // If result is still a string (not parsed as JSON), that's an error
        if (typeof result === 'string') {
          throw new Error(`Agent output is not valid JSON: ${result.slice(0, 100)}`);
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
          name: 'ParseError',
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
      
      reject(new Error(
        `Failed to spawn agent process: ${err.message}\n` +
        `Command: ${command} ${args.join(' ')}`
      ));
    });
  });
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
    return {
      description,
      passed: passCount >= requiredPasses,
      passCount,
      totalRuns: runs,
      runResults
    };
  });

  return {
    passed: assertions.every(a => a.passed),
    assertions
  };
};

/**
 * Run AI tests with per-assertion isolation.
 * Pipeline: readTestFile → extractTests (sub-agent) → per-assertion parallel execution → aggregation.
 * @param {Object} options
 * @param {string} options.filePath - Path to test file
 * @param {number} [options.runs=4] - Number of test runs per assertion
 * @param {number} [options.threshold=75] - Required pass percentage (0-100)
 * @param {Object} options.agentConfig - Agent CLI configuration
 * @param {string} options.agentConfig.command - Command to execute
 * @param {Array<string>} [options.agentConfig.args=[]] - Command arguments
 * @param {number} [options.timeout=300000] - Timeout in milliseconds (default: 5 minutes)
 * @param {number} [options.concurrency=4] - Maximum concurrent test executions
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
  
  // TODO: refactor to asyncPipe(readTestFile, extractTests({ agentConfig, timeout }))(filePath)
  // Currently extractTests takes { testContent, testFilePath, agentConfig, timeout }, so the output of
  // readTestFile (string) doesn't match the input shape. Currying extractTests to accept
  // config first and return a function of testContent would enable point-free composition.
  const testContent = await readTestFile(filePath);
  
  logger.log(`\nExtracting tests from: ${filePath}`);
  logger.log(`Test content length: ${testContent.length} characters`);
  
  const tests = await extractTests({ testContent, testFilePath: filePath, agentConfig, timeout, debug });
  
  logger.log(`Extracted ${tests.length} test assertions`);

  // Simple concurrency limiter to avoid resource exhaustion
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

  // Create all test execution tasks
  const testTasks = tests.flatMap(({ prompt, description }, index) =>
    Array.from({ length: runs }, (_, runIndex) => async () => {
      logger.log(`\nRunning assertion ${index + 1}/${tests.length}, run ${runIndex + 1}/${runs}`);
      logger.log(`Assertion: ${description}`);
      return executeAgent({ agentConfig, prompt, timeout, debug, logFile }).then(result => ({
        assertionIndex: index,
        description,
        result
      }));
    })
  );

  // Execute all tasks with concurrency limit
  const executionResults = await limitConcurrency(testTasks, concurrency);

  // Group results by assertion
  const perAssertionResults = tests.map(({ description }, index) => {
    const runResults = executionResults
      .filter(({ assertionIndex }) => assertionIndex === index)
      .map(({ result }) => result);
    return { description, runResults };
  });

  logger.flush();
  return aggregatePerAssertionResults({ perAssertionResults, threshold, runs });
};
