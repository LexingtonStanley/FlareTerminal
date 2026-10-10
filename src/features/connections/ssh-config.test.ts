import { parseSshConfig, splitLine, type ConfigHost } from './ssh-config';

const host = (alias: string, rest: Partial<ConfigHost> = {}): ConfigHost => ({
  alias,
  hostName: alias,
  user: null,
  port: 22,
  proxyJump: null,
  proxyCommand: false,
  ...rest,
});

describe('splitLine', () => {
  it('reads `Keyword value` and `Keyword=value`, the keyword in any case', () => {
    expect(splitLine('  HostName lexbox.example.com')).toEqual({
      keyword: 'hostname',
      args: ['lexbox.example.com'],
    });
    expect(splitLine('Port=2222')).toEqual({ keyword: 'port', args: ['2222'] });
    expect(splitLine('USER = ada')).toEqual({ keyword: 'user', args: ['ada'] });
  });

  it('keeps quoted words whole and stops at a comment', () => {
    expect(splitLine('Host "my box" web # the web servers')).toEqual({
      keyword: 'host',
      args: ['my box', 'web'],
    });
    expect(splitLine('# Host lexbox')).toBeNull();
    expect(splitLine('')).toBeNull();
    expect(splitLine('Host')).toBeNull();
  });
});

