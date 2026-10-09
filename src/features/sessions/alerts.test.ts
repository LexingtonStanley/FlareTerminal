import { parseOsc777, parseOsc9, parseOsc99 } from './alerts';

describe('parseOsc9', () => {
  it('reads iTerm2 notifications', () => {
    expect(parseOsc9('Claude is waiting for your input')).toEqual({
      title: null,
      body: 'Claude is waiting for your input',
    });
  });

  it('ignores progress bars and empty messages', () => {
    expect(parseOsc9('4;1;50')).toBeNull();
    expect(parseOsc9('  ')).toBeNull();
  });
});

describe('parseOsc777', () => {
  it('reads notify with a title and a body containing semicolons', () => {
    expect(parseOsc777('notify;Claude Code;Done; 3 files changed')).toEqual({
      title: 'Claude Code',
      body: 'Done; 3 files changed',
    });
  });

  it('ignores other 777 commands', () => {
    expect(parseOsc777('preexec')).toBeNull();
  });
});

describe('parseOsc99', () => {
  it('reads kitty titles and bodies, including base64 payloads', () => {
    expect(parseOsc99(';Build finished')).toEqual({ title: 'Build finished', body: '' });
    expect(parseOsc99('p=body;All tests passed')).toEqual({
      title: null,
      body: 'All tests passed',
    });
    expect(parseOsc99(`e=1:p=body;${btoa('Needs approval')}`)).toEqual({
      title: null,
      body: 'Needs approval',
    });
  });

  it('ignores other payload types and malformed input', () => {
    expect(parseOsc99('p=icon;abc')).toBeNull();
    expect(parseOsc99('no separator')).toBeNull();
  });
});
