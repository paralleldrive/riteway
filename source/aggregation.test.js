import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import {
  normalizeJudgment,
  aggregatePerAssertionResults
} from './aggregation.js';
import { handleAIErrors, allNoop } from './ai-errors.js';

describe('aggregatePerAssertionResults()', () => {
  test('aggregates per-assertion results when all assertions pass', () => {
    const runResultsA = [
      { passed: true, output: 'ok' },
      { passed: true, output: 'ok' }
    ];
    const runResultsB = [
      { passed: true, output: 'ok' },
      { passed: true, output: 'ok' }
    ];
    const perAssertionResults = [
      { requirement: 'Given simple addition, should add correctly', runResults: runResultsA },
      { requirement: 'Given format, should output JSON', runResults: runResultsB }
    ];

    const result = aggregatePerAssertionResults({
      perAssertionResults,
      threshold: 75,
      runs: 2
    });

    assert({
      given: 'two assertions both meeting threshold',
      should: 'return full aggregated result with all assertions passed',
      actual: result,
      expected: {
        passed: true,
        assertions: [
          {
            requirement: 'Given simple addition, should add correctly',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            averageScore: 0,
            runResults: runResultsA
          },
          {
            requirement: 'Given format, should output JSON',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            averageScore: 0,
            runResults: runResultsB
          }
        ]
      }
    });
  });

  test('fails when any assertion does not meet threshold', () => {
    const runResultsA = [
      { passed: true, output: 'ok' },
      { passed: true, output: 'ok' }
    ];
    const runResultsB = [
      { passed: false, output: 'fail' },
      { passed: false, output: 'fail' }
    ];
    const perAssertionResults = [
      { requirement: 'Given addition, should add correctly', runResults: runResultsA },
      { requirement: 'Given format, should output JSON', runResults: runResultsB }
    ];

    const result = aggregatePerAssertionResults({
      perAssertionResults,
      threshold: 75,
      runs: 2
    });

    assert({
      given: 'one assertion meeting threshold and one failing',
      should: 'return full result with overall passed: false and correct per-assertion states',
      actual: result,
      expected: {
        passed: false,
        assertions: [
          {
            requirement: 'Given addition, should add correctly',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            averageScore: 0,
            runResults: runResultsA
          },
          {
            requirement: 'Given format, should output JSON',
            passed: false,
            passCount: 0,
            totalRuns: 2,
            averageScore: 0,
            runResults: runResultsB
          }
        ]
      }
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
      given: 'per-assertion run results with 1 of 2 passes at 50% threshold',
      should: 'return full result preserving run results and totalRuns',
      actual: result,
      expected: {
        passed: true,
        assertions: [{
          requirement: 'test assertion',
          passed: true,
          passCount: 1,
          totalRuns: 2,
          averageScore: 0,
          runResults
        }]
      }
    });
  });

  test('calculates averageScore from run results', () => {
    const runResults = [
      { passed: true, score: 85 },
      { passed: true, score: 95 },
      { passed: true, score: 90 }
    ];
    const perAssertionResults = [{ requirement: 'test with scores', runResults }];

    const result = aggregatePerAssertionResults({
      perAssertionResults,
      threshold: 75,
      runs: 3
    });

    assert({
      given: 'three runs with scores 85, 95, 90',
      should: 'calculate average score of 90',
      actual: result,
      expected: {
        passed: true,
        assertions: [{
          requirement: 'test with scores',
          passed: true,
          passCount: 3,
          totalRuns: 3,
          averageScore: 90,
          runResults
        }]
      }
    });
  });

  test('defaults missing scores to 0 when calculating average', () => {
    const runResults = [
      { passed: true },
      { passed: true }
    ];
    const perAssertionResults = [{ requirement: 'test without scores', runResults }];

    const result = aggregatePerAssertionResults({
      perAssertionResults,
      threshold: 75,
      runs: 2
    });

    assert({
      given: 'run results with no score fields',
      should: 'report averageScore of 0',
      actual: result,
      expected: {
        passed: true,
        assertions: [{
          requirement: 'test without scores',
          passed: true,
          passCount: 2,
          totalRuns: 2,
          averageScore: 0,
          runResults
        }]
      }
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
      should: 'return passed: true with empty assertions (vacuous truth)',
      actual: result,
      expected: { passed: true, assertions: [] }
    });
  });

  test.each([
    ['4 runs, 75% threshold — 3 of 4 pass', 4, 75, 3, 3, true],
    ['4 runs, 75% threshold — 2 of 4 pass', 4, 75, 2, 2, false],
    ['5 runs, 75% threshold — 4 of 5 pass', 5, 75, 4, 4, true],
    ['5 runs, 75% threshold — 3 of 5 pass', 5, 75, 3, 3, false],
    ['10 runs, 80% threshold', 10, 80, 8, 8, true],
    ['4 runs, 80% threshold', 4, 80, 4, 4, true],
    ['4 runs, 80% threshold', 4, 80, 3, 3, false],
  ])('applies threshold correctly: %s with %i passes', (label, runs, threshold, passCount, totalPasses, expectedPass) => {
    const runResults = [
      ...Array(passCount).fill({ passed: true, score: 100 }),
      ...Array(runs - passCount).fill({ passed: false, score: 0 })
    ];

    const result = aggregatePerAssertionResults({
      perAssertionResults: [{ requirement: 'test assertion', runResults }],
      threshold,
      runs
    });

    const averageScore = Math.round((passCount * 100 / runs) * 100) / 100;

    assert({
      given: `${label} with ${passCount} of ${runs} passes`,
      should: expectedPass ? 'pass the assertion with correct counts and score' : 'fail the assertion with correct counts and score',
      actual: result,
      expected: {
        passed: expectedPass,
        assertions: [{
          requirement: 'test assertion',
          passed: expectedPass,
          passCount: totalPasses,
          totalRuns: runs,
          averageScore,
          runResults
        }]
      }
    });
  });

  test.each([
    ['runs above maximum', { runs: 1001, threshold: 75 }],
    ['zero runs', { runs: 0, threshold: 75 }],
    ['negative runs', { runs: -1, threshold: 75 }],
    ['non-integer runs', { runs: 1.5, threshold: 75 }],
    ['NaN runs', { runs: NaN, threshold: 75 }],
    ['threshold above maximum', { runs: 4, threshold: 150 }],
    ['negative threshold', { runs: 4, threshold: -10 }],
    ['NaN threshold', { runs: 4, threshold: NaN }],
  ])('throws ValidationError for %s', (label, { runs, threshold }) => {
    const perAssertionResults = [
      { requirement: 'test', runResults: [{ passed: true }] }
    ];

    const error = Try(aggregatePerAssertionResults, { perAssertionResults, threshold, runs });

    const invoked = [];
    handleAIErrors({ ...allNoop, ValidationError: () => invoked.push('ValidationError') })(error);

    assert({
      given: label,
      should: 'throw an error that routes to the ValidationError handler',
      actual: invoked,
      expected: ['ValidationError']
    });
  });
});

