import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { parseExtractionResult } from './extraction-parser.js';

describe('parseExtractionResult()', () => {
  test('parses valid extraction result with required fields', () => {
    const validOutput = JSON.stringify({
      userPrompt: 'What is 2 + 2?',
      importPaths: ['test.mdc'],
      assertions: [
        { id: 1, requirement: 'Given simple addition, should add correctly' },
        { id: 2, requirement: 'Given format, should output JSON' }
      ]
    });

    const result = parseExtractionResult(validOutput);

    assert({
      given: 'valid extraction result',
      should: 'return the parsed extraction object',
      actual: result,
      expected: {
        userPrompt: 'What is 2 + 2?',
        importPaths: ['test.mdc'],
        assertions: [
          { id: 1, requirement: 'Given simple addition, should add correctly' },
          { id: 2, requirement: 'Given format, should output JSON' }
        ]
      }
    });
  });

  test('parses JSON wrapped in markdown code fences', () => {
    const markdownWrapped = '```json\n{\n  "userPrompt": "test prompt",\n  "importPaths": [],\n  "assertions": [\n    {\n      "id": 1,\n      "requirement": "Given test, should pass"\n    }\n  ]\n}\n```';

    const result = parseExtractionResult(markdownWrapped);

    assert({
      given: 'JSON wrapped in markdown code fences',
      should: 'extract and parse the JSON object',
      actual: result,
      expected: {
        userPrompt: 'test prompt',
        importPaths: [],
        assertions: [{ id: 1, requirement: 'Given test, should pass' }]
      }
    });
  });

  test('parses JSON with surrounding explanation text and markdown fences', () => {
    const withExplanation = 'Here is the extraction result you requested:\n\n```json\n{\n  "userPrompt": "test prompt",\n  "importPaths": [],\n  "assertions": [\n    {\n      "id": 1,\n      "requirement": "Given test, should pass"\n    }\n  ]\n}\n```\n\nLet me know if you need more help.';

    const result = parseExtractionResult(withExplanation);

    assert({
      given: 'JSON with explanation text and markdown fences',
      should: 'extract and parse the JSON object',
      actual: result,
      expected: {
        userPrompt: 'test prompt',
        importPaths: [],
        assertions: [{ id: 1, requirement: 'Given test, should pass' }]
      }
    });
  });

  test('accepts an already-parsed object', () => {
    const parsed = {
      userPrompt: 'test prompt',
      importPaths: [],
      assertions: [{ id: 1, requirement: 'Given a test, should pass' }]
    };

    const result = parseExtractionResult(parsed);

    assert({
      given: 'an already-parsed object instead of a JSON string',
      should: 'validate and return the object directly',
      actual: result,
      expected: {
        userPrompt: 'test prompt',
        importPaths: [],
        assertions: [{ id: 1, requirement: 'Given a test, should pass' }]
      }
    });
  });

  test('throws ExtractionParseError on malformed non-JSON input', () => {
    const error = Try(parseExtractionResult, 'This is not JSON at all');

    assert({
      given: 'non-JSON input',
      should: 'throw ExtractionParseError cause',
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
      should: 'preserve original JSON SyntaxError as cause',
      actual: error?.cause?.cause?.name,
      expected: 'SyntaxError'
    });
  });

  test('throws ExtractionValidationError when result has wrong structure', () => {
    const error = Try(parseExtractionResult, JSON.stringify({ id: 1, description: 'test', prompt: 'test' }));

    assert({
      given: 'extraction result with invalid structure',
      should: 'throw ExtractionValidationError cause',
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

  test.each([
    [
      'missing importPaths',
      { userPrompt: 'test', assertions: [] },
      'importPaths'
    ],
    [
      'missing userPrompt',
      { importPaths: [], assertions: [] },
      'userPrompt'
    ],
    [
      'missing assertions',
      { userPrompt: 'test', importPaths: [] },
      'assertions'
    ],
  ])('throws when %s is missing', (_, input, missingField) => {
    const error = Try(parseExtractionResult, JSON.stringify(input));

    assert({
      given: `extraction result missing ${missingField}`,
      should: 'throw ExtractionValidationError',
      actual: error?.cause?.name,
      expected: 'ExtractionValidationError'
    });

    assert({
      given: `extraction result missing ${missingField}`,
      should: 'have descriptive error message',
      actual: error?.message?.includes(missingField),
      expected: true
    });
  });

  test('throws when assertion is missing required field', () => {
    const missingAssertionFields = JSON.stringify({
      userPrompt: 'test',
      importPaths: [],
      assertions: [{ id: 1 }]
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
      should: 'have error message indicating missing field',
      actual: error?.message?.includes('requirement'),
      expected: true
    });
  });
});
