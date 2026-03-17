import { basename } from 'path';
import minimist from 'minimist';
import { z } from 'zod';
import { createError } from 'error-causes';
import { ValidationError, AITestError, OutputError } from './ai-errors.js';
import { resolveAgentConfig } from './agent-config.js';
import { runAITests, verifyAgentAuthentication } from './ai-runner.js';
import { validateFilePath } from './validation.js';
import { recordTestOutput } from './test-output.js';
import { defaults, runsSchema, thresholdSchema, concurrencySchema, timeoutSchema } from './constants.js';

// agent accepts any string here — custom registry agents are resolved at run time
const aiArgsSchema = z.object({
  filePath: z.string({ error: 'Test file path is required' }),
  runs: runsSchema,
  threshold: thresholdSchema,
  timeout: timeoutSchema,
  agent: z.string().min(1, { error: 'agent must be a non-empty string' }),
  agentConfigPath: z.string().optional(),
  concurrency: concurrencySchema,
  color: z.boolean(),
  saveResponses: z.boolean(),
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

  const unknownFlags = [];
  const opts = minimist(argv, {
    string: ['runs', 'threshold', 'timeout', 'agent', 'concurrency', 'agent-config'],
    boolean: ['color', 'save-responses'],
    default: {
      runs: defaults.runs,
      threshold: defaults.threshold,
      timeout: defaults.timeoutMs,
      agent: defaults.agent,
      color: defaults.color,
      'save-responses': defaults.saveResponses
    },
    unknown: (arg) => {
      if (arg.startsWith('--')) unknownFlags.push(arg);
      return !arg.startsWith('--');
    }
  });

  if (unknownFlags.length > 0) {
    throw createError({
      ...ValidationError,
      code: 'INVALID_AI_ARGS',
      message: `Unknown flag(s): ${unknownFlags.join(', ')}`
    });
  }

  const concurrency = opts.concurrency ? Number(opts.concurrency) : defaults.concurrency;
  const agentConfigPath = opts['agent-config'] ? opts['agent-config'] : undefined;

  const parsed = {
    filePath: opts._[0],
    runs: Number(opts.runs),
    threshold: Number(opts.threshold),
    timeout: Number(opts.timeout),
    agent: opts.agent,
    ...(agentConfigPath ? { agentConfigPath } : {}),
    color: opts.color,
    saveResponses: opts['save-responses'],
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
 * record TAP output to ai-evals/, and report results to console.
 * Throws AITestError when the pass rate falls below threshold.
 *
 * TODO (follow-up): console.log calls are mixed with orchestration here. A future
 * refactor could return a structured result and let the CLI layer own all output,
 * aligning with the saga pattern's IO-separation principle. Not critical for this PR.
 *
 * @param {Object} options - Test run options
 * @returns {Promise<string>} Path to the recorded TAP output file
 */
export const runAICommand = async ({ filePath, runs, threshold, timeout, agent, agentConfigPath, color, saveResponses, concurrency, cwd }) => {
  if (!filePath) {
    throw createError({
      ...ValidationError,
      message: 'Test file path is required'
    });
  }

  try {
    const fullPath = validateFilePath(filePath, cwd);
    const testFilename = basename(filePath);
    const agentConfig = await resolveAgentConfig({ agent, agentConfigPath, cwd });

    const agentLabel = agentConfigPath
      ? `custom (${agentConfigPath})`
      : agent;

    console.log(`Running AI tests: ${testFilename}`);
    console.log(`Configuration: ${runs} runs, ${threshold}% threshold, ${concurrency} concurrent, ${timeout}ms timeout, agent: ${agentLabel}, responses: ${saveResponses ? 'saving' : 'off'}`);

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
      timeout,
      agentConfig,
      concurrency
    });

    let outputPath;
    try {
      outputPath = await recordTestOutput({
        results,
        testFilename,
        saveResponses
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
      const passRate = totalAssertions > 0 ? Math.round(passedAssertions / totalAssertions * 100) : 0;
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
    // error-causes wraps structured errors as { cause: { name, code, ... } }.
    // Presence of cause.name is the stable public contract of the library — only
    // changes if error-causes itself changes its API. Re-throw to avoid double-wrapping.
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
