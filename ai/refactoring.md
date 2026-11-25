# Refactoring Guidelines for Riteway

## Safe Refactoring Patterns

When refactoring code that uses Riteway, follow these patterns to maintain test reliability and readability.

## Refactoring Test Code

### Extracting Common Test Setup

#### Before: Repeated Setup
```javascript
describe('UserService', async assert => {
  const user = { id: 1, name: 'John', email: 'john@example.com' };
  const userService = new UserService();
  
  assert({
    given: 'valid user data',
    should: 'create user successfully',
    actual: userService.create(user).name,
    expected: 'John'
  });
});

describe('UserService validation', async assert => {
  const user = { id: 1, name: 'John', email: 'john@example.com' };
  const userService = new UserService();
  
  assert({
    given: 'user with valid email',
    should: 'pass validation',
    actual: userService.validate(user),
    expected: true
  });
});
```

#### After: Extracted Setup
```javascript
// Helper function for common setup
const createTestUser = () => ({ 
  id: 1, 
  name: 'John', 
  email: 'john@example.com' 
});

const createUserService = () => new UserService();

describe('UserService', async assert => {
  const user = createTestUser();
  const userService = createUserService();
  
  assert({
    given: 'valid user data',
    should: 'create user successfully',
    actual: userService.create(user).name,
    expected: 'John'
  });
});

describe('UserService validation', async assert => {
  const user = createTestUser();
  const userService = createUserService();
  
  assert({
    given: 'user with valid email',
    should: 'pass validation',
    actual: userService.validate(user),
    expected: true
  });
});
```

### Grouping Related Assertions

#### Before: Scattered Tests
```javascript
describe('Calculator add', async assert => {
  assert({
    given: 'positive numbers',
    should: 'return sum',
    actual: calculator.add(2, 3),
    expected: 5
  });
});

describe('Calculator subtract', async assert => {
  assert({
    given: 'positive numbers',
    should: 'return difference',
    actual: calculator.subtract(5, 3),
    expected: 2
  });
});
```

#### After: Grouped Tests
```javascript
describe('Calculator operations', async assert => {
  // Addition tests
  assert({
    given: 'positive numbers for addition',
    should: 'return correct sum',
    actual: calculator.add(2, 3),
    expected: 5
  });

  // Subtraction tests
  assert({
    given: 'positive numbers for subtraction',
    should: 'return correct difference',
    actual: calculator.subtract(5, 3),
    expected: 2
  });
});
```

### Improving Test Descriptions

#### Before: Vague Descriptions
```javascript
describe('function test', async assert => {
  assert({
    given: 'input',
    should: 'work',
    actual: myFunction(input),
    expected: output
  });
});
```

#### After: Clear Descriptions
```javascript
describe('formatCurrency()', async assert => {
  assert({
    given: 'a number with decimal places',
    should: 'format as currency with dollar sign and two decimal places',
    actual: formatCurrency(123.456),
    expected: '$123.46'
  });
});
```

## Refactoring Production Code with Tests

### Step-by-Step Refactoring Process

1. **Ensure comprehensive test coverage**
2. **Make one small change at a time**
3. **Run tests after each change**
4. **Keep the API unchanged until refactoring is complete**

#### Example: Refactoring a Complex Function

##### Before: Monolithic Function
```javascript
const processOrder = (order) => {
  // Validation
  if (!order.items || order.items.length === 0) {
    throw new Error('Order must have items');
  }
  
  // Calculate total
  let total = 0;
  for (const item of order.items) {
    total += item.price * item.quantity;
  }
  
  // Apply discount
  if (order.discount) {
    total = total * (1 - order.discount / 100);
  }
  
  // Add tax
  const tax = total * 0.08;
  total += tax;
  
  return {
    orderId: generateId(),
    total: Math.round(total * 100) / 100,
    tax,
    status: 'processed'
  };
};
```

