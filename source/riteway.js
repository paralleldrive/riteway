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

  const result = TestFunction(assert, end);

  // don't use .catch() - it will swallow test errors
  if (result && result.then) return result.then(end);
});

const identity = x => x;
const isPromise = x => x && typeof x.then === 'function';
const catchAndReturn = x => x.catch(identity);
const catchPromise = x => isPromise(x) ? catchAndReturn(x) : x;

const Try = (fn = noop, ...args) => {
  try {
    return catchPromise(fn(...args));
  } catch (err) {
    return err;
  }
};

const createStream = tape.createStream.bind(tape);

module.exports = { describe, Try, createStream };
