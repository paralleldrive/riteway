# API Development Guidelines for Riteway

## Core Design Principles

When extending or modifying the Riteway API, follow these principles:

1. **Simplicity**: Keep the API surface minimal and focused
2. **Explicitness**: Force users to be explicit about what they're testing
3. **Readability**: API calls should read like natural language
4. **TAP Compatibility**: Maintain compatibility with the TAP ecosystem
5. **Error Clarity**: Failures should provide clear, actionable feedback

## Current API Structure

### Core Functions

```javascript
// Main test runner
describe(unit: String, cb: TestFunction) => Void
describe.only(unit: String, cb: TestFunction) => Void  
describe.skip(unit: String, cb: TestFunction) => Void

// Assertion function
assert({
  given: String,
  should: String, 
  actual: Any,
  expected: Any
}) => Void

// Utility functions
Try(fn: Function, ...args) => Any
createStream() => Stream
countKeys(obj: Object) => Number
```

### Testing Utilities

```javascript
// Text/pattern matching
match(text: String) => (pattern: String|RegExp) => String

// React component rendering  
render(component: ReactElement) => CheerioStatic
```

## Adding New API Functions

### Function Design Pattern

All API functions should follow these patterns:

```javascript
// Pure functions - no side effects
const newUtility = (input) => {
  // Validate inputs
  if (!input) {
    throw new Error('Input is required');
  }
  
  // Transform and return
  return transformedOutput;
};

// Test runner extensions
const newTestType = (description, testFn) => {
  // Wrap with existing patterns
  return describe(description, testFn);
};
```

### Input Validation

Always validate inputs and provide clear error messages:

```javascript
const validateAssertArgs = (args = {}) => {
  const requiredKeys = ['given', 'should', 'actual', 'expected'];
  const missing = requiredKeys.filter(
    k => !Object.keys(args).includes(k)
  );
  
  if (missing.length) {
    throw new Error(
      `The following parameters are required: ${missing.join(', ')}`
    );
  }
};
```

### TypeScript Definitions

Always provide TypeScript definitions for new API functions:

```typescript
// In appropriate .d.ts file
export declare function newFunction(
  param1: string,
  param2?: number
): ReturnType;

export interface NewOptions {
  option1: string;
  option2?: boolean;
}
```

## Extending the Assert Function

The `assert` function is the core of Riteway. Any extensions should maintain its design:

### Current Implementation Pattern
```javascript
const assert = (args = {}) => {
  // Validate required fields
  validateAssertArgs(args);
  
  const { given, should, actual, expected } = args;
  
  // Use tape's assertion
  test.same(
    actual, 
    expected,
    `Given ${given}: should ${should}`
  );
};
```

### Adding New Assertion Types

If adding specialized assertions, follow this pattern:

```javascript
const assertContains = (args = {}) => {
  const { given, should, actual, expected } = args;
  
  // Custom validation logic
  const contains = actual.includes(expected);
  
  test.ok(
    contains,
    `Given ${given}: should ${should}`
  );
};
```

## Testing New API Functions

All new API functions must be thoroughly tested:

```javascript
describe('newFunction()', async assert => {
  assert({
    given: 'valid input',
    should: 'return expected output',
    actual: newFunction('input'),
    expected: 'expectedOutput'
  });

  assert({
    given: 'invalid input', 
    should: 'throw descriptive error',
    actual: Try(newFunction, null),
    expected: new Error('Input is required')
  });
});
```

## Utility Function Guidelines

### Pure Functions Only
```javascript
// Good - pure function
const formatMessage = (message) => `[TEST] ${message}`;

// Bad - side effects
const logMessage = (message) => {
  console.log(message); // Side effect
  return message;
};
```

### Composable Design
```javascript
// Design functions to work together
const createMatcher = (text) => (pattern) => match(text)(pattern);
const createRenderer = (component) => render(component);
```

### Error Handling
```javascript
const safeOperation = (input) => {
  try {
    return riskyOperation(input);
  } catch (error) {
    // Return error object, don't throw
    return error;
  }
};
```

## Module Organization

### Source Structure
```
source/
├── riteway.js          # Main API
├── match.js            # Text matching utilities  
├── render-component.js # React testing utilities
├── vitest.js          # Vitest integration
└── test.js            # API tests
```

### Export Patterns
```javascript
// Named exports for utilities
export { match, render };

// Default export for main API
export default describe;

// Combined exports
export { describe, Try, createStream, countKeys };
```

## Integration with Test Runners

### Tape Integration
Riteway is built on tape and should maintain compatibility:

```javascript
const withTape = tapeFn => (unit = '', TestFunction = noop) => 
  tapeFn(unit, withRiteway(TestFunction));

const describe = Object.assign(withTape(tape), {
  only: withTape(tape.only),
  skip: tape.skip
});
```

### Other Test Runner Support
When adding support for other test runners:

```javascript
// Maintain the same API
const withNewRunner = runnerFn => (unit, TestFunction) => {
  // Adapt to new runner's API
  return runnerFn(unit, adaptedTestFunction);
};
```

## Documentation Requirements

### JSDoc Comments
```javascript
/**
 * Creates a text matcher function for testing content.
 * 
 * @param {string} text - The text to search within
 * @returns {function} A function that matches patterns in the text
 * @example
 * const contains = match('<div>Hello World</div>');
 * contains('Hello'); // Returns 'Hello'
 */
const match = (text) => (pattern) => {
  // Implementation
};
```

### README Updates
When adding new API functions, update:
1. API section with new function signatures
2. Usage examples
3. TypeScript definitions reference

## Backwards Compatibility

### Deprecation Process
1. Mark old API as deprecated in JSDoc
2. Add console warning in development
3. Maintain functionality for at least one major version
4. Provide migration guide

### Version Strategy
- Patch: Bug fixes, no API changes
- Minor: New features, backwards compatible
- Major: Breaking changes, API modifications

## Common Patterns to Follow

### Function Factories
```javascript
// Create specialized versions of generic functions
const createAsyncTester = (timeout = 5000) => async (fn) => {
  // Implementation with timeout
};
```

### Currying for Composability
```javascript
// Allow partial application
const matcher = text => pattern => match(text)(pattern);
const htmlMatcher = matcher(htmlString);
```

### Error Object Structure
```javascript
// Consistent error format
const createError = (message, code, details = {}) => {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
};
```

## Testing API Changes

### Integration Tests
```javascript
// Test how new features work with existing API
describe('API integration', async assert => {
  const result = newFunction(existingFunction(input));
  
  assert({
    given: 'new function with existing API',
    should: 'work seamlessly together',
    actual: result,
    expected: expectedResult
  });
});
```

### Performance Considerations
- Keep API functions lightweight
- Avoid expensive operations in hot paths
- Consider memoization for expensive computations
- Test performance with large inputs

## Release Process

1. Update version in package.json
2. Run full test suite
3. Update TypeScript definitions
4. Update ESM modules (`npm run esm`)
5. Update documentation
6. Tag release in git
7. Publish to npm