declare module 'riteway' {
  export function describe(label: string, TestFunction: TestFunction): void

  export function Try<U extends any[], V>(fn: (...args: U) => V, ...args: U): any

  export function createStream(opts: CreateStreamOptions): ReadableStream

  type assert = (assertion: Assertion) => void

  type TestFunction = (assert: assert, end?: Function) => Promise<void>

  interface Assertion {
    readonly given: any
    readonly should: string
    readonly actual: any
    readonly expected: any
  }

  interface CreateStreamOptions {
    readonly objectMode: boolean
  }
}
