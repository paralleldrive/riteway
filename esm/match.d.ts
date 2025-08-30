declare module 'riteway/esm/match.js' {
  export default function match(
    text: string
  ): (pattern: string | RegExp) => string;
}