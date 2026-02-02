import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import {
  buildExtractionPrompt,
  parseExtractionResult,
  extractTests,
  parseImports
} from './test-extractor.js';

describe('test-extractor', () => {
  describe('buildExtractionPrompt()', () => {
    test('includes the test content in the prompt', () => {
      const testContent = `import @promptUnderTest

userPrompt = """
  What is 2 + 2?
"""

- Given simple addition, should add correctly
- Given format, should output JSON`;

      const result = buildExtractionPrompt(testContent);

      assert({
        given: 'test content with assertions',
        should: 'include the original test content in the prompt',
        actual: result.includes(testContent),
        expected: true
      });
    });

    test('includes extraction instructions', () => {
      const testContent = '- Given a test, should pass';

      const result = buildExtractionPrompt(testContent);

      assert({
        given: 'any test content',
        should: 'include instructions to identify assertions',
        actual: result.includes('assert'),
        expected: true
      });

      assert({
        given: 'any test content',
        should: 'instruct JSON array output format',
        actual: result.includes('JSON'),
        expected: true
      });
    });

    test('instructs agent to extract userPrompt and requirement', () => {
      const testContent = '- Given a test, should pass';

      const result = buildExtractionPrompt(testContent);

      assert({
        given: 'extraction prompt',
        should: 'instruct agent to extract userPrompt field',
        actual: result.includes('userPrompt'),
        expected: true
      });

      assert({
        given: 'extraction prompt',
        should: 'instruct agent to extract requirement field',
        actual: result.includes('requirement'),
        expected: true
      });
    });

    test('wraps test content in boundary delimiters', () => {
      const testContent = '- Given a test, should pass';

      const result = buildExtractionPrompt(testContent);

      assert({
        given: 'any test content',
        should: 'include an opening boundary delimiter before the content',
        actual: result.includes('<test-file-contents>'),
        expected: true
      });

      assert({
        given: 'any test content',
        should: 'include a closing boundary delimiter after the content',
        actual: result.includes('</test-file-contents>'),
        expected: true
      });

      const openTag = result.indexOf('<test-file-contents>');
      const contentPos = result.indexOf(testContent);
      const closeTag = result.indexOf('</test-file-contents>');

      assert({
        given: 'boundary delimiters',
        should: 'place the content between the opening and closing tags',
        actual: openTag < contentPos && contentPos < closeTag,
        expected: true
      });
    });
  });

  describe('parseExtractionResult()', () => {
    test('parses valid JSON array of extracted tests', () => {
      const validOutput = JSON.stringify([
        {
          id: 1,
          description: 'Given simple addition, should add correctly',
          userPrompt: 'What is 2 + 2?',
          requirement: 'should add correctly'
        },
        {
          id: 2,
          description: 'Given format, should output JSON',
          userPrompt: 'What is 2 + 2?',
          requirement: 'should output JSON'
        }
      ]);

      const result = parseExtractionResult(validOutput);

      assert({
        given: 'valid JSON array with two extracted tests',
        should: 'return an array of length 2',
        actual: result.length,
        expected: 2
      });

      assert({
        given: 'valid extraction result',
        should: 'preserve the id field',
        actual: result[0].id,
        expected: 1
      });

      assert({
        given: 'valid extraction result',
        should: 'preserve the description field',
        actual: result[0].description,
        expected: 'Given simple addition, should add correctly'
      });

      assert({
        given: 'valid extraction result',
        should: 'preserve the userPrompt field',
        actual: result[0].userPrompt,
        expected: 'What is 2 + 2?'
      });

      assert({
        given: 'valid extraction result',
        should: 'preserve the requirement field',
        actual: result[0].requirement,
        expected: 'should add correctly'
      });
    });

    test('parses JSON wrapped in markdown code fences', () => {
      const markdownWrapped = '```json\n[\n  {\n    "id": 1,\n    "description": "Given test, should pass",\n    "userPrompt": "test prompt",\n    "requirement": "should pass"\n  }\n]\n```';

      const result = parseExtractionResult(markdownWrapped);

      assert({
        given: 'JSON wrapped in markdown code fences',
        should: 'extract and parse the JSON array',
        actual: Array.isArray(result),
        expected: true
      });

      assert({
        given: 'JSON wrapped in markdown code fences',
        should: 'return correct array length',
        actual: result.length,
        expected: 1
      });

      assert({
        given: 'JSON wrapped in markdown code fences',
        should: 'preserve the description field',
        actual: result[0].description,
        expected: 'Given test, should pass'
      });
    });

    test('parses JSON with explanation text and markdown fences', () => {
      const withExplanation = 'Here is the JSON array you requested:\n\n```json\n[\n  {\n    "id": 1,\n    "description": "Given test, should pass",\n    "userPrompt": "test prompt",\n    "requirement": "should pass"\n  }\n]\n```\n\nLet me know if you need more help.';

      const result = parseExtractionResult(withExplanation);

      assert({
        given: 'JSON with explanation text and markdown fences',
        should: 'extract and parse the JSON array',
        actual: Array.isArray(result),
        expected: true
      });

      assert({
        given: 'JSON with explanation text and markdown fences',
        should: 'return the parsed content',
        actual: result[0].description,
        expected: 'Given test, should pass'
      });
    });

    test('throws on malformed non-JSON input', () => {
      const malformed = 'This is not JSON at all';

      assert({
        given: 'non-JSON input',
        should: 'throw an error',
        actual: (() => {
          try {
            parseExtractionResult(malformed);
            return 'no error';
          } catch (err) {
            return err.message;
          }
        })(),
        expected: 'Failed to parse extraction result as JSON'
      });
    });

    test('throws when result is not an array', () => {
      const notArray = JSON.stringify({ id: 1, description: 'test', prompt: 'test' });

      assert({
        given: 'a JSON object instead of array',
        should: 'throw an error',
        actual: (() => {
          try {
            parseExtractionResult(notArray);
            return 'no error';
          } catch (err) {
            return err.message;
          }
        })(),
        expected: 'Extraction result must be a JSON array'
      });
    });

    test('throws when required fields are missing', () => {
      const missingFields = JSON.stringify([
        { id: 1, description: 'test' }
      ]);

      assert({
        given: 'an item missing the userPrompt field',
        should: 'throw an error indicating the missing field',
        actual: (() => {
          try {
            parseExtractionResult(missingFields);
            return 'no error';
          } catch (err) {
            return err.message;
          }
        })(),
        expected: 'Extracted test at index 0 is missing required field: userPrompt'
      });
    });

    test('throws when id field is missing', () => {
      const missingId = JSON.stringify([
        { description: 'test', prompt: 'test prompt' }
      ]);

      assert({
        given: 'an item missing the id field',
        should: 'throw an error indicating the missing field',
        actual: (() => {
          try {
            parseExtractionResult(missingId);
            return 'no error';
          } catch (err) {
            return err.message;
          }
        })(),
        expected: 'Extracted test at index 0 is missing required field: id'
      });
    });

    test('throws when description field is missing', () => {
      const missingDescription = JSON.stringify([
        { id: 1, prompt: 'test prompt' }
      ]);

      assert({
        given: 'an item missing the description field',
        should: 'throw an error indicating the missing field',
        actual: (() => {
          try {
            parseExtractionResult(missingDescription);
            return 'no error';
          } catch (err) {
            return err.message;
          }
        })(),
        expected: 'Extracted test at index 0 is missing required field: description'
      });
    });

    test('throws on empty extraction result', () => {
      const emptyArray = JSON.stringify([]);

      assert({
        given: 'an empty JSON array',
        should: 'throw an error indicating no tests were extracted',
        actual: (() => {
          try {
            parseExtractionResult(emptyArray);
            return 'no error';
          } catch (err) {
            return err.message;
          }
        })(),
        expected: 'Extraction produced no tests. Verify the test file contains assertion lines.'
      });
    });

    test('accepts an already-parsed object', () => {
      const parsed = [
        {
          id: 1,
          description: 'Given a test, should pass',
          userPrompt: 'test prompt',
          requirement: 'should pass'
        }
      ];

      const result = parseExtractionResult(parsed);

      assert({
        given: 'an already-parsed array instead of a JSON string',
        should: 'validate and return the array directly',
        actual: result.length,
        expected: 1
      });

      assert({
        given: 'an already-parsed array',
        should: 'preserve the fields',
        actual: result[0].description,
        expected: 'Given a test, should pass'
      });
    });
  });

  describe('parseImports()', () => {
    test('extracts import paths from test content', () => {
      const testContent = `import @promptUnderTest from '../../ai/rules/javascript/error-causes.mdc'

userPrompt = """test"""`;

      const result = parseImports(testContent);

      assert({
        given: 'test content with import statement',
        should: 'return array with import path',
        actual: result.length,
        expected: 1
      });

      assert({
        given: 'import statement',
        should: 'extract the file path',
        actual: result[0],
        expected: '../../ai/rules/javascript/error-causes.mdc'
      });
    });

    test('handles test content with no imports', () => {
      const testContent = 'userPrompt = """test"""';

      const result = parseImports(testContent);

      assert({
        given: 'test content without imports',
        should: 'return empty array',
        actual: result.length,
        expected: 0
      });
    });

    test('handles multiple imports', () => {
      const testContent = `import @prompt1 from './file1.mdc'
import @prompt2 from "./file2.mdc"

userPrompt = """test"""`;

      const result = parseImports(testContent);

      assert({
        given: 'test content with multiple imports',
        should: 'return array with all import paths',
        actual: result.length,
        expected: 2
      });
    });
  });

  describe('extractTests()', () => {
    test('orchestrates extraction via agent and returns evaluation prompts', async () => {
      const extractedTests = [
        {
          id: 1,
          description: 'Given simple addition, should add correctly',
          userPrompt: 'What is 2 + 2?',
          requirement: 'should add correctly'
        }
      ];

      // Node script that outputs the extracted tests JSON, ignoring prompt input
      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedTests)}))`]
      };

      const result = await extractTests({
        testContent: '- Given simple addition, should add correctly',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'test content and a mock extraction agent',
        should: 'return the parsed array of extracted tests',
        actual: result.length,
        expected: 1
      });

      assert({
        given: 'a successful extraction',
        should: 'return objects with id and description',
        actual: result[0].description,
        expected: 'Given simple addition, should add correctly'
      });

      assert({
        given: 'a successful extraction',
        should: 'include evaluation prompt',
        actual: result[0].prompt.includes('REQUIREMENT TO EVALUATE'),
        expected: true
      });
    });

    test('passes the extraction prompt to the agent', async () => {
      const testContent = 'userPrompt = """test"""\n\n- Given a unique marker xyzzy, should verify';

      const extractedData = [
        {
          id: 1,
          description: 'Given a unique marker xyzzy, should verify',
          userPrompt: 'test prompt',
          requirement: 'should verify'
        }
      ];

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const result = await extractTests({
        testContent,
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'test content with assertions',
        should: 'extract and transform into evaluation prompts',
        actual: result.length > 0,
        expected: true
      });

      assert({
        given: 'extraction result',
        should: 'include generated evaluation prompt',
        actual: result[0].prompt !== undefined,
        expected: true
      });
    });

    test('throws when agent returns invalid extraction output', async () => {
      const mockAgentConfig = {
        command: 'node',
        args: ['-e', 'console.log(JSON.stringify({ not: "an array" }))']
      };

      let error;
      try {
        await extractTests({
          testContent: '- Given a test, should pass',
          agentConfig: mockAgentConfig,
          timeout: 5000
        });
      } catch (err) {
        error = err;
      }

      assert({
        given: 'agent returns a non-array JSON result',
        should: 'throw an extraction error',
        actual: error?.message,
        expected: 'Extraction result must be a JSON array'
      });
    });

    test('returns structured data with evaluation prompts', async () => {
      const extractedData = [
        {
          id: 1,
          description: 'Given a test, should pass',
          userPrompt: 'What is 2+2?',
          requirement: 'should pass'
        }
      ];

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const result = await extractTests({
        testContent: '- Given a test, should pass',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'extraction agent returns structured data',
        should: 'include id field',
        actual: result[0].id,
        expected: 1
      });

      assert({
        given: 'extraction result',
        should: 'include description field',
        actual: result[0].description,
        expected: 'Given a test, should pass'
      });

      assert({
        given: 'extraction result',
        should: 'include prompt field with evaluation instructions',
        actual: result[0].prompt.includes('REQUIREMENT TO EVALUATE'),
        expected: true
      });

      assert({
        given: 'evaluation prompt',
        should: 'include the user prompt',
        actual: result[0].prompt.includes('What is 2+2?'),
        expected: true
      });
    });
  });
});
