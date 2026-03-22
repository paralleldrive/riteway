import { readFile } from 'fs/promises';
import { createError } from 'error-causes';
import { executeAgent } from './execute-agent.js';
import { extractTests, buildResultPrompt, buildJudgePrompt } from './test-extractor.js';
import { limitConcurrency } from './limit-concurrency.js';
import { normalizeJudgment, aggregatePerAssertionResults } from './aggregation.js';
import { parseTAPYAML } from './tap-yaml.js';
import { verifyAgentAuthentication as verifyAuth } from './validation.js';
import { getAgentConfig } from './agent-config.js';

export const verifyAgentAuthentication = (options) => verifyAuth({ ...options, executeAgent });

// TODO: extract console.log progress calls into an onProgress callback to decouple IO from logic
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

// TODO(post-consolidation): assertionIndex and totalAssertions exist solely for the
// console.log progress line below. Remove them from this signature once console.log
// is extracted into an onProgress callback (see the TODO on extractStructuredTests).
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

  return { judgments, response: result };
};

const executeRuns = ({
  extracted,
  resultPrompt,
  runs,
  concurrency,
  agentConfig,
  timeout
}) => {
  const completedRuns = [];
  const inFlightPromises = [];
  let lastTimedOutStdout;

  const runTasks = Array.from({ length: runs }, (_, runIndex) => async () => {
    const runPromise = executeSingleRun({
      runIndex,
      extracted,
      resultPrompt,
      runs,
      agentConfig,
      timeout
    });
    inFlightPromises.push(runPromise);

    try {
      const result = await runPromise;
      completedRuns.push(result);
      return result;
    } catch (error) {
      const partialStdout = error.cause?.partialStdout;
      if (partialStdout !== undefined) {
        lastTimedOutStdout = partialStdout;
      }
      throw error;
    }
  });

  return {
    promise: limitConcurrency(runTasks, concurrency),
    // Wait for all in-flight runs to settle before reading completedRuns,
    // since Promise.all rejects immediately and other runs may still be running.
    waitForSettled: () => Promise.allSettled(inFlightPromises),
    completedRuns,
    getTimedOutPartialStdout: () => lastTimedOutStdout
  };
};

const aggregateResults = ({ assertions, allRunResults, threshold, runs }) => {
  const perAssertionResults = assertions.map(({ requirement }, assertionIndex) => ({
    requirement,
    runResults: allRunResults.map(({ judgments }) => judgments[assertionIndex])
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
 * @param {Object} [options.agentConfig=getAgentConfig()] - Agent CLI configuration; defaults to the built-in claude config
 * @param {string} options.agentConfig.command - Command to execute
 * @param {Array<string>} [options.agentConfig.args=[]] - Command arguments
 * @param {number} [options.timeout=300000] - Timeout in milliseconds (default: 5 minutes)
 * @param {number} [options.concurrency=4] - Maximum concurrent runs
 * @param {string} [options.projectRoot=process.cwd()] - Project root directory for resolving import paths
 * @returns {Promise<{passed: boolean, assertions: Array<Object>, responses: string[]}>} Aggregated per-assertion test results with raw agent responses
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

  const { promise: runsPromise, waitForSettled, completedRuns, getTimedOutPartialStdout } = executeRuns({
    extracted,
    resultPrompt,
    runs,
    concurrency,
    agentConfig,
    timeout
  });

  try {
    const allRunResults = await runsPromise;
    const aggregated = aggregateResults({ assertions, allRunResults, threshold, runs });
    const responses = allRunResults.map(({ response }) => response);
    return { ...aggregated, responses };
  } catch (error) {
    await waitForSettled();
    const lastTimedOutStdout = getTimedOutPartialStdout();
    const hasPartialData = completedRuns.length > 0 || lastTimedOutStdout !== undefined;

    if (hasPartialData) {
      const responses = completedRuns.map(({ response }) => response);

      if (lastTimedOutStdout !== undefined) {
        const timeoutMs = error.cause?.timeout ?? timeout;
        responses.push(
          lastTimedOutStdout +
          `\n\n---\n[RITEWAY TIMEOUT] Agent was terminated after ${timeoutMs}ms. Output above is partial.\n---\n`
        );
      }

      const aggregated = completedRuns.length > 0
        ? aggregateResults({
          assertions,
          allRunResults: completedRuns,
          threshold,
          runs: completedRuns.length
        })
        : { passed: false, assertions: [] };

      throw createError({
        name: error.cause?.name ?? error.name,
        code: error.cause?.code ?? error.code,
        message: error.cause?.message ?? error.message,
        partialResults: { ...aggregated, responses },
        cause: error
      });
    }

    throw error;
  }
};
