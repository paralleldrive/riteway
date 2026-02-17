import { createError } from 'error-causes';
import { ValidationError, ParseError } from './ai-errors.js';
import { 
  defaults, 
  calculateRequiredPassesSchema 
} from './constants.js';

/**
 * Normalize a judge response with safe defaults, logging, and error handling.
 * This function normalizes a judge response (already parsed from TAP YAML) to ensure
 * consistent structure with safe defaults for missing fields.
 * @param {Object} raw - Raw judge response (already parsed from TAP YAML)
 * @param {Object} options
 * @param {string} options.requirement - Test assertion requirement
 * @param {number} options.runIndex - Zero-based run index
 * @param {Object} options.logger - Logger instance with log() method
 * @returns {Object} Normalized judgment with passed, actual, expected, score fields
 * @throws {Error} If raw is not an object (null, string, undefined, etc.)
 */
export const normalizeJudgment = (raw, { requirement, runIndex, logger }) => {
  // Fail loud on non-object input per error-causes.md
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

  // Log warning when applying defaults for missing fields
  if (raw?.actual === undefined || raw?.expected === undefined) {
    logger.log(`Warning: Judge response missing fields for "${requirement}" run ${runIndex + 1}`);
  }

  return {
    passed: raw?.passed === true,
    actual: raw?.actual ?? 'No actual provided',
    expected: raw?.expected ?? 'No expected provided',
    score: Number.isFinite(raw?.score) ? Math.max(0, Math.min(100, raw.score)) : 0
  };
};

/**
 * Calculate the number of passes required to meet the threshold.
 * Uses ceiling to ensure threshold is met or exceeded.
 * Validates input using Zod schema for comprehensive type and range checking.
 * @param {Object} options
 * @param {number} [options.runs=4] - Total number of test runs
 * @param {number} [options.threshold=75] - Required pass percentage (0-100)
 * @returns {number} Number of passes required
 * @throws {Error} If validation fails (non-integer runs, invalid threshold, etc.)
 */
export const calculateRequiredPasses = ({ runs = defaults.runs, threshold = defaults.threshold } = {}) => {
  try {
    // Validate and apply defaults using Zod schema
    const validated = calculateRequiredPassesSchema.parse({ runs, threshold });
    return Math.ceil((validated.runs * validated.threshold) / 100);
  } catch (zodError) {
    // Convert Zod error to error-causes format
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
 * @param {Object} options
 * @param {Array<{ requirement: string, runResults: Array<Object> }>} options.perAssertionResults
 * @param {number} options.threshold - Required pass percentage (0-100)
 * @param {number} options.runs - Number of runs per assertion
 * @returns {Object} Aggregated results with per-assertion breakdown
 */
export const aggregatePerAssertionResults = ({ perAssertionResults, threshold, runs }) => {
  // Pre-validate inputs once at entry point (performance optimization)
  try {
    calculateRequiredPassesSchema.parse({ runs, threshold });
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

  const requiredPasses = calculateRequiredPasses({ runs, threshold });

  const assertions = perAssertionResults.map(({ requirement, runResults }) => {
    const passCount = runResults.filter(r => r.passed).length;

    // Calculate average score across all runs, treating missing/invalid scores as 0
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
