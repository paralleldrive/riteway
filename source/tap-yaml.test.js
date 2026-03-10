import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { parseTAPYAML } from './tap-yaml.js';
import { handleAIErrors, allNoop } from './ai-errors.js';

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
      should: 'parse all fields correctly',
      actual: result,
      expected: {
        passed: true,
        actual: 'the result was correct',
        expected: 'a correct result',
        score: 100
      }
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
      should: 'parse all fields correctly',
      actual: result,
      expected: {
        passed: false,
        actual: 'incorrect output',
        expected: 'correct output',
        score: 20
      }
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
      should: 'strip quotes from all fields',
      actual: resultQuoted,
      expected: {
        passed: true,
        actual: 'quoted value',
        expected: 'another quoted',
        score: 90
      }
    });

    assert({
      given: 'unquoted string values',
      should: 'parse all fields without alteration',
      actual: resultUnquoted,
      expected: {
        passed: true,
        actual: 'unquoted value',
        expected: 'another unquoted',
        score: 90
      }
    });
  });

  test('throws ParseError when no --- markers found', () => {
    const invalidInput = 'passed: true\nactual: result\nexpected: something';

    const error = Try(parseTAPYAML, invalidInput);

    const invoked = [];
    handleAIErrors({ ...allNoop, ParseError: () => invoked.push('ParseError') })(error);

    assert({
      given: 'input without --- markers',
      should: 'throw an error that routes to the ParseError handler',
      actual: invoked,
      expected: ['ParseError']
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
      should: 'parse all fields including score as a number',
      actual: result,
      expected: {
        passed: true,
        actual: 'result',
        expected: 'something',
        score: 85
      }
    });
  });

  test('handles YAML with missing optional fields', () => {
    const input = `---
passed: true
score: 75
---`;

    const result = parseTAPYAML(input);

    assert({
      given: 'YAML block with only passed and score fields',
      should: 'return only the present fields without actual or expected',
      actual: result,
      expected: {
        passed: true,
        score: 75
      }
    });
  });
});
