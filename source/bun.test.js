import { test, describe, assert, setupRitewayBun } from './bun.js';

setupRitewayBun();

describe('riteway/bun', () => {
  test('given: matching primitives, should: pass', () => {
    assert({
      given: 'two identical numbers',
      should: 'be equal',
      actual: 42,
      expected: 42,
    });
  });

  test('given: matching strings, should: pass', () => {
    assert({
      given: 'two identical strings',
      should: 'be equal',
      actual: 'hello',
      expected: 'hello',
    });
  });

  test('given: matching objects, should: pass', () => {
    assert({
      given: 'two identical objects',
      should: 'be deeply equal',
      actual: { name: 'Bun', version: 1.1 },
      expected: { name: 'Bun', version: 1.1 },
    });
  });

  test('given: matching arrays, should: pass', () => {
    assert({
      given: 'two identical arrays',
      should: 'be deeply equal',
      actual: [1, 2, 3],
      expected: [1, 2, 3],
    });
  });

  test('given: nested structures, should: pass', () => {
    assert({
      given: 'two identical nested structures',
      should: 'be deeply equal',
      actual: { users: [{ name: 'Alice' }, { name: 'Bob' }] },
      expected: { users: [{ name: 'Alice' }, { name: 'Bob' }] },
    });
  });
});
