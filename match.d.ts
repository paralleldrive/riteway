declare module 'riteway/match' {
  export default function match(
    text: string
  ): (pattern: string | RegExp) => string;
}
