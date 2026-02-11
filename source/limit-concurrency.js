/**
 * Simple concurrency limiter to avoid resource exhaustion.
 * Executes tasks with a maximum concurrency limit.
 * @param {Array<Function>} tasks - Array of async task functions
 * @param {number} limit - Maximum number of concurrent tasks
 * @returns {Promise<Array>} Results from all tasks
 */
export const limitConcurrency = async (tasks, limit) => {
  const results = [];
  const executing = [];

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
