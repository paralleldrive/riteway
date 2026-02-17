import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { createError } from 'error-causes';
import {
  aiErrors,
  handleAIErrors,
  ParseError,
  ValidationError,
  SecurityError,
  TimeoutError,
  AgentProcessError,
  AITestError,
  OutputError,
  ExtractionParseError,
  ExtractionValidationError
} from './ai-errors.js';

const errorTable = [
  ['ParseError',               'PARSE_FAILURE',              ParseError],
  ['ValidationError',          'VALIDATION_FAILURE',         ValidationError],
  ['SecurityError',            'SECURITY_VIOLATION',         SecurityError],
  ['TimeoutError',             'AGENT_TIMEOUT',              TimeoutError],
  ['AgentProcessError',        'AGENT_PROCESS_FAILURE',      AgentProcessError],
  ['AITestError',              'AI_TEST_ERROR',              AITestError],
  ['OutputError',              'OUTPUT_ERROR',               OutputError],
  ['ExtractionParseError',     'EXTRACTION_PARSE_FAILURE',   ExtractionParseError],
  ['ExtractionValidationError','EXTRACTION_VALIDATION_FAILURE', ExtractionValidationError],
];

describe('ai-errors module', () => {
  describe('error descriptors', () => {
    test.each(errorTable)('%s descriptor has correct name', (name) => {
      assert({
        given: `${name} descriptor`,
        should: 'have the correct error name',
        actual: aiErrors[name].name,
        expected: name
      });
    });

    test.each(errorTable)('%s descriptor has correct code', (name, code) => {
      assert({
        given: `${name} descriptor`,
        should: 'have the correct error code',
        actual: aiErrors[name].code,
        expected: code
      });
    });

    test.each(errorTable)('%s named export matches aiErrors entry', (name, _code, descriptor) => {
      assert({
        given: `destructured ${name} export`,
        should: 'equal aiErrors entry',
        actual: descriptor,
        expected: aiErrors[name]
      });
    });
  });

  describe('createError integration', () => {
    test.each([
      ['ParseError',    ParseError,    'PARSE_FAILURE'],
      ['SecurityError', SecurityError, 'SECURITY_VIOLATION'],
    ])('%s produces an Error with structured cause', (name, descriptor, code) => {
      const err = createError(descriptor);

      assert({
        given: `a ${name} descriptor`,
        should: 'produce an Error instance',
        actual: err instanceof Error,
        expected: true
      });

      assert({
        given: `a ${name} descriptor`,
        should: `set cause.name to ${name}`,
        actual: err.cause.name,
        expected: name
      });

      assert({
        given: `a ${name} descriptor`,
        should: `set cause.code to ${code}`,
        actual: err.cause.code,
        expected: code
      });
    });
  });

  describe('handleAIErrors', () => {
    // handleAIErrors is exhaustive: every registered error type must have a handler.
    // Build a no-op map for all types, then override the one under test.
    const noop = () => {};
    const allNoop = {
      ParseError: noop, ValidationError: noop, SecurityError: noop,
      TimeoutError: noop, AgentProcessError: noop, AITestError: noop,
      OutputError: noop, ExtractionParseError: noop, ExtractionValidationError: noop
    };

    test('routes a ParseError to the ParseError handler', () => {
      const err = createError(ParseError);
      const invoked = [];

      handleAIErrors({ ...allNoop, ParseError: () => invoked.push('ParseError') })(err);

      assert({
        given: 'an error created from ParseError',
        should: 'invoke only the ParseError handler',
        actual: invoked,
        expected: ['ParseError']
      });
    });

    test('routes a ValidationError to the ValidationError handler', () => {
      const err = createError(ValidationError);
      const invoked = [];

      handleAIErrors({ ...allNoop, ValidationError: () => invoked.push('ValidationError') })(err);

      assert({
        given: 'an error created from ValidationError',
        should: 'invoke only the ValidationError handler',
        actual: invoked,
        expected: ['ValidationError']
      });
    });
  });
});
