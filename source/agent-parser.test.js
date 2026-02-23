import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import {
  parseStringResult,
  parseOpenCodeNDJSON,
  unwrapEnvelope,
  unwrapAgentResult
} from './agent-parser.js';
import { handleAIErrors, allNoop } from './ai-errors.js';

describe('parseStringResult()', () => {
  test('parses direct JSON when string starts with {', () => {
    const logger = { log: () => {} };
    const input = '{"passed": true, "output": "test"}';

    const result = parseStringResult(input, logger);

    assert({
      given: 'JSON string starting with {',
      should: 'parse as JSON object',
      actual: result,
      expected: { passed: true, output: 'test' }
    });
  });

  test('parses direct JSON when string starts with [', () => {
    const logger = { log: () => {} };
    const input = '[{"id": 1}, {"id": 2}]';

    const result = parseStringResult(input, logger);

    assert({
      given: 'JSON string starting with [',
      should: 'parse as JSON array',
      actual: result,
      expected: [{ id: 1 }, { id: 2 }]
    });
  });

  test('extracts markdown-wrapped JSON when direct parse fails', () => {
    const logger = { log: () => {} };
    const input = '```json\n{"passed": true, "output": "test"}\n```';

    const result = parseStringResult(input, logger);

    assert({
      given: 'markdown-wrapped JSON',
      should: 'extract and parse JSON',
      actual: result,
      expected: { passed: true, output: 'test' }
    });
  });

  test('extracts markdown-wrapped JSON without json language tag', () => {
    const logger = { log: () => {} };
    const input = '```\n{"passed": true}\n```';

    const result = parseStringResult(input, logger);

    assert({
      given: 'markdown without json tag',
      should: 'extract and parse JSON',
      actual: result,
      expected: { passed: true }
    });
  });

  test('tries markdown extraction even if string starts with {', () => {
    const logger = { log: () => {} };
    const input = '{ broken json ```json\n{"passed": true}\n```';

    const result = parseStringResult(input, logger);

    assert({
      given: 'malformed JSON with markdown fallback',
      should: 'extract from markdown block',
      actual: result,
      expected: { passed: true }
    });
  });

  test('returns plain text when no parsing succeeds', () => {
    const logger = { log: () => {} };
    const input = 'This is just plain text with no JSON';

    const result = parseStringResult(input, logger);

    assert({
      given: 'plain text string',
      should: 'return original string',
      actual: result,
      expected: input
    });
  });

  test('handles malformed markdown gracefully', () => {
    const logger = { log: () => {} };
    const input = '```json\n{ broken: json }\n```';

    const result = parseStringResult(input, logger);

    assert({
      given: 'markdown with invalid JSON',
      should: 'return original string',
      actual: result,
      expected: input
    });
  });

  test('trims whitespace before parsing', () => {
    const logger = { log: () => {} };
    const input = '  \n  {"passed": true}  \n  ';

    const result = parseStringResult(input, logger);

    assert({
      given: 'JSON with surrounding whitespace',
      should: 'return parsed object matching trimmed input',
      actual: result,
      expected: { passed: true }
    });
  });
});

