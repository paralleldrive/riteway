import tape from 'tape';

const noop = new Function();
const isPromise = x => x && typeof x.then === 'function';

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

  if (isPromise(result)) return result.then(end);
};

const withTape = tapeFn => (unit = '', TestFunction = noop) => tapeFn(unit, withRiteway(TestFunction));

// The testing library: a thin wrapper around tape
const describe = Object.assign(withTape(tape), {
  only: withTape(tape.only),
  skip: tape.skip
});

const catchAndReturn = x => x.catch(x => x);
const catchPromise = x => isPromise(x) ? catchAndReturn(x) : x;

const Try = (fn = noop, ...args) => {
  try {
    return catchPromise(fn(...args));
  } catch (err) {
    return err;
  }
};

const createStream = tape.createStream.bind(tape);

export default describe;
export { describe, Try, createStream };
