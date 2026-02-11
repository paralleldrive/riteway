import { describe, test, vi } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import {
  normalizeJudgment,
  calculateRequiredPasses,
  aggregatePerAssertionResults
} from './aggregation.js';

describe('aggregation', () => {
  describe('calculateRequiredPasses()', () => {
    test('calculates required passes using ceiling', () => {
      assert({
        given: '4 runs with 75% threshold',
        should: 'require 3 passes (ceiling of 3)',
        actual: calculateRequiredPasses({ runs: 4, threshold: 75 }),
        expected: 3
      });

      assert({
        given: '5 runs with 75% threshold',
        should: 'require 4 passes (ceiling of 3.75)',
        actual: calculateRequiredPasses({ runs: 5, threshold: 75 }),
        expected: 4
      });

      assert({
        given: '10 runs with 80% threshold',
        should: 'require 8 passes',
        actual: calculateRequiredPasses({ runs: 10, threshold: 80 }),
        expected: 8
      });
    });

    test('uses default values', () => {
      assert({
        given: 'no arguments',
        should: 'use defaults (4 runs, 75% threshold) requiring 3 passes',
        actual: calculateRequiredPasses(),
        expected: 3
      });
    });

    test('validates runs is a positive integer', () => {
      const invalidRunsValues = [
        { value: 0, label: 'zero' },
        { value: -1, label: 'negative' },
        { value: NaN, label: 'NaN' },
        { value: 1.5, label: 'non-integer' }
      ];

      for (const { value, label } of invalidRunsValues) {
        const error = Try(calculateRequiredPasses, { runs: value, threshold: 75 });

        assert({
          given: `runs value of ${label} (${value})`,
          should: 'throw an error with message',
          actual: error?.message,
          expected: 'runs must be a positive integer'
        });

        assert({
          given: `runs value of ${label} (${value})`,
          should: 'have ValidationError name in cause',
          actual: error?.cause?.name,
          expected: 'ValidationError'
        });

        assert({
          given: `runs value of ${label} (${value})`,
          should: 'have INVALID_RUNS code in cause',
          actual: error?.cause?.code,
          expected: 'INVALID_RUNS'
        });
      }
    });

    test('validates threshold is between 0 and 100', () => {
      const error1 = Try(calculateRequiredPasses, { runs: 4, threshold: 150 });

      assert({
        given: 'threshold > 100',
        should: 'throw an error with message',
        actual: error1?.message,
        expected: 'threshold must be between 0 and 100'
      });

      assert({
        given: 'threshold > 100',
        should: 'have ValidationError name in cause',
        actual: error1?.cause?.name,
        expected: 'ValidationError'
      });

      assert({
        given: 'threshold > 100',
        should: 'have INVALID_THRESHOLD code in cause',
        actual: error1?.cause?.code,
        expected: 'INVALID_THRESHOLD'
      });

      const error2 = Try(calculateRequiredPasses, { runs: 4, threshold: -10 });

      assert({
        given: 'negative threshold',
        should: 'throw an error with message',
        actual: error2?.message,
        expected: 'threshold must be between 0 and 100'
      });

      assert({
        given: 'negative threshold',
        should: 'have ValidationError name in cause',
        actual: error2?.cause?.name,
        expected: 'ValidationError'
      });

      assert({
        given: 'negative threshold',
        should: 'have INVALID_THRESHOLD code in cause',
        actual: error2?.cause?.code,
        expected: 'INVALID_THRESHOLD'
      });
    });

    test('validates threshold is a finite number', () => {
      const error = Try(calculateRequiredPasses, { runs: 4, threshold: NaN });

      assert({
        given: 'NaN threshold',
        should: 'throw ValidationError',
        actual: error?.cause?.name,
        expected: 'ValidationError'
      });

      assert({
        given: 'NaN threshold',
        should: 'have INVALID_THRESHOLD code',
        actual: error?.cause?.code,
        expected: 'INVALID_THRESHOLD'
      });

      assert({
        given: 'NaN threshold',
        should: 'have clear error message',
        actual: error?.message,
        expected: 'threshold must be between 0 and 100'
      });
    });
  });

  describe('aggregatePerAssertionResults()', () => {
    test('aggregates per-assertion results when all assertions pass', () => {
      const perAssertionResults = [
        {
          requirement: 'Given simple addition, should add correctly',
          runResults: [
            { passed: true, output: 'ok' },
            { passed: true, output: 'ok' }
          ]
        },
        {
          requirement: 'Given format, should output JSON',
          runResults: [
            { passed: true, output: 'ok' },
            { passed: true, output: 'ok' }
          ]
        }
      ];

      const result = aggregatePerAssertionResults({
        perAssertionResults,
        threshold: 75,
        runs: 2
      });

      assert({
        given: 'all assertions meeting threshold',
        should: 'return passed: true',
        actual: result.passed,
        expected: true
      });

      assert({
        given: 'two assertions',
        should: 'return assertions array of length 2',
        actual: result.assertions.length,
        expected: 2
      });

      assert({
        given: 'first assertion with all passes',
        should: 'mark the assertion as passed',
        actual: result.assertions[0].passed,
        expected: true
      });

      assert({
        given: 'first assertion with 2 passes',
        should: 'report passCount 2',
        actual: result.assertions[0].passCount,
        expected: 2
      });

      assert({
        given: 'first assertion requirement',
        should: 'preserve the requirement',
        actual: result.assertions[0].requirement,
        expected: 'Given simple addition, should add correctly'
      });
    });

    test('fails when any assertion does not meet threshold', () => {
      const perAssertionResults = [
        {
          requirement: 'Given addition, should add correctly',
          runResults: [
            { passed: true, output: 'ok' },
            { passed: true, output: 'ok' }
          ]
        },
        {
          requirement: 'Given format, should output JSON',
          runResults: [
            { passed: false, output: 'fail' },
            { passed: false, output: 'fail' }
          ]
        }
      ];

      const result = aggregatePerAssertionResults({
        perAssertionResults,
        threshold: 75,
        runs: 2
      });

      assert({
        given: 'one assertion failing threshold',
        should: 'return passed: false',
        actual: result.passed,
        expected: false
      });

      assert({
        given: 'the passing assertion',
        should: 'mark it as passed',
        actual: result.assertions[0].passed,
        expected: true
      });

      assert({
        given: 'the failing assertion',
        should: 'mark it as failed',
        actual: result.assertions[1].passed,
        expected: false
      });

      assert({
        given: 'the failing assertion',
        should: 'have passCount 0',
        actual: result.assertions[1].passCount,
        expected: 0
      });
    });

    test('includes per-assertion run results', () => {
      const runResults = [
        { passed: true, output: 'run 1' },
        { passed: false, output: 'run 2' }
      ];
      const perAssertionResults = [
        { requirement: 'test assertion', runResults }
      ];

      const result = aggregatePerAssertionResults({
        perAssertionResults,
        threshold: 50,
        runs: 2
      });

      assert({
        given: 'per-assertion run results',
        should: 'include run results in the assertion',
        actual: result.assertions[0].runResults,
        expected: runResults
      });

      assert({
        given: 'per-assertion run results',
        should: 'include totalRuns per assertion',
        actual: result.assertions[0].totalRuns,
        expected: 2
      });
    });

    test('calculates averageScore from run results', () => {
      const perAssertionResults = [
        {
          requirement: 'test with scores',
          runResults: [
            { passed: true, score: 85 },
            { passed: true, score: 95 },
            { passed: true, score: 90 }
          ]
        }
      ];

      const result = aggregatePerAssertionResults({
        perAssertionResults,
        threshold: 50,
        runs: 3
      });

      assert({
        given: 'run results with scores 85, 95, 90',
        should: 'calculate average score as 90',
        actual: result.assertions[0].averageScore,
        expected: 90
      });
    });

    test('rounds averageScore to 2 decimal places', () => {
      const perAssertionResults = [
        {
          requirement: 'test with fractional average',
          runResults: [
            { passed: true, score: 85 },
            { passed: true, score: 90 },
            { passed: false, score: 88 }
          ]
        }
      ];

      const result = aggregatePerAssertionResults({
        perAssertionResults,
        threshold: 50,
        runs: 3
      });

      // Average: (85 + 90 + 88) / 3 = 87.666... rounds to 87.67
      assert({
        given: 'run results with scores 85, 90, 88',
        should: 'round average score to 87.67',
        actual: result.assertions[0].averageScore,
        expected: 87.67
      });
    });

    test('defaults missing score values to 0 in average', () => {
      const perAssertionResults = [
        {
          requirement: 'test with some missing scores',
          runResults: [
            { passed: true, score: 90 },
            { passed: true }, // missing score
            { passed: true, score: 80 }
          ]
        }
      ];

      const result = aggregatePerAssertionResults({
        perAssertionResults,
        threshold: 50,
        runs: 3
      });

      // Average: (90 + 0 + 80) / 3 = 56.666... rounds to 56.67
      assert({
        given: 'run results with one missing score',
        should: 'treat missing score as 0 and calculate average as 56.67',
        actual: result.assertions[0].averageScore,
        expected: 56.67
      });
    });

    test('handles all missing scores by defaulting to 0', () => {
      const perAssertionResults = [
        {
          requirement: 'test with all missing scores',
          runResults: [
            { passed: true },
            { passed: false },
            { passed: true }
          ]
        }
      ];

      const result = aggregatePerAssertionResults({
        perAssertionResults,
        threshold: 50,
        runs: 3
      });

      assert({
        given: 'run results with all missing scores',
        should: 'calculate average score as 0',
        actual: result.assertions[0].averageScore,
        expected: 0
      });
    });

    test('handles empty runResults without division by zero', () => {
      const perAssertionResults = [
        {
          requirement: 'test with no run results',
          runResults: []
        }
      ];

      const result = aggregatePerAssertionResults({
        perAssertionResults,
        threshold: 50,
        runs: 1
      });

      assert({
        given: 'empty runResults array',
        should: 'return averageScore of 0 without error',
        actual: result.assertions[0].averageScore,
        expected: 0
      });

      assert({
        given: 'empty runResults array',
        should: 'not be NaN',
        actual: Number.isNaN(result.assertions[0].averageScore),
        expected: false
      });
    });
  });

  describe('normalizeJudgment()', () => {
    const createMockLogger = () => ({
      log: vi.fn()
    });

    test('is exported as a function', () => {
      assert({
        given: 'aggregation module',
        should: 'export normalizeJudgment',
        actual: typeof normalizeJudgment,
        expected: 'function'
      });
    });

    test('passes through complete valid input unchanged', () => {
      const logger = createMockLogger();
      const raw = {
        passed: true,
        actual: 'Result from agent',
        expected: 'Expected output',
        score: 85
      };

      const result = normalizeJudgment(raw, {
        requirement: 'test assertion',
        runIndex: 0,
        logger
      });

      assert({
        given: 'complete valid judgment with passed: true',
        should: 'preserve passed as true',
        actual: result.passed,
        expected: true
      });

      assert({
        given: 'complete valid judgment',
        should: 'preserve actual value',
        actual: result.actual,
        expected: 'Result from agent'
      });

      assert({
        given: 'complete valid judgment',
        should: 'preserve expected value',
        actual: result.expected,
        expected: 'Expected output'
      });

      assert({
        given: 'complete valid judgment with score 85',
        should: 'preserve score value',
        actual: result.score,
        expected: 85
      });
    });

    test('defaults passed to false when missing', () => {
      const logger = createMockLogger();
      const raw = {
        actual: 'Result',
        expected: 'Expected',
        score: 50
      };

      const result = normalizeJudgment(raw, {
        requirement: 'test',
        runIndex: 0,
        logger
      });

      assert({
        given: 'judgment missing passed field',
        should: 'default passed to false',
        actual: result.passed,
        expected: false
      });
    });

    test('defaults passed to false when explicitly false', () => {
      const logger = createMockLogger();
      const raw = {
        passed: false,
        actual: 'Result',
        expected: 'Expected',
        score: 50
      };

      const result = normalizeJudgment(raw, {
        requirement: 'test',
        runIndex: 0,
        logger
      });

      assert({
        given: 'judgment with passed: false',
        should: 'keep passed as false',
        actual: result.passed,
        expected: false
      });
    });

    test('defaults missing actual and expected fields with warning', () => {
      const logger = createMockLogger();
      const raw = {
        passed: true,
        score: 100
      };

      const result = normalizeJudgment(raw, {
        requirement: 'test assertion',
        runIndex: 2,
        logger
      });

      assert({
        given: 'judgment missing actual',
        should: 'default actual to "No actual provided"',
        actual: result.actual,
        expected: 'No actual provided'
      });

      assert({
        given: 'judgment missing expected',
        should: 'default expected to "No expected provided"',
        actual: result.expected,
        expected: 'No expected provided'
      });

      assert({
        given: 'judgment missing actual and expected',
        should: 'log warning with requirement and run number',
        actual: logger.log.mock.calls[0][0],
        expected: 'Warning: Judge response missing fields for "test assertion" run 3'
      });
    });

    test('logs warning when only actual is missing', () => {
      const logger = createMockLogger();
      const raw = {
        passed: true,
        expected: 'Expected value',
        score: 90
      };

      normalizeJudgment(raw, {
        requirement: 'my test',
        runIndex: 0,
        logger
      });

      assert({
        given: 'judgment missing actual',
        should: 'log warning',
        actual: logger.log.mock.calls.length > 0,
        expected: true
      });
    });

    test('logs warning when only expected is missing', () => {
      const logger = createMockLogger();
      const raw = {
        passed: true,
        actual: 'Actual value',
        score: 90
      };

      normalizeJudgment(raw, {
        requirement: 'my test',
        runIndex: 1,
        logger
      });

      assert({
        given: 'judgment missing expected',
        should: 'log warning',
        actual: logger.log.mock.calls.length > 0,
        expected: true
      });
    });

    test('clamps score above 100 to 100', () => {
      const logger = createMockLogger();
      const raw = {
        passed: true,
        actual: 'Result',
        expected: 'Expected',
        score: 150
      };

      const result = normalizeJudgment(raw, {
        requirement: 'test',
        runIndex: 0,
        logger
      });

      assert({
        given: 'judgment with score 150',
        should: 'clamp to 100',
        actual: result.score,
        expected: 100
      });
    });

    test('clamps negative score to 0', () => {
      const logger = createMockLogger();
      const raw = {
        passed: false,
        actual: 'Result',
        expected: 'Expected',
        score: -50
      };

      const result = normalizeJudgment(raw, {
        requirement: 'test',
        runIndex: 0,
        logger
      });

      assert({
        given: 'judgment with score -50',
        should: 'clamp to 0',
        actual: result.score,
        expected: 0
      });
    });

    test('defaults non-finite score to 0', () => {
      const logger = createMockLogger();
      const raw = {
        passed: true,
        actual: 'Result',
        expected: 'Expected',
        score: NaN
      };

      const result = normalizeJudgment(raw, {
        requirement: 'test',
        runIndex: 0,
        logger
      });

      assert({
        given: 'judgment with NaN score',
        should: 'default to 0',
        actual: result.score,
        expected: 0
      });
    });

    test('defaults missing score to 0', () => {
      const logger = createMockLogger();
      const raw = {
        passed: true,
        actual: 'Result',
        expected: 'Expected'
      };

      const result = normalizeJudgment(raw, {
        requirement: 'test',
        runIndex: 0,
        logger
      });

      assert({
        given: 'judgment missing score',
        should: 'default to 0',
        actual: result.score,
        expected: 0
      });
    });

    test('throws ParseError on null input', () => {
      const logger = createMockLogger();

      const error = Try(normalizeJudgment, null, {
        requirement: 'test assertion',
        runIndex: 1,
        logger
      });

      assert({
        given: 'null input',
        should: 'throw Error with cause',
        actual: error instanceof Error && error.cause !== undefined,
        expected: true
      });

      assert({
        given: 'null input',
        should: 'have ParseError name in cause',
        actual: error?.cause?.name,
        expected: 'ParseError'
      });

      assert({
        given: 'null input',
        should: 'have JUDGE_INVALID_RESPONSE code in cause',
        actual: error?.cause?.code,
        expected: 'JUDGE_INVALID_RESPONSE'
      });

      assert({
        given: 'null input',
        should: 'include requirement in cause',
        actual: error?.cause?.requirement,
        expected: 'test assertion'
      });

      assert({
        given: 'null input',
        should: 'include runIndex in cause',
        actual: error?.cause?.runIndex,
        expected: 1
      });

      assert({
        given: 'null input',
        should: 'include rawResponse in cause',
        actual: error?.cause?.rawResponse,
        expected: null
      });
    });

    test('throws ParseError on string input', () => {
      const logger = createMockLogger();

      const error = Try(normalizeJudgment, 'not an object', {
        requirement: 'test',
        runIndex: 0,
        logger
      });

      assert({
        given: 'string input',
        should: 'have ParseError name in cause',
        actual: error?.cause?.name,
        expected: 'ParseError'
      });

      assert({
        given: 'string input',
        should: 'have JUDGE_INVALID_RESPONSE code in cause',
        actual: error?.cause?.code,
        expected: 'JUDGE_INVALID_RESPONSE'
      });
    });

    test('throws ParseError on undefined input', () => {
      const logger = createMockLogger();

      const error = Try(normalizeJudgment, undefined, {
        requirement: 'test',
        runIndex: 0,
        logger
      });

      assert({
        given: 'undefined input',
        should: 'have ParseError name in cause',
        actual: error?.cause?.name,
        expected: 'ParseError'
      });

      assert({
        given: 'undefined input',
        should: 'have JUDGE_INVALID_RESPONSE code in cause',
        actual: error?.cause?.code,
        expected: 'JUDGE_INVALID_RESPONSE'
      });
    });
  });
});
