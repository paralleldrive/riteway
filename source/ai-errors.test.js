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

describe('ai-errors module', () => {
  describe('error descriptors', () => {
    test('exports all named error types with correct codes', () => {
      const expected = [
        ['ParseError', 'PARSE_FAILURE'],
        ['ValidationError', 'VALIDATION_FAILURE'],
        ['SecurityError', 'SECURITY_VIOLATION'],
        ['TimeoutError', 'AGENT_TIMEOUT'],
        ['AgentProcessError', 'AGENT_PROCESS_FAILURE'],
        ['AITestError', 'AI_TEST_ERROR'],
        ['OutputError', 'OUTPUT_ERROR'],
        ['ExtractionParseError', 'EXTRACTION_PARSE_FAILURE'],
        ['ExtractionValidationError', 'EXTRACTION_VALIDATION_FAILURE'],
      ];

      for (const [name, code] of expected) {
        assert({
          given: `${name} descriptor`,
          should: 'have the correct error name',
          actual: aiErrors[name].name,
          expected: name
        });

        assert({
          given: `${name} descriptor`,
          should: 'have the correct error code',
          actual: aiErrors[name].code,
          expected: code
        });
      }
    });

    test('individual exports match aiErrors entries', () => {
      const exports = [
        ['ParseError', ParseError],
        ['ValidationError', ValidationError],
        ['SecurityError', SecurityError],
        ['TimeoutError', TimeoutError],
        ['AgentProcessError', AgentProcessError],
        ['AITestError', AITestError],
        ['OutputError', OutputError],
        ['ExtractionParseError', ExtractionParseError],
        ['ExtractionValidationError', ExtractionValidationError],
      ];

      for (const [name, descriptor] of exports) {
        assert({
          given: `destructured ${name} export`,
          should: 'equal aiErrors entry',
          actual: descriptor,
          expected: aiErrors[name]
        });
      }
    });
  });

  describe('createError integration', () => {
    test('creates an Error with structured cause from error descriptor', () => {
      const err = createError(ParseError);

      assert({
        given: 'a ParseError descriptor',
        should: 'produce an Error instance',
        actual: err instanceof Error,
        expected: true
      });

      assert({
        given: 'a ParseError descriptor',
        should: 'set cause.name to ParseError',
        actual: err.cause.name,
        expected: 'ParseError'
      });

      assert({
        given: 'a ParseError descriptor',
        should: 'set cause.code to PARSE_FAILURE',
        actual: err.cause.code,
        expected: 'PARSE_FAILURE'
      });
    });
  });

  describe('handleAIErrors', () => {
    test('exports a handler factory function', () => {
      assert({
        given: 'handleAIErrors export',
        should: 'be a function',
        actual: typeof handleAIErrors,
        expected: 'function'
      });
    });
  });
});
