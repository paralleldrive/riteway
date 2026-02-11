import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { parseTAPYAML } from './tap-yaml.js';

describe('tap-yaml', () => {
  describe('parseTAPYAML()', () => {
    test('parses valid TAP YAML block with passed: true', () => {
      const input = `---
passed: true
actual: "the result was correct"
expected: "a correct result"
score: 100
---`;

      const result = parseTAPYAML(input);

      assert({
        given: 'TAP YAML with passed: true',
        should: 'parse passed as boolean true',
        actual: result.passed,
        expected: true
      });

      assert({
        given: 'TAP YAML with passed: true',
        should: 'parse actual field',
        actual: result.actual,
        expected: 'the result was correct'
      });

      assert({
        given: 'TAP YAML with passed: true',
        should: 'parse expected field',
        actual: result.expected,
        expected: 'a correct result'
      });

      assert({
        given: 'TAP YAML with passed: true',
        should: 'parse score as number',
        actual: result.score,
        expected: 100
      });
    });

    test('parses valid TAP YAML block with passed: false', () => {
      const input = `---
passed: false
actual: "incorrect output"
expected: "correct output"
score: 20
---`;

      const result = parseTAPYAML(input);

      assert({
        given: 'TAP YAML with passed: false',
        should: 'parse passed as boolean false',
        actual: result.passed,
        expected: false
      });

      assert({
        given: 'TAP YAML with passed: false',
        should: 'parse score as number',
        actual: result.score,
        expected: 20
      });
    });

    test('handles quoted and unquoted string values', () => {
      const inputQuoted = `---
passed: true
actual: "quoted value"
expected: "another quoted"
score: 90
---`;

      const inputUnquoted = `---
passed: true
actual: unquoted value
expected: another unquoted
score: 90
---`;

      const resultQuoted = parseTAPYAML(inputQuoted);
      const resultUnquoted = parseTAPYAML(inputUnquoted);

      assert({
        given: 'quoted string values',
        should: 'strip quotes from actual',
        actual: resultQuoted.actual,
        expected: 'quoted value'
      });

      assert({
        given: 'unquoted string values',
        should: 'parse unquoted actual',
        actual: resultUnquoted.actual,
        expected: 'unquoted value'
      });
    });

    test('throws ParseError when no --- markers found', () => {
      const invalidInput = 'passed: true\nactual: result\nexpected: something';

      const error = Try(parseTAPYAML, invalidInput);

      assert({
        given: 'input without --- markers',
        should: 'throw error',
        actual: error !== undefined,
        expected: true
      });

      assert({
        given: 'input without --- markers',
        should: 'have ParseError cause name',
        actual: error?.cause?.name,
        expected: 'ParseError'
      });

      assert({
        given: 'input without --- markers',
        should: 'have JUDGE_INVALID_TAP_YAML code',
        actual: error?.cause?.code,
        expected: 'JUDGE_INVALID_TAP_YAML'
      });
    });

    test('parses score as number', () => {
      const input = `---
passed: true
actual: result
expected: something
score: 85
---`;

      const result = parseTAPYAML(input);

      assert({
        given: 'score field with numeric value',
        should: 'parse score as number type',
        actual: typeof result.score === 'number',
        expected: true
      });

      assert({
        given: 'score field with numeric value',
        should: 'parse correct score value',
        actual: result.score,
        expected: 85
      });
    });

    test('handles YAML with missing optional fields', () => {
      const input = `---
passed: true
score: 75
---`;

      const result = parseTAPYAML(input);

      assert({
        given: 'YAML block missing actual and expected fields',
        should: 'parse passed field correctly',
        actual: result.passed,
        expected: true
      });

      assert({
        given: 'YAML block missing actual and expected fields',
        should: 'parse score field correctly',
        actual: result.score,
        expected: 75
      });

      assert({
        given: 'YAML block missing actual field',
        should: 'not include actual in result',
        actual: result.actual,
        expected: undefined
      });

      assert({
        given: 'YAML block missing expected field',
        should: 'not include expected in result',
        actual: result.expected,
        expected: undefined
      });
    });
  });
});
