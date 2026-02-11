import { basename } from 'path';
import minimist from 'minimist';
import { z } from 'zod';
import { createError } from 'error-causes';
import { ValidationError, AITestError, OutputError } from './ai-errors.js';
import { getAgentConfig, loadAgentConfig, formatZodError } from './agent-config.js';
import { runAITests, verifyAgentAuthentication } from './ai-runner.js';
import { validateFilePath } from './validation.js';
import { recordTestOutput, generateLogFilePath } from './test-output.js';

/**
 * Centralized default values for AI test runner
 */
export const defaults = {
  runs: 4,
  threshold: 75,
  concurrency: 4,
  agent: 'claude',
  color: false,
  debug: false,
  debugLog: false
};

/**
 * Zod schema for AI test arguments validation
 */
const aiArgsSchema = z.object({
  filePath: z.string({
    error: 'Test file path is required'
  }),
  runs: z.number().int().positive({
    error: 'runs must be a positive integer'
  }),
  threshold: z.number().min(0).max(100, {
    error: 'threshold must be between 0 and 100'
  }),
  agent: z.enum(['claude', 'opencode', 'cursor'], {
    error: 'agent must be one of: claude, opencode, cursor'
  }),
  agentConfigPath: z.string().optional(),
  concurrency: z.number().int().positive({
    error: 'concurrency must be a positive integer'
  }),
  debug: z.boolean(),
  debugLog: z.boolean(),
  color: z.boolean(),
  cwd: z.string()
});

/**
 * Parse and validate AI test command arguments
 * @param {string[]} argv - Command line arguments
 * @returns {Object} Parsed and validated arguments
 */
export const parseAIArgs = (argv) => {
  // Mutual exclusion: --agent and --agent-config cannot both be explicitly provided
  const hasExplicitAgent = argv.includes('--agent');
  const hasAgentConfig = argv.includes('--agent-config');

  if (hasExplicitAgent && hasAgentConfig) {
    throw createError({
      ...ValidationError,
      code: 'INVALID_AI_ARGS',
      message: '--agent and --agent-config are mutually exclusive'
    });
  }

  const opts = minimist(argv, {
    string: ['runs', 'threshold', 'agent', 'concurrency', 'agent-config'],
    boolean: ['debug', 'debug-log', 'color'],
    default: {
      runs: defaults.runs,
      threshold: defaults.threshold,
      agent: defaults.agent,
      debug: defaults.debug,
      'debug-log': defaults.debugLog,
      color: defaults.color
    }
  });

  // Concurrency defaults if not specified
  const concurrency = opts.concurrency ? Number(opts.concurrency) : defaults.concurrency;
  const agentConfigPath = opts['agent-config'] || undefined;

  const parsed = {
    filePath: opts._[0],
    runs: Number(opts.runs),
    threshold: Number(opts.threshold),
    agent: opts.agent,
    ...(agentConfigPath ? { agentConfigPath } : {}),
    debug: opts.debug || opts['debug-log'], // --debug-log implies --debug
    debugLog: opts['debug-log'],
    color: opts.color,
    concurrency,
    cwd: process.cwd()
  };

  // Validate with Zod schema
  try {
    return aiArgsSchema.parse(parsed);
  } catch (zodError) {
    throw createError({
      ...ValidationError,
      code: 'INVALID_AI_ARGS',
      message: formatZodError(zodError),
      cause: zodError
    });
  }
};

const ANSI = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

/**
 * Pure function to format a single assertion report line
 * @param {Object} assertion - Assertion result object
 * @param {boolean} assertion.passed - Whether the assertion passed
 * @param {string} assertion.description - Assertion description
 * @param {number} assertion.passCount - Number of passing runs
 * @param {number} assertion.totalRuns - Total number of runs
 * @param {boolean} [assertion.color=false] - Enable ANSI color codes
 * @returns {string} Formatted assertion report line
 */
export const formatAssertionReport = ({ passed, description, passCount, totalRuns, color = false }) => {
  const status = passed ? 'PASS' : 'FAIL';
  const colorCode = color ? (passed ? ANSI.green : ANSI.red) : '';
  const resetCode = color ? ANSI.reset : '';
  return `  ${colorCode}[${status}]${resetCode} ${description} (${passCount}/${totalRuns} runs)`;
};

/**
 * Run AI tests with specified configuration
 * @param {Object} options - Test run options
 * @returns {Promise<string>} Path to output file
 */
export const runAICommand = async ({ filePath, runs, threshold, agent, agentConfigPath, debug, debugLog, color, concurrency, cwd }) => {
  if (!filePath) {
    throw createError({
      ...ValidationError,
      message: 'Test file path is required'
    });
  }

  try {
    // Validate and resolve the test file path
    const fullPath = validateFilePath(filePath, cwd);
    const testFilename = basename(filePath);
    // agentConfigPath is not restricted by validateFilePath — unlike test file paths,
    // config files are explicitly user-supplied and may live outside the project directory.
    const agentConfig = agentConfigPath
      ? await loadAgentConfig(agentConfigPath)
      : getAgentConfig(agent);

    // Generate log file path if --debug-log is enabled
    const logFile = debugLog ? await generateLogFilePath(testFilename) : undefined;

    const agentLabel = agentConfigPath
      ? `custom (${agentConfigPath})`
      : agent;

    console.log(`Running AI tests: ${testFilename}`);
    console.log(`Configuration: ${runs} runs, ${threshold}% threshold, agent: ${agentLabel}`);
    if (debug) {
      console.log('Debug mode: enabled');
      if (logFile) {
        console.log(`Debug log file: ${logFile}`);
      }
    }

    // Verify agent authentication before running tests
    console.log(`\nVerifying ${agentLabel} agent authentication...`);
    const authResult = await verifyAgentAuthentication({
      agentConfig,
      timeout: 30000,
      debug
    });

    if (!authResult.success) {
      throw createError({
        ...ValidationError,
        message: `Agent authentication failed: ${authResult.error}`
      });
    }
    console.log('✓ Agent authenticated successfully\n');

    const results = await runAITests({
      filePath: fullPath,
      runs,
      threshold,
      agentConfig,
      concurrency,
      debug,
      logFile
    });

    const outputPath = await recordTestOutput({
      results,
      testFilename
    }).catch(error => {
      throw createError({
        ...OutputError,
        message: `Failed to record test output: ${error.message}`,
        cause: error
      });
    });

    const { assertions } = results;
    const passedAssertions = assertions.filter(a => a.passed).length;
    const totalAssertions = assertions.length;

    console.log(`\nResults recorded: ${outputPath}`);
    if (logFile) {
      console.log(`Debug log recorded: ${logFile}`);
    }
    console.log(`Assertions: ${passedAssertions}/${totalAssertions} passed`);
    console.log(assertions.map(a => formatAssertionReport({ ...a, color })).join('\n'));

    if (!results.passed) {
      const passRate = Math.round(passedAssertions / totalAssertions * 100);
      throw createError({
        ...AITestError,
        message: `Test suite failed: ${passedAssertions}/${totalAssertions} assertions passed (${passRate}%)`,
        passRate,
        threshold
      });
    }

    console.log('Test suite passed!');
    return outputPath;
  } catch (error) {
    if (error.cause?.name) {
      throw error;
    }

    throw createError({
      ...AITestError,
      message: `Failed to run AI tests: ${error.message}`,
      cause: error
    });
  }
};
