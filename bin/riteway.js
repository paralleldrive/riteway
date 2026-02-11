#!/usr/bin/env node

import { resolve as resolvePath, basename } from 'path';
import { readFileSync } from 'fs';
import resolve from 'resolve';
import minimist from 'minimist';
import { globSync } from 'glob';
import dotignore from 'dotignore';
import { z } from 'zod';
import { errorCauses, createError } from 'error-causes';
import { runAITests, verifyAgentAuthentication, validateFilePath, parseOpenCodeNDJSON } from '../source/ai-runner.js';
import { recordTestOutput, generateLogFilePath } from '../source/test-output.js';

const resolveModule = resolve.sync;
const createMatcher = dotignore.createMatcher;

const asyncPipe = (...fns) => x => fns.reduce(async (y, f) => f(await y), x);

// Error causes definition for AI test runner
const [aiRunnerErrors, handleAIRunnerErrors] = errorCauses({
  ValidationError: {
    code: 'VALIDATION_ERROR',
    message: 'Input validation failed'
  },
  AITestError: {
    code: 'AI_TEST_ERROR',
    message: 'AI test execution failed'
  },
  OutputError: {
    code: 'OUTPUT_ERROR',
    message: 'Test output recording failed'
  }
});

const { ValidationError, AITestError, OutputError } = aiRunnerErrors;

/**
 * Centralized default values for AI test runner
 */
export const defaults = {
  runs: 4,
  threshold: 75,
  concurrency: 4,
  agent: 'claude',
  color: false
};

/**
 * Get agent configuration based on agent name.
 * Supports 'claude', 'opencode', and 'cursor' agents.
 * All agents use their standard OAuth authentication flows.
 * @param {string} agentName - Name of the agent ('claude', 'opencode', 'cursor')
 * @returns {Object} Agent configuration with command and args
 */
export const getAgentConfig = (agentName = 'claude') => {
  const agentConfigs = {
    claude: {
      command: 'claude',
      args: ['-p', '--output-format', 'json', '--no-session-persistence']
    },
    opencode: {
      command: 'opencode',
      args: ['run', '--format', 'json'],
      parseOutput: (stdout, logger) => parseOpenCodeNDJSON(stdout, logger)
    },
    cursor: {
      command: 'agent',
      args: ['--print', '--output-format', 'json']
    }
  };
  
  const config = agentConfigs[agentName.toLowerCase()];
  if (!config) {
    throw createError({
      ...ValidationError,
      message: `Unknown agent: ${agentName}. Supported agents: ${Object.keys(agentConfigs).join(', ')}`
    });
  }
  
  return config;
};

export const parseArgs = (argv) => {
  const opts = minimist(argv, {
    alias: { r: 'require', i: 'ignore' },
    string: ['require', 'ignore'],
    default: { r: [], i: null }
  });
  
  return {
    require: Array.isArray(opts.require) ? opts.require : [opts.require].filter(Boolean),
    ignore: opts.ignore,
    patterns: opts._,
    cwd: process.cwd()
  };
};

/**
 * Zod schema for AI test arguments validation
 */
const aiArgsSchema = z.object({
  filePath: z.string({
    required_error: 'Test file path is required',
    invalid_type_error: 'Test file path must be a string'
  }),
  runs: z.number().int().positive({
    message: 'runs must be a positive integer'
  }),
  threshold: z.number().min(0).max(100, {
    message: 'threshold must be between 0 and 100'
  }),
  agent: z.enum(['claude', 'opencode', 'cursor'], {
    errorMap: () => ({ message: 'agent must be one of: claude, opencode, cursor' })
  }),
  concurrency: z.number().int().positive({
    message: 'concurrency must be a positive integer'
  }),
  validateExtraction: z.boolean(),
  debug: z.boolean(),
  debugLog: z.boolean(),
  color: z.boolean(),
  cwd: z.string()
});

