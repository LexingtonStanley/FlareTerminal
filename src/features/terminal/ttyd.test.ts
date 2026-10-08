import type { SessionStatus } from './transport';
import {
  decodeServerMessage,
  describeClose,
  encodeInput,
  encodeResize,
  isPrivateHost,
  ttydCredential,
  TtydTransport,
  ttydSocketUrl,
  type CreateSocket,
} from './ttyd';

const text = (bytes: Uint8Array | ArrayBuffer) => new TextDecoder().decode(bytes);
const frame = (command: string, payload: string | Uint8Array) => {
  const body = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
  const bytes = new Uint8Array(body.length + 1);
  bytes[0] = command.charCodeAt(0);
  bytes.set(body, 1);
  return bytes.buffer;
};

/** Stands in for WebSocket: records what the transport sends, lets the test play the server. */
class FakeSocket {
  readyState = 0;
  binaryType = 'blob';
  sent: Uint8Array[] = [];
  closedWith: number | undefined;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer | string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(
    readonly url: string,
    readonly protocols: string[],
    readonly headers: Record<string, string>
  ) {}

  send(data: Uint8Array) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.closedWith = code;
    this.serverClose(code ?? 1005);
  }

  // Server side
  serverOpen() {
    this.readyState = 1;
    this.onopen?.();
  }
  serverSend(data: ArrayBuffer) {
    this.onmessage?.({ data });
  }
  serverClose(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function setup(options: { url?: string; credentials?: { username: string; password: string } }) {
  const sockets: FakeSocket[] = [];
  const createSocket: CreateSocket = (url, protocols, headers) => {
    const socket = new FakeSocket(url, protocols, headers);
    sockets.push(socket);
    return socket as unknown as WebSocket;
  };
  const listener = { onData: jest.fn(), onTitle: jest.fn(), onStatus: jest.fn() };
  const transport = new TtydTransport(
    { url: options.url ?? 'devbox:7681', credentials: options.credentials, createSocket },
    listener
  );
  const statuses = () => listener.onStatus.mock.calls.map(([status]: [SessionStatus]) => status);
  return { transport, listener, statuses, socket: () => sockets[0] };
}

describe('ttydSocketUrl', () => {
  it.each([
    ['devbox:7681', 'ws://devbox:7681/ws'],
    ['  http://10.0.0.5:7681  ', 'ws://10.0.0.5:7681/ws'],
    ['https://devbox.example.ts.net/', 'wss://devbox.example.ts.net/ws'],
    ['https://example.com/term/', 'wss://example.com/term/ws'],
    ['wss://example.com/term/ws', 'wss://example.com/term/ws'],
    ['http://devbox:7681/?arg=main', 'ws://devbox:7681/ws?arg=main'],
  ])('maps %j to %j', (input, expected) => {
    expect(ttydSocketUrl(input)).toBe(expected);
  });

  it('rejects other schemes and embedded credentials', () => {
    expect(() => ttydSocketUrl('ftp://devbox')).toThrow('Use an http(s):// or ws(s):// address');
    expect(() => ttydSocketUrl('http://ada:pw@devbox')).toThrow('own fields');
  });
});

describe('isPrivateHost', () => {
  it.each(['localhost', '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.5', '100.101.102.103'])(
    'treats %s as private',
    (host) => expect(isPrivateHost(host)).toBe(true)
  );
  it.each(['devbox.ts.net', 'mac.local', '[::1]'])('treats %s as private', (host) =>
    expect(isPrivateHost(host)).toBe(true)
  );
  it.each(['example.com', '8.8.8.8', '172.32.0.1', '100.128.0.1'])('treats %s as public', (host) =>
    expect(isPrivateHost(host)).toBe(false)
  );
});

describe('ttyd framing', () => {
  it('base64-encodes user:pass as UTF-8', () => {
    expect(ttydCredential({ username: 'ada', password: 's3cret' })).toBe(
      Buffer.from('ada:s3cret').toString('base64')
    );
    expect(ttydCredential({ username: 'zoë', password: '✓' })).toBe(
      Buffer.from('zoë:✓').toString('base64')
    );
  });

  it('prefixes input and resize with their command bytes', () => {
    expect(text(encodeInput('ls é\r'))).toBe('0ls é\r');
    expect(text(encodeResize({ cols: 40, rows: 12 }))).toBe('1{"columns":40,"rows":12}');
  });

  it('decodes output, titles and ignores preferences', () => {
    const output = decodeServerMessage(frame('0', 'hi'));
    expect(output.type === 'output' && text(output.data)).toBe('hi');
    expect(decodeServerMessage(frame('1', 'bash (devbox)'))).toEqual({
      type: 'title',
      title: 'bash (devbox)',
    });
    expect(decodeServerMessage(frame('2', '{}'))).toEqual({ type: 'other' });
  });

  it('explains close codes', () => {
    expect(describeClose(1006, false, 'ws://x/ws')).toBe("Couldn't connect to ws://x/ws");
    expect(describeClose(1000, true, '')).toBe('Session ended');
    expect(describeClose(1008, true, '')).toMatch(/username or password/);
  });
});

describe('TtydTransport', () => {
  it('opens the tty subprotocol and sends the handshake with the terminal size', () => {
    const { transport, socket, statuses } = setup({});
    transport.connect({ cols: 50, rows: 20 });

    expect(socket().url).toBe('ws://devbox:7681/ws');
    expect(socket().protocols).toEqual(['tty']);
    expect(socket().binaryType).toBe('arraybuffer');
    expect(socket().headers).toEqual({});
    expect(statuses()).toEqual([{ state: 'connecting' }]);

    socket().serverOpen();

    expect(JSON.parse(text(socket().sent[0]))).toEqual({ AuthToken: '', columns: 50, rows: 20 });
    expect(statuses()).toEqual([{ state: 'connecting' }, { state: 'connected' }]);
  });

  it('authenticates with a Basic header and the same AuthToken', () => {
    const { transport, socket } = setup({ credentials: { username: 'ada', password: 's3cret' } });
    transport.connect({ cols: 80, rows: 24 });
    socket().serverOpen();

    const token = Buffer.from('ada:s3cret').toString('base64');
    expect(socket().headers).toEqual({ Authorization: `Basic ${token}` });
    expect(JSON.parse(text(socket().sent[0])).AuthToken).toBe(token);
  });

  it('streams output, keeping characters split across frames intact', () => {
    const { transport, socket, listener } = setup({});
    transport.connect({ cols: 80, rows: 24 });
    socket().serverOpen();

    const bytes = new TextEncoder().encode('ok ✓');
    socket().serverSend(frame('0', bytes.slice(0, 4)));
    socket().serverSend(frame('0', bytes.slice(4)));
    socket().serverSend(frame('1', 'bash (devbox)'));

    expect(listener.onData.mock.calls.map(([data]) => data).join('')).toBe('ok ✓');
    expect(listener.onTitle).toHaveBeenCalledWith('bash (devbox)');
  });

  it('sends input and resizes only while open', () => {
    const { transport, socket } = setup({});
    transport.connect({ cols: 80, rows: 24 });
    transport.write('dropped');
    transport.resize({ cols: 60, rows: 30 });
    expect(socket().sent).toHaveLength(0);

    socket().serverOpen();
    transport.write('ls\r');
    transport.resize({ cols: 61, rows: 31 });

    expect(socket().sent.map(text)).toEqual([
      '{"AuthToken":"","columns":60,"rows":30}',
      '0ls\r',
      '1{"columns":61,"rows":31}',
    ]);
  });

  it('reports why the session closed', () => {
    const { transport, socket, statuses } = setup({});
    transport.connect({ cols: 80, rows: 24 });
    socket().serverOpen();
    socket().serverClose(1000);

    expect(statuses().at(-1)).toEqual({ state: 'closed', message: 'Session ended' });
  });

  it('reports a host it never reached', () => {
    const { transport, socket, statuses } = setup({ url: 'http://10.9.9.9:7681' });
    transport.connect({ cols: 80, rows: 24 });
    socket().serverClose(1006);

    expect(statuses().at(-1)).toEqual({
      state: 'closed',
      message: "Couldn't connect to ws://10.9.9.9:7681/ws",
    });
  });

  it('reports a bad address without opening a socket', () => {
    const { transport, socket, statuses } = setup({ url: 'ftp://devbox' });
    transport.connect({ cols: 80, rows: 24 });

    expect(socket()).toBeUndefined();
    expect(statuses().at(-1)).toEqual({
      state: 'closed',
      message: 'Use an http(s):// or ws(s):// address',
    });
  });

  it('stays quiet when the app closes it', () => {
    const { transport, socket, statuses } = setup({});
    transport.connect({ cols: 80, rows: 24 });
    socket().serverOpen();
    transport.close();

    expect(socket().closedWith).toBe(1000);
    expect(statuses()).toEqual([{ state: 'connecting' }, { state: 'connected' }]);
  });
});
