// @ts-check
import { describe, test, onTestFinished } from 'vitest';
import { assert } from 'riteway/vitest';
import { Try } from './riteway.js';
import { readFile, rm } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { runAITests } from './ai-runner.js';
import { recordTestOutput } from './test-output.js';
import { loadAgentConfig } from './agent-config.js';

// @ts-ignore - import.meta.url is valid in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// spawnSync needed here because describe.skipIf requires a synchronous boolean.
// Uses the same probe string as validation.js to stay consistent with the canonical
// Claude CLI smoke-test pattern.
const cliCheck = spawnSync('claude', ['-p', '--output-format', 'json', '--no-session-persistence', 'Respond with valid JSON: {"status": "ok"}'], {
  encoding: 'utf-8',
  timeout: 5000
});

const isClaudeAuthenticated = cliCheck.status === 0;

const AI_AGENT_TIMEOUT_MS = 180000;
const E2E_TEST_TIMEOUT_MS = 300000;

const claudeConfig = {
  command: 'claude',
  args: ['-p', '--output-format', 'json', '--no-session-persistence']
};

describe.skipIf(!isClaudeAuthenticated)('e2e: full workflow with real agent', () => {
  test('runs AI tests and records TAP output file', { timeout: E2E_TEST_TIMEOUT_MS }, async () => {
    const testFilePath = join(__dirname, 'fixtures', 'sum-function-test.sudo');
    const aiEvalsDir = join(__dirname, 'fixtures', 'test-ai-evals');

    onTestFinished(async () => {
      await rm(aiEvalsDir, { recursive: true, force: true }).catch(() => {});
    });

    const results = await runAITests({
      filePath: testFilePath,
      runs: 2,
      threshold: 75,
      timeout: AI_AGENT_TIMEOUT_MS,
      agentConfig: claudeConfig
    });

    assert({
      given: 'sum-function fixture with 3 assertions',
      should: 'extract and run all 3 assertions',
      actual: results.assertions.length,
      expected: 3
    });

    assert({
      given: 'a fixture with a clear, well-specified prompt under test',
      should: 'pass the overall test suite',
      actual: results.passed,
      expected: true
    });

    assert({
      given: 'runs set to 2',
      should: 'run each assertion exactly 2 times',
      actual: results.assertions[0].totalRuns,
      expected: 2
    });

    assert({
      given: 'first assertion with 2 runs',
      should: 'collect 2 run results',
      actual: results.assertions[0].runResults.length,
      expected: 2
    });

    assert({
      given: 'assertion average score',
      should: 'be between 0 and 100',
      actual: results.assertions[0].averageScore >= 0 && results.assertions[0].averageScore <= 100,
      expected: true
    });

    const outputPath = await recordTestOutput({
      results,
      testFilename: 'sum-function-test.sudo',
      outputDir: aiEvalsDir,
      openBrowser: false
    });

    const fileContent = await readFile(outputPath, 'utf-8');
    const filename = basename(outputPath);

    assert({
      given: 'TAP output with 3 assertions',
      should: 'include correct test plan',
      actual: fileContent.includes('1..3'),
      expected: true
    });

    assert({
      given: 'TAP output',
      should: 'include TAP version header',
      actual: fileContent.includes('TAP version 13'),
      expected: true
    });

    assert({
      given: 'TAP output',
      should: 'include assertion requirement text',
      actual: fileContent.includes('Given the spec, should name the function sum'),
      expected: true
    });

    assert({
      given: 'TAP output',
      should: 'include pass rate diagnostics',
      actual: fileContent.includes('# pass rate:'),
      expected: true
    });

    assert({
      given: 'TAP output',
      should: 'include test summary',
      actual: fileContent.includes('# tests 3'),
      expected: true
    });

    assert({
      given: 'output filename',
      should: 'include date in YYYY-MM-DD format',
      actual: /^\d{4}-\d{2}-\d{2}/.test(filename),
      expected: true
    });

    assert({
      given: 'output filename',
      should: 'include test name and .tap.md extension',
      actual: filename.includes('sum-function-test') && filename.endsWith('.tap.md'),
      expected: true
    });
  });
});

// Extraction validation tests: each requires one real agent call (extraction only).
// The error is thrown before result/judge agents are invoked, so these are faster
// than the full-workflow tests but still require Claude authentication.

