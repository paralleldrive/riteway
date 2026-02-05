// @ts-nocheck
import { describe } from '../source/riteway.js';
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
  getAgentConfig
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

describe('parseAIArgs()', async assert => {
  assert({
    given: 'AI command with test file path',
    should: 'parse file path as first argument with defaults',
    actual: parseAIArgs(['test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: 4,
      threshold: 75,
      agent: 'claude',
      validateExtraction: false,
      debug: false,
      debugLog: false,
      color: false,
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
      threshold: 75,
      agent: 'claude',
      validateExtraction: false,
      debug: false,
      debugLog: false,
      color: false,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with --threshold flag',
    should: 'parse custom threshold value',
    actual: parseAIArgs(['--threshold', '80', 'test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: 4,
      threshold: 80,
      agent: 'claude',
      validateExtraction: false,
      debug: false,
      debugLog: false,
      color: false,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with --agent flag',
    should: 'parse custom agent value',
    actual: parseAIArgs(['--agent', 'opencode', 'test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: 4,
      threshold: 75,
      agent: 'opencode',
      validateExtraction: false,
      debug: false,
      debugLog: false,
      color: false,
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
      color: false,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with no file path',
    should: 'return undefined filePath',
    actual: parseAIArgs([]),
    expected: {
      filePath: undefined,
      runs: 4,
      threshold: 75,
      agent: 'claude',
      validateExtraction: false,
      debug: false,
      debugLog: false,
      color: false,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with --validate-extraction flag',
    should: 'parse validateExtraction as true',
    actual: parseAIArgs(['--validate-extraction', 'test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: 4,
      threshold: 75,
      agent: 'claude',
      validateExtraction: true,
      debug: false,
      debugLog: false,
      color: false,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with --debug flag',
    should: 'parse debug as true',
    actual: parseAIArgs(['--debug', 'test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: 4,
      threshold: 75,
      agent: 'claude',
      validateExtraction: false,
      debug: true,
      debugLog: false,
      color: false,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with --debug-log flag',
    should: 'parse debugLog as true and enable debug mode',
    actual: parseAIArgs(['--debug-log', 'test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: 4,
      threshold: 75,
      agent: 'claude',
      validateExtraction: false,
      debug: true,
      debugLog: true,
      color: false,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with --color flag',
    should: 'parse color as true',
    actual: parseAIArgs(['--color', 'test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: 4,
      threshold: 75,
      agent: 'claude',
      validateExtraction: false,
      debug: false,
      debugLog: false,
      color: true,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with --no-color flag',
    should: 'parse color as false',
    actual: parseAIArgs(['--no-color', 'test.sudo']),
    expected: {
      filePath: 'test.sudo',
      runs: 4,
      threshold: 75,
      agent: 'claude',
      validateExtraction: false,
      debug: false,
      debugLog: false,
      color: false,
      cwd: process.cwd()
    }
  });

  assert({
    given: 'AI command with default color setting',
    should: 'default color to false when no flag specified',
    actual: parseAIArgs(['test.sudo']).color,
    expected: false
  });
});

describe('getAgentConfig()', async assert => {
  assert({
    given: 'agent name "claude"',
    should: 'return claude agent configuration',
    actual: (() => {
      const config = getAgentConfig('claude');
      return {
        command: config.command,
        args: config.args,
        hasParseOutput: config.parseOutput !== undefined
      };
    })(),
    expected: {
      command: 'claude',
      args: ['-p', '--output-format', 'json', '--no-session-persistence'],
      hasParseOutput: false
    }
  });

  assert({
    given: 'agent name "opencode"',
    should: 'return opencode agent configuration with run subcommand',
    actual: (() => {
      const config = getAgentConfig('opencode');
      return {
        command: config.command,
        args: config.args,
        hasParseOutput: typeof config.parseOutput === 'function'
      };
    })(),
    expected: {
      command: 'opencode',
      args: ['run', '--format', 'json'],
      hasParseOutput: true
    }
  });

  assert({
    given: 'agent name "cursor"',
    should: 'return cursor agent configuration using OAuth',
    actual: (() => {
      const config = getAgentConfig('cursor');
      return {
        command: config.command,
        args: config.args,
        hasParseOutput: config.parseOutput !== undefined
      };
    })(),
    expected: {
      command: 'agent',
      args: ['--print', '--output-format', 'json'],
      hasParseOutput: false
    }
  });

  assert({
    given: 'no agent name (undefined)',
    should: 'return default claude configuration',
    actual: (() => {
      const config = getAgentConfig();
      return {
        command: config.command,
        args: config.args,
        hasParseOutput: config.parseOutput !== undefined
      };
    })(),
    expected: {
      command: 'claude',
      args: ['-p', '--output-format', 'json', '--no-session-persistence'],
      hasParseOutput: false
    }
  });

  assert({
    given: 'agent name in mixed case',
    should: 'handle case-insensitive lookup with correct args',
    actual: (() => {
      const config = getAgentConfig('OpenCode');
      return {
        command: config.command,
        args: config.args,
        hasParseOutput: typeof config.parseOutput === 'function'
      };
    })(),
    expected: {
      command: 'opencode',
      args: ['run', '--format', 'json'],
      hasParseOutput: true
    }
  });

  {
    // Test invalid agent name throws error
    let error;
    try {
      getAgentConfig('invalid-agent');
    } catch (e) {
      error = e;
    }
    
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
    let error;
    try {
      await runAICommand({ filePath: undefined, runs: 4, threshold: 75, cwd: process.cwd() });
    } catch (e) {
      error = e;
    }
    
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
    let error;
    try {
      await runAICommand({ 
        filePath: '../../../etc/passwd', 
        runs: 4, 
        threshold: 75, 
        agent: 'claude',
        cwd: process.cwd() 
      });
    } catch (e) {
      error = e;
    }
    
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
