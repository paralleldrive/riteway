#!/usr/bin/env node

import { resolve as resolvePath, basename } from 'path';
import { readFileSync } from 'fs';
import resolve from 'resolve';
import minimist from 'minimist';
import { globSync } from 'glob';
import dotignore from 'dotignore';
import { errorCauses, createError } from 'error-causes';
import { runAITests } from '../source/ai-runner.js';
import { recordTestOutput } from '../source/test-output.js';

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
      args: ['--output-format', 'json']
    },
    cursor: {
      command: 'cursor-agent',
      args: ['--output', 'json']
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
    string: ['runs', 'threshold', 'agent'],
    default: { runs: 4, threshold: 75, agent: 'claude' }
  });
  
  return {
    filePath: opts._[0],
    runs: Number(opts.runs),
    threshold: Number(opts.threshold),
    agent: opts.agent,
    cwd: process.cwd()
  };
};

export const runAICommand = async ({ filePath, runs, threshold, agent, cwd }) => {
  if (!filePath) {
    throw createError({
      ...ValidationError,
      message: 'Test file path is required'
    });
  }

  try {
    const fullPath = resolvePath(cwd, filePath);
    const testFilename = basename(filePath);
    const agentConfig = getAgentConfig(agent);
    
    console.log(`Running AI tests: ${testFilename}`);
    console.log(`Configuration: ${runs} runs, ${threshold}% threshold, agent: ${agent}`);
    
    const results = await runAITests({
      filePath: fullPath,
      runs,
      threshold,
      agentConfig
    });
    
    const outputPath = await recordTestOutput({
      results,
      testFilename
    });
    
    console.log(`\nResults recorded: ${outputPath}`);
    console.log(`Pass rate: ${results.passCount}/${results.totalRuns} (${Math.round(results.passCount / results.totalRuns * 100)}%)`);
    
    if (!results.passed) {
      throw createError({
        ...AITestError,
        message: `Test suite failed: Pass rate ${Math.round(results.passCount / results.totalRuns * 100)}% below ${threshold}% threshold`,
        passRate: Math.round(results.passCount / results.totalRuns * 100),
        threshold
      });
    }
    
    console.log('Test suite passed!');
    return outputPath;
  } catch (error) {
    // Re-throw structured errors as-is
    if (error.cause?.name) {
      throw error;
    }
    
    // Wrap unexpected errors
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
    console.error('\nUsage: riteway ai <file> [--runs N] [--threshold P] [--agent NAME]');
    console.error('  --runs N        Number of test runs (default: 4)');
    console.error('  --threshold P   Required pass percentage 0-100 (default: 75)');
    console.error('  --agent NAME    AI agent: claude, opencode, cursor (default: claude)');
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
  --runs N                  Number of test runs (default: 4)
  --threshold P             Required pass percentage 0-100 (default: 75)
  --agent NAME              AI agent to use: claude, opencode, cursor (default: claude)

Examples:
  riteway 'test/**/*.js'
  riteway ai prompts/test.sudo --runs 10 --threshold 80
  riteway ai prompts/test.sudo --agent opencode --runs 5
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
