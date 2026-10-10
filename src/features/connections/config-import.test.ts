import { importInput, importRows } from './config-import';
import { EMPTY_CONNECTION_INPUT, type Connection } from './connections';
import type { ConfigHost } from './ssh-config';

const host = (alias: string, rest: Partial<ConfigHost> = {}): ConfigHost => ({
  alias,
  hostName: alias,
  user: null,
  port: 22,
  jump: false,
  ...rest,
});

const LEXBOX: Connection = {
  id: 'lexbox',
  kind: 'ssh',
  name: 'Lexbox',
  host: 'lexbox.tail.ts.net',
  port: 22,
  username: 'lexde',
};

describe('importRows', () => {
  it('says why a host starts unticked', () => {
    const rows = importRows(
      [
        host('new', { hostName: '100.64.0.2', user: 'ada' }),
        host('lexbox', { hostName: 'LEXBOX.tail.ts.net' }),
        host('lexbox-root', { hostName: 'lexbox.tail.ts.net', user: 'root' }),
        host('prod', { jump: true }),
        host('orb', { hostName: '127.0.0.1', port: 32222 }),
        host('dev', { hostName: 'localhost' }),
        host('templated', { hostName: '%n.example.com' }),
      ],
      [LEXBOX]
    );

    expect(rows.map(({ host: { alias }, note }) => [alias, note])).toEqual([
      ['new', null],
      ['lexbox', 'saved'],
      ['lexbox-root', null],
      ['prod', 'jump'],
      ['orb', 'local'],
      ['dev', 'local'],
      ['templated', 'invalid'],
    ]);
  });
});

describe('importInput', () => {
  it('fills the form’s fields, with the username given for a host without one', () => {
    expect(importInput(host('web', { hostName: '10.0.0.5', port: 2222 }), ' ada ', 'g1')).toEqual({
      ...EMPTY_CONNECTION_INPUT,
      name: 'web',
      host: '10.0.0.5',
      port: '2222',
      username: 'ada',
      groupId: 'g1',
    });
    expect(importInput(host('pi', { user: 'pi' }), 'ada', '').username).toBe('pi');
  });
});
