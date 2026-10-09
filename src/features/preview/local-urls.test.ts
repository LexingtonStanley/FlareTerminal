import { findLocalPorts, parseLocalUrl, parsePort } from './local-urls';

describe('findLocalPorts', () => {
  it('finds what dev servers print, the latest first', () => {
    const screen = [
      '  VITE v6.0.0  ready in 312 ms',
      '  ➜  Local:   http://localhost:5173/',
      '  ➜  Network: use --host to expose',
      '- Local:        http://127.0.0.1:3000',
      'Serving HTTP on 0.0.0.0 port 8000 (http://0.0.0.0:8000/) ...',
      'again http://localhost:5173/about',
    ].join('\n');

    expect(findLocalPorts(screen)).toEqual([5173, 8000, 3000]);
  });

  it('reads IPv6 loopback', () => {
    expect(findLocalPorts('listening on http://[::1]:4000')).toEqual([4000]);
  });

  it('ignores other hosts, https, missing and impossible ports', () => {
    expect(
      findLocalPorts(
        'http://example.com:3000 https://localhost:3000 http://localhost/ http://localhost:99999 http://localhost.evil.com:80'
      )
    ).toEqual([]);
  });
});

describe('parseLocalUrl', () => {
  it('splits a local URL into port and path', () => {
    expect(parseLocalUrl('http://localhost:3000/docs?page=2#top')).toEqual({
      port: 3000,
      path: '/docs?page=2#top',
    });
    expect(parseLocalUrl('http://127.0.0.1:8080')).toEqual({ port: 8080, path: '/' });
  });

  it('refuses anything else', () => {
    expect(parseLocalUrl('https://localhost:3000/')).toBeNull();
    expect(parseLocalUrl('http://localhost:3000.evil.com/')).toBeNull();
    expect(parseLocalUrl('http://example.com/')).toBeNull();
    expect(parseLocalUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('parsePort', () => {
  it('takes 1 to 65535', () => {
    expect(parsePort(' 3000 ')).toBe(3000);
    expect(parsePort('0')).toBeNull();
    expect(parsePort('65536')).toBeNull();
    expect(parsePort('30a')).toBeNull();
    expect(parsePort('')).toBeNull();
  });
});
