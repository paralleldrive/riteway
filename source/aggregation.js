import { createError } from 'error-causes';
import { ValidationError, ParseError } from './ai-errors.js';
import {
  defaults,
  calculateRequiredPassesSchema
} from './constants.js';

/**
 * Normalize a judge response (already parsed from TAP YAML) to ensure consistent
 * structure with safe defaults for missing fields.
 * @throws {Error} If raw is not an object (null, string, undefined, etc.)
 */
export const normalizeJudgment = (raw, { requirement, runIndex, logger }) => {
  if (typeof raw !== 'object' || raw === null) {
    throw createError({
      ...ParseError,
      message: 'Judge returned non-object response',
      code: 'JUDGE_INVALID_RESPONSE',
      requirement,
      runIndex,
      rawResponse: raw
    });
  }

  if (raw.actual === undefined || raw.expected === undefined) {
    logger.log(`Warning: Judge response missing fields for "${requirement}" run ${runIndex + 1}`);
  }

  return {
    passed: raw.passed === true,
    actual: raw.actual ?? 'No actual provided',
    expected: raw.expected ?? 'No expected provided',
    score: Number.isFinite(raw.score) ? Math.max(0, Math.min(100, raw.score)) : 0
  };
};

/**
 * Calculate the number of passes required to meet the threshold.
 * Uses ceiling to ensure threshold is met or exceeded.
 * @throws {Error} If validation fails (non-integer runs, invalid threshold, etc.)
 */
export const calculateRequiredPasses = ({ runs = defaults.runs, threshold = defaults.threshold } = {}) => {
  try {
    const validated = calculateRequiredPassesSchema.parse({ runs, threshold });
    return Math.ceil((validated.runs * validated.threshold) / 100);
  } catch (zodError) {
    const issues = zodError.issues || [];
    const messages = issues.map(issue =>
      `${issue.path.join('.')}: ${issue.message}`
    ).join('; ');

    throw createError({
      ...ValidationError,
      message: `Invalid parameters for calculateRequiredPasses: ${messages}`,
      code: 'INVALID_CALCULATION_PARAMS',
      runs,
      threshold,
      cause: zodError
    });
  }
};

/**
 * Aggregate results from per-assertion test runs.
 * Each assertion is independently evaluated against the threshold.
 * Overall pass requires all assertions to meet the threshold.
 */
export const aggregatePerAssertionResults = ({ perAssertionResults, threshold, runs }) => {
  let validated;
  try {
    validated = calculateRequiredPassesSchema.parse({ runs, threshold });
  } catch (zodError) {
    const issues = zodError.issues || [];
    const messages = issues.map(issue =>
      `${issue.path.join('.')}: ${issue.message}`
    ).join('; ');

    throw createError({
      ...ValidationError,
      message: `Invalid parameters for aggregatePerAssertionResults: ${messages}`,
      code: 'INVALID_AGGREGATION_PARAMS',
      runs,
      threshold,
      cause: zodError
    });
  }

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
