import {
  connectionLabel,
  connectionWarning,
  EMPTY_CONNECTION_INPUT,
  migrateConnection,
  parseSshTarget,
  toConnection,
  toInput,
  validateConnection,
  type ConnectionInput,
} from './connections';

const ssh = (fields: Partial<ConnectionInput>): ConnectionInput => ({
  ...EMPTY_CONNECTION_INPUT,
  ...fields,
});
const ttyd = (fields: Partial<ConnectionInput>): ConnectionInput => ({
  ...EMPTY_CONNECTION_INPUT,
  kind: 'ttyd',
  ...fields,
});

describe('parseSshTarget', () => {
  it.each([
    ['lexbox', { host: 'lexbox' }],
    ['lexde@lexbox', { username: 'lexde', host: 'lexbox' }],
    ['lexde@100.101.102.103:2222', { username: 'lexde', host: '100.101.102.103', port: 2222 }],
    ['ssh lexde@lexbox', { username: 'lexde', host: 'lexbox' }],
    ['ada@[::1]:22', { username: 'ada', host: '::1', port: 22 }],
  ])('reads %j', (text, expected) => {
    expect(parseSshTarget(text)).toEqual({ username: undefined, port: undefined, ...expected });
  });
});

describe('validateConnection for SSH', () => {
  it('accepts user@host typed into Host', () => {
    expect(validateConnection(ssh({ host: 'lexde@lexbox' }))).toEqual({});
  });

  it('needs a host and a username', () => {
    expect(validateConnection(ssh({}))).toEqual({
      host: 'Enter the computer’s name or IP, e.g. lexbox',
      username: 'Enter your username on that computer',
    });
  });

  it('rejects URLs and bad ports', () => {
    expect(validateConnection(ssh({ host: 'https://lexbox', username: 'a' })).host).toBe(
      'Enter just the name or IP, e.g. lexbox'
    );
    expect(validateConnection(ssh({ host: 'lexbox', username: 'a', port: '70000' })).port).toBe(
      'Use a port from 1 to 65535'
    );
  });
});

describe('validateConnection for ttyd', () => {
  it('explains addresses it cannot use', () => {
    expect(validateConnection(ttyd({ url: 'ftp://devbox' })).url).toBe(
      'Use an http(s):// or ws(s):// address'
    );
  });

  it('needs a password when a username is set', () => {
    expect(validateConnection(ttyd({ url: 'devbox:7681', username: 'ada' }))).toEqual({
      password: 'Enter the password for this username',
    });
  });
});

describe('toConnection', () => {
  it('splits user@host:port and names the connection after it', () => {
    expect(toConnection(ssh({ host: 'lexde@lexbox:2222' }), 'c1')).toEqual({
      id: 'c1',
      kind: 'ssh',
      name: 'lexde@lexbox:2222',
      host: 'lexbox',
      port: 2222,
      username: 'lexde',
      groupId: null,
      protected: false,
      keepAlive: true,
    });
  });

  it('keeps the group, protection and keep-alive, and reads them back for editing', () => {
    const connection = toConnection(
      ssh({ host: 'lexbox', username: 'lexde', groupId: 'g1', protected: true, keepAlive: false }),
      'c1'
    );
    expect(connection).toMatchObject({ groupId: 'g1', protected: true, keepAlive: false });
    expect(toInput(connection, null)).toMatchObject({
      groupId: 'g1',
      protected: true,
      keepAlive: false,
    });
  });

  it('treats connections saved before groups as ungrouped, unprotected and kept alive', () => {
    const old = {
      id: 'c1',
      kind: 'ssh',
      name: 'Box',
      host: 'box',
      port: 22,
      username: 'a',
    } as const;
    expect(toInput(old, null)).toMatchObject({ groupId: '', protected: false, keepAlive: true });
  });

  it('prefers the Username field and keeps a given name', () => {
    const connection = toConnection(
      ssh({ name: ' Lexbox ', host: 'root@lexbox', username: 'lexde' }),
      'c1'
    );
    expect(connection).toMatchObject({ name: 'Lexbox', username: 'lexde', port: 22 });
    expect(connectionLabel(connection)).toBe('lexde@lexbox');
  });
});

describe('migrateConnection', () => {
  it('reads connections saved before SSH as ttyd', () => {
    expect(migrateConnection({ id: 'a', name: 'Box', url: 'box:7681', username: '' })).toEqual({
      id: 'a',
      kind: 'ttyd',
      name: 'Box',
      url: 'box:7681',
      username: '',
    });
  });

  it('drops records it cannot read', () => {
    expect(migrateConnection(null)).toBeNull();
    expect(migrateConnection({ name: 'no id' })).toBeNull();
  });
});

describe('connectionWarning', () => {
  it.each(['https://devbox.example.com', 'wss://devbox.example.com/ws', '192.168.1.5:7681'])(
    'is quiet for ttyd at %s',
    (url) => expect(connectionWarning(ttyd({ url }))).toBeNull()
  );

  it('warns about unencrypted public ttyd addresses', () => {
    expect(connectionWarning(ttyd({ url: 'http://devbox.example.com:7681' }))).toMatch(
      /not encrypted/
    );
  });

  it('never warns for SSH, which is always encrypted', () => {
    expect(connectionWarning(ssh({ host: 'example.com' }))).toBeNull();
  });
});
