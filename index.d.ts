declare module 'riteway' {
  export function describe(label: string, callback: describeCallback): void
  
  export function Try<U extends any[], V>(fn: (...args: U) => V, ...args: U): any

  type describeCallback = ({ assert: assert }) => Promise<void>

  type assert = (assertion: Assertion) => void

  interface Assertion {
    readonly given: string
    readonly should: string
    readonly actual: any
    readonly expected: any
  }
}
