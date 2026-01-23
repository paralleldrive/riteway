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
 * @param {number} [options.threshold=75] - Required pass percentage
 * @returns {number} Number of passes required
 */
export const calculateRequiredPasses = ({ runs = 4, threshold = 75 } = {}) =>
  Math.ceil((runs * threshold) / 100);
