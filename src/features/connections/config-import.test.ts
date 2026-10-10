import {
  goesThrough,
  importConnections,
  importInput,
  importNote,
  importRows,
  withJumps,
} from './config-import';
import { EMPTY_CONNECTION_INPUT, type Connection, type SshConnection } from './connections';
import type { ConfigHost } from './ssh-config';

const host = (alias: string, rest: Partial<ConfigHost> = {}): ConfigHost => ({
  alias,
  hostName: alias,
  user: null,
  port: 22,
  proxyJump: null,
  proxyCommand: false,
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

const BASTION: Connection = {
  id: 'saved-bastion',
  kind: 'ssh',
  name: 'Work bastion',
  host: 'bastion.example.com',
  port: 22,
  username: 'ec2-user',
};

describe('importRows', () => {
  it('says why a host starts unticked', () => {
    const rows = importRows(
      [
        host('new', { hostName: '100.64.0.2', user: 'ada' }),
        host('lexbox', { hostName: 'LEXBOX.tail.ts.net' }),
        host('lexbox-root', { hostName: 'lexbox.tail.ts.net', user: 'root' }),
        host('old', { proxyCommand: true }),
        host('orb', { hostName: '127.0.0.1', port: 32222 }),
        host('dev', { hostName: 'localhost' }),
        host('templated', { hostName: '%n.example.com' }),
      ],
      [LEXBOX]
    );

    expect(rows.map((row) => [row.host.alias, row.note, importNote(row)])).toEqual([
      ['new', null, null],
      ['lexbox', 'saved', 'Already saved'],
      ['lexbox-root', null, null],
      ['old', 'command', 'Reached with a ProxyCommand, which Flare can’t run'],
      ['orb', 'local', 'Points at localhost, which from the phone is the phone'],
      ['dev', 'local', 'Points at localhost, which from the phone is the phone'],
      ['templated', 'invalid', 'Flare can’t read its HostName'],
    ]);
  });

  it('finds the jump host a ProxyJump names, here or saved', () => {
    const rows = importRows(
      [
        host('bastion', { hostName: 'jump.example.com', user: 'ec2-user' }),
        host('web', { hostName: '10.0.1.5', proxyJump: 'bastion' }),
        // On the jump host, localhost is the jump host itself.
        host('jump-local', { hostName: 'localhost', port: 2200, proxyJump: 'bastion' }),
        host('db', { hostName: '10.0.2.5', proxyJump: 'web' }),
        host('work', { hostName: '10.9.0.1', proxyJump: 'ec2-user@bastion.example.com' }),
        host('uri', { proxyJump: 'ssh://bastion.example.com:22' }),
      ],
      [BASTION]
    );

    expect(rows.map((row) => [row.host.alias, row.note, row.jump, importNote(row)])).toEqual([
      ['bastion', null, null, null],
      ['web', null, { alias: 'bastion' }, 'Through bastion'],
      ['jump-local', null, { alias: 'bastion' }, 'Through bastion'],
      ['db', null, { alias: 'web' }, 'Through web'],
      ['work', null, { connectionId: 'saved-bastion' }, 'Through Work bastion'],
      ['uri', null, { connectionId: 'saved-bastion' }, 'Through Work bastion'],
    ]);
  });

  it('uses the saved connection for a jump host that’s already saved', () => {
    const rows = importRows(
      [host('bastion', { hostName: 'bastion.example.com' }), host('web', { proxyJump: 'bastion' })],
      [BASTION]
    );
    expect(rows.map(({ note, jump }) => [note, jump])).toEqual([
      ['saved', null],
      [null, { connectionId: 'saved-bastion' }],
    ]);
  });

  it('says which jump hosts it can’t follow', () => {
    const rows = importRows(
      [
        host('elsewhere', { proxyJump: 'ada@unknown.example.com' }),
        host('deep', { proxyJump: 'outer,inner' }),
        host('a', { proxyJump: 'b' }),
        host('b', { proxyJump: 'a' }),
        host('behind-command', { proxyJump: 'old' }),
        host('old', { proxyCommand: true }),
        // Not the bastion host here: another user.
        host('bastion', { user: 'ec2-user' }),
        host('other-user', { proxyJump: 'root@bastion' }),
      ],
      []
    );
    expect(rows.map((row) => [row.host.alias, row.note, importNote(row)])).toEqual([
      [
        'elsewhere',
        'jump',
        'Reached through ada@unknown.example.com, which isn’t saved or here to add',
      ],
      ['deep', 'chain', 'Its ProxyJump lists several hosts, which Flare can’t import yet'],
      ['a', 'jump', 'Reached through b, which isn’t saved or here to add'],
      ['b', 'jump', 'Reached through a, which isn’t saved or here to add'],
      ['behind-command', 'jump', 'Reached through old, which isn’t saved or here to add'],
      ['old', 'command', 'Reached with a ProxyCommand, which Flare can’t run'],
      ['bastion', null, null],
      ['other-user', 'jump', 'Reached through root@bastion, which isn’t saved or here to add'],
    ]);
  });
});

describe('adding hosts with their jump hosts', () => {
  const rows = importRows(
    [
      host('bastion', { hostName: 'jump.example.com' }),
      host('web', { hostName: '10.0.1.5', proxyJump: 'bastion' }),
      host('db', { hostName: '10.0.2.5', proxyJump: 'web' }),
      host('work', { proxyJump: 'bastion.example.com' }),
      host('pi'),
    ],
    [BASTION]
  );
  const [bastion, web, db, work, pi] = rows;

  it('brings in the hosts a ticked one goes through', () => {
    expect(withJumps(rows, [db, pi])).toEqual([bastion, web, db, pi]);
    expect(withJumps(rows, [work])).toEqual([work]);
    expect(goesThrough(db, bastion, rows)).toBe(true);
    expect(goesThrough(db, web, rows)).toBe(true);
    expect(goesThrough(web, db, rows)).toBe(false);
    expect(goesThrough(pi, bastion, rows)).toBe(false);
  });

  it('links each new connection to its jump host', () => {
    let next = 0;
    const added = importConnections(
      withJumps(rows, [db, work]),
      'ada',
      'g1',
      () => `n${next++}`
    ) as SshConnection[];

    expect(added.map(({ id, name, jumpId, groupId }) => ({ id, name, jumpId, groupId }))).toEqual(
      [
        { id: 'n0', name: 'bastion', jumpId: null, groupId: 'g1' },
        { id: 'n1', name: 'web', jumpId: 'n0', groupId: 'g1' },
        { id: 'n2', name: 'db', jumpId: 'n1', groupId: 'g1' },
        { id: 'n3', name: 'work', jumpId: 'saved-bastion', groupId: 'g1' },
      ].map((connection) => expect.objectContaining(connection))
    );
  });

  it('refuses to add a host without the one it goes through', () => {
    expect(() => importConnections([db], 'ada', '')).toThrow(
      'db goes through web, which isn’t added'
    );
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
