import reactDom from 'react-dom/server';
import dom from 'cheerio';
// import { fixture } from '@open-wc/testing-helpers';
// import { html } from 'lit';

// export const renderLit = async (template) => {
//   const el = await fixture(html`${template}`);
//   await el.updateComplete; // Wait for the component to finish rendering
//   if (el.shadowRoot) {
//     return dom.load(el.shadowRoot.innerHTML);
//   }
//   return dom.load(el.innerHTML);
// };

export const renderReact = (component) =>
  dom.load(reactDom.renderToStaticMarkup(component));

export default renderReact;
