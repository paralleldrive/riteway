const tape = require('tape');

const noop = new Function();

// The testing library: a thin wrapper around tape
const describe = (unit = '', cb = noop) => tape(unit, test => {
  const end = test.end.bind(test);

  const assert = ({
    given,
    should = '',
    actual,
    expected
  } = {}) => {
    test.same(
      actual, expected,
      `Given ${given}: should ${should}`
    );
  };
  assert.end = end;
  assert.assert = assert;

  const result = cb(assert);

  if (result && result.then) result.then(end);
});

const Try = (fn = noop, ...args) => {
  try {
    return fn(...args);
  } catch (err) {
    return err;
  }
};

const createStream = tape.createStream.bind(tape);

module.exports = { describe, Try, createStream };
