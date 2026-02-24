import { describe, test, vi } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { handleAIErrors, allNoop } from './ai-errors.js';

vi.mock('fs/promises', () => ({ readFile: vi.fn() }));

const { readFile } = await import('fs/promises');
const { parseExtractionResult, resolveImportPaths } = await import('./extraction-parser.js');

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

    const invoked = [];
    handleAIErrors({ ...allNoop, ExtractionParseError: () => invoked.push('ExtractionParseError') })(error);

    assert({
      given: 'non-JSON input',
      should: 'throw an error that routes to the ExtractionParseError handler',
      actual: invoked,
      expected: ['ExtractionParseError']
    });
  });

  test('throws ExtractionValidationError when result has wrong structure', () => {
    const rawOutput = JSON.stringify({ id: 1, description: 'test', prompt: 'test' });
    const error = Try(parseExtractionResult, rawOutput);

    const invoked = [];
    handleAIErrors({ ...allNoop, ExtractionValidationError: () => invoked.push('ExtractionValidationError') })(error);

    assert({
      given: 'extraction result with invalid structure',
      should: 'throw an error that routes to the ExtractionValidationError handler',
      actual: invoked,
      expected: ['ExtractionValidationError']
    });
  });

  test.each([
    ['missing importPaths', { userPrompt: 'test', assertions: [] }],
    ['missing userPrompt', { importPaths: [], assertions: [] }],
    ['missing assertions', { userPrompt: 'test', importPaths: [] }],
  ])('throws when %s is missing', (_, input) => {
    const error = Try(parseExtractionResult, JSON.stringify(input));

    const invoked = [];
    handleAIErrors({ ...allNoop, ExtractionValidationError: () => invoked.push('ExtractionValidationError') })(error);

    assert({
      given: `extraction result with ${_}`,
      should: 'throw an error that routes to the ExtractionValidationError handler',
      actual: invoked,
      expected: ['ExtractionValidationError']
    });
  });

  test('throws when assertion is missing required field', () => {
    const error = Try(parseExtractionResult, JSON.stringify({
      userPrompt: 'test',
      importPaths: [],
      assertions: [{ id: 1 }]
    }));

    const invoked = [];
    handleAIErrors({ ...allNoop, ExtractionValidationError: () => invoked.push('ExtractionValidationError') })(error);

    assert({
      given: 'assertion missing the requirement field',
      should: 'throw an error that routes to the ExtractionValidationError handler',
      actual: invoked,
      expected: ['ExtractionValidationError']
    });
  });

  test('throws ExtractionValidationError when JSON parses to a non-object', () => {
    const error = Try(parseExtractionResult, '42');

    const invoked = [];
    handleAIErrors({ ...allNoop, ExtractionValidationError: () => invoked.push('ExtractionValidationError') })(error);

    assert({
      given: 'JSON string that parses to a number',
      should: 'throw an error that routes to ExtractionValidationError handler',
      actual: invoked,
      expected: ['ExtractionValidationError']
    });
  });
});

describe('resolveImportPaths()', () => {
  test('resolves and joins file contents for valid import paths', async () => {
    readFile.mockResolvedValueOnce('content of file A').mockResolvedValueOnce('content of file B');

    const result = await resolveImportPaths(['a.mdc', 'b.mdc'], '/project', false);

    assert({
      given: 'two readable import paths',
      should: 'return joined file contents separated by double newline',
      actual: result,
      expected: 'content of file A\n\ncontent of file B'
    });
  });

  test('throws ValidationError when a file cannot be read', async () => {
    readFile.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'));

    const error = await Try(resolveImportPaths, ['missing.mdc'], '/project', false);

    const invoked = [];
    handleAIErrors({ ...allNoop, ValidationError: () => invoked.push('ValidationError') })(error);

    assert({
      given: 'an import path that cannot be read',
      should: 'throw an error that routes to the ValidationError handler',
      actual: invoked,
      expected: ['ValidationError']
    });
  });
});
