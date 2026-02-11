import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import {
  buildExtractionPrompt,
  buildResultPrompt,
  buildJudgePrompt,
  parseTAPYAML,
  parseExtractionResult,
  extractTests
} from './test-extractor.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { init } from '@paralleldrive/cuid2';

const createSlug = init({ length: 10 });

// Helper to create unique temp directory names
const createTempDir = () => {
  const slug = createSlug();
  return join(tmpdir(), `riteway-extractor-test-${slug}`);
};

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

    test('instructs agent to extract userPrompt, requirement, and import paths', () => {
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

      assert({
        given: 'extraction prompt',
        should: 'instruct agent to extract import paths',
        actual: result.includes('importPaths') || result.includes('import'),
        expected: true
      });
    });

    test('accepts flexible assertion formats', () => {
      const testContent = '- Given a test, should pass';

      const result = buildExtractionPrompt(testContent);

      assert({
        given: 'extraction prompt',
        should: 'not mandate specific assertion format',
        actual: result.includes('any format') || result.includes('flexible') || !result.includes('must be formatted as'),
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
      const requirement = 'Given simple addition, should return correct answer';

      const output = buildJudgePrompt({ userPrompt, promptUnderTest, result, requirement });

      assert({
        given: 'result string',
        should: 'include result in output',
        actual: output.includes(result),
        expected: true
      });
    });

    test('includes ONE requirement', () => {
      const userPrompt = 'What is 2 + 2?';
      const promptUnderTest = 'You are a math helper.';
      const result = '4';
      const requirement = 'Given simple addition, should return correct answer';

      const output = buildJudgePrompt({ userPrompt, promptUnderTest, result, requirement });

      assert({
        given: 'requirement',
        should: 'include requirement in output',
        actual: output.includes(requirement),
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
      const requirement = 'Given simple addition, should return correct answer';

      const output = buildJudgePrompt({ userPrompt, promptUnderTest, result, requirement });

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
      const requirement = 'Given simple addition, should return correct answer';

      const output = buildJudgePrompt({ userPrompt, promptUnderTest, result, requirement });

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

      const error = Try(parseTAPYAML, invalidInput);

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
        should: 'throw ParseError',
        actual: error?.cause?.name,
        expected: 'ParseError'
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
        should: 'throw ValidationError',
        actual: error?.cause?.name,
        expected: 'ValidationError'
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
        should: 'throw ValidationError',
        actual: error?.cause?.name,
        expected: 'ValidationError'
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
        should: 'throw ValidationError',
        actual: error?.cause?.name,
        expected: 'ValidationError'
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

  describe('extractTests()', () => {
    test('orchestrates extraction via agent and returns structured data', async () => {
      const extractedData = {
        userPrompt: 'What is 2 + 2?',
        importPaths: ['package.json'], // Use existing file from project root
        assertions: [
          {
            id: 1,
            requirement: 'Given simple addition, should add correctly'
          }
        ]
      };

      // Node script that outputs the extracted data JSON, ignoring prompt input
      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const result = await extractTests({
        testContent: 'import "package.json"\n\n- Given simple addition, should add correctly',
        testFilePath: '/test/test.sudo',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'test content and a mock extraction agent',
        should: 'return object with userPrompt field',
        actual: result.userPrompt,
        expected: 'What is 2 + 2?'
      });

      assert({
        given: 'a successful extraction',
        should: 'return object with assertions array',
        actual: result.assertions.length,
        expected: 1
      });

      assert({
        given: 'a successful extraction',
        should: 'include assertion requirement',
        actual: result.assertions[0].requirement,
        expected: 'Given simple addition, should add correctly'
      });

      assert({
        given: 'a successful extraction',
        should: 'return object with promptUnderTest from imported file',
        actual: result.promptUnderTest.length > 0,
        expected: true
      });
    });

    test('passes the extraction prompt to the agent', async () => {
      const testContent = 'import "package.json"\n\nuserPrompt = """test"""\n\n- Given a unique marker xyzzy, should verify';

      const extractedData = {
        userPrompt: 'test prompt',
        importPaths: ['package.json'],
        assertions: [
          {
            id: 1,
            requirement: 'Given a unique marker xyzzy, should verify'
          }
        ]
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const result = await extractTests({
        testContent,
        testFilePath: '/test/test.sudo',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'test content with assertions',
        should: 'extract structured data',
        actual: result.assertions.length > 0,
        expected: true
      });

      assert({
        given: 'extraction result',
        should: 'include userPrompt field',
        actual: result.userPrompt !== undefined,
        expected: true
      });
    });

    test('throws when agent returns invalid extraction output', async () => {
      const mockAgentConfig = {
        command: 'node',
        args: ['-e', 'console.log(JSON.stringify({ not: "valid" }))']
      };

      const error = await Try(extractTests, {
        testContent: 'import "test.mdc"\n\n- Given a test, should pass',
        testFilePath: '/test/test.sudo',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'agent returns invalid extraction result',
        should: 'throw an extraction error',
        actual: error !== undefined,
        expected: true
      });
    });

    test('returns structured data with assertions', async () => {
      const extractedData = {
        userPrompt: 'What is 2+2?',
        importPaths: ['package.json'],
        assertions: [
          {
            id: 1,
            requirement: 'Given a test, should pass'
          }
        ]
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const result = await extractTests({
        testContent: 'import "package.json"\n\n- Given a test, should pass',
        testFilePath: '/test/test.sudo',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'extraction agent returns structured data',
        should: 'include userPrompt field',
        actual: result.userPrompt,
        expected: 'What is 2+2?'
      });

      assert({
        given: 'extraction result',
        should: 'include assertions array',
        actual: Array.isArray(result.assertions),
        expected: true
      });

      assert({
        given: 'assertion in result',
        should: 'include id field',
        actual: result.assertions[0].id,
        expected: 1
      });

      assert({
        given: 'assertion in result',
        should: 'include requirement field',
        actual: result.assertions[0].requirement,
        expected: 'Given a test, should pass'
      });
    });

    test('throws ValidationError when import file is missing', async () => {
      const extractedData = {
        userPrompt: 'test prompt',
        importPaths: ['nonexistent-file.mdc'],
        assertions: [
          {
            id: 1,
            requirement: 'Given a test, should pass'
          }
        ]
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const error = await Try(extractTests, {
        testContent: 'import "nonexistent-file.mdc"\n\n- Given test, should pass',
        testFilePath: '/test/test.sudo',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'import file that does not exist',
        should: 'throw ValidationError',
        actual: error?.cause?.name,
        expected: 'ValidationError'
      });

      assert({
        given: 'import file that does not exist',
        should: 'have PROMPT_READ_FAILED code',
        actual: error?.cause?.code,
        expected: 'PROMPT_READ_FAILED'
      });

      assert({
        given: 'import file that does not exist',
        should: 'preserve original error as cause',
        actual: error?.cause?.cause !== undefined,
        expected: true
      });
    });

    test('throws ValidationError when promptUnderTest is empty', async () => {
      const extractedData = {
        userPrompt: 'test prompt',
        importPaths: [],
        assertions: [
          {
            id: 1,
            requirement: 'Given a test, should pass'
          }
        ]
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const error = await Try(extractTests, {
        testContent: '- Given test, should pass',
        testFilePath: '/test/test.sudo',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'no promptUnderTest import declared',
        should: 'throw ValidationError',
        actual: error?.cause?.name,
        expected: 'ValidationError'
      });

      assert({
        given: 'no promptUnderTest import declared',
        should: 'have MISSING_PROMPT_UNDER_TEST code',
        actual: error?.cause?.code,
        expected: 'MISSING_PROMPT_UNDER_TEST'
      });
    });

    test('throws ValidationError when userPrompt is missing', async () => {
      const extractedData = {
        userPrompt: '',
        importPaths: ['package.json'],
        assertions: [
          {
            id: 1,
            requirement: 'Given a test, should pass'
          }
        ]
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const error = await Try(extractTests, {
        testContent: 'import "package.json"\n\n- Given test, should pass',
        testFilePath: '/test/test.sudo',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'empty userPrompt',
        should: 'throw ValidationError',
        actual: error?.cause?.name,
        expected: 'ValidationError'
      });

      assert({
        given: 'empty userPrompt',
        should: 'have MISSING_USER_PROMPT code',
        actual: error?.cause?.code,
        expected: 'MISSING_USER_PROMPT'
      });
    });

    test('throws ValidationError when no assertions found', async () => {
      const extractedData = {
        userPrompt: 'test prompt',
        importPaths: ['package.json'],
        assertions: []
      };

      const mockAgentConfig = {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
      };

      const error = await Try(extractTests, {
        testContent: 'import "package.json"\n\nuserPrompt = """test"""',
        testFilePath: '/test/test.sudo',
        agentConfig: mockAgentConfig,
        timeout: 5000
      });

      assert({
        given: 'empty assertions array',
        should: 'throw ValidationError',
        actual: error?.cause?.name,
        expected: 'ValidationError'
      });

      assert({
        given: 'empty assertions array',
        should: 'have NO_ASSERTIONS_FOUND code',
        actual: error?.cause?.code,
        expected: 'NO_ASSERTIONS_FOUND'
      });
    });

    test('E2E: reads real import files from disk', async () => {
      const testDir = createTempDir();

      try {
        mkdirSync(testDir, { recursive: true });

        // Create a real prompt file
        const promptFile = join(testDir, 'prompt.mdc');
        const promptContent = 'You are a helpful AI assistant. Be concise and accurate.';
        writeFileSync(promptFile, promptContent);

        // Create test file
        const testFile = join(testDir, 'test.sudo');
        const testContent = 'import "prompt.mdc"\n\n- Given a question, should answer';
        writeFileSync(testFile, testContent);

        const extractedData = {
          userPrompt: 'What is 2+2?',
          importPaths: ['prompt.mdc'],
          assertions: [
            { id: 1, requirement: 'Given a question, should answer' }
          ]
        };

        const mockAgentConfig = {
          command: 'node',
          args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
        };

        const result = await extractTests({
          testContent,
          testFilePath: testFile,
          agentConfig: mockAgentConfig,
          timeout: 5000,
          projectRoot: testDir
        });

        assert({
          given: 'real import file on disk',
          should: 'read and include file content in promptUnderTest',
          actual: result.promptUnderTest,
          expected: promptContent
        });

        assert({
          given: 'extraction with real files',
          should: 'return userPrompt from extraction',
          actual: result.userPrompt,
          expected: 'What is 2+2?'
        });

        assert({
          given: 'extraction with real files',
          should: 'return assertions array',
          actual: result.assertions.length,
          expected: 1
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('E2E: reads multiple import files and concatenates', async () => {
      const testDir = createTempDir();

      try {
        mkdirSync(testDir, { recursive: true });

        // Create multiple prompt files
        const prompt1 = join(testDir, 'rules1.mdc');
        const prompt2 = join(testDir, 'rules2.mdc');
        writeFileSync(prompt1, 'Rule 1: Be concise');
        writeFileSync(prompt2, 'Rule 2: Be accurate');

        const testFile = join(testDir, 'test.sudo');
        const testContent = 'import "rules1.mdc"\nimport "rules2.mdc"\n\n- Given rules, should follow';
        writeFileSync(testFile, testContent);

        const extractedData = {
          userPrompt: 'Test prompt',
          importPaths: ['rules1.mdc', 'rules2.mdc'],
          assertions: [
            { id: 1, requirement: 'Given rules, should follow' }
          ]
        };

        const mockAgentConfig = {
          command: 'node',
          args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
        };

        const result = await extractTests({
          testContent,
          testFilePath: testFile,
          agentConfig: mockAgentConfig,
          timeout: 5000,
          projectRoot: testDir
        });

        assert({
          given: 'multiple import files',
          should: 'concatenate all imported content',
          actual: result.promptUnderTest.includes('Rule 1') && result.promptUnderTest.includes('Rule 2'),
          expected: true
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('E2E: throws real ENOENT error for missing import file', async () => {
      const testDir = createTempDir();

      try {
        mkdirSync(testDir, { recursive: true });

        const testFile = join(testDir, 'test.sudo');
        const testContent = 'import "nonexistent.mdc"\n\n- Given test, should pass';
        writeFileSync(testFile, testContent);

        const extractedData = {
          userPrompt: 'Test',
          importPaths: ['nonexistent.mdc'],
          assertions: [
            { id: 1, requirement: 'Given test, should pass' }
          ]
        };

        const mockAgentConfig = {
          command: 'node',
          args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
        };

        const error = await Try(extractTests, {
          testContent,
          testFilePath: testFile,
          agentConfig: mockAgentConfig,
          timeout: 5000
        });

        assert({
          given: 'missing import file (real ENOENT)',
          should: 'throw ValidationError',
          actual: error?.cause?.name,
          expected: 'ValidationError'
        });

        assert({
          given: 'missing import file (real ENOENT)',
          should: 'have PROMPT_READ_FAILED code',
          actual: error?.cause?.code,
          expected: 'PROMPT_READ_FAILED'
        });

        assert({
          given: 'missing import file (real ENOENT)',
          should: 'preserve original ENOENT error as cause',
          actual: error?.cause?.cause?.code,
          expected: 'ENOENT'
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('E2E: validates real extraction output structure', async () => {
      const testDir = createTempDir();

      try {
        mkdirSync(testDir, { recursive: true });

        const promptFile = join(testDir, 'prompt.mdc');
        writeFileSync(promptFile, 'Test prompt content');

        const testFile = join(testDir, 'test.sudo');
        const testContent = 'import "prompt.mdc"\n\n- Test assertion';
        writeFileSync(testFile, testContent);

        // Valid extraction result that parseExtractionResult will validate
        const validExtractionResult = {
          userPrompt: 'What is 2+2?',
          importPaths: ['prompt.mdc'],
          assertions: [
            { id: 1, requirement: 'Test assertion' }
          ]
        };

        const mockAgentConfig = {
          command: 'node',
          args: ['-e', `console.log(JSON.stringify(${JSON.stringify(validExtractionResult)}))`]
        };

        const result = await extractTests({
          testContent,
          testFilePath: testFile,
          agentConfig: mockAgentConfig,
          timeout: 5000,
          projectRoot: testDir
        });

        assert({
          given: 'valid extraction output from agent',
          should: 'successfully parse and validate structure',
          actual: typeof result === 'object' && result !== null,
          expected: true
        });

        assert({
          given: 'valid extraction output',
          should: 'have userPrompt field',
          actual: result.userPrompt,
          expected: 'What is 2+2?'
        });

        assert({
          given: 'valid extraction output',
          should: 'have promptUnderTest with file content',
          actual: result.promptUnderTest,
          expected: 'Test prompt content'
        });

        assert({
          given: 'valid extraction output',
          should: 'have assertions array',
          actual: Array.isArray(result.assertions) && result.assertions.length > 0,
          expected: true
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('E2E: resolves imports relative to project root', async () => {
      const testDir = createTempDir();

      try {
        mkdirSync(testDir, { recursive: true });
        const nestedDir = join(testDir, 'nested', 'deep');
        mkdirSync(nestedDir, { recursive: true });

        // Create prompt at project root level
        const promptFile = join(testDir, 'root-prompt.mdc');
        writeFileSync(promptFile, 'Root level prompt');

        // Create test file in nested directory
        const testFile = join(nestedDir, 'test.sudo');
        const testContent = 'import "root-prompt.mdc"\n\n- Test';
        writeFileSync(testFile, testContent);

        const extractedData = {
          userPrompt: 'Test',
          importPaths: ['root-prompt.mdc'],
          assertions: [
            { id: 1, requirement: 'Test' }
          ]
        };

        const mockAgentConfig = {
          command: 'node',
          args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
        };

        const result = await extractTests({
          testContent,
          testFilePath: testFile,
          agentConfig: mockAgentConfig,
          timeout: 5000,
          projectRoot: testDir
        });

        assert({
          given: 'import path relative to project root',
          should: 'resolve and read file correctly',
          actual: result.promptUnderTest,
          expected: 'Root level prompt'
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('allows imports outside project root', async () => {
      const testDir = createTempDir();

      try {
        mkdirSync(testDir, { recursive: true });

        // Create a prompt file OUTSIDE the test project directory
        const externalDir = join(testDir, 'external');
        mkdirSync(externalDir, { recursive: true });
        const externalPrompt = join(externalDir, 'shared-prompt.mdc');
        writeFileSync(externalPrompt, 'External shared prompt content');

        // Create project directory separate from external prompt
        const projectDir = join(testDir, 'project');
        mkdirSync(projectDir, { recursive: true });
        const testFile = join(projectDir, 'test.sudo');

        // Import path goes OUTSIDE projectRoot (up and over to external)
        const testContent = 'import "../external/shared-prompt.mdc"\n\n- Given test, should pass';
        writeFileSync(testFile, testContent);

        const extractedData = {
          userPrompt: 'test',
          importPaths: ['../external/shared-prompt.mdc'],
          assertions: [
            { id: 1, requirement: 'Given test, should pass' }
          ]
        };

        const mockAgentConfig = {
          command: 'node',
          args: ['-e', `console.log(JSON.stringify(${JSON.stringify(extractedData)}))`]
        };

        const result = await extractTests({
          testContent,
          testFilePath: testFile,
          agentConfig: mockAgentConfig,
          timeout: 5000,
          projectRoot: projectDir
        });

        assert({
          given: 'import path outside project root',
          should: 'resolve and read the external file',
          actual: result.promptUnderTest,
          expected: 'External shared prompt content'
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });
});
