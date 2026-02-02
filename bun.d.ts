declare module 'riteway/bun' {
  interface Assertion<T> {
    readonly given: string;
    readonly should: string;
    readonly actual: T;
    readonly expected: T;
  }

  export function assert<T>(assertion: Assertion<T>): void;

  /**
   * Setup function to extend Bun's expect with a custom RITEway matcher.
   * Call this once in your test setup file or at the top of test files.
   */
  export function setupRitewayBun(): void;

  // Re-export test and describe from bun:test
  export { test, describe } from 'bun:test';
}
