/**
 * Sliding-window async concurrency limiter.
 * Executes tasks with a maximum concurrency limit, preserving result order.
 * Uses fail-fast semantics: if any task rejects, the returned promise rejects
 * immediately and remaining results are discarded.
 * @param {Array<Function>} tasks - Array of async task functions
 * @param {number} limit - Maximum number of concurrent tasks (must be >= 1)
 * @returns {Promise<Array>} Results from all tasks in input order
 */
export const limitConcurrency = async (tasks, limit) => {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`limit must be a positive integer, got ${limit}`);
  }

  const results = [];
  const executing = [];

  // Sequential launch is required; await throttles entry into the pool
  for (const task of tasks) {
    const promise = task().then(result => {
      executing.splice(executing.indexOf(promise), 1);
      return result;
    });

    results.push(promise);
    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
};
