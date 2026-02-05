# Debugging Common Issues in Riteway

## Test Failures and Debugging

### Understanding Test Output

Riteway uses TAP format. A typical failure looks like:

```
not ok 5 Given invalid input: should throw an error
  ---
    operator: deepEqual
    expected: Error: Invalid input
    actual:   undefined
  ...
```

Key debugging information:
- **Test number**: `5` - helps locate the failing test
- **Description**: `Given invalid input: should throw an error` - from your `given` and `should` fields
- **Expected vs Actual**: Shows what you expected vs what you got

### Common Test Failure Patterns

#### 1. Missing Error Handling
```javascript
// Problem: Function doesn't throw when it should
describe('validateEmail()', async assert => {
  assert({
    given: 'invalid email',
    should: 'throw validation error',
    actual: Try(validateEmail, 'invalid'),  // Returns undefined instead of Error
    expected: new Error('Invalid email')
  });
});

// Solution: Check your function implementation
const validateEmail = (email) => {
  if (!email.includes('@')) {
    throw new Error('Invalid email');  // Make sure this actually throws
  }
  return email;
};
```

#### 2. Async/Await Issues
```javascript
// Problem: Not awaiting async operations
describe('fetchUser()', async assert => {
  assert({
    given: 'user ID',
    should: 'return user data',
    actual: fetchUser(123),  // Missing await - returns Promise object
    expected: { name: 'John' }
  });
});

// Solution: Await the async operation
describe('fetchUser()', async assert => {
  const user = await fetchUser(123);
  
  assert({
    given: 'user ID',
    should: 'return user data',
    actual: user,
    expected: { name: 'John' }
  });
});
```

#### 3. Object Comparison Issues
```javascript
// Problem: Comparing objects that aren't deeply equal
assert({
  given: 'user data',
  should: 'create user object',
  actual: createUser('John'),  // Returns { id: 'abc123', name: 'John' }
  expected: { name: 'John' }   // Missing id field
});

// Solution: Match the exact structure or test specific properties
assert({
  given: 'user data',
  should: 'create user with correct name',
  actual: createUser('John').name,
  expected: 'John'
});
```

## Component Testing Debug Patterns

### React Component Not Rendering
```javascript
// Problem: Component returns null or undefined
const $ = render(<ConditionalComponent show={false} />);

assert({
  given: 'show prop is false',
  should: 'render nothing',
  actual: $('.component').length,  // Might be looking for wrong selector
  expected: 0
});

// Debug: Check what's actually rendered
console.log($.html()); // See the full HTML output
```

### CSS Selector Issues
```javascript
// Problem: Wrong CSS selector
const $ = render(<div className="user-card"><h1>John</h1></div>);

assert({
  given: 'user component',
  should: 'render user name',
  actual: $('.user-name').text(),  // Wrong class name
  expected: 'John'
});

// Debug: Check available elements
console.log($.html());  // See actual HTML structure
console.log($('h1').text());  // Try different selectors
```

### Text Content Matching Issues
```javascript
// Problem: Extra whitespace or different content
const $ = render(<p>  Hello World  </p>);

assert({
  given: 'text content',
  should: 'match exactly',
  actual: $('p').text(),      // "  Hello World  " (with spaces)
  expected: 'Hello World'     // Without spaces
});

// Solution: Trim whitespace or use match()
import match from 'riteway/match';

const contains = match($('p').html());
assert({
  given: 'text content with spacing',
  should: 'contain the expected text',
  actual: contains('Hello World'),
  expected: 'Hello World'
});
```

## Build and Environment Issues

### Babel Configuration Problems
```javascript
// Error: SyntaxError: Unexpected token '<'
// Problem: JSX not being transpiled

// Solution: Check .babelrc
{
  "presets": [
    "@babel/preset-env",
    "@babel/preset-react"  // Make sure this is included
  ]
}
```

### Module Import Issues
```javascript
// Error: Cannot find module 'riteway/match'
// Problem: Wrong import path

// Wrong
import match from 'riteway/match';

// Correct
import match from 'riteway/source/match';
// OR if using ESM
import match from 'riteway/esm/match';
```

### TypeScript Definition Issues
```javascript
// Error: Property 'given' does not exist on type...
// Problem: TypeScript definitions out of sync

// Check if using correct import
import { describe } from 'riteway';  // Should have proper types

// If types are missing, check index.d.ts file exists and is correct
```

