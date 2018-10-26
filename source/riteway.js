const tape = require('tape');

const noop = new Function();

// The testing library: a thin wrapper around tape
const describe = (unit = '', TestFunction = noop) => tape(unit, test => {
  const end = () => test.end();

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

  const result = TestFunction(assert);

  if (result && result.then) return result.then(end).catch(end);
});

const Try = async (fn = noop, ...args) => {
  try {
    return await fn(...args);
  } catch (err) {
    return err;
  }
};

const createStream = tape.createStream.bind(tape);

module.exports = { describe, Try, createStream };
