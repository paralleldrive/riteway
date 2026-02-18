import { describe, test, vi } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import {
  normalizeJudgment,
  calculateRequiredPasses,
  aggregatePerAssertionResults
} from './aggregation.js';

describe('calculateRequiredPasses()', () => {
  test.each([
    ['4 runs, 75% threshold', { runs: 4, threshold: 75 }, 3],
    ['5 runs, 75% threshold', { runs: 5, threshold: 75 }, 4],
    ['10 runs, 80% threshold', { runs: 10, threshold: 80 }, 8],
    ['4 runs, 80% threshold', { runs: 4, threshold: 80 }, 4],
  ])('%s requires correct pass count', (_, options, expected) => {
    assert({
      given: _,
      should: `require ${expected} passes`,
      actual: calculateRequiredPasses(options),
      expected
    });
  });

  test('uses default values when called with no arguments', () => {
    assert({
      given: 'no arguments',
      should: 'use defaults (4 runs, 75% threshold) requiring 3 passes',
      actual: calculateRequiredPasses(),
      expected: 3
    });
  });

  test.each([
    ['zero runs', { runs: 0, threshold: 75 }, 'runs must be at least 1'],
    ['negative runs', { runs: -1, threshold: 75 }, 'runs must be at least 1'],
    ['non-integer runs', { runs: 1.5, threshold: 75 }, 'runs must be an integer'],
    ['NaN runs', { runs: NaN, threshold: 75 }, 'expected number, received NaN'],
  ])('throws ValidationError for %s', (_, options, expectedMessage) => {
    const error = Try(calculateRequiredPasses, options);

    assert({
      given: _,
      should: 'have ValidationError in cause',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: _,
      should: 'have INVALID_CALCULATION_PARAMS code',
      actual: error?.cause?.code,
      expected: 'INVALID_CALCULATION_PARAMS'
    });

    assert({
      given: _,
      should: 'include descriptive message',
      actual: error?.message?.includes(expectedMessage),
      expected: true
    });
  });

  test.each([
    ['threshold above 100', { runs: 4, threshold: 150 }, 'threshold must be at most 100'],
    ['negative threshold', { runs: 4, threshold: -10 }, 'threshold must be at least 0'],
    ['NaN threshold', { runs: 4, threshold: NaN }, 'expected number, received NaN'],
  ])('throws ValidationError for %s', (_, options, expectedMessage) => {
    const error = Try(calculateRequiredPasses, options);

    assert({
      given: _,
      should: 'have ValidationError in cause',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: _,
      should: 'have INVALID_CALCULATION_PARAMS code',
      actual: error?.cause?.code,
      expected: 'INVALID_CALCULATION_PARAMS'
    });

    assert({
      given: _,
      should: 'include descriptive message',
      actual: error?.message?.includes(expectedMessage),
      expected: true
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

  test('includes per-assertion run results and totalRuns', () => {
    const runResults = [
      { passed: true, output: 'run 1' },
      { passed: false, output: 'run 2' }
    ];
    const perAssertionResults = [{ requirement: 'test assertion', runResults }];

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
      threshold: 75,
      runs: 3
    });

    assert({
      given: 'three runs with scores 85, 95, 90',
      should: 'calculate average score of 90',
      actual: result.assertions[0].averageScore,
      expected: 90
    });
  });

  test('defaults missing scores to 0 when calculating average', () => {
    const perAssertionResults = [
      {
        requirement: 'test without scores',
        runResults: [
          { passed: true },
          { passed: true }
        ]
      }
    ];

    const result = aggregatePerAssertionResults({
      perAssertionResults,
      threshold: 75,
      runs: 2
    });

    assert({
      given: 'run results with no score fields',
      should: 'report averageScore of 0',
      actual: result.assertions[0].averageScore,
      expected: 0
    });
  });

  test.each([
    ['runs above maximum', { runs: 1001, threshold: 75 }, 'INVALID_AGGREGATION_PARAMS'],
    ['threshold above maximum', { runs: 4, threshold: 150 }, 'INVALID_AGGREGATION_PARAMS'],
  ])('throws ValidationError for %s', (_, { runs, threshold }, expectedCode) => {
    const perAssertionResults = [
      { requirement: 'test', runResults: [{ passed: true }] }
    ];

    const error = Try(() =>
      aggregatePerAssertionResults({ perAssertionResults, threshold, runs })
    );

    assert({
      given: _,
      should: 'throw validation error',
      actual: error instanceof Error,
      expected: true
    });

    assert({
      given: _,
      should: 'have correct error code',
      actual: error?.cause?.code,
      expected: expectedCode
    });
  });
});

describe('normalizeJudgment()', () => {
  const createMockLogger = () => ({ log: vi.fn() });

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
    const raw = { passed: true, actual: 'Result from agent', expected: 'Expected output', score: 85 };

    const result = normalizeJudgment(raw, { requirement: 'test assertion', runIndex: 0, logger });

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
    const result = normalizeJudgment(
      { actual: 'Result', expected: 'Expected', score: 50 },
      { requirement: 'test', runIndex: 0, logger }
    );

    assert({
      given: 'judgment missing passed field',
      should: 'default passed to false',
      actual: result.passed,
      expected: false
    });
  });

  test('defaults missing actual and expected with warning log', () => {
    const logger = createMockLogger();
    const result = normalizeJudgment(
      { passed: true, score: 100 },
      { requirement: 'test assertion', runIndex: 2, logger }
    );

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

  test.each([
    ['score 150', 150, 100],
    ['score -50', -50, 0],
    ['NaN score', NaN, 0],
  ])('normalizes %s correctly', (_, score, expected) => {
    const logger = createMockLogger();
    const result = normalizeJudgment(
      { passed: true, actual: 'Result', expected: 'Expected', score },
      { requirement: 'test', runIndex: 0, logger }
    );

    assert({
      given: `judgment with ${_}`,
      should: `normalize score to ${expected}`,
      actual: result.score,
      expected
    });
  });

  test('defaults missing score to 0', () => {
    const logger = createMockLogger();
    const result = normalizeJudgment(
      { passed: true, actual: 'Result', expected: 'Expected' },
      { requirement: 'test', runIndex: 0, logger }
    );

    assert({
      given: 'judgment missing score',
      should: 'default to 0',
      actual: result.score,
      expected: 0
    });
  });

  test.each([
    ['null input', null],
    ['string input', 'not an object'],
    ['undefined input', undefined],
  ])('throws ParseError for %s', (_, input) => {
    const logger = createMockLogger();
    const error = Try(normalizeJudgment, input, { requirement: 'test assertion', runIndex: 1, logger });

    assert({
      given: _,
      should: 'have ParseError name in cause',
      actual: error?.cause?.name,
      expected: 'ParseError'
    });

    assert({
      given: _,
      should: 'have JUDGE_INVALID_RESPONSE code in cause',
      actual: error?.cause?.code,
      expected: 'JUDGE_INVALID_RESPONSE'
    });
  });

  test('includes requirement and runIndex in ParseError cause', () => {
    const logger = createMockLogger();
    const error = Try(normalizeJudgment, null, { requirement: 'test assertion', runIndex: 1, logger });

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
});
