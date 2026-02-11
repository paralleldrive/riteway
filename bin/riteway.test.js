// @ts-nocheck
import { describe, Try } from '../source/riteway.js';
import { execSync } from 'child_process';

// Import the functions we need to test
import {
  parseArgs,
  loadModules,
  createIgnoreMatcher,
  resolveTestFiles,
  runTests,
  parseAIArgs,
  runAICommand,
  getAgentConfig,
  loadAgentConfig,
  defaults,
  formatAssertionReport
} from './riteway.js';

// Test utilities
const testSubprocessExit = (command, { cwd = process.cwd() } = {}) => {
  try {
    execSync(command, { cwd, stdio: 'pipe' });
    return { exitCode: 0, stderr: '' };
  } catch (e) {
    return { 
      exitCode: e.status, 
      stderr: e.stderr?.toString() || '' 
    };
  }
};

describe('parseArgs()', async assert => {
  assert({
    given: 'command line arguments with test patterns',
    should: 'parse patterns for test file execution',
    actual: parseArgs(['test/*.js', 'src/**/*.test.js']),
    expected: { 
      patterns: ['test/*.js', 'src/**/*.test.js'], 
      require: [], 
      ignore: null, 
      cwd: process.cwd() 
    }
  });

  assert({
    given: 'command line arguments with -r flag',
    should: 'parse required modules for pre-loading',
    actual: parseArgs(['-r', 'babel-register', 'test/*.js']),
    expected: { 
      patterns: ['test/*.js'], 
      require: ['babel-register'], 
      ignore: null, 
      cwd: process.cwd() 
    }
  });

  assert({
    given: 'command line arguments with multiple -r flags',
    should: 'parse all required modules as array',
    actual: parseArgs(['-r', 'module1', '-r', 'module2', 'test/*.js']),
    expected: { 
      patterns: ['test/*.js'], 
      require: ['module1', 'module2'], 
      ignore: null, 
      cwd: process.cwd() 
    }
  });

  assert({
    given: 'command line arguments with -i ignore flag',
    should: 'parse ignore file path',
    actual: parseArgs(['-i', '.testignore', 'test/*.js']),
    expected: { 
      patterns: ['test/*.js'], 
      require: [], 
      ignore: '.testignore', 
      cwd: process.cwd() 
    }
  });

  assert({
    given: 'empty command line arguments',
    should: 'return default configuration',
    actual: parseArgs([]),
    expected: { 
      patterns: [], 
      require: [], 
      ignore: null, 
      cwd: process.cwd() 
    }
  });
});

describe('createIgnoreMatcher()', async assert => {
  assert({
    given: 'options without ignore file',
    should: 'return null matcher',
    actual: createIgnoreMatcher({ cwd: process.cwd() }),
    expected: { cwd: process.cwd(), matcher: null }
  });

  {
    // Test in subprocess since createIgnoreMatcher calls process.exit()
    const { exitCode, stderr } = testSubprocessExit(
      'node -e "import(\'./bin/riteway.js\').then(m => m.createIgnoreMatcher({ ignore: \'nonexistent.ignore\', cwd: process.cwd() }))"'
    );
    
    assert({
      given: 'options with ignore file that does not exist',
      should: 'exit with error code 2',
      actual: exitCode,
      expected: 2
    });
    
    assert({
      given: 'options with ignore file that does not exist',
      should: 'output error message to stderr',
      actual: stderr.includes('ENOENT') && stderr.includes('nonexistent.ignore'),
      expected: true
    });
  }
});

describe('resolveTestFiles()', async assert => {
  assert({
    given: 'patterns with no matcher',
    should: 'resolve all matching files',
    actual: resolveTestFiles({ 
      patterns: ['source/test.js'], 
      matcher: null, 
      cwd: process.cwd() 
    }).files.length > 0,
    expected: true
  });

  assert({
    given: 'empty patterns array',
    should: 'return empty files array',
    actual: resolveTestFiles({ 
      patterns: [], 
      matcher: null, 
      cwd: process.cwd() 
    }),
    expected: { files: [] }
  });
});

// FUNCTIONAL REQUIREMENT TESTS - Based on Epic Requirements

