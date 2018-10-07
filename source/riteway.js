const tape = require('tape');

const noop = new Function();

// The testing library: a thin wrapper around tape
const describe = (unit = '', cb = noop) => tape(unit, test => {
  const end = test.end.bind(test);

  const assert = ({
    // initialize values to undefined so TypeScript doesn't complain
    given = undefined,
    should = '',
    actual = undefined,
    expected = undefined
  } = {}) => {
    test.same(
      actual, expected,
      `Given ${given}: should ${should}`
    );
  };

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
