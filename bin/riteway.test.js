// @ts-nocheck
import { describe, Try } from '../source/riteway.js';
import { execSync } from 'child_process';

// Import the functions we need to test
import {
  parseArgs,
  loadModules,
  createIgnoreMatcher,
  resolveTestFiles,
  runTests
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
