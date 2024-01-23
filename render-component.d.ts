/// <reference types="cheerio" />
/// <reference types="react" />

declare module 'riteway/render-component' {
  export default function render(el: JSX.Element): cheerio.Root;
}
