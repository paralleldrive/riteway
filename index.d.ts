declare module 'riteway' {
  export function describe(label: string, callback: describeCallback): void
  
  export function Try<U, V>(fn: (...args: U) => V, ...args: U): any

  type describeCallback = (should: should) => Promise<void>

  type should = (label?: string) => { assert: assert }

  type assert = (assertion: Assertion) => void

  interface Assertion {
    given: string
    should?: string
    actual: any
    expected: any
  }
}
