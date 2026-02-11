import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { parseExtractionResult } from './extraction-parser.js';

describe('extraction-parser', () => {
  describe('parseExtractionResult()', () => {
    test('parses valid extraction result with new shape', () => {
      const validOutput = JSON.stringify({
        userPrompt: 'What is 2 + 2?',
        importPaths: ['test.mdc'],
        assertions: [
          {
            id: 1,
            requirement: 'Given simple addition, should add correctly'
          },
          {
            id: 2,
            requirement: 'Given format, should output JSON'
          }
        ]
      });

      const result = parseExtractionResult(validOutput);

      assert({
        given: 'valid extraction result',
        should: 'preserve the userPrompt field',
        actual: result.userPrompt,
        expected: 'What is 2 + 2?'
      });

      assert({
        given: 'valid extraction result',
        should: 'preserve the importPaths field',
        actual: Array.isArray(result.importPaths),
        expected: true
      });

      assert({
        given: 'valid extraction result',
        should: 'preserve importPaths values',
        actual: result.importPaths[0],
        expected: 'test.mdc'
      });

      assert({
        given: 'valid extraction result',
        should: 'preserve assertions array',
        actual: result.assertions.length,
        expected: 2
      });

      assert({
        given: 'valid extraction result',
        should: 'preserve assertion requirement field',
        actual: result.assertions[0].requirement,
        expected: 'Given simple addition, should add correctly'
      });
    });

    test('parses JSON wrapped in markdown code fences', () => {
      const markdownWrapped = '```json\n{\n  "userPrompt": "test prompt",\n  "importPaths": [],\n  "assertions": [\n    {\n      "id": 1,\n      "requirement": "Given test, should pass"\n    }\n  ]\n}\n```';

      const result = parseExtractionResult(markdownWrapped);

      assert({
        given: 'JSON wrapped in markdown code fences',
        should: 'extract and parse the JSON object',
        actual: typeof result === 'object' && result !== null,
        expected: true
      });

      assert({
        given: 'JSON wrapped in markdown code fences',
        should: 'preserve the userPrompt field',
        actual: result.userPrompt,
        expected: 'test prompt'
      });

      assert({
        given: 'JSON wrapped in markdown code fences',
        should: 'preserve assertions array',
        actual: result.assertions[0].requirement,
        expected: 'Given test, should pass'
      });
    });

    test('parses JSON with explanation text and markdown fences', () => {
      const withExplanation = 'Here is the extraction result you requested:\n\n```json\n{\n  "userPrompt": "test prompt",\n  "importPaths": [],\n  "assertions": [\n    {\n      "id": 1,\n      "requirement": "Given test, should pass"\n    }\n  ]\n}\n```\n\nLet me know if you need more help.';

      const result = parseExtractionResult(withExplanation);

      assert({
        given: 'JSON with explanation text and markdown fences',
        should: 'extract and parse the JSON object',
        actual: typeof result === 'object' && result !== null,
        expected: true
      });

      assert({
        given: 'JSON with explanation text and markdown fences',
        should: 'return the parsed content',
        actual: result.assertions[0].requirement,
        expected: 'Given test, should pass'
      });
    });

    test('throws on malformed non-JSON input', () => {
      const malformed = 'This is not JSON at all';

      const error = Try(parseExtractionResult, malformed);

      assert({
        given: 'non-JSON input',
        should: 'throw ExtractionParseError',
        actual: error?.cause?.name,
        expected: 'ExtractionParseError'
      });

      assert({
        given: 'non-JSON input',
        should: 'have EXTRACTION_PARSE_FAILURE code',
        actual: error?.cause?.code,
        expected: 'EXTRACTION_PARSE_FAILURE'
      });

      assert({
        given: 'non-JSON input',
        should: 'preserve original parse error as cause',
        actual: error?.cause?.cause !== undefined,
        expected: true
      });
    });

    test('throws when result does not have required structure', () => {
      const invalidStructure = JSON.stringify({ id: 1, description: 'test', prompt: 'test' });

      const error = Try(parseExtractionResult, invalidStructure);

      assert({
        given: 'extraction result with invalid structure',
        should: 'throw ExtractionValidationError',
        actual: error?.cause?.name,
        expected: 'ExtractionValidationError'
      });

      assert({
        given: 'extraction result with invalid structure',
        should: 'have EXTRACTION_VALIDATION_FAILURE code',
        actual: error?.cause?.code,
        expected: 'EXTRACTION_VALIDATION_FAILURE'
      });
    });

    test('throws when required fields are missing', () => {
      const missingFields = JSON.stringify({
        userPrompt: 'test',
        assertions: []
      });

      const error = Try(parseExtractionResult, missingFields);

      assert({
        given: 'extraction result missing importPaths field',
        should: 'throw ExtractionValidationError',
        actual: error?.cause?.name,
        expected: 'ExtractionValidationError'
      });

      assert({
        given: 'extraction result missing importPaths field',
        should: 'have EXTRACTION_VALIDATION_FAILURE code',
        actual: error?.cause?.code,
        expected: 'EXTRACTION_VALIDATION_FAILURE'
      });

      assert({
        given: 'extraction result missing importPaths field',
        should: 'have descriptive error message',
        actual: error?.message?.includes('importPaths'),
        expected: true
      });
    });

    test('throws when assertions array has items missing required fields', () => {
      const missingAssertionFields = JSON.stringify({
        userPrompt: 'test',
        importPaths: [],
        assertions: [
          { id: 1 }
        ]
      });

      const error = Try(parseExtractionResult, missingAssertionFields);

      assert({
        given: 'assertion missing the requirement field',
        should: 'throw ExtractionValidationError',
        actual: error?.cause?.name,
        expected: 'ExtractionValidationError'
      });

      assert({
        given: 'assertion missing the requirement field',
        should: 'have EXTRACTION_VALIDATION_FAILURE code',
        actual: error?.cause?.code,
        expected: 'EXTRACTION_VALIDATION_FAILURE'
      });

      assert({
        given: 'assertion missing the requirement field',
        should: 'have error message indicating missing field',
        actual: error?.message?.includes('requirement'),
        expected: true
      });
    });

    test('accepts an already-parsed object', () => {
      const parsed = {
        userPrompt: 'test prompt',
        importPaths: [],
        assertions: [
          {
            id: 1,
            requirement: 'Given a test, should pass'
          }
        ]
      };

      const result = parseExtractionResult(parsed);

      assert({
        given: 'an already-parsed object instead of a JSON string',
        should: 'validate and return the object directly',
        actual: result.userPrompt,
        expected: 'test prompt'
      });

      assert({
        given: 'an already-parsed object',
        should: 'preserve the assertions',
        actual: result.assertions[0].requirement,
        expected: 'Given a test, should pass'
      });
    });
  });
});
