import { readFile } from 'fs/promises';
import { spawn } from 'child_process';

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
  if (threshold < 0 || threshold > 100) {
    throw new Error('threshold must be between 0 and 100');
  }
  return Math.ceil((runs * threshold) / 100);
};

/**
 * Execute an agent CLI subprocess and return parsed JSON output.
 * @param {Object} options
 * @param {Object} options.agentConfig - Agent configuration
 * @param {string} options.agentConfig.command - Command to execute
 * @param {Array<string>} [options.agentConfig.args=[]] - Command arguments
 * @param {string} options.prompt - Prompt to send to the agent
 * @param {number} [options.timeout=300000] - Timeout in milliseconds (default: 5 minutes)
 * @returns {Promise<Object>} Parsed JSON response from agent
 * @throws {Error} If JSON parsing fails or subprocess errors
 */
export const executeAgent = ({ agentConfig, prompt, timeout = 300000 }) => {
  return new Promise((resolve, reject) => {
    const { command, args = [] } = agentConfig;
    const allArgs = [...args, prompt];
    
    const proc = spawn(command, allArgs);
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill();
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

      if (code !== 0) {
        const truncatedStdout = stdout.length > 500 ? stdout.slice(0, 500) + '...' : stdout;
        return reject(new Error(
          `Agent process exited with code ${code}\n` +
          `Command: ${command} ${args.join(' ')}\n` +
          `Stderr: ${stderr}\n` +
          `Stdout preview: ${truncatedStdout}`
        ));
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (err) {
        const truncatedStdout = stdout.length > 500 ? stdout.slice(0, 500) + '...' : stdout;
        reject(new Error(
          `Failed to parse agent output as JSON: ${err.message}\n` +
          `Command: ${command} ${args.join(' ')}\n` +
          `Stdout preview: ${truncatedStdout}`
        ));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(new Error(
        `Failed to spawn agent process: ${err.message}\n` +
        `Command: ${command} ${args.join(' ')}`
      ));
    });
  });
};

/**
 * Aggregate results from multiple test runs.
 * @param {Object} options
 * @param {Array<Object>} options.runResults - Array of individual run results
 * @param {number} options.threshold - Required pass percentage (0-100)
 * @param {number} options.runs - Total number of runs
 * @returns {Object} Aggregated results with passed status, counts, and individual results
 */
export const aggregateResults = ({ runResults, threshold, runs }) => {
  const passCount = runResults.filter(r => r.passed).length;
  const requiredPasses = calculateRequiredPasses({ runs, threshold });
  
  return {
    passed: passCount >= requiredPasses,
    passCount,
    totalRuns: runs,
    runResults
  };
};

/**
 * Run AI tests with multiple parallel runs and aggregate results.
 * @param {Object} options
 * @param {string} options.filePath - Path to test file
 * @param {number} [options.runs=4] - Number of test runs
 * @param {number} [options.threshold=75] - Required pass percentage (0-100)
 * @param {Object} options.agentConfig - Agent CLI configuration
 * @param {string} options.agentConfig.command - Command to execute
 * @param {Array<string>} [options.agentConfig.args=[]] - Command arguments
 * @param {number} [options.timeout=300000] - Timeout in milliseconds (default: 5 minutes)
 * @returns {Promise<Object>} Aggregated test results
 */
export const runAITests = async ({
  filePath,
  runs = 4,
  threshold = 75,
  timeout = 300000,
  agentConfig = {
    command: 'claude',
    args: ['-p', '--output-format', 'json', '--no-session-persistence']
  }
}) => {
  const prompt = await readTestFile(filePath);
  
  const runResults = await Promise.all(
    Array.from({ length: runs }, () => executeAgent({ agentConfig, prompt, timeout }))
  );
  
  return aggregateResults({ runResults, threshold, runs });
};
