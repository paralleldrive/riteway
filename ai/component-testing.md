# React Component Testing with Riteway

## Setup and Imports

```javascript
import React from 'react';
import { describe } from 'riteway';
import render from 'riteway/render-component';
import match from 'riteway/match';
```

## Basic Component Testing Pattern

```javascript
// Component to test
const Greeting = ({ name }) => <h1>Hello, {name}!</h1>;

describe('Greeting component', async assert => {
  const $ = render(<Greeting name="World" />);
  
  assert({
    given: 'a name prop',
    should: 'render greeting with the name',
    actual: $('h1').text(),
    expected: 'Hello, World!'
  });
});
```

## Using match() for Content Verification

The `match()` function is particularly useful for testing rendered content:

```javascript
const BlogPost = ({ title, content }) => (
  <article>
    <h1>{title}</h1>
    <div className="content">{content}</div>
  </article>
);

describe('BlogPost component', async assert => {
  const title = 'My Blog Post';
  const content = 'This is the blog content.';
  const $ = render(<BlogPost title={title} content={content} />);
  
  // Using match to find specific text
  const contains = match($('.content').html());
  
  assert({
    given: 'title and content props',
    should: 'render the content',
    actual: contains(content),
    expected: content
  });
});
```

## Testing Component State and Props

```javascript
const Counter = ({ initialCount = 0 }) => {
  const [count, setCount] = React.useState(initialCount);
  
  return (
    <div>
      <span className="count">{count}</span>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
};

describe('Counter component', async assert => {
  {
    const $ = render(<Counter />);
    
    assert({
      given: 'no initial count',
      should: 'display zero as default',
      actual: $('.count').text(),
      expected: '0'
    });
  }

  {
    const $ = render(<Counter initialCount={5} />);
    
    assert({
      given: 'an initial count of 5',
      should: 'display the initial count',
      actual: $('.count').text(),
      expected: '5'
    });
  }
});
```

## Testing Component Structure and CSS Classes

```javascript
const Card = ({ title, children, variant = 'default' }) => (
  <div className={`card card--${variant}`}>
    <h2 className="card__title">{title}</h2>
    <div className="card__content">{children}</div>
  </div>
);

describe('Card component', async assert => {
  const $ = render(
    <Card title="Test Card" variant="primary">
      <p>Card content</p>
    </Card>
  );

  assert({
    given: 'a variant prop',
    should: 'apply the correct CSS class',
    actual: $('.card').hasClass('card--primary'),
    expected: true
  });

  assert({
    given: 'a title prop',
    should: 'render title in correct element',
    actual: $('.card__title').text(),
    expected: 'Test Card'
  });
});
```

## Testing Lists and Repeated Elements

```javascript
const TodoList = ({ todos }) => (
  <ul className="todo-list">
    {todos.map(todo => (
      <li key={todo.id} className={`todo ${todo.completed ? 'completed' : ''}`}>
        {todo.text}
      </li>
    ))}
  </ul>
);

describe('TodoList component', async assert => {
  const todos = [
    { id: 1, text: 'Buy milk', completed: false },
    { id: 2, text: 'Walk dog', completed: true }
  ];
  
  const $ = render(<TodoList todos={todos} />);

  assert({
    given: 'an array of todos',
    should: 'render correct number of items',
    actual: $('.todo').length,
    expected: 2
  });

  assert({
    given: 'a completed todo',
    should: 'apply completed class',
    actual: $('.todo').eq(1).hasClass('completed'),
    expected: true
  });
});
```

## Testing Component with Event Handlers

```javascript
const Button = ({ onClick, children, disabled = false }) => (
  <button onClick={onClick} disabled={disabled}>
    {children}
  </button>
);

describe('Button component', async assert => {
  const $ = render(<Button disabled={true}>Click me</Button>);

  assert({
    given: 'disabled prop is true',
    should: 'render button as disabled',
    actual: $('button').prop('disabled'),
    expected: true
  });

  assert({
    given: 'children content',
    should: 'render button text',
    actual: $('button').text(),
    expected: 'Click me'
  });
});
```

## Testing Conditional Rendering

```javascript
const Message = ({ type, text }) => {
  if (!text) return null;
  
  return (
    <div className={`message message--${type}`}>
      {type === 'error' && <span className="icon">⚠️</span>}
      {text}
    </div>
  );
};

describe('Message component', async assert => {
  {
    const $ = render(<Message type="error" text="Something went wrong" />);
    
    assert({
      given: 'error type and text',
      should: 'render error icon',
      actual: $('.icon').text(),
      expected: '⚠️'
    });
  }

  {
    const $ = render(<Message type="info" text="" />);
    
    assert({
      given: 'empty text',
      should: 'render nothing',
      actual: $('.message').length,
      expected: 0
    });
  }
});
```

## Testing Components with Complex Markup

```javascript
const ProductCard = ({ product }) => (
  <div className="product-card">
    <img src={product.image} alt={product.name} />
    <h3>{product.name}</h3>
    <p className="price">${product.price}</p>
    <p className="description">{product.description}</p>
  </div>
);

describe('ProductCard component', async assert => {
  const product = {
    name: 'Widget',
    price: 29.99,
    description: 'A useful widget',
    image: '/widget.jpg'
  };
  
  const $ = render(<ProductCard product={product} />);
  const contains = match($('.product-card').html());

  assert({
    given: 'a product object',
    should: 'render product name',
    actual: contains(product.name),
    expected: product.name
  });

  assert({
    given: 'a product with price',
    should: 'format price correctly',
    actual: $('.price').text(),
    expected: '$29.99'
  });
});
```

## Common Patterns for Component Testing

### Testing Accessibility Attributes
```javascript
assert({
  given: 'component with accessibility requirements',
  should: 'have correct aria-label',
  actual: $('button').attr('aria-label'),
  expected: 'Close dialog'
});
```

### Testing Data Attributes
```javascript
assert({
  given: 'component with data attributes',
  should: 'set correct data attribute',
  actual: $('.item').attr('data-testid'),
  expected: 'product-123'
});
```

### Testing Component Composition
```javascript
const Layout = ({ children }) => (
  <div className="layout">
    <header>Header</header>
    <main>{children}</main>
  </div>
);

const $ = render(
  <Layout>
    <p>Content</p>
  </Layout>
);

assert({
  given: 'children content',
  should: 'render children in main section',
  actual: $('main p').text(),
  expected: 'Content'
});
```

## Best Practices

1. **Test the rendered output, not implementation details**
2. **Use `match()` for text content verification**
3. **Test component behavior at different prop values**
4. **Focus on what users see and interact with**
5. **Keep component tests isolated and independent**
6. **Use descriptive selectors based on CSS classes or structure**
7. **Test both positive and negative cases (what should and shouldn't render)**