/// <reference types="cheerio" />
/// <reference types="react" />

declare module 'riteway' {

  export function Try<U extends any[], V>(fn: (...args: U) => V, ...args: U): any | Promise<any>

  export function createStream(opts: CreateStreamOptions): ReadableStream

  export const describe: DescribeFunction;

  interface DescribeFunction {
    (unit: string, testFunction: TestFunction): Promise<void>
    only: (unit: string, testFunction: TestFunction) => Promise<void>
    skip: (unit: string, testFunction: TestFunction) => Promise<void>
  }

  type assert = <T>(assertion: Assertion<T>) => void

  type TestFunction = (assert: assert, end?: Function) => Promise<void>

  interface Assertion<T> {
    readonly given: any
    readonly should: string
    readonly actual: T
    readonly expected: T
  }

  interface CreateStreamOptions {
    readonly objectMode: boolean
  }
}

declare module "riteway/render-component" {
  export default function render(el: JSX.Element): cheerio.Root;
}

declare module "riteway/match" {
  export default function match(text: string): (pattern: string | RegExp) => string;
}

declare module "riteway/vitest" {

  interface Assertion<T> {
    readonly given: any
    readonly should: string
    readonly actual: T
    readonly expected: T
  }

  export type assert = <T>(assertion: Assertion<T>) => void
}
