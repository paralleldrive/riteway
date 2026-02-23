import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { createError } from 'error-causes';
import {
  handleAIErrors,
  allNoop,
  ParseError,
  ValidationError,
} from './ai-errors.js';

describe('ai-errors module', () => {
  describe('handleAIErrors', () => {
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
