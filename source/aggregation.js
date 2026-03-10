import { z } from 'zod';
import { createError } from 'error-causes';
import { ValidationError, ParseError } from './ai-errors.js';
import { aggregationParamsSchema } from './constants.js';

/**
 * Normalize a judge response (already parsed from TAP YAML) to ensure consistent
 * structure with safe defaults for missing fields.
 * @throws {Error} If judgeResponse is not an object (null, string, undefined, etc.)
 */
export const normalizeJudgment = ({ judgeResponse, requirement, runIndex }) => {
  if (typeof judgeResponse !== 'object' || judgeResponse === null) {
    throw createError({
      ...ParseError,
      message: 'Judge returned non-object response',
      code: 'JUDGE_INVALID_RESPONSE',
      requirement,
      runIndex,
      rawResponse: judgeResponse
    });
  }

  if (judgeResponse.actual === undefined || judgeResponse.expected === undefined) {
    console.warn(`Warning: Judge response missing fields for "${requirement}" run ${runIndex + 1}`);
  }

  return {
    passed: judgeResponse.passed === true,
    actual: judgeResponse.actual ?? 'No actual provided',
    expected: judgeResponse.expected ?? 'No expected provided',
    score: Number.isFinite(judgeResponse.score) ? Math.max(0, Math.min(100, judgeResponse.score)) : 0
  };
};

const parseAggregationParams = ({ runs, threshold }) => {
  const result = aggregationParamsSchema.safeParse({ runs, threshold });
  if (!result.success) {
    throw createError({
      ...ValidationError,
      message: `Invalid parameters for aggregatePerAssertionResults: ${z.prettifyError(result.error)}`,
      code: 'INVALID_AGGREGATION_PARAMS',
      runs,
      threshold,
      cause: result.error
    });
  }
  return result.data;
};

/**
 * Aggregate results from per-assertion test runs.
 * Each assertion is independently evaluated against the threshold.
 * Overall pass requires all assertions to meet the threshold.
 */
export const aggregatePerAssertionResults = ({ perAssertionResults, threshold, runs }) => {
  const validated = parseAggregationParams({ runs, threshold });

  const requiredPasses = Math.ceil((validated.runs * validated.threshold) / 100);

  const assertions = perAssertionResults.map(({ requirement, runResults }) => {
    const passCount = runResults.filter(r => r.passed).length;
    const totalScore = runResults.reduce((sum, r) => sum + (r.score ?? 0), 0);
    const averageScore = runResults.length > 0
      ? Math.round((totalScore / runResults.length) * 100) / 100
      : 0;

    return {
      requirement,
      passed: passCount >= requiredPasses,
      passCount,
      totalRuns: runs,
      averageScore,
      runResults
    };
  });

  return {
    passed: assertions.every(a => a.passed),
    assertions
  };
};