describe('parseSshConfig', () => {
  it('reads each host’s HostName, User and Port', () => {
    const { hosts, missing, skippedMatch } = parseSshConfig(
      [
        'Host lexbox',
        '  HostName 100.101.102.103',
        '  User lexde',
        '  Port 2222',
        '',
        'Host pi raspberry',
        '  User pi',
      ].join('\n')
    );

    expect(hosts).toEqual([
      host('lexbox', { hostName: '100.101.102.103', user: 'lexde', port: 2222 }),
      host('pi', { user: 'pi' }),
      host('raspberry', { user: 'pi' }),
    ]);
    expect(missing).toEqual([]);
    expect(skippedMatch).toBe(false);
  });

  it('takes the first value for each, so defaults go last and overrides first', () => {
    const { hosts } = parseSshConfig(
      [
        'User root',
        'Host web',
        '  User deploy',
        '  Port 2200',
        'Host db',
        '  HostName db.internal',
        'Host *',
        '  User ada',
        '  Port 22',
      ].join('\n')
    );

    expect(hosts).toEqual([
      host('web', { user: 'root', port: 2200 }),
      host('db', { hostName: 'db.internal', user: 'root' }),
    ]);
  });

  it('applies patterns, but lists only names', () => {
    const { hosts } = parseSshConfig(
      [
        'Host web1.example.com web2.example.com bastion.example.com',
        'Host *.example.com !bastion.example.com',
        '  User deploy',
        'Host web?.EXAMPLE.com',
        '  Port 8022',
      ].join('\n')
    );

    expect(hosts).toEqual([
      host('web1.example.com', { user: 'deploy', port: 8022 }),
      host('web2.example.com', { user: 'deploy', port: 8022 }),
      host('bastion.example.com'),
    ]);
  });

  it('puts the alias in for %h', () => {
    const { hosts } = parseSshConfig(
      'Host db cache\n  HostName %h.internal\nHost web\n  HostName 100%%'
    );
    expect(hosts.map(({ hostName }) => hostName)).toEqual([
      'db.internal',
      'cache.internal',
      '100%',
    ]);
  });

  it('reads how a host is reached through another, as `ssh -G` does', () => {
    // Each host's result is what OpenSSH 9.6's `ssh -G` printed for this config.
    const { hosts } = parseSshConfig(
      [
        'Host prod',
        '  ProxyJump ada@bastion:2222',
        'Host old',
        '  ProxyCommand ssh -W %h:%p bastion',
        'Host deep',
        '  ProxyJump outer,inner',
        'Host uri',
        '  ProxyJump ssh://ada@bastion.example.com:2200',
        'Host jump-none',
        '  ProxyJump none',
        '  ProxyJump x',
        'Host command-none',
        '  ProxyCommand none',
        'Host command-then-jump-none',
        '  ProxyCommand nc',
        '  ProxyJump none',
        'Host jump-then-command-none',
        '  ProxyJump j1',
        '  ProxyCommand none',
        'Host *',
        '  ProxyJump bastion',
        '  ProxyCommand nc2 %h',
      ].join('\n')
    );
    expect(
      hosts.map(({ alias, proxyJump, proxyCommand }) => [alias, proxyJump, proxyCommand])
    ).toEqual([
      ['prod', 'ada@bastion:2222', false],
      ['old', null, true],
      ['deep', 'outer,inner', false],
      ['uri', 'ada@bastion.example.com:2200', false],
      // `ProxyJump none` keeps out a later ProxyJump, but not a ProxyCommand.
      ['jump-none', null, true],
      // A ProxyCommand, even none, keeps out a later ProxyJump.
      ['command-none', null, false],
      ['command-then-jump-none', null, true],
      ['jump-then-command-none', 'j1', false],
    ]);
  });

  it('skips Match blocks, but for Match all', () => {
    const { hosts, skippedMatch } = parseSshConfig(
      [
        'Host lexbox',
        'Match host lexbox exec "test -f ~/.vpn"',
        '  User vpn',
        'Match all',
        '  Port 2222',
      ].join('\n')
    );
    expect(hosts).toEqual([host('lexbox', { port: 2222 })]);
    expect(skippedMatch).toBe(true);
  });

  it('ignores a port it can’t use', () => {
    const { hosts } = parseSshConfig('Host a\n  Port 99999\nHost *\n  Port 2222');
    expect(hosts).toEqual([host('a', { port: 2222 })]);
  });

  it('lists a name once, whatever its case', () => {
    const { hosts } = parseSshConfig('Host Lexbox\r\n  User ada\r\nHost lexbox\r\n  Port 2222\r\n');
    expect(hosts).toEqual([host('Lexbox', { user: 'ada', port: 2222 })]);
  });

  it('says which Include files it didn’t have', () => {
    const { hosts, missing } = parseSshConfig(
      'Include config.d/* ~/.orbstack/ssh/config\nHost lexbox\nInclude config.d/*'
    );
    expect(hosts).toEqual([host('lexbox')]);
    expect(missing).toEqual(['config.d/*', '~/.orbstack/ssh/config']);
  });

  it('reads the files Include names, where they are', () => {
    const files: Record<string, string[]> = {
      'config.d/*': ['Host work\n  HostName work.example.com', 'Host home\n  User ada'],
      'defaults.conf': ['Host *\n  User root\n  Port 2222'],
    };
    const { hosts, missing } = parseSshConfig(
      [
        'Include config.d/*',
        'Host lexbox',
        '  User lexde',
        'Host *',
        '  Include defaults.conf',
      ].join('\n'),
      (pattern) => files[pattern]
    );

    expect(hosts).toEqual([
      host('work', { hostName: 'work.example.com', user: 'root', port: 2222 }),
      host('home', { user: 'ada', port: 2222 }),
      host('lexbox', { user: 'lexde', port: 2222 }),
    ]);
    expect(missing).toEqual([]);
  });

  it('applies an Include inside a block only to that block’s hosts', () => {
    const files: Record<string, string[]> = {
      'work.conf': ['Host *\n  User deploy\nHost db\n  HostName 10.0.0.5'],
    };
    const { hosts } = parseSshConfig(
      'Host web\n  Include work.conf\nHost lexbox\n',
      (pattern) => files[pattern]
    );
    // `ssh db` wouldn't read work.conf, so db isn't listed.
    expect(hosts).toEqual([host('web', { user: 'deploy' }), host('lexbox')]);
  });

  it('stops following an Include that includes itself', () => {
    const { hosts } = parseSshConfig('Include loop\nHost a', () => ['Include loop\nHost b']);
    expect(hosts.map(({ alias }) => alias)).toEqual(['b', 'a']);
  });
});
