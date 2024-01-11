import React from 'react';
import { describe } from "vitest";
import { Try, countKeys, createStream } from './riteway';
import { assert } from './vitest';
import match from './match';
import render from './render-component';

// a function to test
const sum = (...args) => {
  if (args.some(v => Number.isNaN(v))) throw new TypeError('NaN');
  return args.reduce((acc, n) => acc + n, 0);
};

describe('sum()', () => {
  const should = 'return the correct sum';

  assert({
    given: 'no arguments',
    should: 'return 0',
    actual: sum(),
    expected: 0
  });

  assert({
    given: 'zero',
    should,
    actual: sum(2, 0),
    expected: 2
  });

  assert({
    given: 'negative numbers',
    should,
    actual: sum(1, -4),
    expected: -3
  });

  assert({
    given: 'NaN',
    should: 'throw',
    actual: Try(sum, 1, NaN),
    expected: new TypeError('NaN')
  });
});

describe('createStream()', () => {
  assert({
    given: 'typeof check',
    should: 'be a function',
    actual: typeof createStream,
    expected: 'function'
  });
});

describe('Try()', async () => {
  {
    const error = new Error('ooops');
    assert({
      given: 'an async function that throws',
      should: 'await and return the value of the error',
      actual: (await Try(async () => { throw error; }, 'irrelivant')).toString(),
      expected: error.toString()
    });
  }
});

describe('assert()', () => {
  assert({
    given: 'some key is undefined',
    should: 'not throw',
    actual: undefined,
    expected: undefined
  });

  {
    try {
      assert({});
    } catch (error) {
      assert({
        given: 'calling `assert` with missing keys',
        should: 'throw with missing keys',
        actual: error.message,
        expected: 'The following parameters are required by `assert`: given, should, actual, expected',
      });
    }
  }

  {
    try {
      assert({ given: 'some keys', should: 'find the missing keys' });
    } catch (error) {
      assert({
        given: 'calling `assert` with missing keys',
        should: 'throw with missing keys',
        actual: error.message,
        expected: 'The following parameters are required by `assert`: actual, expected',
      });
    }
  }
});

describe('countKeys()', () => {
  assert({
    given: 'an object',
    should: 'return the number of own props in the object',
    actual: countKeys({ a: 'a', b: 'b', c: 'c' }),
    expected: 3
  });
});

{
  // @ts-ignore
  // eslint-disable-next-line
  const MyComponent = ({text}) => <div className="contents">{text}</div>;

  describe('renderComponent', async () => {
    const text = 'Test for whatever you like!';
    const $ = render(<MyComponent text={ text }/>);
    const contains = match($('.contents').html());

    assert({
      given: 'A react component',
      should: 'return a working cheerio instance',
      actual: contains(text),
      expected: text
    });
  });
}