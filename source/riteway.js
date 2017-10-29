const tape = require('tape');

// The testing library: a thin wrapper around tape
const describe = (unit, cb) => tape(unit, assert => {
  const end = assert.end.bind(assert);

  const result = cb(description => ({
    assert: ({ actual, expected, given, should = description }) =>
      assert.same(
        actual, expected,
        `Given ${ given }: should ${ should }`
      ),
    // We can probably use async/await to deal with most async tests,
    // but we should probably still supply `end()` so users can do
    // whatever they like
    end
  }));

  if (result && result.then) result.then(end).catch(x => x);
});

const Try = (fn, ...args) => {
  try {
    return fn(...args);
  } catch (err) {
    return err;
  }
};

module.exports = { describe, Try };
