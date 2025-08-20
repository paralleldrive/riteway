/// <reference types="cheerio" />
/// <reference types="react" />

declare module 'riteway/esm/render-component.js' {
  export default function render(el: JSX.Element): cheerio.Root;
}