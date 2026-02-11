// @ts-check
import { describe } from './riteway.js';
import { readFile, rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawnSync } from 'child_process';
import { runAITests } from './ai-runner.js';
import { recordTestOutput } from './test-output.js';
import { loadAgentConfig } from '../bin/riteway.js';

// @ts-ignore - import.meta.url is valid in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if Claude CLI is authenticated
const cliCheck = spawnSync('claude', ['-p', '--output-format', 'json', '--no-session-persistence', 'respond with: test'], {
  encoding: 'utf-8',
  timeout: 10000
});

const isClaudeAuthenticated = cliCheck.status === 0;

const testRunner = isClaudeAuthenticated ? describe : describe.skip;

testRunner('e2e: full workflow with real agent', async (assert) => {
  if (!isClaudeAuthenticated) {
    console.log('⚠️  Skipping E2E tests: Claude CLI not authenticated. Run: claude setup-token');
    return;
  }

  const testFilePath = join(__dirname, 'fixtures', 'multi-assertion-test.sudo');
  const aiEvalsDir = join(__dirname, 'fixtures', 'test-ai-evals');

  try {
    await rm(aiEvalsDir, { recursive: true, force: true });
  } catch {
    // Directory might not exist
  }

  const agentConfig = {
    command: 'claude',
    args: ['-p', '--output-format', 'json', '--no-session-persistence']
  };

  const results = await runAITests({
    filePath: testFilePath,
    runs: 2,
    threshold: 75,
    timeout: 180000,
    agentConfig
  });

  assert({
    given: 'execution of AI tests with real agent',
    should: 'return aggregated results object',
    actual: typeof results,
    expected: 'object'
  });

  assert({
    given: 'execution of AI tests with real agent',
    should: 'have passed boolean property',
    actual: typeof results.passed,
    expected: 'boolean'
  });

  assert({
    given: 'per-assertion extraction',
    should: 'return assertions array',
    actual: Array.isArray(results.assertions),
    expected: true
  });

  assert({
    given: 'three extracted assertions from multi-assertion fixture',
    should: 'have 3 assertions',
    actual: results.assertions.length,
    expected: 3
  });

  assert({
    given: 'first assertion',
    should: 'have requirement property',
    actual: typeof results.assertions[0].requirement,
    expected: 'string'
  });

  assert({
    given: 'first assertion',
    should: 'have passed boolean property',
    actual: typeof results.assertions[0].passed,
    expected: 'boolean'
  });

  assert({
    given: 'first assertion',
    should: 'have passCount number property',
    actual: typeof results.assertions[0].passCount,
    expected: 'number'
  });

  assert({
    given: 'first assertion run 2 times',
    should: 'have totalRuns 2',
    actual: results.assertions[0].totalRuns,
    expected: 2
  });

  assert({
    given: 'first assertion',
    should: 'have runResults array',
    actual: Array.isArray(results.assertions[0].runResults),
    expected: true
  });

  assert({
    given: 'first assertion run 2 times',
    should: 'have 2 runResults',
    actual: results.assertions[0].runResults.length,
    expected: 2
  });

  assert({
    given: 'first assertion with score data',
    should: 'have averageScore property',
    actual: typeof results.assertions[0].averageScore,
    expected: 'number'
  });

  assert({
    given: 'first assertion averageScore',
    should: 'be between 0 and 100',
    actual: results.assertions[0].averageScore >= 0 && results.assertions[0].averageScore <= 100,
    expected: true
  });

  // Record test output to file
  const outputPath = await recordTestOutput({
    results,
    testFilename: 'multi-assertion-test.sudo',
    outputDir: aiEvalsDir,
    openBrowser: false
  });

  assert({
    given: 'test output recording',
    should: 'return output path string',
    actual: typeof outputPath,
    expected: 'string'
  });

  assert({
    given: 'test output recording',
    should: 'create file in ai-evals directory',
    actual: outputPath.includes('test-ai-evals'),
    expected: true
  });

  const fileContent = await readFile(outputPath, 'utf-8');

  assert({
    given: 'output file content',
    should: 'not be empty',
    actual: fileContent.length > 0,
    expected: true
  });

  assert({
    given: 'TAP output',
    should: 'include TAP version header',
    actual: fileContent.includes('TAP version 13'),
    expected: true
  });

  assert({
    given: 'TAP output with 3 assertions',
    should: 'include test plan 1..3',
    actual: fileContent.includes('1..3'),
    expected: true
  });

  assert({
    given: 'TAP output',
    should: 'include assertion requirement',
    actual: fileContent.includes('Given the error cause, should include a descriptive message'),
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

  // Verify filename format
  const filename = outputPath.split('/').pop();

  assert({
    given: 'output filename',
    should: 'include date in YYYY-MM-DD format',
    actual: /^\d{4}-\d{2}-\d{2}/.test(filename),
    expected: true
  });

  assert({
    given: 'output filename',
    should: 'include test name',
    actual: filename.includes('multi-assertion-test'),
    expected: true
  });

  assert({
    given: 'output filename',
    should: 'have .tap.md extension',
    actual: filename.endsWith('.tap.md'),
    expected: true
  });

  // Cleanup
  try {
    await rm(aiEvalsDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

testRunner('e2e: --agent-config JSON file flow', async (assert) => {
  if (!isClaudeAuthenticated) {
    console.log('⚠️  Skipping E2E tests: Claude CLI not authenticated. Run: claude setup-token');
    return;
  }

  const configPath = join(__dirname, 'fixtures', 'claude-agent-config.json');
  const testFilePath = join(__dirname, 'fixtures', 'multi-assertion-test.sudo');

  // Load agent config from JSON file (same path as --agent-config CLI flag)
  const agentConfig = await loadAgentConfig(configPath);

  assert({
    given: 'a claude agent config loaded from JSON file',
    should: 'return config with command and args',
    actual: { command: agentConfig.command, args: agentConfig.args },
    expected: { command: 'claude', args: ['-p', '--output-format', 'json', '--no-session-persistence'] }
  });

  // Run AI tests using the file-loaded config
  const results = await runAITests({
    filePath: testFilePath,
    runs: 2,
    threshold: 75,
    timeout: 180000,
    agentConfig
  });

  assert({
    given: 'AI tests run with agent config loaded from JSON file',
    should: 'return aggregated results object',
    actual: typeof results,
    expected: 'object'
  });

  assert({
    given: 'AI tests run with agent config loaded from JSON file',
    should: 'have passed boolean property',
    actual: typeof results.passed,
    expected: 'boolean'
  });

  assert({
    given: 'per-assertion results from file-loaded agent config',
    should: 'return assertions array with 3 items',
    actual: results.assertions.length,
    expected: 3
  });
});
