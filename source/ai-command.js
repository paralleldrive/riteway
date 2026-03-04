import { basename } from 'path';
import minimist from 'minimist';
import { z } from 'zod';
import { createError } from 'error-causes';
import { ValidationError, AITestError, OutputError } from './ai-errors.js';
import { getAgentConfig, loadAgentConfig } from './agent-config.js';
import { runAITests, verifyAgentAuthentication } from './ai-runner.js';
import { validateFilePath } from './validation.js';
import { recordTestOutput } from './test-output.js';

/**
 * Centralized default values for the AI test CLI.
 * Source of truth for bin/riteway.js help text and parseAIArgs defaults.
 */
export const defaults = {
  runs: 4,
  threshold: 75,
  concurrency: 4,
  agent: 'claude',
  color: false
};

const aiArgsSchema = z.object({
  filePath: z.string({ error: 'Test file path is required' }),
  runs: z.number().int().positive({ error: 'runs must be a positive integer' }),
  threshold: z.number().min(0).max(100, { error: 'threshold must be between 0 and 100' }),
  agent: z.enum(['claude', 'opencode', 'cursor'], { error: 'agent must be one of: claude, opencode, cursor' }),
  agentConfigPath: z.string().optional(),
  concurrency: z.number().int().positive({ error: 'concurrency must be a positive integer' }),
  color: z.boolean(),
  cwd: z.string()
});

/**
 * Parse and validate AI test command arguments.
 * @param {string[]} argv - Command line arguments
 * @returns {Object} Parsed and validated arguments
 */
export const parseAIArgs = (argv) => {
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
    boolean: ['color'],
    default: {
      runs: defaults.runs,
      threshold: defaults.threshold,
      agent: defaults.agent,
      color: defaults.color
    }
  });

  const concurrency = opts.concurrency ? Number(opts.concurrency) : defaults.concurrency;
  const agentConfigPath = opts['agent-config'] || undefined;

  const parsed = {
    filePath: opts._[0],
    runs: Number(opts.runs),
    threshold: Number(opts.threshold),
    agent: opts.agent,
    ...(agentConfigPath ? { agentConfigPath } : {}),
    color: opts.color,
    concurrency,
    cwd: process.cwd()
  };

  try {
    return aiArgsSchema.parse(parsed);
  } catch (zodError) {
    throw createError({
      ...ValidationError,
      code: 'INVALID_AI_ARGS',
      message: z.prettifyError(zodError),
      cause: zodError
    });
  }
};

const ansi = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

/**
 * Format a single assertion report line.
 * @param {Object} assertion - Assertion result object
 * @param {boolean} assertion.passed - Whether the assertion passed
 * @param {string} assertion.requirement - Assertion requirement
 * @param {number} assertion.passCount - Number of passing runs
 * @param {number} assertion.totalRuns - Total number of runs
 * @param {boolean} [assertion.color=false] - Enable ANSI color codes
 * @returns {string} Formatted assertion report line
 */
export const formatAssertionReport = ({ passed, requirement, passCount, totalRuns, color = false }) => {
  const status = passed ? 'PASS' : 'FAIL';
  const colorCode = color ? (passed ? ansi.green : ansi.red) : '';
  const resetCode = color ? ansi.reset : '';
  return `  ${colorCode}[${status}]${resetCode} ${requirement} (${passCount}/${totalRuns} runs)`;
};

/**
 * Orchestrate AI test execution: validate file path, verify agent auth, run tests,
 * record TAP output to ai-evals/, open result in browser, and report results to console.
 * Throws AITestError when the pass rate falls below threshold.
 * @param {Object} options - Test run options
 * @returns {Promise<string>} Path to the recorded TAP output file
 */
export const runAICommand = async ({ filePath, runs, threshold, agent, agentConfigPath, color, concurrency, cwd }) => {
  if (!filePath) {
    throw createError({
      ...ValidationError,
      message: 'Test file path is required'
    });
  }

  try {
    const fullPath = validateFilePath(filePath, cwd);
    const testFilename = basename(filePath);
    // agentConfigPath is not restricted by validateFilePath — unlike test file paths,
    // config files are explicitly user-supplied and may live outside the project directory.
    const agentConfig = agentConfigPath
      ? await loadAgentConfig(agentConfigPath)
      : getAgentConfig(agent);

    const agentLabel = agentConfigPath
      ? `custom (${agentConfigPath})`
      : agent;

    console.log(`Running AI tests: ${testFilename}`);
    console.log(`Configuration: ${runs} runs, ${threshold}% threshold, ${concurrency} concurrent, agent: ${agentLabel}`);

    console.log(`\nVerifying ${agentLabel} agent authentication...`);
    const authResult = await verifyAgentAuthentication({
      agentConfig,
      timeout: 30000
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
      concurrency
    });

    let outputPath;
    try {
      outputPath = await recordTestOutput({
        results,
        testFilename
      });
    } catch (error) {
      throw createError({
        ...OutputError,
        message: `Failed to record test output: ${error.message}`,
        cause: error
      });
    }

    const { assertions } = results;
    const passedAssertions = assertions.filter(a => a.passed).length;
    const totalAssertions = assertions.length;

    console.log(`\nResults recorded: ${outputPath}`);
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
    // error-causes stores the structured error type in error.cause.name — re-throw known types
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
