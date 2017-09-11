# RITEway

Unit tests that always supply a good bug report when they fail.


```js
import { describe, Try } from 'riteway';

// a function to test
const sum = (...args) => {
  if (args.some(v => Number.isNaN(v))) throw new TypeError('NaN');
  return args.reduce((acc, n) => acc + n, 0);
};

describe('sum()', async should => {
  const { assert } = should('return the correct sum');

  assert({
    given: 'no arguments',
    should: 'return 0',
    actual: sum(),
    expected: 0
  });

  assert({
    given: 'zero',
    actual: sum(2, 0),
    expected: 2
  });

  assert({
    given: 'negative numbers',
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