## Debugging Strategies

### 1. Isolate the Problem
```javascript
// Start with simplest possible test
describe('debug test', async assert => {
  assert({
    given: 'simple input',
    should: 'return simple output',
    actual: 1 + 1,
    expected: 2
  });
});
```

### 2. Log Intermediate Values
```javascript
describe('complex function', async assert => {
  const input = { name: 'John', age: 30 };
  const result = processUser(input);
  
  console.log('Input:', input);
  console.log('Result:', result);
  console.log('Result type:', typeof result);
  
  assert({
    given: 'user input',
    should: 'process correctly',
    actual: result,
    expected: expectedOutput
  });
});
```

### 3. Test Individual Properties
```javascript
// Instead of comparing entire objects
assert({
  given: 'complex object',
  should: 'have correct name property',
  actual: result.name,
  expected: 'John'
});

assert({
  given: 'complex object',
  should: 'have correct age property',
  actual: result.age,
  expected: 30
});
```

### 4. Use describe.only for Focus Testing
```javascript
// Only run this specific test
describe.only('focused debug test', async assert => {
  // Your debugging test here
});
```

## Common Error Messages and Solutions

### "Test exited without ending"
```javascript
// Problem: Async test not properly handled
describe('async test', (assert, end) => {
  setTimeout(() => {
    assert({...});
    // Missing end() call
  }, 100);
});

// Solution: Use async/await OR call end()
describe('async test', async assert => {
  await delay(100);
  assert({...});
});
```

### "The following parameters are required by assert"
```javascript
// Problem: Missing required assert fields
assert({
  given: 'input',
  // Missing 'should', 'actual', 'expected'
});

// Solution: Include all required fields
assert({
  given: 'input',
  should: 'produce output',
  actual: myFunction(input),
  expected: expectedOutput
});
```

### "Cannot read property of undefined"
```javascript
// Problem: Function returns undefined
const result = myFunction();

assert({
  given: 'some input',
  should: 'return object with property',
  actual: result.property,  // Error if result is undefined
  expected: 'value'
});

// Solution: Check function return value first
const result = myFunction();
console.log('Function returned:', result);

assert({
  given: 'some input',
  should: 'return defined result',
  actual: result !== undefined,
  expected: true
});
```

## Performance Debugging

### Slow Tests
```javascript
// Add timing to identify slow operations
describe('performance test', async assert => {
  const start = Date.now();
  const result = expensiveOperation();
  const end = Date.now();
  
  console.log(`Operation took ${end - start}ms`);
  
  assert({
    given: 'expensive operation',
    should: 'complete in reasonable time',
    actual: (end - start) < 1000,
    expected: true
  });
});
```

### Memory Issues
```javascript
// Check for memory leaks in component tests
describe('component memory test', async assert => {
  // Render many components
  for (let i = 0; i < 1000; i++) {
    const $ = render(<TestComponent key={i} />);
    // Make sure components are properly cleaned up
  }
  
  assert({
    given: 'many component renders',
    should: 'not leak memory',
    actual: process.memoryUsage().heapUsed < threshold,
    expected: true
  });
});
```

## Tools for Debugging

### Using Node.js Debugger
```bash
# Run tests with debugger
node --inspect-brk -r @babel/register source/test.js

# Then open Chrome DevTools
# Navigate to chrome://inspect
```

### TAP Formatters for Better Output
```bash
# Install tap-nirvana for better test output
npm install --save-dev tap-nirvana

# Use in package.json
"test": "riteway test/**/*-test.js | tap-nirvana"
```

### ESLint for Code Issues
```bash
# Run linting to catch common issues
npm run lint

# Auto-fix some issues
npm run lint-fix
```

## Debugging Checklist

When a test fails:

1. ✅ **Read the error message carefully** - it usually tells you exactly what's wrong
2. ✅ **Check that all assert fields are provided** - given, should, actual, expected
3. ✅ **Verify async operations are awaited** - use `await` for promises
4. ✅ **Test the function in isolation** - make sure it works outside the test
5. ✅ **Log intermediate values** - use console.log to see what's happening
6. ✅ **Check object structure** - make sure expected and actual have same shape
7. ✅ **Use describe.only** - focus on just the failing test
8. ✅ **Simplify the test** - start with the simplest case that works
9. ✅ **Check environment setup** - babel, imports, dependencies
10. ✅ **Review similar working tests** - see what's different