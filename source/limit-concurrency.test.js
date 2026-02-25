import { describe, test, vi, onTestFinished } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { limitConcurrency } from './limit-concurrency.js';

describe('limit-concurrency', () => {
  describe('limitConcurrency()', () => {
    test('returns results for all tasks in input order', async () => {
      const tasks = [
        () => Promise.resolve(1),
        () => Promise.resolve(2),
        () => Promise.resolve(3),
      ];

      const results = await limitConcurrency(tasks, 2);

      assert({
        given: 'three tasks and a limit of 2',
        should: 'return all results in input order',
        actual: results,
        expected: [1, 2, 3],
      });
    });

    test('limits concurrent execution to the specified limit', async () => {
      vi.useFakeTimers();
      onTestFinished(() => vi.useRealTimers());
      let activeConcurrent = 0;
      let maxConcurrent = 0;

      const makeTask = () => async () => {
        activeConcurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, activeConcurrent);
        await new Promise(resolve => setTimeout(resolve, 10));
        activeConcurrent -= 1;
      };

      const tasks = Array.from({ length: 6 }, makeTask);
      const run = limitConcurrency(tasks, 2);
      await vi.runAllTimersAsync();
      await run;

      assert({
        given: '6 tasks with a limit of 2',
        should: 'reach but not exceed the concurrency limit',
        actual: maxConcurrent,
        expected: 2,
      });
    });

    test('returns empty array for empty task list', async () => {
      const results = await limitConcurrency([], 3);

      assert({
        given: 'empty task array',
        should: 'return empty array',
        actual: results,
        expected: [],
      });
    });

    test('propagates rejection when a task fails', async () => {
      const tasks = [
        () => Promise.resolve('ok'),
        () => Promise.reject(new Error('task failed')),
        () => Promise.resolve('also ok'),
      ];

      const error = await Try(limitConcurrency, tasks, 3);

      assert({
        given: 'a task that rejects',
        should: 'propagate the error',
        actual: error?.message,
        expected: 'task failed',
      });
    });

    test('executes all tasks when limit equals task count', async () => {
      const results = await limitConcurrency(
        [() => Promise.resolve('a'), () => Promise.resolve('b')],
        2,
      );

      assert({
        given: '2 tasks with limit matching task count',
        should: 'execute all tasks and return results',
        actual: results,
        expected: ['a', 'b'],
      });
    });

    test('throws RangeError for zero limit', async () => {
      const tasks = [() => Promise.resolve(1)];

      const error = await Try(limitConcurrency, tasks, 0);

      assert({
        given: 'limit of 0',
        should: 'throw RangeError',
        actual: error?.name,
        expected: 'RangeError',
      });
    });

    test('throws RangeError for negative limit', async () => {
      const tasks = [() => Promise.resolve(1)];

      const error = await Try(limitConcurrency, tasks, -1);

      assert({
        given: 'negative limit',
        should: 'throw RangeError',
        actual: error?.name,
        expected: 'RangeError',
      });
    });
  });
});