##### Step 1: Add Comprehensive Tests
```javascript
describe('processOrder()', async assert => {
  const basicOrder = {
    items: [
      { price: 10.00, quantity: 2 },
      { price: 5.00, quantity: 1 }
    ]
  };

  assert({
    given: 'order with basic items',
    should: 'calculate correct total with tax',
    actual: processOrder(basicOrder).total,
    expected: 27.00 // (20 + 5) * 1.08
  });

  assert({
    given: 'order with discount',
    should: 'apply discount before tax',
    actual: processOrder({
      ...basicOrder,
      discount: 10
    }).total,
    expected: 24.30 // (25 * 0.9) * 1.08
  });

  assert({
    given: 'empty order',
    should: 'throw validation error',
    actual: Try(processOrder, { items: [] }),
    expected: new Error('Order must have items')
  });
});
```

##### Step 2: Extract Validation
```javascript
const validateOrder = (order) => {
  if (!order.items || order.items.length === 0) {
    throw new Error('Order must have items');
  }
};

const processOrder = (order) => {
  validateOrder(order);
  
  // Rest of function unchanged...
};

// Run tests - should still pass
```

##### Step 3: Extract Calculation Logic
```javascript
const calculateSubtotal = (items) => {
  return items.reduce((total, item) => {
    return total + (item.price * item.quantity);
  }, 0);
};

const applyDiscount = (amount, discountPercent) => {
  if (!discountPercent) return amount;
  return amount * (1 - discountPercent / 100);
};

const calculateTax = (amount, taxRate = 0.08) => {
  return amount * taxRate;
};

const processOrder = (order) => {
  validateOrder(order);
  
  const subtotal = calculateSubtotal(order.items);
  const discountedAmount = applyDiscount(subtotal, order.discount);
  const tax = calculateTax(discountedAmount);
  const total = discountedAmount + tax;
  
  return {
    orderId: generateId(),
    total: Math.round(total * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    status: 'processed'
  };
};

// Run tests - should still pass
```

##### Step 4: Add Tests for New Functions
```javascript
describe('calculateSubtotal()', async assert => {
  assert({
    given: 'array of items with price and quantity',
    should: 'return sum of price * quantity',
    actual: calculateSubtotal([
      { price: 10, quantity: 2 },
      { price: 5, quantity: 1 }
    ]),
    expected: 25
  });
});

describe('applyDiscount()', async assert => {
  assert({
    given: 'amount and discount percentage',
    should: 'return discounted amount',
    actual: applyDiscount(100, 10),
    expected: 90
  });

  assert({
    given: 'amount with no discount',
    should: 'return original amount',
    actual: applyDiscount(100),
    expected: 100
  });
});
```

## Refactoring Component Tests

### Extracting Component Factories

#### Before: Repeated Component Creation
```javascript
describe('UserCard component', async assert => {
  const $ = render(
    <UserCard 
      user={{ name: 'John', email: 'john@example.com' }}
      showEmail={true}
    />
  );
  
  assert({
    given: 'user with email',
    should: 'display user name',
    actual: $('.user-name').text(),
    expected: 'John'
  });
});

describe('UserCard with hidden email', async assert => {
  const $ = render(
    <UserCard 
      user={{ name: 'John', email: 'john@example.com' }}
      showEmail={false}
    />
  );
  
  assert({
    given: 'showEmail is false',
    should: 'hide email address',
    actual: $('.user-email').length,
    expected: 0
  });
});
```

#### After: Component Factory
```javascript
const createUserCard = (props = {}) => {
  const defaultProps = {
    user: { name: 'John', email: 'john@example.com' },
    showEmail: true
  };
  
  return render(<UserCard {...defaultProps} {...props} />);
};

describe('UserCard component', async assert => {
  const $ = createUserCard();
  
  assert({
    given: 'user with email',
    should: 'display user name',
    actual: $('.user-name').text(),
    expected: 'John'
  });
});

describe('UserCard with hidden email', async assert => {
  const $ = createUserCard({ showEmail: false });
  
  assert({
    given: 'showEmail is false',
    should: 'hide email address',
    actual: $('.user-email').length,
    expected: 0
  });
});
```

### Extracting Common Assertions

