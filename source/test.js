import { describe, Try, createStream } from './riteway';
import render from './render-component';
import renderPreact from './render-preact-component';
import tape from 'tape';
import React from 'react';
import { h } from 'preact';

// a function to test
const sum = (...args) => {
  if (args.some(v => Number.isNaN(v))) throw new TypeError('NaN');
  return args.reduce((acc, n) => acc + n, 0);
};

describe('sum()', async assert => {
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

describe('describe()', (assert, end) => {
  setTimeout(() => {
    assert({
      given: 'TestFunction using end()',
      should: 'pass end()',
      actual: typeof end,
      expected: 'function'
    });
  }, 20);

  setTimeout(() => {
    end();
  }, 50);
});

describe('createStream()', async assert => {
  assert({
    given: 'typeof check',
    should: 'be a function',
    actual: typeof createStream,
    expected: 'function'
  });
});

describe('Try()', async assert => {
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

describe('skip()', async assert => {
  assert({
    given: 'describe.skip',
    should: 'be equal to tape.skip',
    actual: describe.skip === tape.skip,
    expected: true
  });
});

describe('renderComponent', async assert => {
  const text = 'Foo';
  const $ = render(<div className="foo">{ text }</div>);

  assert({
    given: 'A react component',
    should: 'return a working cheerio instance',
    actual: $('.foo').html().trim(),
    expected: text
  });
});

describe('renderPreactComponent', async assert => {
  const text = 'Foo';
  const $ = renderPreact(h('div', { class: 'foo' }, text));

  assert({
    given: 'A preact component',
    should: 'return a working cheerio instance',
    actual: $('.foo').html().trim(),
    expected: text
  });
});