import reactDom from 'react-dom/server';
import dom from 'cheerio';

const render = component =>
  dom.load(reactDom.renderToStaticMarkup(component));

export default render;