describe.skipIf(!isClaudeAuthenticated)('e2e: missing prompt under test', () => {
  test('throws when test file has no import (no promptUnderTest)', { timeout: E2E_TEST_TIMEOUT_MS }, async () => {
    const testFilePath = join(__dirname, 'fixtures', 'no-prompt-under-test.sudo');

    // extractTests validates promptUnderTest before invoking result/judge agents.
    // See test-extractor.js — MISSING_PROMPT_UNDER_TEST resolves plan item #6
    // (buildJudgePrompt blank CONTEXT guard) as already validated at extraction time.
    const error = await Try(runAITests, { filePath: testFilePath, runs: 1, timeout: AI_AGENT_TIMEOUT_MS, agentConfig: claudeConfig });

    assert({
      given: 'a test file with no import statement',
      should: 'throw a ValidationError with MISSING_PROMPT_UNDER_TEST',
      actual: error?.cause,
      expected: {
        name: 'ValidationError',
        message: 'Test file does not declare a promptUnderTest import. Every test file must import the prompt under test.',
        code: 'MISSING_PROMPT_UNDER_TEST',
        testFile: testFilePath
      }
    });
  });
});

describe.skipIf(!isClaudeAuthenticated)('e2e: missing userPrompt', () => {
  test('throws when test file has no userPrompt', { timeout: E2E_TEST_TIMEOUT_MS }, async () => {
    const testFilePath = join(__dirname, 'fixtures', 'missing-user-prompt.sudo');

    const error = await Try(runAITests, { filePath: testFilePath, runs: 1, timeout: AI_AGENT_TIMEOUT_MS, agentConfig: claudeConfig });

    assert({
      given: 'a test file with no userPrompt field',
      should: 'throw a ValidationError with MISSING_USER_PROMPT',
      actual: error?.cause,
      expected: {
        name: 'ValidationError',
        message: 'Test file does not define a userPrompt. Every test file must include a user prompt (inline or imported).',
        code: 'MISSING_USER_PROMPT',
        testFile: testFilePath
      }
    });
  });
});

describe.skipIf(!isClaudeAuthenticated)('e2e: no assertions', () => {
  test('throws when test file has no assertion lines', { timeout: E2E_TEST_TIMEOUT_MS }, async () => {
    const testFilePath = join(__dirname, 'fixtures', 'no-assertions.sudo');

    const error = await Try(runAITests, { filePath: testFilePath, runs: 1, timeout: AI_AGENT_TIMEOUT_MS, agentConfig: claudeConfig });

    assert({
      given: 'a test file with no assertion lines',
      should: 'throw a ValidationError with NO_ASSERTIONS_FOUND',
      actual: error?.cause,
      expected: {
        name: 'ValidationError',
        message: 'Test file does not contain any assertions. Every test file must include at least one assertion (e.g., "Given X, should Y").',
        code: 'NO_ASSERTIONS_FOUND',
        testFile: testFilePath
      }
    });
  });
});

describe.skipIf(!isClaudeAuthenticated)('e2e: SudoLang userPrompt', () => {
  test('runs AI tests when userPrompt is written in SudoLang', { timeout: E2E_TEST_TIMEOUT_MS }, async () => {
    const testFilePath = join(__dirname, 'fixtures', 'sudolang-prompt-test.sudo');

    const results = await runAITests({
      filePath: testFilePath,
      runs: 2,
      threshold: 75,
      timeout: AI_AGENT_TIMEOUT_MS,
      agentConfig: claudeConfig
    });

    assert({
      given: 'a SudoLang userPrompt with 3 assertions',
      should: 'extract and run all 3 assertions',
      actual: results.assertions.length,
      expected: 3
    });

    assert({
      given: 'a well-specified SudoLang constraint',
      should: 'pass the overall test suite',
      actual: results.passed,
      expected: true
    });
  });
});

describe.skipIf(!isClaudeAuthenticated)('e2e: --agent-config JSON file flow', () => {
  test('loads config from file and runs AI tests', { timeout: E2E_TEST_TIMEOUT_MS }, async () => {
    const configPath = join(__dirname, 'fixtures', 'claude-agent-config.json');
    const testFilePath = join(__dirname, 'fixtures', 'sum-function-test.sudo');

    const agentConfig = await loadAgentConfig(configPath);

    assert({
      given: 'claude agent config loaded from JSON file',
      should: 'return config with correct command and args',
      actual: { command: agentConfig.command, args: agentConfig.args },
      expected: { command: 'claude', args: ['-p', '--output-format', 'json', '--no-session-persistence'] }
    });

    const results = await runAITests({
      filePath: testFilePath,
      runs: 2,
      threshold: 75,
      timeout: AI_AGENT_TIMEOUT_MS,
      agentConfig
    });

    assert({
      given: 'sum-function fixture run via file-loaded agent config',
      should: 'extract and run all 3 assertions',
      actual: results.assertions.length,
      expected: 3
    });
  });
});
