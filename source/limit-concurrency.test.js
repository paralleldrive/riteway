import { describe, test, vi } from 'vitest';
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
      vi.useRealTimers();

      assert({
        given: '6 tasks with a limit of 2',
        should: 'never exceed 2 concurrent executions',
        actual: maxConcurrent <= 2,
        expected: true,
      });

      assert({
        given: '6 tasks with a limit of 2',
        should: 'reach the full concurrency limit',
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
  });
});
