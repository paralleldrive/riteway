const tape = require('tape');

// The testing library: a thin wrapper around tape
const describe = (unit, cb) => tape(unit, assert => {
  const end = assert.end.bind(assert);

  const result = cb({
    assert: riteAssert(assert),
    end,
  });

  if (result && result.then) result.then(end);
});

const riteAssert = (tapeAssert) => ({ actual, expected, given, should }) =>
  tapeAssert.same(
    actual, expected,
    `Given ${ given }: should ${ should }`
  );

const Try = (fn, ...args) => {
  try {
    return fn(...args);
  } catch (err) {
    return err;
  }
};

const createStream = tape.createStream.bind(tape);

module.exports = { describe, Try, createStream };
