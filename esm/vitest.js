import { expect } from "vitest";
import { createTaskCollector, getCurrentSuite, setFn } from "vitest/suite";

const requiredKeys = ["given", "should", "actual", "expected"];
const concatToString = (keys, key, index) => keys + (index ? ", " : "") + key;

const assert = createTaskCollector((args) => {
  const missing = requiredKeys.filter((k) => !Object.keys(args).includes(k));
  if (missing.length) {
    throw new Error(
      `The following parameters are required by \`assert\`: ${missing.reduce(
        concatToString,
        ""
      )}`
    );
  }

  const {
    // initialize values to undefined so TypeScript doesn't complain
    given = undefined,
    should = "",
    actual = undefined,
    expected = undefined,
  } = args;

  // task adds a task during the collection phase
  const task = getCurrentSuite().task(`Given ${given}: should ${should}`);

  // A deep equality will not be performed for Error objects with toEqual.
  // To test if something was thrown, use toThrowError (https://vitest.dev/api/expect#tothrowerror) assertion.
  const deepEquals = () => {
    expect(actual).toEqual(expected);
  };

  setFn(task, deepEquals);
});

export { assert };
