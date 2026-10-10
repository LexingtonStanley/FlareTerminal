/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { KnownHosts } from '@/features/ssh/known-hosts';
import { SshTransport } from '@/features/terminal/ssh-transport';
import type { Tunnel, TunnelEvents } from '@/features/terminal/transport';
import {
  openNodeSocket,
  startTestSshServer,
  stopTestSshServers,
  waitFor,
} from '@/test-utils/ssh-server';

import {
  imageType,
  insertPath,
  parseUpload,
  sendImage,
  SendCancelled,
  sendTimeout,
  uploadCommand,
  uploadName,
} from './upload';

jest.mock('@/lib/storage', () => jest.requireActual('@/test-utils/memory-storage'));

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A "PNG" holding every byte value, newlines and NULs included, then filler. */
function png(size = 1024): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(PNG_HEADER);
  for (let i = PNG_HEADER.length; i < size; i++) bytes[i] = i % 256;
  return bytes;
}

/** Byte for byte, quickly (toEqual walks a large array an index at a time). */
const sameBytes = (file: string, bytes: Uint8Array) => readFileSync(file).equals(bytes);

const homes: string[] = [];
function home(): string {
  const dir = mkdtempSync(join(tmpdir(), 'flare-upload-'));
  homes.push(dir);
  return dir;
}