export const parseAIArgs = (argv) => {
  const opts = minimist(argv, {
    string: ['runs', 'threshold', 'agent', 'concurrency'],
    boolean: ['validate-extraction', 'debug', 'debug-log', 'color'],
    default: {
      runs: defaults.runs,
      threshold: defaults.threshold,
      agent: defaults.agent,
      'validate-extraction': false,
      debug: false,
      'debug-log': false,
      color: defaults.color
    }
  });

  // Concurrency defaults if not specified
  const concurrency = opts.concurrency ? Number(opts.concurrency) : defaults.concurrency;

  const parsed = {
    filePath: opts._[0],
    runs: Number(opts.runs),
    threshold: Number(opts.threshold),
    agent: opts.agent,
    validateExtraction: opts['validate-extraction'],
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
    const errorMessage = zodError.errors
      ? zodError.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
      : zodError.message || 'Validation failed';

    throw createError({
      name: 'ValidationError',
      code: 'INVALID_AI_ARGS',
      message: errorMessage,
      cause: zodError
    });
  }
};

/**
 * Pure function to format a single assertion report line
 * @param {Object} assertion - Assertion result object
 * @param {boolean} assertion.passed - Whether the assertion passed
 * @param {string} assertion.description - Assertion description
 * @param {number} assertion.passCount - Number of passing runs
 * @param {number} assertion.totalRuns - Total number of runs
 * @returns {string} Formatted assertion report line
 */
export const formatAssertionReport = ({ passed, description, passCount, totalRuns }) => {
  const status = passed ? 'PASS' : 'FAIL';
  return `  [${status}] ${description} (${passCount}/${totalRuns} runs)`;
};

