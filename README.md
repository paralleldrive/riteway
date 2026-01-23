# Riteway
[![SudoLang AIDD](https://img.shields.io/badge/✨_SudoLang_AIDD-black)](https://github.com/paralleldrive/aidd)[![Parallel Drive](https://img.shields.io/badge/🖤_Parallel_Drive-000000?style=flat)](https://paralleldrive.com)

**The standard testing framework for AI Driven Development (AIDD) and software agents.**

Riteway is a testing assertion style and philosophy which leads to simple, readable, helpful unit tests for humans and AI agents.

It lets you write better, more readable tests with a fraction of the code that traditional assertion frameworks would use, and the `riteway ai` CLI lets you write AI agent prompt evals as easily as you would write a unit testing suite.

Riteway is the AI-native way to build a modern test suite. It pairs well with Vitest, Playwright, Claude Code, Cursor Agent, Google Antigravity, and more.

* **R**eadable
* **I**solated/**I**ntegrated
* **T**horough
* **E**xplicit

Riteway forces you to write **R**eadable, **I**solated, and **E**xplicit tests, because that's the only way you can use the API. It also makes it easier to be thorough by making test assertions so simple that you'll want to write more of them.

## Why Riteway for AI Driven Development?

Riteway's structured approach makes it ideal for AIDD:

**📖 Learn more:** [Better AI Driven Development with Test Driven Development](https://medium.com/effortless-programming/better-ai-driven-development-with-test-driven-development-d4849f67e339)

- **Clear requirements**: The given, should expectations and 5-question framework help AI better understand exactly what to build
- **Readable by design**: Natural language descriptions make tests comprehensible to both humans and AI
- **Simple API**: Minimal surface area reduces AI confusion and hallucinations
- **Token efficient**: Concise syntax saves valuable context window space

## The 5 Questions Every Test Must Answer

There are [5 questions every unit test must answer](https://medium.com/javascript-scene/what-every-unit-test-needs-f6cd34d9836d). Riteway forces you to answer them.

1. What is the unit under test (module, function, class, whatever)?
2. What should it do? (Prose description)
3. What was the actual output?
4. What was the expected output?
5. How do you reproduce the failure?


## Installing

```shell
npm install --save-dev riteway
```

Then add an npm command in your package.json:

```json
"test": "riteway test/**/*-test.js",
```

For projects using both core Riteway tests and JSX component tests, you can use a dual test runner setup:

```json
"test": "node source/test.js && vitest run",
```

Now you can run your tests with `npm test`. Riteway also supports full TAPE-compatible usage syntax, so you can have an advanced entry that looks like:

```json
"test": "nyc riteway test/**/*-rt.js | tap-nirvana",
```

In this case, we're using [nyc](https://www.npmjs.com/package/nyc), which generates test coverage reports. The output is piped through an advanced TAP formatter, [tap-nirvana](https://www.npmjs.com/package/tap-nirvana) that adds color coding, source line identification and advanced diff capabilities.

### Requirements

Riteway requires Node.js 16+ and uses native ES modules. Add `"type": "module"` to your package.json to enable ESM support. For JSX component testing, you'll need a build tool that can transpile JSX (see [JSX Setup](#jsx-setup) below).


## Example Usage

```js
import { describe, Try } from 'riteway/index.js';

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

### Testing React Components

```js
import render from 'riteway/render-component';
import { describe } from 'riteway/index.js';

describe('renderComponent', async assert => {
  const $ = render(<div className="foo">testing</div>);

  assert({
    given: 'some jsx',
    should: 'render markup',
    actual: $('.foo').html().trim(),
    expected: 'testing'
  });
});
```

> Note: JSX component testing requires transpilation. See the [JSX Setup](#jsx-setup) section below for configuration with Vite or Next.js.

Riteway makes it easier than ever to test pure React components using the `riteway/render-component` module. A pure component is a component which, given the same inputs, always renders the same output.

I don't recommend unit testing stateful components, or components with side-effects. Write functional tests for those, instead, because you'll need tests which describe the complete end-to-end flow, from user input, to back-end-services, and back to the UI. Those tests frequently duplicate any testing effort you would spend unit-testing stateful UI behaviors. You'd need to do a lot of mocking to properly unit test those kinds of components anyway, and that mocking may cover up problems with too much coupling in your component. See ["Mocking is a Code Smell"](https://medium.com/javascript-scene/mocking-is-a-code-smell-944a70c90a6a) for details.

A great alternative is to encapsulate side-effects and state management in container components, and then pass state into pure components as props. Unit test the pure components and use functional tests to ensure that the complete UX flow works in real browsers from the user's perspective.

#### Isolating React Unit Tests

When you [unit test React components](https://medium.com/javascript-scene/unit-testing-react-components-aeda9a44aae2) you frequently have to render your components many times. Often, you want different props for some tests.

Riteway makes it easy to isolate your tests while keeping them readable by using [factory functions](https://link.medium.com/WxHPhCc3OV) in conjunction with [block scope](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/block).

```js
import ClickCounter from '../click-counter/click-counter-component';

describe('ClickCounter component', async assert => {
  const createCounter = clickCount =>
    render(<ClickCounter clicks={ clickCount } />)
  ;

  {
    const count = 3;
    const $ = createCounter(count);
    assert({
      given: 'a click count',
      should: 'render the correct number of clicks.',
      actual: parseInt($('.clicks-count').html().trim(), 10),
      expected: count
    });
  }

  {
    const count = 5;
    const $ = createCounter(count);
    assert({
      given: 'a click count',
      should: 'render the correct number of clicks.',
      actual: parseInt($('.clicks-count').html().trim(), 10),
      expected: count
    });
  }
});
```

## Output

Riteway produces standard TAP output, so it's easy to integrate with just about any test formatter and reporting tool. (TAP is a well established standard with hundreds (thousands?) of integrations).

```shell
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

```shell
npm install -g tap-color
npm test | tap-color
```

![Colorized output](docs/tap-color-screenshot.png)


## API

### describe

```js
describe = (unit: String, cb: TestFunction) => Void
```

Describe takes a prose description of the unit under test (function, module, whatever), and a callback function (`cb: TestFunction`). The callback function should be an [async function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function) so that the test can automatically complete when it reaches the end. Riteway assumes that all tests are asynchronous. Async functions automatically return a promise in JavaScript, so Riteway knows when to end each test.

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
TestFunction = assert => Promise<void>
```

The `TestFunction` is a user-defined function which takes `assert()` and must return a promise. If you supply an async function, it will return a promise automatically. If you don't, you'll need to explicitly return a promise.

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

Note that `assert` uses [a deep equality check](https://github.com/substack/node-deep-equal) to compare the actual and expected values. Rarely, you may need another kind of check. In those cases, pass a JavaScript expression for the `actual` value.

### createStream

```js
createStream = ({ objectMode: Boolean }) => NodeStream
```

Create a stream of output, bypassing the default output stream that writes messages to `console.log()`. By default the stream will be a text stream of TAP output, but you can get an object stream instead by setting `opts.objectMode` to `true`.

```js
import { describe, createStream } from 'riteway/index.js';

createStream({ objectMode: true }).on('data', function (row) {
    console.log(JSON.stringify(row))
});

describe('foo', async assert => {
  /* your tests here */
});
```

### countKeys

Given an object, return a count of the object's own properties.

```js
countKeys = (Object) => Number
```

This function can be handy when you're adding new state to an object keyed by ID, and you want to ensure that the correct number of keys were added to the object.


## Render Component

First, import `render` from `riteway/render-component`:

```js
import render from 'riteway/render-component';
```

```js
render = (jsx) => CheerioObject
```

Take a JSX object and return a [Cheerio object](https://cheerio.js.org/), a partial implementation of the jQuery core API which makes selecting from your rendered JSX markup just like selecting with jQuery or the `querySelectorAll` API.

### Example

```js
describe('MyComponent', async assert => {
  const $ = render(<MyComponent />);

  assert({
    given: 'no params',
    should: 'render something with the my-component class',
    actual: $('.my-component').length,
    expected: 1
  });
});
```


## Match

First, import `match` from `riteway/match`:

```js
import match from 'riteway/match.js';
```

```js
match = text => pattern => String
```

Take some text to search and return a function which takes a pattern and returns the matched text, if found, or an empty string. The pattern can be a string or regular expression.

### Example

Imagine you have a React component you need to test. The component takes some text and renders it in some div contents. You need to make sure that the passed text is getting rendered.

```js
const MyComponent = ({text}) => <div className="contents">{text}</div>;
```

You can use match to create a new function that will test to see if your search
text contains anything matching the pattern you passed in. Writing tests this way
allows you to see clear expected and actual values, so you can expect the specific
text you're expecting to find:

```js
describe('MyComponent', async assert => {
  const text = 'Test for whatever you like!';
  const $ = render(<MyComponent text={ text }/>);
  const contains = match($('.contents').html());

  assert({
    given: 'some text to display',
    should: 'render the text.',
    actual: contains(text),
    expected: text
  });
});
```

## JSX Setup

For JSX component testing, you need a build tool that can transpile JSX. We recommend **Vite** or **Next.js**, both of which handle JSX out of the box.

### Option 1: Vite Setup

[Vite](https://vitejs.dev/) provides excellent JSX support with minimal configuration:

1. **Install Vite, Vitest, and React plugin:**
   ```bash
   npm install --save-dev vite vitest @vitejs/plugin-react
   ```

2. **Create `vite.config.js` in your project root:**
   ```javascript
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';

   export default defineConfig({
     plugins: [react()],
   });
   ```

3. **Update your package.json test script:**
   ```json
   {
     "scripts": {
       "test": "vitest run"
     }
   }
   ```

   Note: Vitest configuration is optional. The above setup will work with default settings.

### Option 2: Next.js Setup

[Next.js](https://nextjs.org/) handles JSX transpilation automatically. No additional configuration needed for JSX support.

## Vitest

[Vitest](https://vitest.dev/guide/) is a [Vite](https://vitejs.dev/) plugin through which you can run Riteway tests. It's a great way to get started with Riteway because it's easy to set up and fast. It also runs tests in real browsers, so you can test standard web components.

### Installing

First you will need to install Vitest. You will also need to install Riteway into your project if you have not already done so. You can use any package manager you like:

```shell
npm install --save-dev vitest
```

### Usage

First, import `assert` from `riteway/vitest` and `describe` from `vitest`:

```ts
import { assert } from 'riteway/vitest';
import { describe, test } from "vitest";
```

Then you can use the Vitest runner to test. You can run `npx vitest` directly or add a script to your package.json. See [here](https://vitest.dev/config/) for additional details on setting up a Vitest configuration.

When using vitest, you should wrap your asserts inside a test function so that vitest can understand where your tests failed when it encounters a failure.


```ts
// a function to test
const sum = (...args) => {
  if (args.some(v => Number.isNaN(v))) throw new TypeError('NaN');
  return args.reduce((acc, n) => acc + n, 0);
};

describe('sum()', () => {
  test('basic summing', () => {
    assert({
      given: 'no arguments',
      should: 'return 0',
      actual: sum(),
      expected: 0
    });

    assert({
      given: 'two numbers',
      should: 'return the correct sum',
      actual: sum(2, 0),
      expected: 2
    });
  });
});
```