afterEach(async () => {
  await stopTestSshServers();
  homes.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

describe('imageType', () => {
  const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

  it('reads the format from the first bytes', () => {
    expect(imageType(png())).toBe('png');
    expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe('jpg');
    expect(imageType(new Uint8Array(ascii('GIF89a......')))).toBe('gif');
    expect(imageType(new Uint8Array(ascii('RIFF\0\0\0\0WEBPVP8 ')))).toBe('webp');
    expect(imageType(new Uint8Array([0, 0, 0, 24, ...ascii('ftypheic'), 0, 0]))).toBe('heic');
  });

  it('refuses anything else', () => {
    expect(imageType(new Uint8Array(ascii('%PDF-1.7')))).toBeNull();
    expect(imageType(new Uint8Array([0, 0, 0, 24, ...ascii('ftypmp42')]))).toBeNull();
    expect(imageType(new Uint8Array([]))).toBeNull();
  });
});

describe('uploadName', () => {
  it('sorts by the time, with a random end', () => {
    const now = new Date(2026, 9, 10, 14, 23, 1);
    expect(uploadName(now, 'png', new Uint8Array([0x3f, 0xa9]))).toBe(
      'flare-20261010-142301-3fa9.png'
    );
    expect(uploadName(now, 'jpg')).toMatch(/^flare-20261010-142301-[0-9a-f]{4}\.jpg$/);
  });
});

describe('uploadCommand', () => {
  it('is sh with one quoted line, which any login shell passes on', () => {
    const command = uploadCommand('flare-x.png', 1234);
    expect(command).toBe(
      `sh -c 'exec 2>&1; umask 077; mkdir -p "$HOME/.flare/uploads" && cd "$HOME/.flare/uploads" || exit 1; head -c 1234 > flare-x.png && echo "saved:$PWD/flare-x.png"'`
    );
    // Inside the quotes: nothing fish, zsh or csh would read differently.
    expect(command.slice(7, -1)).not.toMatch(/['\\!\n]/);
  });

  it('won’t build a command around a name or folder that would break it', () => {
    expect(() => uploadCommand('a b.png', 1)).toThrow();
    expect(() => uploadCommand("x';rm -rf ~;'.png", 1)).toThrow();
    expect(() => uploadCommand('x.png', 1, "/tmp/it's")).toThrow();
    expect(() => uploadCommand('x.png', 1, '/tmp/`id`')).toThrow();
  });

  // The host's login shell runs it with -c, as here.
  it.each(['/bin/sh', 'bash'])(
    'saves exactly the image under %s, readable only by its owner',
    (shell) => {
      const dir = home();
      const image = png(70_000);
      const run = spawnSync(shell, ['-c', uploadCommand('flare-x.png', image.length)], {
        input: Buffer.concat([image, Buffer.from('echo not the image\n')]),
        env: { ...process.env, HOME: dir },
        encoding: 'utf8',
      });
      const saved = join(dir, '.flare/uploads/flare-x.png');

      expect(parseUpload(run.stdout)).toEqual({ path: saved });
      expect(sameBytes(saved, image)).toBe(true);
      expect(statSync(saved).mode & 0o777).toBe(0o600);
      expect(statSync(join(dir, '.flare/uploads')).mode & 0o777).toBe(0o700);
    }
  );

  it('says why when the folder can’t be made', () => {
    // A file where the folder would go: no one can make it, root included.
    const file = join(home(), 'flare');
    writeFileSync(file, '');
    const run = spawnSync('/bin/sh', ['-c', uploadCommand('x.png', 3, `${file}/uploads`)], {
      input: 'abc',
      encoding: 'utf8',
    });
    const result = parseUpload(run.stdout);
    expect(result).toEqual({ error: expect.stringMatching(/^The host said: mkdir: .*flare/) });
  });
});

describe('parseUpload', () => {
  it('finds the path among other lines (a login banner)', () => {
    expect(parseUpload('Welcome!\r\nsaved:/home/ada/.flare/uploads/x.png\r\n')).toEqual({
      path: '/home/ada/.flare/uploads/x.png',
    });
  });

  it('gives the first thing the host said, or that it said nothing', () => {
    expect(parseUpload('\nsh: head: not found\n')).toEqual({
      error: 'The host said: sh: head: not found',
    });
    expect(parseUpload('')).toEqual({ error: 'The host didn’t save it' });
  });
});

describe('insertPath', () => {
  it('adds the path after what is written, ready to type on', () => {
    expect(insertPath('', '/h/x.png')).toBe('/h/x.png ');
    expect(insertPath('What is wrong in', '/h/x.png')).toBe('What is wrong in /h/x.png ');
    expect(insertPath('Look at ', '/h/x.png')).toBe('Look at /h/x.png ');
  });

  it('quotes a path with a space', () => {
    expect(insertPath('', '/Users/Ada Lovelace/x.png')).toBe('"/Users/Ada Lovelace/x.png" ');
  });
});

/** A host that answers the command with `answer`, or never when it's null. */
function fakeHost(answer: string | null) {
  const host = {
    commands: [] as string[],
    received: [] as Uint8Array[],
    closed: false,
    events: null as TunnelEvents | null,
    run: async (command: string, events: TunnelEvents): Promise<Tunnel> => {
      host.commands.push(command);
      host.events = events;
      return {
        write: (bytes) => {
          host.received.push(bytes);
          if (answer === null) return;
          events.onData(new TextEncoder().encode(answer));
          events.onClose();
        },
        close: () => (host.closed = true),
      };
    },
  };
  return host;
}

describe('sendImage', () => {
  const now = new Date(2026, 9, 10, 14, 23, 1);

  it('sends the bytes to the command and resolves to the saved path', async () => {
    const host = fakeHost('saved:/home/ada/.flare/uploads/flare-x.png\n');
    const image = png();

    await expect(sendImage(host.run, image, { now })).resolves.toBe(
      '/home/ada/.flare/uploads/flare-x.png'
    );
    expect(host.commands).toEqual([
      expect.stringMatching(/head -c 1024 > flare-20261010-142301-[0-9a-f]{4}\.png /),
    ]);
    expect(host.received).toEqual([image]);
    expect(host.closed).toBe(true);
  });

  it('rejects with what the host said', async () => {
    const host = fakeHost('mkdir: cannot create directory: Permission denied\n');
    await expect(sendImage(host.run, png())).rejects.toThrow(
      'The host said: mkdir: cannot create directory: Permission denied'
    );
  });

  it('sends nothing that isn’t an image', async () => {
    const host = fakeHost('saved:/x\n');
    await expect(sendImage(host.run, new TextEncoder().encode('#!/bin/sh'))).rejects.toThrow(
      'isn’t a PNG'
    );
    expect(host.commands).toEqual([]);
  });

  it('says so when the session isn’t connected', async () => {
    const run = () => Promise.reject(new Error('Not connected'));
    await expect(sendImage(run, png())).rejects.toThrow('The session isn’t connected');
  });

  it('stops when cancelled, closing the command', async () => {
    const host = fakeHost(null);
    const controller = new AbortController();
    const sending = sendImage(host.run, png(), { signal: controller.signal });
    await waitFor(() => host.received.length === 1);

    controller.abort();

    await expect(sending).rejects.toBeInstanceOf(SendCancelled);
    expect(host.closed).toBe(true);
  });

  it('gives up on a host that never answers', async () => {
    jest.useFakeTimers();
    try {
      const host = fakeHost(null);
      const sending = sendImage(host.run, png(2_500_000));
      const failed = expect(sending).rejects.toThrow('The host stopped answering');
      await jest.advanceTimersByTimeAsync(sendTimeout(2_500_000) - 1);
      expect(host.closed).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      await failed;
      expect(host.closed).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('allows a slow network more time for a bigger image', () => {
    expect(sendTimeout(500_000)).toBe(80_000);
    expect(sendTimeout(3_000_000)).toBe(120_000);
  });
});

describe('over SSH', () => {
  const knownHosts: KnownHosts = { get: () => null, trust: () => {}, forget: () => {} };

  it('saves a photo bigger than the channel’s window, byte for byte', async () => {
    const server = await startTestSshServer();
    const statuses: string[] = [];
    const transport: SshTransport = new SshTransport(
      {
        host: '127.0.0.1',
        port: server.port,
        username: 'ada',
        password: 'correct-horse',
        userKeys: [],
        knownHosts,
        openSocket: openNodeSocket,
        keepaliveInterval: 0,
      },
      {
        onData: (text) => {
          // The question is printed before the transport listens for the answer.
          if (text.includes('(yes/no)?')) setTimeout(() => transport.write('yes\r'));
        },
        onTitle: () => {},
        onStatus: (status) => statuses.push(status.state),
      }
    );
    transport.connect({ cols: 80, rows: 24 });
    await waitFor(() => statuses.at(-1) === 'connected');

    const dir = home();
    // ssh2 opens a 2 MiB window, so the upload waits on the host's window adjustments.
    const image = png(3_000_000);
    const path = await sendImage(
      (command, events) => transport.runCommand(command, events),
      image,
      {
        dir,
      }
    );

    expect(path).toMatch(new RegExp(`^${dir}/flare-\\d{8}-\\d{6}-[0-9a-f]{4}\\.png$`));
    expect(sameBytes(path, image)).toBe(true);
    // The terminal carries on.
    expect(statuses.at(-1)).toBe('connected');
    transport.close();
  });
});
