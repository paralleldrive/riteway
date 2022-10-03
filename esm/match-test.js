import { describe } from './riteway';
import match from './match';

describe('match', async assert => {
  {
    const given = 'some text to search and a pattern to match';
    const should = 'return the matched text';

    const textToSearch = '<h1>Dialog Title</h1>';
    const pattern = 'Dialog Title';
    const contains = match(textToSearch);

    assert({
      given,
      should,
      actual: contains(pattern),
      expected: pattern,
    });
  }

  {
    const given = 'some text with digits';
    const should = 'return the matched text';

    const textWithDigit = '<h1>There are 4 cats</h1>';
    const pattern = /\d+\s\w+/i;
    const contains = match(textWithDigit);

    assert({
      given,
      should,
      actual: contains(pattern),
      expected: '4 cats'
    });
  }

  {
    const given = 'some text that includes regex meta characters';
    const should = 'return the matched text';

    const textWithRegexMetaChar = '<h1>Are there any cats?</h1>';
    const pattern = 'Are there any cats?';
    const contains = match(textWithRegexMetaChar);

    assert({
      given,
      should,
      actual: contains(pattern),
      expected: 'Are there any cats?'
    });
  }

});