#### Before: Repeated Assertions
```javascript
describe('Button variants', async assert => {
  const primaryButton = render(<Button variant="primary">Click me</Button>);
  
  assert({
    given: 'primary variant',
    should: 'have primary class',
    actual: primaryButton('.btn').hasClass('btn--primary'),
    expected: true
  });

  const secondaryButton = render(<Button variant="secondary">Click me</Button>);
  
  assert({
    given: 'secondary variant',
    should: 'have secondary class',
    actual: secondaryButton('.btn').hasClass('btn--secondary'),
    expected: true
  });
});
```

#### After: Assertion Helper
```javascript
const assertButtonVariant = (assert, variant) => {
  const $ = render(<Button variant={variant}>Click me</Button>);
  
  assert({
    given: `${variant} variant`,
    should: `have ${variant} class`,
    actual: $('.btn').hasClass(`btn--${variant}`),
    expected: true
  });
};

describe('Button variants', async assert => {
  assertButtonVariant(assert, 'primary');
  assertButtonVariant(assert, 'secondary');
});
```

## Legacy Code Refactoring

### Adding Tests to Untested Code

#### Step 1: Characterization Tests
```javascript
// First, test the current behavior (even if it's wrong)
describe('legacyFunction() characterization', async assert => {
  assert({
    given: 'current implementation',
    should: 'maintain existing behavior',
    actual: legacyFunction('input'),
    expected: currentOutput // Whatever it currently returns
  });
});
```

#### Step 2: Incremental Improvement
```javascript
// Add tests for desired behavior
describe('legacyFunction() desired behavior', async assert => {
  assert({
    given: 'proper input handling',
    should: 'return sanitized output',
    actual: legacyFunction('input'),
    expected: desiredOutput
  });
});

// Then modify the function to pass new tests
```

### Dealing with Dependencies

#### Before: Hard Dependencies
```javascript
const sendEmail = (user) => {
  const emailService = new EmailService(); // Hard dependency
  return emailService.send(user.email, 'Welcome!');
};

// Hard to test
describe('sendEmail()', async assert => {
  // This will actually send emails!
  assert({
    given: 'user with email',
    should: 'send welcome email',
    actual: sendEmail({ email: 'test@example.com' }),
    expected: true
  });
});
```

#### After: Dependency Injection
```javascript
const sendEmail = (user, emailService = new EmailService()) => {
  return emailService.send(user.email, 'Welcome!');
};

// Easy to test with mock
const mockEmailService = {
  send: (email, message) => `Sent "${message}" to ${email}`
};

describe('sendEmail()', async assert => {
  assert({
    given: 'user with email and mock service',
    should: 'call email service with correct parameters',
    actual: sendEmail({ email: 'test@example.com' }, mockEmailService),
    expected: 'Sent "Welcome!" to test@example.com'
  });
});
```

## Refactoring Anti-Patterns to Avoid

### Don't Change Tests and Code Simultaneously
```javascript
// BAD: Changing test and implementation together
describe('newFunction()', async assert => {
  assert({
    given: 'new input format',      // Changed test
    should: 'return new format',    // Changed test
    actual: newFunction(newInput),  // Changed implementation
    expected: newOutput             // Changed test
  });
});

// GOOD: Change tests first, then implementation
// 1. First, update tests for new desired behavior
// 2. Run tests (they should fail)
// 3. Update implementation to make tests pass
```

### Don't Remove Tests During Refactoring
```javascript
// BAD: Removing tests that became inconvenient
// describe('oldBehavior()', async assert => {
//   // Commented out because it's hard to maintain
// });

// GOOD: Update tests to reflect new behavior
describe('refactoredBehavior()', async assert => {
  assert({
    given: 'same input as before',
    should: 'provide improved output',
    actual: refactoredFunction(input),
    expected: improvedOutput
  });
});
```

## Refactoring Checklist

Before refactoring:
- ✅ **Ensure comprehensive test coverage**
- ✅ **All tests are passing**
- ✅ **Understand the current behavior fully**

During refactoring:
- ✅ **Make small, incremental changes**
- ✅ **Run tests after each change**
- ✅ **Keep the public API stable**
- ✅ **Add tests for new internal functions**

After refactoring:
- ✅ **All tests still pass**
- ✅ **Code is more readable and maintainable**
- ✅ **Performance hasn't degraded**
- ✅ **Documentation is updated if needed**