/**
 * @jest-environment node
 */
import { once } from 'node:events';
import { createServer, get, type RequestListener, type Server } from 'node:http';
import {
  createConnection,
  createServer as createTcpServer,
  type AddressInfo,
  type Server as TcpServer,
} from 'node:net';

import { ChannelOpenError, OPEN_FAILURE } from '@/features/ssh/client';
import type { KnownHosts } from '@/features/ssh/known-hosts';
import { SshTransport } from '@/features/terminal/ssh-transport';
import type { Tunnel, TunnelEvents } from '@/features/terminal/transport';
import { listenNode } from '@/test-utils/node-listen';
import {
  openNodeSocket,
  startTestSshServer,
  stopTestSshServers,
  testSockets,
  waitFor,
} from '@/test-utils/ssh-server';

import { startForward, tunnelErrorMessage, type LocalConnection } from './forward';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));

const trustAll: KnownHosts = { get: () => null, trust: () => {}, forget: () => {} };
const servers: (Server | TcpServer)[] = [];

afterEach(async () => {
  servers.splice(0).forEach((server) => {
    server.close();
    if ('closeAllConnections' in server) server.closeAllConnections();
  });
  await stopTestSshServers();
});

/** The body of a GET, as the preview's browser would load it. (Jest's fetch is a stub.) */
function load(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    get(url, { agent: false }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => (body += chunk));
      response.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

/** A dev server on the "host": it says which path it was asked for. */
async function devServer(
  handle: RequestListener = (request, response) => response.end(`page ${request.url}`)
) {
  const server = createServer(handle);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  return (server.address() as AddressInfo).port;
}

async function connectedTransport() {
  const sshServer = await startTestSshServer({
    authenticate: (ctx) => (ctx.method === 'none' ? ctx.accept() : ctx.reject()),
  });
  const statuses: string[] = [];
  const transport = new SshTransport(
    {
      host: '127.0.0.1',
      port: sshServer.port,
      username: 'ada',
      password: null,
      userKeys: [],
      knownHosts: trustAll,
      openSocket: openNodeSocket,
      keepaliveInterval: 0,
    },
    {
      onData: (text) => {
        // The host key question, answered as a person would (once it's asked).
        if (text.includes('(yes/no)?')) setTimeout(() => transport.write('yes\r'));
      },
      onTitle: () => {},
      onStatus: (status) => statuses.push(status.state),
    }
  );
  transport.connect({ cols: 80, rows: 24 });
  await waitFor(() => statuses.at(-1) === 'connected');
  return { transport, sshServer, statuses };
}

/** A server that answers each connection with `reply`, then closes it. */
async function closingServer(reply: string) {
  const server = createTcpServer((socket) => socket.end(reply));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  return (server.address() as AddressInfo).port;
}

describe('startForward through SSH', () => {
  it('serves the host’s dev server on a phone port', async () => {
    const port = await devServer();
    const { transport, sshServer } = await connectedTransport();

    const forward = await startForward({
      port,
      listen: listenNode,
      openTunnel: (events) => transport.openTunnel(port, events),
    });
    // The dev server already has that port here (one machine plays both), so another.
    expect(forward.localPort).not.toBe(port);

    const pages = await Promise.all(
      ['/', '/about', '/assets/app.js'].map((path) =>
        load(`http://127.0.0.1:${forward.localPort}${path}`)
      )
    );
    expect(pages).toEqual(['page /', 'page /about', 'page /assets/app.js']);
    expect(sshServer.tunnels.every((tunnel) => tunnel.host === 'localhost')).toBe(true);

    forward.stop();
    await expect(load(`http://127.0.0.1:${forward.localPort}/`)).rejects.toThrow();
    transport.close();
  });

  it('uses the host’s port number on the phone when it’s free', async () => {
    const { transport } = await connectedTransport();
    // A free port: listen on it, note it, let it go.
    const probe = await listenNode(0, () => {});
    probe.close();

    const forward = await startForward({
      port: probe.port,
      listen: listenNode,
      openTunnel: (events) => transport.openTunnel(probe.port, events),
    });

    expect(forward.localPort).toBe(probe.port);
    forward.stop();
    transport.close();
  });

  it('closes the browser’s connections when the session’s connection drops', async () => {
    // A page that takes its time, so the browser's connection stays open.
    const asked: string[] = [];
    const port = await devServer((request) => asked.push(request.url ?? ''));
    const { transport } = await connectedTransport();
    const forward = await startForward({
      port,
      listen: listenNode,
      openTunnel: (events) => transport.openTunnel(port, events),
    });
    const sshSocket = testSockets.at(-1)!;
    const browser = createConnection({ host: '127.0.0.1', port: forward.localPort });
    try {
      browser.write('GET /slow HTTP/1.1\r\nHost: localhost\r\n\r\n');
      // Through the tunnel: it's open at both ends.
      await waitFor(() => asked.length === 1);

      // The phone changes networks: the SSH connection dies under the session.
      sshSocket.destroy();

      await waitFor(() => browser.closed, 2000);
    } finally {
      browser.destroy();
      forward.stop();
    }
  });

  it('delivers a page the dev server ends by closing its connection', async () => {
    // No Content-Length: the page ends when the connection does. OpenSSH sends EOF here
    // and waits for the client to close the channel.
    const port = await closingServer(
      'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nthe whole page'
    );
    const { transport } = await connectedTransport();
    const forward = await startForward({
      port,
      listen: listenNode,
      openTunnel: (events) => transport.openTunnel(port, events),
    });

    expect(await load(`http://127.0.0.1:${forward.localPort}/`)).toBe('the whole page');
    forward.stop();
    transport.close();
  });

  it('closes only the tunnel when its other end fails, never the session', async () => {
    const port = await closingServer('a reply the browser is gone for');
    const { transport, statuses } = await connectedTransport();
    const closed = jest.fn();

    await transport.openTunnel(port, {
      onData: () => {
        // What react-native-tcp-socket throws when writing to a browser that went away.
        throw new Error('Socket is closed.');
      },
      onClose: closed,
    });

    await waitFor(() => closed.mock.calls.length === 1);
    expect(statuses.at(-1)).toBe('connected');
    const again = jest.fn();
    await transport.openTunnel(port, { onData: again, onClose: () => {} });
    await waitFor(() => again.mock.calls.length > 0);
    transport.close();
  });

  it('closes a browser’s connection when its tunnel can’t open, and says why', async () => {
    const { transport } = await connectedTransport();
    const onError = jest.fn();
    const forward = await startForward({
      port: 0,
      listen: listenNode,
      // Nothing listens on port 1 on the host.
      openTunnel: (events) => transport.openTunnel(1, events),
      onError,
    });

    await expect(load(`http://127.0.0.1:${forward.localPort}/`)).rejects.toThrow();

    expect(onError).toHaveBeenCalledWith(expect.any(ChannelOpenError));
    forward.stop();
    transport.close();
  });
});

describe('startForward', () => {
  /** A local server that hands out connections the test drives. */
  function fakeListen() {
    let accept: (connection: LocalConnection) => void = () => {};
    const closed = jest.fn();
    return {
      closed,
      listen: async (port: number, onConnection: (connection: LocalConnection) => void) => {
        accept = onConnection;
        return { port, close: closed };
      },
      connect() {
        const browser = {
          received: [] as string[],
          closed: false,
          ended: false,
          events: null as TunnelEvents | null,
        };
        accept({
          write: (bytes) => browser.received.push(new TextDecoder().decode(bytes)),
          end: () => (browser.closed = browser.ended = true),
          close: () => (browser.closed = true),
          listen: (events) => (browser.events = events),
        });
        return browser;
      },
    };
  }

  function fakeTunnel() {
    const sent: string[] = [];
    let resolve: (tunnel: Tunnel) => void = () => {};
    let reject: (error: Error) => void = () => {};
    let events: TunnelEvents | null = null;
    const tunnel = {
      write: (bytes: Uint8Array) => sent.push(new TextDecoder().decode(bytes)),
      close: jest.fn(),
    };
    return {
      sent,
      tunnel,
      events: () => events!,
      open: (handlers: TunnelEvents) => {
        events = handlers;
        return new Promise<Tunnel>((res, rej) => {
          resolve = res;
          reject = rej;
        });
      },
      opened: () => resolve(tunnel),
      failed: (error: Error) => reject(error),
    };
  }

  const bytes = (text: string) => new TextEncoder().encode(text);

  it('keeps what the browser sends until the tunnel is open, in order', async () => {
    const local = fakeListen();
    const remote = fakeTunnel();
    await startForward({ port: 3000, listen: local.listen, openTunnel: remote.open });

    const browser = local.connect();
    browser.events!.onData(bytes('GET / HTTP/1.1\r\n'));
    browser.events!.onData(bytes('\r\n'));
    expect(remote.sent).toEqual([]);
    remote.opened();
    await waitFor(() => remote.sent.length === 2);
    browser.events!.onData(bytes('more'));

    expect(remote.sent).toEqual(['GET / HTTP/1.1\r\n', '\r\n', 'more']);
    remote.events().onData(bytes('HTTP/1.1 200 OK'));
    expect(browser.received).toEqual(['HTTP/1.1 200 OK']);
  });

  it('closes each side when the other closes', async () => {
    const local = fakeListen();
    const remote = fakeTunnel();
    await startForward({ port: 3000, listen: local.listen, openTunnel: remote.open });

    const browser = local.connect();
    remote.opened();
    await Promise.resolve();
    remote.events().onData(new TextEncoder().encode('the end'));
    remote.events().onClose();
    // The dev server finished: its last bytes still reach the browser.
    expect(browser.ended).toBe(true);
    remote.events().onData(new TextEncoder().encode('more'));
    expect(browser.received).toEqual(['the end']);

    const second = local.connect();
    second.events!.onClose();
    // Closed before its tunnel opened: the tunnel is closed as soon as it does.
    remote.opened();
    await waitFor(() => remote.tunnel.close.mock.calls.length > 1);
  });

  it('stops listening and closes every connection when stopped', async () => {
    const local = fakeListen();
    const remote = fakeTunnel();
    const forward = await startForward({
      port: 3000,
      listen: local.listen,
      openTunnel: remote.open,
    });
    const browser = local.connect();

    forward.stop();

    expect(local.closed).toHaveBeenCalled();
    expect(browser).toMatchObject({ closed: true, ended: false });
  });

  it('reports a tunnel that won’t open', async () => {
    const local = fakeListen();
    const remote = fakeTunnel();
    const onError = jest.fn();
    await startForward({ port: 3000, listen: local.listen, openTunnel: remote.open, onError });
    const browser = local.connect();

    remote.failed(new Error('Not connected'));

    await waitFor(() => browser.closed);
    expect(onError).toHaveBeenCalledWith(new Error('Not connected'));
  });
});

describe('tunnelErrorMessage', () => {
  it('says what to do', () => {
    expect(
      tunnelErrorMessage(
        new ChannelOpenError(OPEN_FAILURE.CONNECT_FAILED, 'Connection refused'),
        3000,
        'devbox'
      )
    ).toBe('Nothing is listening on port 3000 on devbox. Start the dev server, then try again.');
    expect(
      tunnelErrorMessage(
        new ChannelOpenError(OPEN_FAILURE.ADMINISTRATIVELY_PROHIBITED, ''),
        3000,
        'devbox'
      )
    ).toBe(
      'devbox doesn’t allow port forwarding. Set AllowTcpForwarding to yes in its sshd_config.'
    );
    expect(tunnelErrorMessage(new Error('Not connected'), 3000, 'devbox')).toBe(
      'The session isn’t connected. Reconnect it, then try again.'
    );
  });
});
