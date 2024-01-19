import { expect } from 'vitest';

export const assert = ({ given, should, actual, expected }) => {
  expect(actual, `Given ${given}: should ${should}`).toEqual(expected);
};
