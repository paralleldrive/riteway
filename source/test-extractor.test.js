import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import {
  buildExtractionPrompt,
  buildResultPrompt,
  buildJudgePrompt,
  parseTAPYAML,
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

  describe('buildResultPrompt()', () => {
    test('includes userPrompt in output', () => {
      const userPrompt = 'What is 2 + 2?';
      const promptUnderTest = 'You are a math helper.';

      const result = buildResultPrompt({ userPrompt, promptUnderTest });

      assert({
        given: 'userPrompt and promptUnderTest',
        should: 'include the userPrompt in the output',
        actual: result.includes(userPrompt),
        expected: true
      });
    });

    test('includes promptUnderTest in context section', () => {
      const userPrompt = 'What is 2 + 2?';
      const promptUnderTest = 'You are a math helper.';

      const result = buildResultPrompt({ userPrompt, promptUnderTest });

      assert({
        given: 'promptUnderTest',
        should: 'include promptUnderTest in context section',
        actual: result.includes(promptUnderTest),
        expected: true
      });

      assert({
        given: 'promptUnderTest',
        should: 'label context section clearly',
        actual: result.includes('CONTEXT (Prompt Under Test)'),
        expected: true
      });
    });

    test('instructs plain text response, NOT JSON', () => {
      const userPrompt = 'What is 2 + 2?';
      const promptUnderTest = 'You are a math helper.';

      const result = buildResultPrompt({ userPrompt, promptUnderTest });

      assert({
        given: 'result prompt',
        should: 'instruct plain text response',
        actual: result.includes('plain text'),
        expected: true
      });

      assert({
        given: 'result prompt',
        should: 'explicitly say NOT to wrap in JSON',
        actual: result.toLowerCase().includes('not') && result.toLowerCase().includes('json'),
        expected: true
      });
    });

    test('does NOT include JSON formatting instructions', () => {
      const userPrompt = 'What is 2 + 2?';
      const promptUnderTest = 'You are a math helper.';

      const result = buildResultPrompt({ userPrompt, promptUnderTest });

      assert({
        given: 'result prompt',
        should: 'NOT include JSON object formatting instructions',
        actual: result.includes('"passed"') || result.includes('{"'),
        expected: false
      });

      assert({
        given: 'result prompt',
        should: 'NOT include markdown fence instructions',
        actual: result.includes('```'),
        expected: false
      });
    });
  });

  describe('buildJudgePrompt()', () => {
    test('includes result in output', () => {
      const userPrompt = 'What is 2 + 2?';
      const promptUnderTest = 'You are a math helper.';
      const result = '4';
      const requirement = 'should return correct answer';
      const description = 'Given simple addition, should return correct answer';

      const output = buildJudgePrompt({ userPrompt, promptUnderTest, result, requirement, description });

      assert({
        given: 'result string',
        should: 'include result in output',
        actual: output.includes(result),
        expected: true
      });
    });

    test('includes ONE requirement/description', () => {
      const userPrompt = 'What is 2 + 2?';
      const promptUnderTest = 'You are a math helper.';
      const result = '4';
      const requirement = 'should return correct answer';
      const description = 'Given simple addition, should return correct answer';

      const output = buildJudgePrompt({ userPrompt, promptUnderTest, result, requirement, description });

      assert({
        given: 'requirement and description',
        should: 'include description in output',
        actual: output.includes(description),
        expected: true
      });

      assert({
        given: 'requirement field',
        should: 'include REQUIREMENT section label',
        actual: output.includes('REQUIREMENT'),
        expected: true
      });
    });

    test('includes full context (promptUnderTest, userPrompt)', () => {
      const userPrompt = 'What is 2 + 2?';
      const promptUnderTest = 'You are a math helper.';
      const result = '4';
      const requirement = 'should return correct answer';
      const description = 'Given simple addition, should return correct answer';

      const output = buildJudgePrompt({ userPrompt, promptUnderTest, result, requirement, description });

      assert({
        given: 'promptUnderTest',
        should: 'include promptUnderTest in context section',
        actual: output.includes(promptUnderTest),
        expected: true
      });

      assert({
        given: 'promptUnderTest',
        should: 'label context section clearly',
        actual: output.includes('CONTEXT (Prompt Under Test)'),
        expected: true
      });

      assert({
        given: 'userPrompt',
        should: 'include userPrompt in output',
        actual: output.includes(userPrompt),
        expected: true
      });

      assert({
        given: 'userPrompt',
        should: 'label original user prompt section',
        actual: output.includes('ORIGINAL USER PROMPT'),
        expected: true
      });
    });

    test('instructs TAP YAML response format', () => {
      const userPrompt = 'What is 2 + 2?';
      const promptUnderTest = 'You are a math helper.';
      const result = '4';
      const requirement = 'should return correct answer';
      const description = 'Given simple addition, should return correct answer';

      const output = buildJudgePrompt({ userPrompt, promptUnderTest, result, requirement, description });

      assert({
        given: 'judge prompt',
        should: 'instruct TAP YAML output format',
        actual: output.includes('TAP YAML'),
        expected: true
      });

      assert({
        given: 'judge prompt',
        should: 'show example with --- delimiters',
        actual: output.includes('---'),
        expected: true
      });

      assert({
        given: 'judge prompt',
        should: 'instruct passed field',
        actual: output.includes('passed:'),
        expected: true
      });

      assert({
        given: 'judge prompt',
        should: 'instruct actual field',
        actual: output.includes('actual:'),
        expected: true
      });

      assert({
        given: 'judge prompt',
        should: 'instruct expected field',
        actual: output.includes('expected:'),
        expected: true
      });

      assert({
        given: 'judge prompt',
        should: 'instruct score field',
        actual: output.includes('score:'),
        expected: true
      });
    });
  });

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

      let error;
      try {
        parseTAPYAML(invalidInput);
      } catch (err) {
        error = err;
      }

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

    test('rejects import path traversal attempts', async () => {
      const extractedData = [
        {
          id: 1,
          description: 'Given a test, should pass',
          userPrompt: 'test',
          requirement: 'should pass'
        }
      ];

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const testContent = 'import @promptUnderTest from "../../../../.env"\n\n- Given test, should pass';

      let error;
      try {
        await extractTests({
          testContent,
          testFilePath: '/project/test/test.sudo',
          agentConfig: mockAgentConfig,
          timeout: 5000
        });
      } catch (err) {
        error = err;
      }

      assert({
        given: 'import with path traversal',
        should: 'throw SecurityError',
        actual: error?.cause?.name,
        expected: 'SecurityError'
      });

      assert({
        given: 'import with path traversal',
        should: 'have IMPORT_PATH_TRAVERSAL code',
        actual: error?.cause?.code,
        expected: 'IMPORT_PATH_TRAVERSAL'
      });
    });
  });
});
