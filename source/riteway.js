const tape = require('tape');

const noop = new Function();

const withRiteway = TestFunction => test => {
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

  if (result && result.then) return result.then(end)
};

const withTape = tapeFn => (unit = '', TestFunction = noop) => tapeFn(unit, withRiteway(TestFunction));

// The testing library: a thin wrapper around tape
const describe = withTape(tape);
describe.only = withTape(tape.only);
describe.skip = tape.skip;


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
