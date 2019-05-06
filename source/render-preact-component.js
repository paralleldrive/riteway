import renderToStaticMarkup from 'preact-render-to-string';
import dom from 'cheerio';

const render = component => dom.load(renderToStaticMarkup(component));

export default render;
