import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { aiTestOptionsSchema } from './constants.js';

describe('aiTestOptionsSchema', () => {
  test('applies default values at parse time', () => {
    const result = aiTestOptionsSchema.parse({ filePath: 'test.sudo' });

    assert({
      given: 'minimal options with only filePath',
      should: 'apply default runs',
      actual: result.runs,
      expected: 4
    });

    assert({
      given: 'minimal options with only filePath',
      should: 'apply default threshold',
      actual: result.threshold,
      expected: 75
    });

    assert({
      given: 'minimal options with only filePath',
      should: 'apply default agent',
      actual: result.agent,
      expected: 'claude'
    });
  });

  test('applies lazy cwd default at parse time', () => {
    const result = aiTestOptionsSchema.parse({ filePath: 'test.sudo' });

    assert({
      given: 'options without cwd',
      should: 'default cwd to current working directory',
      actual: result.cwd,
      expected: process.cwd()
    });
  });
});
