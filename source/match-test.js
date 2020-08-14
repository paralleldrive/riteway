import { describe } from './riteway';
import { match } from './match';

describe('match', async assert => {

  {
    const textToSearch = '<h1>Dialog Title</h1>';
    const pattern = 'Dialog Title';
    const contains = match(textToSearch);
    const actual = contains(pattern);

    assert({
      given: 'some text to search and a pattern to match',
      should: 'return the matched text',
      actual,
      expected: pattern,
    });

    {
      const textWithDigit = '<h1>There are 4 cats</h1>';
      const pattern = /\d+\s\w+/i;
      const expected = '4 cats';
      const contains = match(textWithDigit);
      const actual = contains(pattern);

      assert({
        given: 'some text with digits',
        should: 'return the matched text',
        actual,
        expected,
      });
    }
  }
});