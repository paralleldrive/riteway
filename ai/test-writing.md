# Test Writing Patterns for Riteway

## Basic Test Structure

Every Riteway test must follow this exact pattern:

```javascript
import { describe } from 'riteway';

describe('functionName()', async assert => {
  assert({
    given: 'a clear description of the input or context',
    should: 'describe what the function should do',
    actual: functionName(input),
    expected: expectedOutput
  });
});
```

## Key Principles

1. **All four fields are required**: `given`, `should`, `actual`, `expected`
2. **Use async functions**: Always use `async assert =>` for the test function
3. **Test one thing per assertion**: Keep assertions focused and isolated
4. **Use descriptive prose**: The `given` and `should` fields should read like clear English

## Common Patterns

### Testing Pure Functions
```javascript
describe('sum()', async assert => {
  assert({
    given: 'two positive numbers',
    should: 'return their sum',
    actual: sum(2, 3),
    expected: 5
  });

  assert({
    given: 'negative numbers',
    should: 'handle negative values correctly',
    actual: sum(-1, -2),
    expected: -3
  });
});
```

### Testing Functions That Throw
```javascript
import { Try } from 'riteway';

describe('validateEmail()', async assert => {
  assert({
    given: 'an invalid email',
    should: 'throw a validation error',
    actual: Try(validateEmail, 'invalid-email'),
    expected: new Error('Invalid email format')
  });
});
```

### Testing Async Functions
```javascript
describe('fetchUser()', async assert => {
  const user = await fetchUser(123);
  
  assert({
    given: 'a valid user ID',
    should: 'return user data',
    actual: user.name,
    expected: 'John Doe'
  });
});
```

### Testing Object Properties
```javascript
describe('createUser()', async assert => {
  const user = createUser('John', 'john@example.com');
  
  assert({
    given: 'name and email',
    should: 'create user with correct name',
    actual: user.name,
    expected: 'John'
  });

  assert({
    given: 'name and email',
    should: 'create user with correct email',
    actual: user.email,
    expected: 'john@example.com'
  });
});
```

### Testing Array Operations
```javascript
describe('filterAdults()', async assert => {
  const people = [
    { name: 'Alice', age: 25 },
    { name: 'Bob', age: 17 },
    { name: 'Charlie', age: 30 }
  ];

  assert({
    given: 'array of people with mixed ages',
    should: 'return only adults',
    actual: filterAdults(people).length,
    expected: 2
  });
});
```

## Test Organization

### Grouping Related Tests
```javascript
describe('Calculator operations', async assert => {
  // Addition tests
  assert({
    given: 'two numbers for addition',
    should: 'return correct sum',
    actual: calculator.add(2, 3),
    expected: 5
  });

  // Subtraction tests  
  assert({
    given: 'two numbers for subtraction',
    should: 'return correct difference',
    actual: calculator.subtract(5, 3),
    expected: 2
  });
});
```

### Using describe.only and describe.skip
```javascript
// Run only this test
describe.only('focused test', async assert => {
  // test implementation
});

// Skip this test
describe.skip('broken test', async assert => {
  // test implementation
});
```

## Common Mistakes to Avoid

1. **Missing required fields**: All four fields (given, should, actual, expected) are mandatory
2. **Not using async**: Always use `async assert =>` 
3. **Testing multiple things in one assertion**: Keep each assertion focused
4. **Unclear prose descriptions**: Make `given` and `should` read like clear English
5. **Not handling errors properly**: Use `Try()` for functions that may throw

## Best Practices

1. **Start with the simplest case**: Test the happy path first
2. **Test edge cases**: Consider null, undefined, empty arrays, etc.
3. **Use meaningful test data**: Choose inputs that make the test intention clear
4. **Keep tests independent**: Each test should work in isolation
5. **Use descriptive names**: The `describe` parameter should clearly identify what's being tested