/// <reference types='cheerio' />
/// <reference types='react' />

declare module 'riteway/vitest' {
  interface Assertion<T> {
    readonly given: string;
    readonly should: string;
    readonly actual: T;
    readonly expected: T;
  }

  export function assert<T>(assertion: Assertion<T>): void;
}