export const runAICommand = async ({ filePath, runs, threshold, agent, debug, debugLog, color, concurrency, cwd }) => {
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
    const agentConfig = getAgentConfig(agent);

    // Generate log file path if --debug-log is enabled
    const logFile = debugLog ? await generateLogFilePath(testFilename) : undefined;

    console.log(`Running AI tests: ${testFilename}`);
    console.log(`Configuration: ${runs} runs, ${threshold}% threshold, agent: ${agent}`);
    if (debug) {
      console.log(`Debug mode: enabled`);
      if (logFile) {
        console.log(`Debug log file: ${logFile}`);
      }
    }

    // Verify agent authentication before running tests
    console.log(`\nVerifying ${agent} agent authentication...`);
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
    console.log(`✓ Agent authenticated successfully\n`);

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
      testFilename,
      color
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
    console.log(assertions.map(formatAssertionReport).join('\n'));

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

export const loadModules = async ({ require: modules, ...rest }) => {
  await Promise.all(
    modules.map(async (module) => {
      const options = { basedir: rest.cwd, extensions: ['.js', '.mjs', '.json'] };
      await import(resolveModule(module, options));
    })
  );
  return { require: modules, ...rest };
};

export const createIgnoreMatcher = ({ ignore, cwd, ...rest }) => {
  if (!ignore) return { ...rest, cwd, matcher: null };
  
  try {
    const ignoreStr = readFileSync(resolvePath(cwd, ignore || '.gitignore'), 'utf-8');
    return { ...rest, cwd, matcher: createMatcher(ignoreStr) };
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
};

export const resolveTestFiles = ({ patterns, matcher, cwd, ...rest }) => {
  const files = patterns
    .flatMap(pattern => globSync(pattern))
    .filter(file => !matcher || !matcher.shouldIgnore(file))
    .map(file => resolvePath(cwd, file));
    
  return { ...rest, files };
};

export const runTests = async ({ files }) => {
  await Promise.all(files.map(file => import(file)));
};

const mainTestRunner = asyncPipe(
  parseArgs,
  loadModules,
  createIgnoreMatcher,
  resolveTestFiles,
  runTests
);

const mainAIRunner = asyncPipe(
  parseAIArgs,
  runAICommand
);

// Error handler for AI runner errors
const handleAIError = handleAIRunnerErrors({
  ValidationError: ({ message, code }) => {
    console.error(`❌ Validation failed: ${message}`);
    console.error('\nUsage: riteway ai <file> [--runs N] [--threshold P] [--agent NAME] [--validate-extraction] [--debug] [--debug-log] [--color]');
    console.error(`  --runs N               Number of test runs per assertion (default: ${defaults.runs})`);
    console.error(`  --threshold P          Required pass percentage 0-100 (default: ${defaults.threshold})`);
    console.error(`  --agent NAME           AI agent: claude, opencode, cursor (default: ${defaults.agent})`);
    console.error('  --validate-extraction  Validate extraction with judge sub-agent');
    console.error('  --debug                Enable debug output to console');
    console.error('  --debug-log            Enable debug output and save to auto-generated log file');
    console.error(`  --color                Enable ANSI color codes in TAP output (default: ${defaults.color ? 'enabled' : 'disabled'})`);
    console.error('\nAuthentication: Run agent-specific OAuth setup:');
    console.error("  Claude:  'claude setup-token'");
    console.error("  Cursor:  'agent login'");
    console.error('  OpenCode: See https://opencode.ai/docs/cli/');
    process.exit(1);
  },
  AITestError: ({ message, code, cause, passRate, threshold }) => {
    console.error(`❌ AI test failed: ${message}`);
    if (passRate !== undefined && threshold !== undefined) {
      console.error(`💡 Pass rate: ${passRate}% (threshold: ${threshold}%)`);
    }
    if (cause) {
      console.error(`🔍 Root cause: ${cause.message || cause}`);
    }
    process.exit(1);
  },
  OutputError: ({ message, code, cause }) => {
    console.error(`❌ Output recording failed: ${message}`);
    console.error('💡 Check file system permissions and available disk space.');
    if (cause) {
      console.error(`🔍 Root cause: ${cause.message || cause}`);
    }
    process.exit(1);
  }
});

const main = (argv) => {
  // Check for help flag
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`
Usage:
  riteway <patterns...> [options]       Run test files
  riteway ai <file> [options]           Run AI prompt tests

Test Runner Options:
  -r, --require <module>    Require module before running tests
  -i, --ignore <file>       Ignore patterns from file

AI Test Options:
  --runs N                  Number of test runs per assertion (default: ${defaults.runs})
  --threshold P             Required pass percentage 0-100 (default: ${defaults.threshold})
  --agent NAME              AI agent to use: claude, opencode, cursor (default: ${defaults.agent})
  --concurrency N           Max concurrent test executions (default: ${defaults.concurrency})
  --validate-extraction     Validate extraction output with judge sub-agent
  --debug                   Enable debug output to console
  --debug-log               Enable debug output and save to auto-generated log file
  --color                   Enable ANSI color codes in TAP output (default: ${defaults.color ? 'enabled' : 'disabled'})

Authentication:
  All agents use OAuth authentication (no API keys required):
    Claude:  Run 'claude setup-token' - https://docs.anthropic.com/en/docs/claude-code
    Cursor:  Run 'agent login' - https://docs.cursor.com/context/rules-for-ai
    OpenCode: See https://opencode.ai/docs/cli/ for authentication setup

Examples:
  riteway 'test/**/*.js'
  riteway ai prompts/test.sudo --runs 10 --threshold 80
  riteway ai prompts/test.sudo --agent cursor --runs 5
  riteway ai prompts/test.sudo --agent opencode --runs 5
  riteway ai prompts/test.sudo --validate-extraction
  riteway ai prompts/test.sudo --debug
  riteway ai prompts/test.sudo --debug-log
  riteway ai prompts/test.sudo --color
    `);
    process.exit(0);
  }

  // Route to appropriate handler
  if (argv[0] === 'ai') {
    return mainAIRunner(argv.slice(1)).catch(handleAIError);
  }
  
  return mainTestRunner(argv);
};

main(process.argv.slice(2)).catch(console.error);
