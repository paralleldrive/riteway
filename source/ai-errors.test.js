import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { createError } from 'error-causes';
import {
  handleAIErrors,
  ParseError,
  ValidationError,
} from './ai-errors.js';

describe('ai-errors module', () => {
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
