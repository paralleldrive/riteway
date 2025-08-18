import reactDom from 'react-dom/server';
import { load } from 'cheerio';

const render = component =>
  load(reactDom.renderToStaticMarkup(component));

export default render;

