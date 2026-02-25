import { readFile } from 'fs/promises';
import { executeAgent } from './execute-agent.js';
import { extractTests, buildResultPrompt, buildJudgePrompt } from './test-extractor.js';
import { limitConcurrency } from './limit-concurrency.js';
import { normalizeJudgment, aggregatePerAssertionResults } from './aggregation.js';
import { parseTAPYAML } from './tap-yaml.js';
import { verifyAgentAuthentication as verifyAuth } from './validation.js';
import { getAgentConfig } from './agent-config.js';

export const verifyAgentAuthentication = (options) => verifyAuth({ ...options, executeAgent });

// Enhancement: extract console.log progress calls into an onProgress callback
// to separate IO from business logic (see javascript.mdc: "One job per function")
const extractStructuredTests = async ({
  testContent,
  testFilePath,
  agentConfig,
  timeout,
  projectRoot
}) => {
  console.log(`\nExtracting tests from: ${testFilePath}`);

  const { userPrompt, promptUnderTest, assertions } = await extractTests({
    testContent,
    testFilePath,
    agentConfig,
    timeout,
    projectRoot
  });

  console.log(`Extracted ${assertions.length} assertions`);

  const resultPrompt = buildResultPrompt({ userPrompt, promptUnderTest });

  return { userPrompt, promptUnderTest, assertions, resultPrompt };
};

const judgeAssertion = async ({
  assertion,
  result,
  userPrompt,
  promptUnderTest,
  runIndex,
  assertionIndex,
  totalAssertions,
  agentConfig,
  timeout
}) => {
  const judgePrompt = buildJudgePrompt({
    userPrompt,
    promptUnderTest,
    result,
    requirement: assertion.requirement
  });

  console.log(`  Assertion ${assertionIndex + 1}/${totalAssertions}: ${assertion.requirement}`);

  const judgeOutput = await executeAgent({
    agentConfig,
    prompt: judgePrompt,
    timeout,
    rawOutput: true
  });

  const parsed = parseTAPYAML(judgeOutput);
  return normalizeJudgment({
    judgeResponse: parsed,
    requirement: assertion.requirement,
    runIndex
  });
};

const executeSingleRun = async ({
  runIndex,
  extracted,
  resultPrompt,
  runs,
  agentConfig,
  timeout
}) => {
  const { userPrompt, promptUnderTest, assertions } = extracted;

  console.log(`\nRun ${runIndex + 1}/${runs}: Calling result agent...`);

  const result = await executeAgent({
    agentConfig,
    prompt: resultPrompt,
    timeout,
    rawOutput: true
  });

  console.log(`Judging ${assertions.length} assertions...`);

  // Enhancement: inline return to eliminate intermediate variable (see javascript.mdc)
  const judgments = await Promise.all(
    assertions.map((assertion, assertionIndex) =>
      judgeAssertion({
        assertion,
        result,
        userPrompt,
        promptUnderTest,
        runIndex,
        assertionIndex,
        totalAssertions: assertions.length,
        agentConfig,
        timeout
      })
    )
  );

  return judgments;
};

const executeRuns = ({
  extracted,
  resultPrompt,
  runs,
  concurrency,
  agentConfig,
  timeout
}) => {
  const runTasks = Array.from({ length: runs }, (_, runIndex) => async () =>
    executeSingleRun({
      runIndex,
      extracted,
      resultPrompt,
      runs,
      agentConfig,
      timeout
    })
  );

  return limitConcurrency(runTasks, concurrency);
};

const aggregateResults = ({ assertions, allRunJudgments, threshold, runs }) => {
  const perAssertionResults = assertions.map(({ requirement }, assertionIndex) => ({
    requirement,
    runResults: allRunJudgments.map(runJudgments => runJudgments[assertionIndex])
  }));

  return aggregatePerAssertionResults({ perAssertionResults, threshold, runs });
};

/**
 * Run AI tests with two-agent pattern: result agent + judge agent.
 * Pipeline: readFile → extractTests → result agent (once per run) → judge agents (per assertion, parallel) → aggregation.
 *
 * @param {Object} options
 * @param {string} options.filePath - Path to test file
 * @param {number} [options.runs=4] - Number of test runs per assertion
 * @param {number} [options.threshold=75] - Required pass percentage (0-100)
 * @param {Object} options.agentConfig - Agent CLI configuration
 * @param {string} options.agentConfig.command - Command to execute
 * @param {Array<string>} [options.agentConfig.args=[]] - Command arguments
 * @param {number} [options.timeout=300000] - Timeout in milliseconds (default: 5 minutes)
 * @param {number} [options.concurrency=4] - Maximum concurrent runs
 * @param {string} [options.projectRoot=process.cwd()] - Project root directory for resolving import paths
 * @returns {Promise<Object>} Aggregated per-assertion test results
 */
export const runAITests = async ({
  filePath,
  runs = 4,
  threshold = 75,
  timeout = 300000,
  concurrency = 4,
  projectRoot = process.cwd(),
  agentConfig = getAgentConfig()
}) => {
  const testContent = await readFile(filePath, 'utf-8');

  const extracted = await extractStructuredTests({
    testContent,
    testFilePath: filePath,
    agentConfig,
    timeout,
    projectRoot
  });

  const { resultPrompt, assertions } = extracted;

  const allRunJudgments = await executeRuns({
    extracted,
    resultPrompt,
    runs,
    concurrency,
    agentConfig,
    timeout
  });

  return aggregateResults({ assertions, allRunJudgments, threshold, runs });
};