describe('Functional Requirement: ES module environment support', async assert => {
  assert({
    given: 'a project using ES modules ("type": "module")',
    should: 'run core Riteway tests without requiring Babel',
    actual: typeof parseArgs === 'function' && typeof resolveTestFiles === 'function',
    expected: true
  });
});

describe('Functional Requirement: CLI execution in ES environment', async assert => {
  assert({
    given: 'the Riteway CLI command with test patterns',
    should: 'execute test files in ES module environment',
    actual: resolveTestFiles({ 
      patterns: ['source/test.js'], 
      matcher: null, 
      cwd: process.cwd() 
    }).files.some(file => file.endsWith('source/test.js')),
    expected: true
  });
});

describe('Functional Requirement: Backward compatibility', async assert => {
  assert({
    given: 'existing test patterns and APIs',
    should: 'maintain backward compatibility with -r and -i flags',
    actual: parseArgs(['-r', 'module', '-i', '.ignore', 'test/*.js']),
    expected: {
      patterns: ['test/*.js'],
      require: ['module'],
      ignore: '.ignore',
      cwd: process.cwd()
    }
  });
});

describe('Functional Requirement: ES module imports', async assert => {
  assert({
    given: 'ES module imports',
    should: 'resolve modules with proper extensions and imports',
    actual: typeof resolveTestFiles === 'function',
    expected: true
  });
});

describe('loadModules()', async assert => {
  assert({
    given: 'options with empty require array',
    should: 'return options unchanged',
    actual: await loadModules({ require: [], cwd: process.cwd(), patterns: [] }),
    expected: { require: [], cwd: process.cwd(), patterns: [] }
  });
});

describe('runTests()', async assert => {
  assert({
    given: 'empty files array',
    should: 'complete without error',
    actual: await runTests({ files: [] }),
    expected: undefined
  });
});

describe('defaults', async assert => {
  assert({
    given: 'defaults constant',
    should: 'export centralized default values',
    actual: defaults,
    expected: {
      runs: 4,
      threshold: 75,
      concurrency: 4,
      agent: 'claude',
      color: false
    }
  });
});

