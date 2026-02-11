import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import {
  parseStringResult,
  parseOpenCodeNDJSON
} from './agent-parser.js';

describe('agent-parser', () => {
  describe('parseStringResult()', () => {
    const createMockLogger = () => {
      const logs = [];
      return {
        log: (...args) => logs.push(args.join(' ')),
        logs
      };
    };

    test('parses direct JSON when string starts with {', () => {
      const logger = createMockLogger();
      const input = '{"passed": true, "output": "test"}';

      const result = parseStringResult(input, logger);

      assert({
        given: 'JSON string starting with {',
        should: 'parse as JSON object',
        actual: JSON.stringify(result),
        expected: '{"passed":true,"output":"test"}'
      });

      assert({
        given: 'successful JSON parse',
        should: 'log success message',
        actual: logger.logs.some(log => log.includes('Successfully parsed string as JSON')),
        expected: true
      });
    });

    test('parses direct JSON when string starts with [', () => {
      const logger = createMockLogger();
      const input = '[{"id": 1}, {"id": 2}]';

      const result = parseStringResult(input, logger);

      assert({
        given: 'JSON string starting with [',
        should: 'parse as JSON array',
        actual: result.length,
        expected: 2
      });
    });

    test('extracts markdown-wrapped JSON when direct parse fails', () => {
      const logger = createMockLogger();
      const input = '```json\n{"passed": true, "output": "test"}\n```';

      const result = parseStringResult(input, logger);

      assert({
        given: 'markdown-wrapped JSON',
        should: 'extract and parse JSON',
        actual: JSON.stringify(result),
        expected: '{"passed":true,"output":"test"}'
      });

      assert({
        given: 'markdown extraction',
        should: 'log markdown extraction',
        actual: logger.logs.some(log => log.includes('markdown-wrapped JSON')),
        expected: true
      });
    });

    test('extracts markdown-wrapped JSON without json language tag', () => {
      const logger = createMockLogger();
      const input = '```\n{"passed": true}\n```';

      const result = parseStringResult(input, logger);

      assert({
        given: 'markdown without json tag',
        should: 'extract and parse JSON',
        actual: result.passed,
        expected: true
      });
    });

    test('tries markdown extraction even if string starts with {', () => {
      const logger = createMockLogger();
      // Intentionally malformed JSON that starts with { but isn't valid
      const input = '{ broken json ```json\n{"passed": true}\n```';

      const result = parseStringResult(input, logger);

      assert({
        given: 'malformed JSON with markdown fallback',
        should: 'extract from markdown block',
        actual: result.passed,
        expected: true
      });

      assert({
        given: 'fallback scenario',
        should: 'log failed parse and markdown extraction',
        actual: logger.logs.some(log => log.includes('trying markdown extraction')),
        expected: true
      });
    });

    test('returns plain text when no parsing succeeds', () => {
      const logger = createMockLogger();
      const input = 'This is just plain text with no JSON';

      const result = parseStringResult(input, logger);

      assert({
        given: 'plain text string',
        should: 'return original string',
        actual: result,
        expected: input
      });

      assert({
        given: 'no valid JSON',
        should: 'log keeping as plain text',
        actual: logger.logs.some(log => log.includes('keeping as plain text')),
        expected: true
      });
    });

    test('handles malformed markdown gracefully', () => {
      const logger = createMockLogger();
      const input = '```json\n{ broken: json }\n```';

      const result = parseStringResult(input, logger);

      assert({
        given: 'markdown with invalid JSON',
        should: 'return original string',
        actual: result,
        expected: input
      });

      assert({
        given: 'failed markdown parse',
        should: 'log failure',
        actual: logger.logs.some(log => log.includes('Failed to parse markdown content')),
        expected: true
      });
    });

    test('trims whitespace before parsing', () => {
      const logger = createMockLogger();
      const input = '  \n  {"passed": true}  \n  ';

      const result = parseStringResult(input, logger);

      assert({
        given: 'JSON with surrounding whitespace',
        should: 'parse successfully',
        actual: result.passed,
        expected: true
      });
    });
  });

  describe('parseOpenCodeNDJSON()', () => {
    const createMockLogger = () => {
      const logs = [];
      return {
        log: (...args) => logs.push(args.join(' ')),
        logs
      };
    };

    test('extracts text from single text event', () => {
      const logger = createMockLogger();
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

      assert({
        given: 'successful text extraction',
        should: 'log found text event',
        actual: logger.logs.some(log => log.includes('Found text event')),
        expected: true
      });
    });

    test('concatenates multiple text events', () => {
      const logger = createMockLogger();
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
      const logger = createMockLogger();
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
      const logger = createMockLogger();
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

      assert({
        given: 'malformed JSON',
        should: 'log warning for failed parse',
        actual: logger.logs.some(log => log.includes('Failed to parse NDJSON line')),
        expected: true
      });
    });

    test('throws error when no text events found', () => {
      const logger = createMockLogger();
      const ndjson = '{"type":"step_start","data":"no text here"}\n' +
        '{"type":"step_finish","data":"still no text"}';

      const error = Try(parseOpenCodeNDJSON, ndjson, logger);

      assert({
        given: 'NDJSON with no text events',
        should: 'throw Error with cause',
        actual: error instanceof Error && error.cause !== undefined,
        expected: true
      });

      assert({
        given: 'NDJSON with no text events',
        should: 'have ParseError name in cause',
        actual: error?.cause?.name,
        expected: 'ParseError'
      });

      assert({
        given: 'NDJSON with no text events',
        should: 'have NO_TEXT_EVENTS code in cause',
        actual: error?.cause?.code,
        expected: 'NO_TEXT_EVENTS'
      });

      assert({
        given: 'NDJSON with no text events',
        should: 'include ndjsonLength in cause',
        actual: typeof error?.cause?.ndjsonLength === 'number',
        expected: true
      });

      assert({
        given: 'NDJSON with no text events',
        should: 'include linesProcessed in cause',
        actual: error?.cause?.linesProcessed,
        expected: 2
      });
    });

    test('handles empty lines in NDJSON', () => {
      const logger = createMockLogger();
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
      const logger = createMockLogger();
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
});
