#!/usr/bin/env node

import { resolve as resolvePath } from 'path';
import { readFileSync } from 'fs';
import resolve from 'resolve';
import minimist from 'minimist';
import { globSync } from 'glob';
import dotignore from 'dotignore';
import { handleAIErrors } from '../source/ai-errors.js';
import { parseAIArgs, runAICommand, defaults } from '../source/ai-command.js';

const resolveModule = resolve.sync;
const createMatcher = dotignore.createMatcher;

const asyncPipe = (...fns) => x => fns.reduce(async (y, f) => f(await y), x);

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

// Exhaustive — every error type registered in ai-errors.js must have a handler.
const handleAIError = handleAIErrors({
  ValidationError: ({ message }) => {
    console.error(`❌ Validation failed: ${message}`);
    console.error('\nUsage: riteway ai <file> [--runs N] [--threshold P] [--agent NAME | --agent-config FILE] [--color]');
    console.error(`  --runs N               Number of test runs per assertion (default: ${defaults.runs})`);
    console.error(`  --threshold P          Required pass percentage 0-100 (default: ${defaults.threshold})`);
    console.error(`  --agent NAME           AI agent: claude, opencode, cursor (default: ${defaults.agent})`);
    console.error('  --agent-config FILE    Path to custom agent config JSON (mutually exclusive with --agent)');
    console.error(`  --color                Enable ANSI color codes in terminal output (default: ${defaults.color ? 'enabled' : 'disabled'})`);
    console.error('\nAuthentication: Run agent-specific OAuth setup:');
    console.error("  Claude:  'claude setup-token'");
    console.error("  Cursor:  'agent login'");
    console.error('  OpenCode: See https://opencode.ai/docs/cli/');
    process.exit(1);
  },
  AITestError: ({ message, cause, passRate, threshold }) => {
    console.error(`❌ AI test failed: ${message}`);
    if (passRate !== undefined && threshold !== undefined) {
      console.error(`💡 Pass rate: ${passRate}% (threshold: ${threshold}%)`);
    }
    if (cause) {
      console.error(`🔍 Root cause: ${cause.message || cause}`);
    }
    process.exit(1);
  },
  OutputError: ({ message, cause }) => {
    console.error(`❌ Output recording failed: ${message}`);
    console.error('💡 Check file system permissions and available disk space.');
    if (cause) {
      console.error(`🔍 Root cause: ${cause.message || cause}`);
    }
    process.exit(1);
  },
  AgentProcessError: ({ message, cause }) => {
    console.error(`❌ Agent process failed: ${message}`);
    if (cause) {
      console.error(`🔍 Root cause: ${cause.message || cause}`);
    }
    process.exit(1);
  },
  TimeoutError: ({ message, timeout }) => {
    console.error(`❌ Agent timed out: ${message}`);
    if (timeout) {
      console.error(`💡 Timeout was set to ${timeout}ms.`);
    }
    process.exit(1);
  },
  ParseError: ({ message, cause }) => {
    console.error(`❌ Failed to parse agent output: ${message}`);
    if (cause) {
      console.error(`🔍 Root cause: ${cause.message || cause}`);
    }
    process.exit(1);
  },
  SecurityError: ({ message }) => {
    console.error(`❌ Security violation: ${message}`);
    process.exit(1);
  },
  ExtractionParseError: ({ message, cause }) => {
    console.error(`❌ Failed to parse test extraction: ${message}`);
    if (cause) {
      console.error(`🔍 Root cause: ${cause.message || cause}`);
    }
    process.exit(1);
  },
  ExtractionValidationError: ({ message }) => {
    console.error(`❌ Invalid test extraction: ${message}`);
    process.exit(1);
  },
  AgentConfigReadError: ({ message, cause }) => {
    console.error(`❌ Failed to read agent config: ${message}`);
    if (cause) {
      console.error(`🔍 Root cause: ${cause.message || cause}`);
    }
    process.exit(1);
  },
  AgentConfigParseError: ({ message, cause }) => {
    console.error(`❌ Invalid agent config JSON: ${message}`);
    if (cause) {
      console.error(`🔍 Root cause: ${cause.message || cause}`);
    }
    process.exit(1);
  },
  AgentConfigValidationError: ({ message }) => {
    console.error(`❌ Agent config validation failed: ${message}`);
    console.error('💡 Config must be a JSON object with "command" (string) and optional "args" (string[]).');
    process.exit(1);
  }
});

const main = async (argv) => {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`
Usage:
  riteway <patterns...> [options]       Run test files
  riteway ai <file> [options]           Run AI prompt tests
    --runs N --threshold P --agent NAME [--concurrency N] [--color] [--agent-config FILE]

Test Runner Options:
  -r, --require <module>    Require module before running tests
  -i, --ignore <file>       Ignore patterns from file

AI Test Options:
  --runs N                  Number of test runs per assertion (default: ${defaults.runs})
  --threshold P             Required pass percentage 0-100 (default: ${defaults.threshold})
  --agent NAME              AI agent to use: claude, opencode, cursor (default: ${defaults.agent})
  --agent-config FILE       Path to custom agent config JSON {"command","args"} (mutually exclusive with --agent)
  --concurrency N           Max concurrent test executions (default: ${defaults.concurrency})
  --color                   Enable ANSI color codes in terminal output

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
  riteway ai prompts/test.sudo --color
  riteway ai prompts/test.sudo --agent-config ./my-agent.json
    `);
    process.exit(0);
  }

  if (argv[0] === 'ai') {
    try {
      await mainAIRunner(argv.slice(1));
      process.exit(0);
    } catch (error) {
      handleAIError(error);
    }
  }

  return mainTestRunner(argv);
};

main(process.argv.slice(2)).catch(console.error);
