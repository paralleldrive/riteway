import { expect } from "vitest";
import { createTaskCollector, getCurrentSuite, setFn } from "vitest/suite";

const requiredKeys = ["given", "should", "actual", "expected"];
const concatToString = (keys, key, index) => keys + (index ? ", " : "") + key;

const assert = createTaskCollector(({
  given = undefined,
  should = undefined,
  actual = undefined,
  expected = undefined,
}) => {
  const missing = requiredKeys.filter((k) => !Object.keys({ given, should, actual, expected }).includes(k));
  if (missing.length) {
    throw new Error(
      `The following parameters are required by \`assert\`: ${missing.reduce(
        concatToString,
        ""
      )}`
    );
  }

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
