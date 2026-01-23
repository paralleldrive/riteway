import { describe } from 'riteway';
import { readFile, writeFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { runAITests } from './ai-runner.js';
import { recordTestOutput } from './test-output.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create a mock agent script that returns predictable test results.
 */
const createMockAgent = async () => {
  const mockAgentPath = join(__dirname, 'fixtures', 'mock-agent.js');
  const mockAgentContent = `#!/usr/bin/env node
const response = {
  passed: true,
  output: "Mock agent response: Test passed"
};
console.log(JSON.stringify(response));
`;
  
  await mkdir(join(__dirname, 'fixtures'), { recursive: true });
  await writeFile(mockAgentPath, mockAgentContent, { mode: 0o755 });
  
  return mockAgentPath;
};

describe('e2e: full workflow with mock agent', async (assert) => {
  const testFilePath = join(__dirname, 'fixtures', 'sample-test.sudo');
  const aiEvalsDir = join(__dirname, 'fixtures', 'test-ai-evals');
  
  // Clean up test output directory before tests
  try {
    await rm(aiEvalsDir, { recursive: true, force: true });
  } catch {
    // Directory might not exist, that's fine
  }
  
  const mockAgentPath = await createMockAgent();
  const agentConfig = {
    command: 'node',
    args: [mockAgentPath]
  };
  
  // Execute AI tests with mock agent
  const results = await runAITests({
    filePath: testFilePath,
    runs: 2,
    threshold: 75,
    agentConfig
  });
  
  assert({
    given: 'execution of AI tests with mock agent',
    should: 'return aggregated results object',
    actual: typeof results,
    expected: 'object'
  });
  
  assert({
    given: 'execution of AI tests with mock agent',
    should: 'have passed status',
    actual: results.passed,
    expected: true
  });
  
  assert({
    given: 'execution of AI tests with mock agent',
    should: 'have correct total runs',
    actual: results.totalRuns,
    expected: 2
  });
  
  // Record test output to file
  const outputPath = await recordTestOutput({
    results,
    testFilename: 'sample-test.sudo',
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
  
  // Verify file exists and has content
  const fileContent = await readFile(outputPath, 'utf-8');
  
  assert({
    given: 'output file content',
    should: 'not be empty',
    actual: fileContent.length > 0,
    expected: true
  });
  
  // Verify TAP format
  assert({
    given: 'TAP output',
    should: 'include TAP version header',
    actual: fileContent.includes('TAP version 13'),
    expected: true
  });
  
  assert({
    given: 'TAP output',
    should: 'include test plan',
    actual: fileContent.includes('1..2'),
    expected: true
  });
  
  assert({
    given: 'TAP output',
    should: 'include ok status for passed tests',
    actual: fileContent.includes('ok 1'),
    expected: true
  });
  
  assert({
    given: 'TAP output',
    should: 'include test summary',
    actual: fileContent.includes('# tests 2'),
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
    actual: filename.includes('sample-test'),
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
    await rm(join(__dirname, 'fixtures', 'mock-agent.js'), { force: true });
    await rm(aiEvalsDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});
