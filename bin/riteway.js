#!/usr/bin/env node

import { resolve as resolvePath, basename } from 'path';
import { readFileSync } from 'fs';
import resolve from 'resolve';
import minimist from 'minimist';
import { globSync } from 'glob';
import dotignore from 'dotignore';
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

export const parseAIArgs = (argv) => {
  const opts = minimist(argv, {
    string: ['runs', 'threshold', 'agent', 'concurrency'],
    boolean: ['validate-extraction', 'debug', 'debug-log', 'color', 'no-color'],
    default: { runs: 4, threshold: 75, agent: 'claude', 'validate-extraction': false, debug: false, 'debug-log': false }
  });

  // Color defaults to false, users can explicitly enable with --color
  const color = opts['no-color'] ? false : (opts.color || false);

  // Concurrency defaults to 4 if not specified
  const concurrency = opts.concurrency ? Number(opts.concurrency) : 4;

  return {
    filePath: opts._[0],
    runs: Number(opts.runs),
    threshold: Number(opts.threshold),
    agent: opts.agent,
    validateExtraction: opts['validate-extraction'],
    debug: opts.debug || opts['debug-log'], // --debug-log implies --debug
    debugLog: opts['debug-log'],
    color,
    concurrency,
    cwd: process.cwd()
  };
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

    let outputPath;
    try {
      outputPath = await recordTestOutput({
        results,
        testFilename,
        color
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
    if (logFile) {
      console.log(`Debug log recorded: ${logFile}`);
    }
    console.log(`Assertions: ${passedAssertions}/${totalAssertions} passed`);
    assertions.forEach(a => {
      const status = a.passed ? 'PASS' : 'FAIL';
      console.log(`  [${status}] ${a.description} (${a.passCount}/${a.totalRuns} runs)`);
    });

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
    console.error('\nUsage: riteway ai <file> [--runs N] [--threshold P] [--agent NAME] [--validate-extraction] [--debug] [--debug-log] [--color] [--no-color]');
    console.error('  --runs N               Number of test runs per assertion (default: 4)');
    console.error('  --threshold P          Required pass percentage 0-100 (default: 75)');
    console.error('  --agent NAME           AI agent: claude, opencode, cursor (default: claude)');
    console.error('  --validate-extraction  Validate extraction with judge sub-agent');
    console.error('  --debug                Enable debug output to console');
    console.error('  --debug-log            Enable debug output and save to auto-generated log file');
    console.error('  --color                Enable ANSI color codes in TAP output (default: disabled)');
    console.error('  --no-color             Explicitly disable ANSI color codes in TAP output');
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
  --runs N                  Number of test runs per assertion (default: 4)
  --threshold P             Required pass percentage 0-100 (default: 75)
  --agent NAME              AI agent to use: claude, opencode, cursor (default: claude)
  --concurrency N           Max concurrent test executions (default: 4)
  --validate-extraction     Validate extraction output with judge sub-agent
  --debug                   Enable debug output to console
  --debug-log               Enable debug output and save to auto-generated log file
  --color                   Enable ANSI color codes in TAP output (default: disabled)
  --no-color                Explicitly disable ANSI color codes in TAP output

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
  riteway ai prompts/test.sudo --no-color
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
