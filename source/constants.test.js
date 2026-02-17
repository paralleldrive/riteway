import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { 
  defaults, 
  constraints,
  runsSchema, 
  thresholdSchema,
  concurrencySchema,
  timeoutSchema,
  agentSchema,
  calculateRequiredPassesSchema 
} from './constants.js';

describe('constants module', () => {
  describe('defaults', () => {
    test('exports standard test configuration', () => {
      assert({
        given: 'defaults export',
        should: 'contain runs value',
        actual: defaults.runs,
        expected: 4
      });

      assert({
        given: 'defaults export',
        should: 'contain threshold value',
        actual: defaults.threshold,
        expected: 75
      });

      assert({
        given: 'defaults export',
        should: 'contain timeout in milliseconds',
        actual: defaults.timeoutMs,
        expected: 300_000
      });
    });
  });

  describe('constraints', () => {
    test('defines validation boundaries', () => {
      assert({
        given: 'constraints export',
        should: 'define threshold min/max',
        actual: [constraints.thresholdMin, constraints.thresholdMax],
        expected: [0, 100]
      });

      assert({
        given: 'constraints export',
        should: 'list supported agents',
        actual: constraints.supportedAgents,
        expected: ['claude', 'opencode', 'cursor']
      });
    });
  });

  describe('runsSchema', () => {
    test('accepts positive integers', () => {
      const result = runsSchema.safeParse(5);
      
      assert({
        given: 'positive integer 5',
        should: 'pass validation',
        actual: result.success,
        expected: true
      });

      assert({
        given: 'positive integer 5',
        should: 'return parsed value',
        actual: result.data,
        expected: 5
      });
    });

    test('rejects zero', () => {
      const result = runsSchema.safeParse(0);
      
      assert({
        given: 'zero runs',
        should: 'fail validation',
        actual: result.success,
        expected: false
      });
    });

    test('rejects negative numbers', () => {
      const result = runsSchema.safeParse(-5);
      
      assert({
        given: 'negative runs',
        should: 'fail validation',
        actual: result.success,
        expected: false
      });
    });

    test('rejects non-integers', () => {
      const result = runsSchema.safeParse(3.5);
      
      assert({
        given: 'decimal runs',
        should: 'fail validation',
        actual: result.success,
        expected: false
      });
    });

    test('rejects NaN', () => {
      const result = runsSchema.safeParse(NaN);
      
      assert({
        given: 'NaN runs',
        should: 'fail validation',
        actual: result.success,
        expected: false
      });
    });

    test('rejects runs above maximum', () => {
      const result = runsSchema.safeParse(10000);
      
      assert({
        given: 'runs above maximum (10000)',
        should: 'fail validation',
        actual: result.success,
        expected: false
      });
      
      assert({
        given: 'runs above maximum (10000)',
        should: 'include max constraint in error message',
        actual: result.error?.issues[0]?.message.includes('1000'),
        expected: true
      });
    });

    test('accepts runs at maximum boundary', () => {
      const result = runsSchema.safeParse(1000);
      
      assert({
        given: 'runs at maximum (1000)',
        should: 'pass validation',
        actual: result.success,
        expected: true
      });
    });
  });

  describe('thresholdSchema', () => {
    test('accepts valid percentages', () => {
      const result = thresholdSchema.safeParse(75);
      
      assert({
        given: 'threshold 75',
        should: 'pass validation',
        actual: result.success,
        expected: true
      });
    });

    test('accepts boundary value 0', () => {
      const result = thresholdSchema.safeParse(0);
      
      assert({
        given: 'threshold 0',
        should: 'pass validation',
        actual: result.success,
        expected: true
      });
    });

    test('accepts boundary value 100', () => {
      const result = thresholdSchema.safeParse(100);
      
      assert({
        given: 'threshold 100',
        should: 'pass validation',
        actual: result.success,
        expected: true
      });
    });

    test('rejects values below 0', () => {
      const result = thresholdSchema.safeParse(-1);
      
      assert({
        given: 'threshold -1',
        should: 'fail validation',
        actual: result.success,
        expected: false
      });
    });

    test('rejects values above 100', () => {
      const result = thresholdSchema.safeParse(101);
      
      assert({
        given: 'threshold 101',
        should: 'fail validation',
        actual: result.success,
        expected: false
      });
    });

    test('rejects NaN', () => {
      const result = thresholdSchema.safeParse(NaN);
      
      assert({
        given: 'threshold NaN',
        should: 'fail validation',
        actual: result.success,
        expected: false
      });
    });

    test('rejects Infinity', () => {
      const result = thresholdSchema.safeParse(Infinity);
      
      assert({
        given: 'threshold Infinity',
        should: 'fail validation',
        actual: result.success,
        expected: false
      });
    });
  });

  describe('concurrencySchema', () => {
    test('accepts positive integers', () => {
      const result = concurrencySchema.safeParse(4);
      
      assert({
        given: 'concurrency 4',
        should: 'pass validation',
        actual: result.success,
        expected: true
      });
    });

    test('rejects zero', () => {
      const result = concurrencySchema.safeParse(0);
      
      assert({
        given: 'concurrency 0',
        should: 'fail validation',
        actual: result.success,
        expected: false
      });
    });
  });

  describe('timeoutSchema', () => {
    test('accepts valid timeout values', () => {
      const result = timeoutSchema.safeParse(30000);
      
      assert({
        given: 'timeout 30000ms',
        should: 'pass validation',
        actual: result.success,
        expected: true
      });
    });

    test('rejects timeout below minimum', () => {
      const result = timeoutSchema.safeParse(500);
      
      assert({
        given: 'timeout 500ms (below minimum)',
        should: 'fail validation',
        actual: result.success,
        expected: false
      });
    });

    test('rejects timeout above maximum', () => {
      const result = timeoutSchema.safeParse(4_000_000);
      
      assert({
        given: 'timeout 4000000ms (above maximum)',
        should: 'fail validation',
        actual: result.success,
        expected: false
      });
    });
  });

  describe('agentSchema', () => {
    test('accepts supported agent types', () => {
      const claudeResult = agentSchema.safeParse('claude');
      const opencodeResult = agentSchema.safeParse('opencode');
      const cursorResult = agentSchema.safeParse('cursor');
      
      assert({
        given: 'supported agent names',
        should: 'pass validation for all',
        actual: [claudeResult.success, opencodeResult.success, cursorResult.success],
        expected: [true, true, true]
      });
    });

    test('rejects unsupported agent types', () => {
      const result = agentSchema.safeParse('unsupported');
      
      assert({
        given: 'unsupported agent name',
        should: 'fail validation',
        actual: result.success,
        expected: false
      });
    });

    test('provides helpful error message', () => {
      const result = agentSchema.safeParse('invalid');
      
      assert({
        given: 'invalid agent',
        should: 'include supported agents in error',
        actual: result.error?.issues?.[0]?.message?.includes('claude'),
        expected: true
      });
    });
  });

  describe('calculateRequiredPassesSchema', () => {
    test('validates complete object with defaults', () => {
      const result = calculateRequiredPassesSchema.parse({
        runs: 5,
        threshold: 80
      });
      
      assert({
        given: 'valid runs and threshold',
        should: 'return validated object',
        actual: result,
        expected: { runs: 5, threshold: 80 }
      });
    });

    test('reports multiple validation errors', () => {
      const result = calculateRequiredPassesSchema.safeParse({
        runs: -1,
        threshold: 150
      });
      
      assert({
        given: 'invalid runs and threshold',
        should: 'fail validation',
        actual: result.success,
        expected: false
      });

      assert({
        given: 'multiple validation errors',
        should: 'report both issues',
        actual: result.error?.issues?.length,
        expected: 2
      });
    });
  });
});
