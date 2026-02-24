import { readFile } from 'fs/promises';
import { executeAgent } from './execute-agent.js';
import { extractTests, buildResultPrompt, buildJudgePrompt } from './test-extractor.js';
import { createDebugLogger } from './debug-logger.js';
import { limitConcurrency } from './limit-concurrency.js';
import { normalizeJudgment, aggregatePerAssertionResults } from './aggregation.js';
import { parseTAPYAML } from './tap-yaml.js';
import { verifyAgentAuthentication as verifyAuth } from './validation.js';

export const readTestFile = (filePath) => readFile(filePath, 'utf-8');

export const verifyAgentAuthentication = (options) => verifyAuth({ ...options, executeAgent });

const extractStructuredTests = async ({
  testContent,
  testFilePath,
  agentConfig,
  timeout,
  debug,
  projectRoot,
  logger
}) => {
  logger.log(`\nExtracting tests from: ${testFilePath}`);
  logger.log(`Test content length: ${testContent.length} characters`);

  const { userPrompt, promptUnderTest, assertions } = await extractTests({
    testContent,
    testFilePath,
    agentConfig,
    timeout,
    debug,
    projectRoot,
    logger
  });

  logger.log(`Extracted ${assertions.length} assertions`);

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
  timeout,
  debug,
  logFile,
  logger
}) => {
  const judgePrompt = buildJudgePrompt({
    userPrompt,
    promptUnderTest,
    result,
    requirement: assertion.requirement
  });

  logger.log(`  Assertion ${assertionIndex + 1}/${totalAssertions}: ${assertion.requirement}`);

  const judgeOutput = await executeAgent({
    agentConfig,
    prompt: judgePrompt,
    timeout,
    debug,
    logFile,
    rawOutput: true
  });

  const parsed = parseTAPYAML(judgeOutput);
  return normalizeJudgment({
    judgeResponse: parsed,
    requirement: assertion.requirement,
    runIndex,
    logger
  });
};

const executeSingleRun = async ({
  runIndex,
  extracted,
  resultPrompt,
  runs,
  agentConfig,
  timeout,
  debug,
  logFile,
  logger
}) => {
  const { userPrompt, promptUnderTest, assertions } = extracted;

  logger.log(`\nRun ${runIndex + 1}/${runs}: Calling result agent...`);

  const result = await executeAgent({
    agentConfig,
    prompt: resultPrompt,
    timeout,
    debug,
    logFile,
    rawOutput: true
  });

  logger.log(`Result obtained (${result.length} chars). Judging ${assertions.length} assertions...`);

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
        timeout,
        debug,
        logFile,
        logger
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
  timeout,
  debug,
  logFile,
  logger
}) => {
  const runTasks = Array.from({ length: runs }, (_, runIndex) => async () =>
    executeSingleRun({
      runIndex,
      extracted,
      resultPrompt,
      runs,
      agentConfig,
      timeout,
      debug,
      logFile,
      logger
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
 * Pipeline: readTestFile → extractTests → result agent (once per run) → judge agents (per assertion, parallel) → aggregation.
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
 * @param {boolean} [options.debug=false] - Enable debug logging
 * @param {string} [options.logFile] - Optional log file path for debug output
 * @param {string} [options.projectRoot=process.cwd()] - Project root directory for resolving import paths
 * @returns {Promise<Object>} Aggregated per-assertion test results
 */
export const runAITests = async ({
  filePath,
  runs = 4,
  threshold = 75,
  timeout = 300000,
  concurrency = 4,
  debug = false,
  logFile,
  projectRoot = process.cwd(),
  agentConfig = {
    command: 'claude',
    args: ['-p', '--output-format', 'json', '--no-session-persistence']
  }
}) => {
  const logger = createDebugLogger({ debug, logFile });

  const testContent = await readTestFile(filePath);

  const extracted = await extractStructuredTests({
    testContent,
    testFilePath: filePath,
    agentConfig,
    timeout,
    debug,
    projectRoot,
    logger
  });

  const { resultPrompt, assertions } = extracted;

  const allRunJudgments = await executeRuns({
    extracted,
    resultPrompt,
    runs,
    concurrency,
    agentConfig,
    timeout,
    debug,
    logFile,
    logger
  });

  logger.flush();
  return aggregateResults({ assertions, allRunJudgments, threshold, runs });
};
