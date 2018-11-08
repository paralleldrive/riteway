# RITEway

Test assertions that always supply a good bug report when they fail.

* **R**eadable
* **I**solated/**I**ntegrated
* **T**horough
* **E**xplicit

RITEway forces you to write **R**eadable, **I**solated, and **E**xplicit tests, because that's the only way you can use the API. It also makes it easier to be thorough by making test assertions so simple that you'll want to write more of them.

There are [5 questions every unit test must answer](https://medium.com/javascript-scene/what-every-unit-test-needs-f6cd34d9836d). RITEWay forces you to answer them.

1. What is the unit under test (module, function, class, whatever)?
2. What should it do? (Prose description)
3. What was the actual output?
4. What was the expected output?
5. How do you reproduce the failure?


## Installing

```
npm install --save-dev riteway
```

## Example Usage

```js
import { describe, Try } from 'riteway';

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
```

## Output

RITEway produces standard TAP output, so it's easy to integrate with just about any test formatter and reporting tool. (TAP is a well established standard with hundreds (thousands?) of integrations).

```
TAP version 13
# sum()
ok 1 Given no arguments: should return 0
ok 2 Given zero: should return the correct sum
ok 3 Given negative numbers: should return the correct sum
ok 4 Given NaN: should throw

1..4
# tests 4
# pass  4

# ok
```

Prefer colorful output? No problem. The standard TAP output has you covered. You can run it through any TAP formatter you like:

```
npm install -g tap-color
npm test | tap-color
```

![Colorized output](docs/tap-color-screenshot.png)


## API

### describe

```js
describe = (unit: String, cb: TestFunction) => Void
```

Describe takes a prose description of the unit under test (function, module, whatever), and a callback function (`cb: TestFunction`). The callback function should be an [async function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function) so that the test can automatically complete when it reaches the end. RITEWay assumes that all tests are asynchronous. Async functions automatically return a promise in JavaScript, so RITEWay knows when to end each test.

### describe.only

```js
describe.only = (unit: String, cb: TestFunction) => Void
```

Like Describe, but don't run any other tests in the test suite.  See [test.only](https://github.com/substack/tape#testonlyname-cb)

### describe.skip

```js
describe.skip = (unit: String, cb: TestFunction) => Void
```

Skip running this test. See [test.skip](https://github.com/substack/tape#testskipname-cb)

### TestFunction

```js
TestFunction = assert => Promise | Void
```

The `TestFunction` is a user-defined function which takes `assert()` and should return a promise. If you supply an async function, it will return a promise automatically. If you don't, you'll need to explicitly return a promise.

Failure to resolve the `TestFunction` promise will cause an error telling you that your test exited without ending. Usually, the fix is to add `async` to your `TestFunction` signature, e.g.:

```js
describe('sum()', async assert => {
  /* test goes here */
});
```


### assert

```js
assert = ({
  given = Any,
  should = '',
  actual: Any,
  expected: Any
} = {}) => Void, throws
```

The `assert` function is the function you call to make your assertions. It takes prose descriptions for `given` and `should` (which should be strings), and invokes the test harness to evaluate the pass/fail status of the test. Unless you're using a custom test harness, assertion failures will cause a test failure report and an error exit status.


### createStream

```js
createStream = ({ objectMode: Boolean }) => NodeStream
```

Create a stream of output, bypassing the default output stream that writes messages to `console.log()`. By default the stream will be a text stream of TAP output, but you can get an object stream instead by setting opts.objectMode to true.

```js
import { describe, createStream } from 'riteway';

createStream({ objectMode: true }).on('data', function (row) {
    console.log(JSON.stringify(row))
});

describe('foo', async assert => {
  /* your tests here */
});
```
