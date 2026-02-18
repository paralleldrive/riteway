import { describe, test, vi } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import {
  normalizeJudgment,
  aggregatePerAssertionResults
} from './aggregation.js';

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

  test('passes with empty assertions array (vacuous truth)', () => {
    const result = aggregatePerAssertionResults({
      perAssertionResults: [],
      threshold: 75,
      runs: 4
    });

    assert({
      given: 'empty perAssertionResults array',
      should: 'return passed: true (all zero assertions meet threshold)',
      actual: result.passed,
      expected: true
    });

    assert({
      given: 'empty perAssertionResults array',
      should: 'return empty assertions array',
      actual: result.assertions,
      expected: []
    });
  });

  test.each([
    ['4 runs, 75% threshold', 4, 75, 3, 3, true],
    ['4 runs, 75% threshold', 4, 75, 2, 2, false],
    ['5 runs, 75% threshold', 5, 75, 4, 4, true],
    ['5 runs, 75% threshold', 5, 75, 3, 3, false],
    ['10 runs, 80% threshold', 10, 80, 8, 8, true],
    ['4 runs, 80% threshold', 4, 80, 4, 4, true],
    ['4 runs, 80% threshold', 4, 80, 3, 3, false],
  ])('applies threshold correctly: %s with %i passes', (_, runs, threshold, passCount, totalPasses, expectedPass) => {
    const runResults = [
      ...Array(passCount).fill({ passed: true, score: 100 }),
      ...Array(runs - passCount).fill({ passed: false, score: 0 })
    ];

    const result = aggregatePerAssertionResults({
      perAssertionResults: [{ requirement: 'test assertion', runResults }],
      threshold,
      runs
    });

    assert({
      given: `${_} with ${passCount} of ${runs} passes`,
      should: expectedPass ? 'pass the assertion' : 'fail the assertion',
      actual: result.assertions[0].passed,
      expected: expectedPass
    });

    assert({
      given: `${_} with ${passCount} passes`,
      should: `report passCount of ${totalPasses}`,
      actual: result.assertions[0].passCount,
      expected: totalPasses
    });
  });

  test.each([
    ['runs above maximum', { runs: 1001, threshold: 75 }, 'INVALID_AGGREGATION_PARAMS'],
    ['zero runs', { runs: 0, threshold: 75 }, 'INVALID_AGGREGATION_PARAMS'],
    ['negative runs', { runs: -1, threshold: 75 }, 'INVALID_AGGREGATION_PARAMS'],
    ['non-integer runs', { runs: 1.5, threshold: 75 }, 'INVALID_AGGREGATION_PARAMS'],
    ['NaN runs', { runs: NaN, threshold: 75 }, 'INVALID_AGGREGATION_PARAMS'],
    ['threshold above maximum', { runs: 4, threshold: 150 }, 'INVALID_AGGREGATION_PARAMS'],
    ['negative threshold', { runs: 4, threshold: -10 }, 'INVALID_AGGREGATION_PARAMS'],
    ['NaN threshold', { runs: 4, threshold: NaN }, 'INVALID_AGGREGATION_PARAMS'],
  ])('throws ValidationError for %s', (_, { runs, threshold }, expectedCode) => {
    const perAssertionResults = [
      { requirement: 'test', runResults: [{ passed: true }] }
    ];

    const error = Try(aggregatePerAssertionResults, { perAssertionResults, threshold, runs });

    assert({
      given: _,
      should: 'have ValidationError name in cause',
      actual: error?.cause?.name,
      expected: 'ValidationError'
    });

    assert({
      given: _,
      should: 'have correct error code in cause',
      actual: error?.cause?.code,
      expected: expectedCode
    });
  });
});

describe('normalizeJudgment()', () => {
  const createMockLogger = () => ({ log: vi.fn() });

  test('passes through complete valid input unchanged', () => {
    const logger = createMockLogger();
    const judgeResponse = { passed: true, actual: 'Result from agent', expected: 'Expected output', score: 85 };

    const result = normalizeJudgment({ judgeResponse, requirement: 'test assertion', runIndex: 0, logger });

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
    const result = normalizeJudgment({
      judgeResponse: { actual: 'Result', expected: 'Expected', score: 50 },
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

  test('defaults missing actual and expected with warning log', () => {
    const logger = createMockLogger();
    const result = normalizeJudgment({
      judgeResponse: { passed: true, score: 100 },
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

  test.each([
    ['score 150', 150, 100],
    ['score -50', -50, 0],
    ['NaN score', NaN, 0],
  ])('normalizes %s correctly', (_, score, expected) => {
    const logger = createMockLogger();
    const result = normalizeJudgment({
      judgeResponse: { passed: true, actual: 'Result', expected: 'Expected', score },
      requirement: 'test',
      runIndex: 0,
      logger
    });

    assert({
      given: `judgment with ${_}`,
      should: `normalize score to ${expected}`,
      actual: result.score,
      expected
    });
  });

  test('defaults missing score to 0', () => {
    const logger = createMockLogger();
    const result = normalizeJudgment({
      judgeResponse: { passed: true, actual: 'Result', expected: 'Expected' },
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

  test.each([
    ['null input', null],
    ['string input', 'not an object'],
    ['undefined input', undefined],
  ])('throws ParseError for %s', (_, input) => {
    const logger = createMockLogger();
    const error = Try(normalizeJudgment, { judgeResponse: input, requirement: 'test assertion', runIndex: 1, logger });

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
    const error = Try(normalizeJudgment, { judgeResponse: null, requirement: 'test assertion', runIndex: 1, logger });

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
