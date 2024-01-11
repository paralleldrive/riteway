
import { describe } from "vitest";
import { Try, countKeys, createStream } from './riteway';
import { vitestAssert } from './vitest';

// a function to test
const sum = (...args) => {
  if (args.some(v => Number.isNaN(v))) throw new TypeError('NaN');
  return args.reduce((acc, n) => acc + n, 0);
};

describe('sum()', () => {
  const should = 'return the correct sum';

  vitestAssert({
    given: 'no arguments',
    should: 'return 0',
    actual: sum(),
    expected: 0
  });

  vitestAssert({
    given: 'zero',
    should,
    actual: sum(2, 0),
    expected: 2
  });

  vitestAssert({
    given: 'negative numbers',
    should,
    actual: sum(1, -4),
    expected: -3
  });

  vitestAssert({
    given: 'NaN',
    should: 'throw',
    actual: Try(sum, 1, NaN),
    expected: new TypeError('NaN')
  });
});

describe('createStream()', () => {
  vitestAssert({
    given: 'typeof check',
    should: 'be a function',
    actual: typeof createStream,
    expected: 'function'
  });
});

describe('Try()', async () => {
  {
    const error = new Error('ooops');
    vitestAssert({
      given: 'an async function that throws',
      should: 'await and return the value of the error',
      actual: (await Try(async () => { throw error; }, 'irrelivant')).toString(),
      expected: error.toString()
    });
  }
});

describe('vitestAssert()', () => {
  vitestAssert({
    given: 'some key is undefined',
    should: 'not throw',
    actual: undefined,
    expected: undefined
  });

  {
    try {
      vitestAssert({});
    } catch (error) {
      vitestAssert({
        given: 'calling `vitestAssert` with missing keys',
        should: 'throw with missing keys',
        actual: error.message,
        expected: 'The following parameters are required by `vitestAssert`: given, should, actual, expected',
      });
    }
  }

  {
    try {
      vitestAssert({ given: 'some keys', should: 'find the missing keys' });
    } catch (error) {
      vitestAssert({
        given: 'calling `vitestAssert` with missing keys',
        should: 'throw with missing keys',
        actual: error.message,
        expected: 'The following parameters are required by `vitestAssert`: actual, expected',
      });
    }
  }
});

describe('countKeys()', () => {
  vitestAssert({
    given: 'an object',
    should: 'return the number of own props in the object',
    actual: countKeys({ a: 'a', b: 'b', c: 'c' }),
    expected: 3
  });
});