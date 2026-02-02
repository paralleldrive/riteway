import { expect, test, describe } from 'bun:test';

export { test, describe };

const requiredKeys = ['given', 'should', 'actual', 'expected'];

/**
 * Setup function to extend Bun's expect with a custom RITEway matcher.
 * Call this once in your test setup file or at the top of test files.
 */
export const setupRitewayBun = () => {
  expect.extend({
    toRitewayEqual(received, expected, given, should) {
      const pass = this.equals(received, expected);

      if (pass) {
        return { pass: true };
      }

      return {
        pass: false,
        message: () =>
          `Given ${given}: should ${should}\n\nExpected: ${this.utils.printExpected(expected)}\nReceived: ${this.utils.printReceived(received)}`,
      };
    },
  });
};

/**
 * Assert function compatible with Bun's expect, using the custom matcher.
 * @param {Object} args - Assertion object with given, should, actual, expected.
 */
export const assert = (args = {}) => {
  const missing = requiredKeys.filter((k) => !Object.keys(args).includes(k));
  if (missing.length) {
    throw new Error(
      `The following parameters are required by \`assert\`: ${missing.join(', ')}`
    );
  }

  const { given, should, actual, expected } = args;
  expect(actual).toRitewayEqual(expected, given, should);
};
