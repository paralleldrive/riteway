/// <reference types="cheerio" />
/// <reference types="react" />
/// <reference types="lit" />

import { TemplateResult } from "lit";

declare module 'riteway/render-component' {
  export function renderLit(el: TemplateResult): cheerio.Root;
  export function renderReact(el: JSX.Element): cheerio.Root;
  export default function render(el: JSX.Element): cheerio.Root;
}
