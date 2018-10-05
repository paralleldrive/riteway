const { describe, Try, createStream } = require('./riteway');

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

describe('synchronous assert()', ({assert, end}) => {

  assert({
    given: 'synchronous function taking end()',
    should: 'end the test when end() is called'
  });

  end();
});

describe('createStream()', async assert => {
  assert({
    given: 'typeof check',
    should: 'be a function',
    actual: typeof createStream,
    expected: 'function'
  });
});