describe('parseOpenCodeNDJSON()', () => {
  test('extracts text from single text event', () => {
    const logger = { log: () => {} };
    const ndjson = '{"type":"step_start","timestamp":1770245956364}\n' +
        '{"type":"text","part":{"text":"```json\\n{\\"status\\": \\"ok\\"}\\n```"}}\n' +
        '{"type":"step_finish","timestamp":1770245956211}';

    const result = parseOpenCodeNDJSON(ndjson, logger);

    assert({
      given: 'NDJSON with single text event',
      should: 'extract text content',
      actual: result,
      expected: '```json\n{"status": "ok"}\n```'
    });
  });

  test('concatenates multiple text events', () => {
    const logger = { log: () => {} };
    const ndjson = '{"type":"text","part":{"text":"Part 1"}}\n' +
        '{"type":"text","part":{"text":" Part 2"}}\n' +
        '{"type":"text","part":{"text":" Part 3"}}';

    const result = parseOpenCodeNDJSON(ndjson, logger);

    assert({
      given: 'NDJSON with multiple text events',
      should: 'concatenate all text content',
      actual: result,
      expected: 'Part 1 Part 2 Part 3'
    });
  });

  test('filters out non-text events', () => {
    const logger = { log: () => {} };
    const ndjson = '{"type":"step_start","data":"ignored"}\n' +
        '{"type":"text","part":{"text":"Hello"}}\n' +
        '{"type":"step_finish","data":"ignored"}\n' +
        '{"type":"text","part":{"text":" World"}}';

    const result = parseOpenCodeNDJSON(ndjson, logger);

    assert({
      given: 'NDJSON with mixed event types',
      should: 'extract only text events',
      actual: result,
      expected: 'Hello World'
    });
  });

  test('skips malformed JSON lines', () => {
    const logger = { log: () => {} };
    const ndjson = '{invalid json}\n' +
        '{"type":"text","part":{"text":"Valid text"}}\n' +
        'not json at all';

    const result = parseOpenCodeNDJSON(ndjson, logger);

    assert({
      given: 'NDJSON with malformed lines',
      should: 'skip invalid lines and process valid ones',
      actual: result,
      expected: 'Valid text'
    });
  });

  test('throws error when no text events found', () => {
    const logger = { log: () => {} };
    const ndjson = '{"type":"step_start","data":"no text here"}\n' +
        '{"type":"step_finish","data":"still no text"}';

    const error = Try(parseOpenCodeNDJSON, ndjson, logger);

    const invoked = [];
    handleAIErrors({ ...allNoop, ParseError: () => invoked.push('ParseError') })(error);

    assert({
      given: 'NDJSON with no text events',
      should: 'throw an error that routes to the ParseError handler',
      actual: invoked,
      expected: ['ParseError']
    });
  });

  test('handles empty lines in NDJSON', () => {
    const logger = { log: () => {} };
    const ndjson = '\n\n{"type":"text","part":{"text":"Hello"}}\n\n\n{"type":"text","part":{"text":" World"}}\n\n';

    const result = parseOpenCodeNDJSON(ndjson, logger);

    assert({
      given: 'NDJSON with empty lines',
      should: 'filter empty lines and process valid events',
      actual: result,
      expected: 'Hello World'
    });
  });

  test('preserves markdown-wrapped JSON in text', () => {
    const logger = { log: () => {} };
    const ndjson = '{"type":"text","part":{"text":"```json\\n{\\"passed\\":true}\\n```"}}';

    const result = parseOpenCodeNDJSON(ndjson, logger);

    assert({
      given: 'text event with markdown-wrapped JSON',
      should: 'preserve markdown formatting',
      actual: result,
      expected: '```json\n{"passed":true}\n```'
    });
  });
});

describe('unwrapEnvelope()', () => {
  test.each([
    ['object with result field', { result: { passed: true } }, { passed: true }],
    ['object with result as string', { result: 'raw string' }, 'raw string'],
    ['object with result as null', { result: null }, null],
    ['object without result field', { passed: true, score: 80 }, { passed: true, score: 80 }],
  ])('%s', (_, input, expected) => {
    assert({
      given: _,
      should: 'return the unwrapped value',
      actual: unwrapEnvelope(input),
      expected
    });
  });
});

describe('unwrapAgentResult()', () => {
  test('unwraps Claude envelope and returns parsed inner object', () => {
    const logger = { log: () => {} };
    const envelope = JSON.stringify({ result: JSON.stringify({ passed: true, score: 90 }) });

    const result = unwrapAgentResult(envelope, logger);

    assert({
      given: 'Claude CLI envelope wrapping a JSON string',
      should: 'return the fully parsed inner object',
      actual: result,
      expected: { passed: true, score: 90 }
    });
  });

  test('returns parsed object when no envelope present', () => {
    const logger = { log: () => {} };
    const direct = JSON.stringify({ passed: false, score: 40 });

    const result = unwrapAgentResult(direct, logger);

    assert({
      given: 'direct JSON object (no envelope)',
      should: 'return the parsed object',
      actual: result,
      expected: { passed: false, score: 40 }
    });
  });

  test('throws ParseError when output is not valid JSON', () => {
    const logger = { log: () => {} };

    const error = Try(unwrapAgentResult, 'plain text response', logger);

    const invoked = [];
    handleAIErrors({ ...allNoop, ParseError: () => invoked.push('ParseError') })(error);

    assert({
      given: 'plain text that is not valid JSON',
      should: 'throw an error that routes to the ParseError handler',
      actual: invoked,
      expected: ['ParseError']
    });
  });

  test('handles markdown-wrapped envelope', () => {
    const logger = { log: () => {} };
    const markdownEnvelope = '```json\n{"result": {"passed": true}}\n```';

    const result = unwrapAgentResult(markdownEnvelope, logger);

    assert({
      given: 'markdown-wrapped JSON with result envelope',
      should: 'extract, unwrap and return the inner object',
      actual: result,
      expected: { passed: true }
    });
  });
});
