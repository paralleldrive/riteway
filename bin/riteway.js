#!/usr/bin/env node

import { resolve as resolvePath } from 'path';
import { readFileSync } from 'fs';
import resolve from 'resolve';
import minimist from 'minimist';
import { globSync } from 'glob';
import dotignore from 'dotignore';
import { handleAIErrors } from '../source/ai-errors.js';
import { parseAIArgs, runAICommand } from '../source/ai-command.js';
import { defaults } from '../source/constants.js';
import { initAgentRegistry } from '../source/ai-init.js';
import { registryFileName } from '../source/agent-config.js';

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
    console.error('\nUsage: riteway ai <patterns...> [--runs N] [--threshold P] [--agent NAME | --agent-config FILE] [--color] [--save-responses]');
    console.error(`  --runs N               Number of test runs per assertion (default: ${defaults.runs})`);
    console.error(`  --threshold P          Required pass percentage 0-100 (default: ${defaults.threshold})`);
    console.error(`  --timeout MS           Per-agent-call timeout in milliseconds (default: ${defaults.timeoutMs})`);
    console.error(`  --agent NAME           Agent: claude, opencode, cursor, or custom from ${registryFileName} (default: ${defaults.agent})`);
    console.error(`  --agent-config FILE    Path to a flat single-agent config JSON (mutually exclusive with --agent)`);
    console.error(`  --color                Enable ANSI color codes in terminal output (default: ${defaults.color ? 'enabled' : 'disabled'})`);
    console.error(`  --save-responses       Save raw agent responses to a companion .responses.md file (default: ${defaults.saveResponses})`);
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
    console.error('💡 Each agent entry must have "command" (string), optional "args" (string[]), and optional "outputFormat" ("json"|"ndjson", default "json").');
    process.exit(1);
  }
});

const main = async (argv) => {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`
Usage:
  riteway <patterns...> [options]       Run test files
  riteway ai <patterns...> [options]     Run AI prompt evaluations
  riteway ai init [--force]             Write agent config registry to ${registryFileName}

Test Runner Options:
  -r, --require <module>    Require module before running tests
  -i, --ignore <file>       Ignore patterns from file

AI Test Options:
  --runs N                  Number of test runs per assertion (default: ${defaults.runs})
  --threshold P             Required pass percentage 0-100 (default: ${defaults.threshold})
  --timeout MS              Per-agent-call timeout in milliseconds (default: ${defaults.timeoutMs})
  --agent NAME              Agent: claude, opencode, cursor, or custom from ${registryFileName} (default: ${defaults.agent})
  --agent-config FILE       Path to a flat single-agent config JSON {"command","args","outputFormat"} (mutually exclusive with --agent)
  --concurrency N           Max concurrent test executions (default: ${defaults.concurrency})
  --color                   Enable ANSI color codes in terminal output
  --save-responses          Save raw agent responses and judge details to a companion .responses.md file

AI Init Options:
  --force                   Overwrite existing ${registryFileName}

Authentication:
  All agents use OAuth authentication (no API keys required):
    Claude:  Run 'claude setup-token' - https://docs.anthropic.com/en/docs/claude-code
    Cursor:  Run 'agent login' - https://docs.cursor.com/context/rules-for-ai
    OpenCode: See https://opencode.ai/docs/cli/ for authentication setup

Examples:
  riteway 'test/**/*.js'
  riteway ai 'prompts/**/*.sudo' --runs 1 --threshold 75
  riteway ai prompts/test.sudo --runs 10 --threshold 80
  riteway ai prompts/test.sudo --agent cursor --runs 5
  riteway ai prompts/test.sudo --agent opencode --runs 5
  riteway ai prompts/test.sudo --color
  riteway ai prompts/test.sudo --save-responses
  riteway ai prompts/test.sudo --agent-config ./my-agent.json
  riteway ai init
  riteway ai init --force
    `);
    process.exit(0);
  }

  if (argv[0] === 'ai') {
    if (argv[1] === 'init') {
      try {
        const force = argv.slice(2).includes('--force');
        const outputPath = await initAgentRegistry({ force, cwd: process.cwd() });
        console.log(`Wrote ${outputPath}`);
        console.log('');
        console.log("⚠️  You now own your agent configuration. The library's built-in agent configs");
        console.log('    are bypassed for any agent defined in this file. Edit freely.');
        console.log('');
        console.log('    To use a custom agent:    riteway ai <file> --agent <name>');
        console.log('    To use a specific config:  riteway ai <file> --agent-config <path>');
        process.exit(0);
      } catch (error) {
        handleAIError(error);
      }
    } else {
      try {
        await mainAIRunner(argv.slice(1));
        process.exit(0);
      } catch (error) {
        handleAIError(error);
      }
    }
    return;
  }

  return mainTestRunner(argv);
};

main(process.argv.slice(2)).catch(console.error);
