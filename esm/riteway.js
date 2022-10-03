import tape from 'tape';

const noop = new Function();
const isPromise = x => x && typeof x.then === 'function';
const requiredKeys = ['given', 'should', 'actual', 'expected'];
const concatToString = (keys, key, index) => keys + (index ? ', ' : '') + key;

const withRiteway = TestFunction => test => {
  const end = () => test.end();

  const assert = (args = {}) => {
    const missing = requiredKeys.filter(
      k => !Object.keys(args).includes(k)
    );
    if (missing.length) {
      throw new Error(`The following parameters are required by \`assert\`: ${missing.reduce(concatToString, '')}`);
    }

    const {
      // initialize values to undefined so TypeScript doesn't complain
      given = undefined,
      should = '',
      actual = undefined,
      expected = undefined
    } = args;

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

/**
 * Given an object, return a count of the object's own properties.
 *
 * @param {object} [obj] The object whose keys you wish to count.
 * @returns {number}
 */
const countKeys = (obj = {}) => Object.keys(obj).length;

export default describe;
export { describe, Try, createStream, countKeys };
