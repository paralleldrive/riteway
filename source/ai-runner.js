import { readFile } from 'fs/promises';

/**
 * Read the contents of a test file.
 * @param {string} filePath - Path to the test file
 * @returns {Promise<string>} File contents
 */
export const readTestFile = (filePath) => readFile(filePath, 'utf-8');

/**
 * Calculate the number of passes required to meet the threshold.
 * Uses ceiling to ensure threshold is met or exceeded.
 * @param {Object} options
 * @param {number} [options.runs=4] - Total number of test runs
 * @param {number} [options.threshold=75] - Required pass percentage (0-100)
 * @returns {number} Number of passes required
 * @throws {Error} If threshold is not between 0 and 100
 */
export const calculateRequiredPasses = ({ runs = 4, threshold = 75 } = {}) => {
  if (threshold < 0 || threshold > 100) {
    throw new Error('threshold must be between 0 and 100');
  }
  return Math.ceil((runs * threshold) / 100);
};