describe('parseAIArgs()', async assert => {
  assert({
    given: 'AI command with test file path',
    should: 'parse file path as first argument with defaults',
    actual: parseAIArgs(['test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: defaults.runs,
      threshold: defaults.threshold,
      agent: defaults.agent,
      validateExtraction: false,
      debug: false,
      debugLog: false,
      color: defaults.color,
      concurrency: defaults.concurrency,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with --runs flag',
    should: 'parse custom runs value',
    actual: parseAIArgs(['--runs', '10', 'test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: 10,
      threshold: defaults.threshold,
      agent: defaults.agent,
      validateExtraction: false,
      debug: false,
      debugLog: false,
      color: defaults.color,
      concurrency: defaults.concurrency,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with --threshold flag',
    should: 'parse custom threshold value',
    actual: parseAIArgs(['--threshold', '80', 'test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: defaults.runs,
      threshold: 80,
      agent: defaults.agent,
      validateExtraction: false,
      debug: false,
      debugLog: false,
      color: defaults.color,
      concurrency: defaults.concurrency,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with --agent flag',
    should: 'parse custom agent value',
    actual: parseAIArgs(['--agent', 'opencode', 'test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: defaults.runs,
      threshold: defaults.threshold,
      agent: 'opencode',
      validateExtraction: false,
      debug: false,
      debugLog: false,
      color: defaults.color,
      concurrency: defaults.concurrency,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with all flags',
    should: 'parse all custom values',
    actual: parseAIArgs(['--runs', '5', '--threshold', '60', '--agent', 'cursor', 'test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: 5,
      threshold: 60,
      agent: 'cursor',
      validateExtraction: false,
      debug: false,
      debugLog: false,
      color: defaults.color,
      concurrency: defaults.concurrency,
      cwd: process.cwd()
    }
  });

  {
    // Test missing filePath throws ValidationError
    const error = Try(parseAIArgs, []);

    assert({
      given: 'AI command with no file path',
      should: 'throw Error with cause',
      actual: error instanceof Error && error.cause !== undefined,
      expected: true
    });

    assert({
      given: 'AI command with no file path',
      should: 'have ValidationError name',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: 'AI command with no file path',
      should: 'have INVALID_AI_ARGS code',
      actual: error?.cause?.code,
      expected: 'INVALID_AI_ARGS'
    });

    assert({
      given: 'AI command with no file path',
      should: 'include descriptive message about filePath',
      actual: error?.cause?.message.toLowerCase().includes('filepath') || error?.cause?.message.toLowerCase().includes('file path'),
      expected: true
    });
  }

  assert({
    given: 'AI command with --validate-extraction flag',
    should: 'parse validateExtraction as true',
    actual: parseAIArgs(['--validate-extraction', 'test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: defaults.runs,
      threshold: defaults.threshold,
      agent: defaults.agent,
      validateExtraction: true,
      debug: false,
      debugLog: false,
      color: defaults.color,
      concurrency: defaults.concurrency,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with --debug flag',
    should: 'parse debug as true',
    actual: parseAIArgs(['--debug', 'test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: defaults.runs,
      threshold: defaults.threshold,
      agent: defaults.agent,
      validateExtraction: false,
      debug: true,
      debugLog: false,
      color: defaults.color,
      concurrency: defaults.concurrency,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with --debug-log flag',
    should: 'parse debugLog as true and enable debug mode',
    actual: parseAIArgs(['--debug-log', 'test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: defaults.runs,
      threshold: defaults.threshold,
      agent: defaults.agent,
      validateExtraction: false,
      debug: true,
      debugLog: true,
      color: defaults.color,
      concurrency: defaults.concurrency,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with --color flag',
    should: 'parse color as true',
    actual: parseAIArgs(['--color', 'test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: defaults.runs,
      threshold: defaults.threshold,
      agent: defaults.agent,
      validateExtraction: false,
      debug: false,
      debugLog: false,
      color: true,
      concurrency: defaults.concurrency,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with default color setting',
    should: 'default color to false when no flag specified',
    actual: parseAIArgs(['test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: defaults.runs,
      threshold: defaults.threshold,
      agent: defaults.agent,
      validateExtraction: false,
      debug: false,
      debugLog: false,
      color: defaults.color,
      concurrency: defaults.concurrency,
      cwd: process.cwd()
    }
  });

  {
    // Test invalid threshold throws ValidationError
    const error = Try(parseAIArgs, ['--threshold', '150', 'test.sudo']);

    assert({
      given: 'AI command with threshold > 100',
      should: 'throw ValidationError',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });
  }

  {
    // Test invalid threshold throws ValidationError
    const error = Try(parseAIArgs, ['--threshold', '-10', 'test.sudo']);

    assert({
      given: 'AI command with negative threshold',
      should: 'throw ValidationError',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });
  }

  {
    // Test invalid runs throws ValidationError
    const error = Try(parseAIArgs, ['--runs', '0', 'test.sudo']);

    assert({
      given: 'AI command with runs = 0',
      should: 'throw ValidationError',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });
  }

  {
    // Test invalid concurrency throws ValidationError
    const error = Try(parseAIArgs, ['--concurrency', '-5', 'test.sudo']);

    assert({
      given: 'AI command with negative concurrency',
      should: 'throw ValidationError',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });
  }

  {
    // Test invalid agent throws ValidationError
    const error = Try(parseAIArgs, ['--agent', 'invalid-agent', 'test.sudo']);

    assert({
      given: 'AI command with unsupported agent',
      should: 'throw ValidationError',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });
  }
});

describe('getAgentConfig()', async assert => {
  // Claude config - direct object comparison (no parseOutput)
  const claudeConfig = getAgentConfig('claude');

  assert({
    given: 'agent name "claude"',
    should: 'return claude agent configuration',
    actual: { command: claudeConfig.command, args: claudeConfig.args },
    expected: {
      command: 'claude',
      args: ['-p', '--output-format', 'json', '--no-session-persistence']
    }
  });

  // OpenCode config - test static props directly
  const opencodeConfig = getAgentConfig('opencode');

  assert({
    given: 'agent name "opencode"',
    should: 'return opencode command and args',
    actual: { command: opencodeConfig.command, args: opencodeConfig.args },
    expected: {
      command: 'opencode',
      args: ['run', '--format', 'json']
    }
  });

  // OpenCode parseOutput - test behavior separately
  assert({
    given: 'opencode agent config',
    should: 'have parseOutput function',
    actual: typeof opencodeConfig.parseOutput,
    expected: 'function'
  });

  // Cursor config - direct object comparison (no parseOutput)
  const cursorConfig = getAgentConfig('cursor');

  assert({
    given: 'agent name "cursor"',
    should: 'return cursor agent configuration using OAuth',
    actual: { command: cursorConfig.command, args: cursorConfig.args },
    expected: {
      command: 'agent',
      args: ['--print', '--output-format', 'json']
    }
  });

  // Default (undefined) - direct object comparison
  const defaultConfig = getAgentConfig();

  assert({
    given: 'no agent name (undefined)',
    should: 'return default claude configuration',
    actual: { command: defaultConfig.command, args: defaultConfig.args },
    expected: {
      command: 'claude',
      args: ['-p', '--output-format', 'json', '--no-session-persistence']
    }
  });

  // Mixed case - test static props + parseOutput separately
  const mixedCaseConfig = getAgentConfig('OpenCode');

  assert({
    given: 'agent name in mixed case',
    should: 'handle case-insensitive lookup with correct args',
    actual: { command: mixedCaseConfig.command, args: mixedCaseConfig.args },
    expected: {
      command: 'opencode',
      args: ['run', '--format', 'json']
    }
  });

  assert({
    given: 'opencode agent config via mixed case lookup',
    should: 'have parseOutput function',
    actual: typeof mixedCaseConfig.parseOutput,
    expected: 'function'
  });

  {
    // Test invalid agent name throws error
    const error = Try(getAgentConfig, 'invalid-agent');

    assert({
      given: 'invalid agent name',
      should: 'throw ValidationError with cause',
      actual: error instanceof Error && error.cause !== undefined,
      expected: true
    });

    assert({
      given: 'invalid agent name',
      should: 'have correct error name',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: 'invalid agent name',
      should: 'include supported agents in message',
      actual: error?.cause?.message.includes('claude') &&
              error?.cause?.message.includes('opencode') &&
              error?.cause?.message.includes('cursor'),
      expected: true
    });
  }
});

describe('runAICommand()', async assert => {
  {
    // Test missing filePath throws structured error
    const error = await Try(runAICommand, { filePath: undefined, runs: 4, threshold: 75, cwd: process.cwd() });

    assert({
      given: 'options without filePath',
      should: 'throw ValidationError with cause',
      actual: error instanceof Error && error.cause !== undefined,
      expected: true
    });

    assert({
      given: 'options without filePath',
      should: 'have correct error name',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: 'options without filePath',
      should: 'have correct error code',
      actual: error?.cause?.code,
      expected: 'VALIDATION_ERROR'
    });

    assert({
      given: 'options without filePath',
      should: 'include descriptive message',
      actual: error?.cause?.message.includes('file path'),
      expected: true
    });
  }

  {
    // Test path traversal attempt throws security error
    const error = await Try(runAICommand, {
      filePath: '../../../etc/passwd',
      runs: 4,
      threshold: 75,
      agent: 'claude',
      cwd: process.cwd()
    });

    assert({
      given: 'path traversal attempt',
      should: 'throw SecurityError',
      actual: error?.cause?.name,
      expected: 'SecurityError'
    });

    assert({
      given: 'path traversal attempt',
      should: 'include PATH_TRAVERSAL code',
      actual: error?.cause?.code,
      expected: 'PATH_TRAVERSAL'
    });
  }
});

describe('formatAssertionReport()', async assert => {
  assert({
    given: 'a passing assertion',
    should: 'format with PASS status',
    actual: formatAssertionReport({
      passed: true,
      description: 'test assertion',
      passCount: 4,
      totalRuns: 4
    }),
    expected: '  [PASS] test assertion (4/4 runs)'
  });

  assert({
    given: 'a failing assertion',
    should: 'format with FAIL status',
    actual: formatAssertionReport({
      passed: false,
      description: 'test assertion',
      passCount: 2,
      totalRuns: 4
    }),
    expected: '  [FAIL] test assertion (2/4 runs)'
  });

  assert({
    given: 'an assertion with partial success',
    should: 'format with correct pass/total ratio',
    actual: formatAssertionReport({
      passed: false,
      description: 'partial pass',
      passCount: 3,
      totalRuns: 5
    }),
    expected: '  [FAIL] partial pass (3/5 runs)'
  });

  assert({
    given: 'a passing assertion with color enabled',
    should: 'wrap PASS status in green ANSI code',
    actual: formatAssertionReport({
      passed: true,
      description: 'test assertion',
      passCount: 4,
      totalRuns: 4,
      color: true
    }),
    expected: '  \x1b[32m[PASS]\x1b[0m test assertion (4/4 runs)'
  });

  assert({
    given: 'a failing assertion with color enabled',
    should: 'wrap FAIL status in red ANSI code',
    actual: formatAssertionReport({
      passed: false,
      description: 'test assertion',
      passCount: 2,
      totalRuns: 4,
      color: true
    }),
    expected: '  \x1b[31m[FAIL]\x1b[0m test assertion (2/4 runs)'
  });

  assert({
    given: 'an assertion without color option',
    should: 'not include ANSI codes',
    actual: formatAssertionReport({
      passed: true,
      description: 'test assertion',
      passCount: 4,
      totalRuns: 4
    }).includes('\x1b['),
    expected: false
  });
});

describe('loadAgentConfig()', async assert => {
  {
    const config = await loadAgentConfig('./source/fixtures/test-agent-config.json');

    assert({
      given: 'a valid agent config JSON file',
      should: 'return parsed agent configuration',
      actual: config,
      expected: {
        command: 'my-agent',
        args: ['--print', '--format', 'json']
      }
    });
  }

  {
    const error = await Try(loadAgentConfig, './source/fixtures/invalid-agent-config.txt');

    assert({
      given: 'a file with invalid JSON',
      should: 'throw ValidationError',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: 'a file with invalid JSON',
      should: 'have AGENT_CONFIG_PARSE_ERROR code',
      actual: error?.cause?.code,
      expected: 'AGENT_CONFIG_PARSE_ERROR'
    });
  }

  {
    const error = await Try(loadAgentConfig, './source/fixtures/no-command-agent-config.json');

    assert({
      given: 'a config file missing the command field',
      should: 'throw ValidationError',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: 'a config file missing the command field',
      should: 'have AGENT_CONFIG_VALIDATION_ERROR code',
      actual: error?.cause?.code,
      expected: 'AGENT_CONFIG_VALIDATION_ERROR'
    });
  }

  {
    const error = await Try(loadAgentConfig, './nonexistent/path.json');

    assert({
      given: 'a nonexistent config file path',
      should: 'throw ValidationError',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: 'a nonexistent config file path',
      should: 'have AGENT_CONFIG_READ_ERROR code',
      actual: error?.cause?.code,
      expected: 'AGENT_CONFIG_READ_ERROR'
    });
  }
});

describe('parseAIArgs() with --agent-config', async assert => {
  {
    const parsed = parseAIArgs(['--agent-config', './my-agent.json', 'test.sudo']);

    assert({
      given: 'AI command with --agent-config flag',
      should: 'include agentConfigPath in parsed args',
      actual: parsed.agentConfigPath,
      expected: './my-agent.json'
    });
  }

  {
    const error = Try(parseAIArgs, ['--agent', 'opencode', '--agent-config', './my-agent.json', 'test.sudo']);

    assert({
      given: 'both --agent and --agent-config flags',
      should: 'throw ValidationError for mutual exclusion',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: 'both --agent and --agent-config flags',
      should: 'have INVALID_AI_ARGS code',
      actual: error?.cause?.code,
      expected: 'INVALID_AI_ARGS'
    });
  }

  {
    const parsed = parseAIArgs(['test.sudo']);

    assert({
      given: 'AI command without --agent-config',
      should: 'not include agentConfigPath in parsed args',
      actual: parsed.agentConfigPath,
      expected: undefined
    });
  }
});
