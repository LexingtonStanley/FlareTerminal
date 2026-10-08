import { connectionWarning, validateConnection } from './connections';

const valid = { name: 'Devbox', url: 'devbox:7681', username: '', password: '' };

describe('validateConnection', () => {
  it('accepts a name and an address', () => {
    expect(validateConnection(valid)).toEqual({});
  });

  it('requires a name and an address', () => {
    expect(validateConnection({ ...valid, name: ' ', url: '' })).toEqual({
      name: 'Enter a name',
      url: 'Enter the address ttyd is listening on',
    });
  });

  it('explains addresses it cannot use', () => {
    expect(validateConnection({ ...valid, url: 'ssh://devbox' }).url).toBe(
      'Use an http(s):// or ws(s):// address'
    );
  });

  it('needs a password when a username is set', () => {
    expect(validateConnection({ ...valid, username: 'ada' })).toEqual({
      password: 'Enter the password for this username',
    });
    expect(validateConnection({ ...valid, username: 'ada', password: 'pw' })).toEqual({});
  });
});

describe('connectionWarning', () => {
  it.each(['https://devbox.example.com', 'wss://devbox.example.com/ws', '192.168.1.5:7681'])(
    'is quiet for %s',
    (url) => expect(connectionWarning(url)).toBeNull()
  );

  it('warns about unencrypted public addresses', () => {
    expect(connectionWarning('http://devbox.example.com:7681')).toMatch(/not encrypted/);
  });

  it('is quiet while the address is still invalid', () => {
    expect(connectionWarning('http://')).toBeNull();
  });
});
