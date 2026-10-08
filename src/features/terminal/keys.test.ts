import { applyModifiers, controlCharacter, NO_MODIFIERS, sequenceForKey } from './keys';

describe('sequenceForKey', () => {
  it('sends normal-mode arrows by default', () => {
    expect(sequenceForKey('up')).toBe('\x1b[A');
    expect(sequenceForKey('left')).toBe('\x1b[D');
  });

  it('sends application-mode arrows when the app asked for them', () => {
    expect(sequenceForKey('up', { applicationCursor: true })).toBe('\x1bOA');
    expect(sequenceForKey('home', { applicationCursor: true })).toBe('\x1bOH');
  });

  it('sends carriage return for enter, as terminals do', () => {
    expect(sequenceForKey('enter')).toBe('\r');
  });

  it('sends back-tab for shift-tab', () => {
    expect(sequenceForKey('shift-tab')).toBe('\x1b[Z');
  });
});

describe('controlCharacter', () => {
  it.each([
    ['c', '\x03'],
    ['C', '\x03'],
    ['d', '\x04'],
    ['[', '\x1b'],
    [' ', '\x00'],
    ['?', '\x7f'],
  ])('maps Ctrl+%j', (char, expected) => {
    expect(controlCharacter(char)).toBe(expected);
  });

  it('has no byte for digits or multi-character input', () => {
    expect(controlCharacter('1')).toBeNull();
    expect(controlCharacter('ab')).toBeNull();
  });
});

describe('applyModifiers', () => {
  it('passes input through without modifiers', () => {
    expect(applyModifiers('ls', NO_MODIFIERS)).toBe('ls');
  });

  it('turns a typed letter into a control byte', () => {
    expect(applyModifiers('c', { ctrl: true, alt: false })).toBe('\x03');
  });

  it('prefixes ESC for alt, including on top of ctrl', () => {
    expect(applyModifiers('b', { ctrl: false, alt: true })).toBe('\x1bb');
    expect(applyModifiers('x', { ctrl: true, alt: true })).toBe('\x1b\x18');
  });

  it('leaves input that ctrl cannot modify unchanged', () => {
    expect(applyModifiers('hello', { ctrl: true, alt: false })).toBe('hello');
  });
});
