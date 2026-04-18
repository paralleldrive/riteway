import { basename } from 'path';
import minimist from 'minimist';
import { z } from 'zod';
import { globSync } from 'glob';
import { createError } from 'error-causes';
import { ValidationError, AITestError, OutputError } from './ai-errors.js';
import { resolveAgentConfig } from './agent-config.js';
import { runAITests, verifyAgentAuthentication } from './ai-runner.js';
import { validateFilePath } from './validation.js';
import { recordTestOutput } from './test-output.js';
import { defaults, runsSchema, thresholdSchema, concurrencySchema, timeoutSchema } from './constants.js';

// agent accepts any string here — custom registry agents are resolved at run time
const aiArgsSchema = z.object({
  patterns: z.array(z.string()).min(1, { error: 'At least one test file path or glob pattern is required' }),
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
    patterns: opts._.length > 0 ? opts._ : [],
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
 * Resolve glob patterns to concrete file paths.
 * @param {string[]} patterns - File paths or glob patterns
 * @returns {string[]} Resolved file paths
 */
export const resolveAITestFiles = (patterns) => {
  const files = patterns.flatMap(pattern => globSync(pattern));

  if (files.length === 0) {
    throw createError({
      ...ValidationError,
      message: `No test files found matching: ${patterns.join(', ')}`
    });
  }

  return files;
};

/**
 * Run a single AI test file: validate path, run tests, record output, report results.
 * @param {Object} options - Test run options
 * @returns {Promise<string>} Path to the recorded TAP output file
 */
const runSingleFile = async ({ filePath, runs, threshold, timeout, agentConfig, color, saveResponses, concurrency, cwd }) => {
  const testFilename = basename(filePath);
  const fullPath = validateFilePath(filePath, cwd);

  console.log(`\nRunning AI tests: ${testFilename}`);

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

  console.log(`Results recorded: ${outputPath}`);
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
};

/**
 * Orchestrate AI test execution: resolve file patterns, verify agent auth,
 * run tests for each file, record TAP output to ai-evals/, and report results.
 * Throws AITestError when the pass rate falls below threshold.
 *
 * @param {Object} options - Test run options
 * @returns {Promise<string[]>} Paths to the recorded TAP output files
 */
export const runAICommand = async ({ patterns, runs, threshold, timeout, agent, agentConfigPath, color, saveResponses, concurrency, cwd }) => {
  if (!patterns || patterns.length === 0) {
    throw createError({
      ...ValidationError,
      message: 'Test file path is required'
    });
  }

  const filePaths = resolveAITestFiles(patterns);

  const agentConfig = await resolveAgentConfig({ agent, agentConfigPath, cwd });

  const agentLabel = agentConfigPath
    ? `custom (${agentConfigPath})`
    : agent;

  console.log(`Configuration: ${runs} runs, ${threshold}% threshold, ${concurrency} concurrent, ${timeout}ms timeout, agent: ${agentLabel}, responses: ${saveResponses ? 'saving' : 'off'}`);
  console.log(`Test files: ${filePaths.length}`);

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
  console.log('✓ Agent authenticated successfully');

  // Run all files, collecting results and errors. Files that fail do not
  // prevent the remaining files from running (run-all, report-all).
  const outputPaths = [];
  const errors = [];
  for (const filePath of filePaths) {
    try {
      const outputPath = await runSingleFile({
        filePath, runs, threshold, timeout, agentConfig, color, saveResponses, concurrency, cwd
      });
      outputPaths.push(outputPath);
    } catch (error) {
      // If the error carries partial results, write them before continuing.
      const partialResults = error.cause?.partialResults;
      if (partialResults) {
        try {
          const outputPath = await recordTestOutput({
            results: partialResults,
            testFilename: basename(filePath),
            saveResponses
          });
          console.log(`\nPartial results recorded: ${outputPath}`);
          outputPaths.push(outputPath);
        } catch {
          // Best-effort — don't mask the original error
        }
      }
      errors.push({ filePath, error });
    }
  }

  if (errors.length > 0) {
    const messages = errors.map(({ filePath, error }) => {
      const msg = error.cause?.message || error.message;
      return `  ${basename(filePath)}: ${msg}`;
    }).join('\n');

    throw createError({
      ...AITestError,
      message: `${errors.length}/${filePaths.length} test file(s) failed:\n${messages}`,
      outputPaths
    });
  }

  return outputPaths;
};