describe('normalizeJudgment()', () => {
  test('passes through complete valid input unchanged', () => {
    const judgeResponse = { passed: true, actual: 'Result from agent', expected: 'Expected output', score: 85 };

    const result = normalizeJudgment({ judgeResponse, requirement: 'test assertion', runIndex: 0 });

    assert({
      given: 'complete valid judgment',
      should: 'return the full normalized result unchanged',
      actual: result,
      expected: {
        passed: true,
        actual: 'Result from agent',
        expected: 'Expected output',
        score: 85
      }
    });
  });

  test('defaults passed to false when missing', () => {
    const result = normalizeJudgment({
      judgeResponse: { actual: 'Result', expected: 'Expected', score: 50 },
      requirement: 'test',
      runIndex: 0
    });

    assert({
      given: 'judgment missing passed field',
      should: 'default passed to false while preserving other fields',
      actual: result,
      expected: { passed: false, actual: 'Result', expected: 'Expected', score: 50 }
    });
  });

  test('defaults missing actual and expected', () => {
    const result = normalizeJudgment({
      judgeResponse: { passed: true, score: 100 },
      requirement: 'test assertion',
      runIndex: 2
    });

    assert({
      given: 'judgment missing actual and expected fields',
      should: 'return full result with default placeholder strings',
      actual: result,
      expected: {
        passed: true,
        actual: 'No actual provided',
        expected: 'No expected provided',
        score: 100
      }
    });
  });

  test.each([
    ['score 150', 150, 100],
    ['score -50', -50, 0],
    ['NaN score', NaN, 0],
  ])('normalizes %s correctly', (label, score, expected) => {
    const result = normalizeJudgment({
      judgeResponse: { passed: true, actual: 'Result', expected: 'Expected', score },
      requirement: 'test',
      runIndex: 0
    });

    assert({
      given: `judgment with ${label}`,
      should: `clamp score to ${expected}`,
      actual: result,
      expected: { passed: true, actual: 'Result', expected: 'Expected', score: expected }
    });
  });

  test('defaults missing score to 0', () => {
    const result = normalizeJudgment({
      judgeResponse: { passed: true, actual: 'Result', expected: 'Expected' },
      requirement: 'test',
      runIndex: 0
    });

    assert({
      given: 'judgment missing score',
      should: 'default to 0',
      actual: result,
      expected: { passed: true, actual: 'Result', expected: 'Expected', score: 0 }
    });
  });

  test.each([
    ['null input', null],
    ['string input', 'not an object'],
    ['undefined input', undefined],
  ])('throws ParseError for %s', (label, input) => {
    const error = Try(normalizeJudgment, { judgeResponse: input, requirement: 'test assertion', runIndex: 1 });

    const invoked = [];
    handleAIErrors({ ...allNoop, ParseError: () => invoked.push('ParseError') })(error);

    assert({
      given: label,
      should: 'throw an error that routes to the ParseError handler',
      actual: invoked,
      expected: ['ParseError']
    });
  });

});
