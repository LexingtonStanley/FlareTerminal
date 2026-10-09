import { cdPrefix, quote, quoteDirectory } from './shell';

describe('quote', () => {
  it.each(['claude', '--yolo', 'a/b.c', 'user@host:22', 'x=1,y'])('leaves %j alone', (word) => {
    expect(quote(word)).toBe(word);
  });

  it.each([
    ['two words', "'two words'"],
    ["it's", "'it'\\''s'"],
    ['$HOME', "'$HOME'"],
    ['a;b', "'a;b'"],
    ['', "''"],
    ['layout { pane command="claude"; }', `'layout { pane command="claude"; }'`],
  ])('quotes %j as %s', (word, expected) => {
    expect(quote(word)).toBe(expected);
  });
});

describe('quoteDirectory', () => {
  it.each([
    ['~', '~'],
    ['~/', '~/'],
    ['~/agents/janus', '~/agents/janus'],
    ['~/My Agents', "~/'My Agents'"],
    ['/srv/app', '/srv/app'],
    ['/srv/my app', "'/srv/my app'"],
    ['~ada/app', "'~ada/app'"],
  ])('quotes %j as %s', (directory, expected) => {
    expect(quoteDirectory(directory)).toBe(expected);
  });
});

describe('cdPrefix', () => {
  it('is empty without a folder', () => {
    expect(cdPrefix('')).toBe('');
    expect(cdPrefix('   ')).toBe('');
  });

  it('changes to a trimmed folder', () => {
    expect(cdPrefix(' ~/code/flare ')).toBe('cd ~/code/flare && ');
  });
});
