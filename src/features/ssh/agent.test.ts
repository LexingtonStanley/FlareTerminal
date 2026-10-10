import { ed25519 } from '@noble/curves/ed25519.js';
import { randomBytes } from '@noble/hashes/utils.js';

import {
  AGENT,
  AgentConnection,
  agentSignatureAlgorithm,
  signPurpose,
  type AgentBackend,
  type SessionBinding,
  type SignRequest,
} from './agent';
import { SshReader, SshWriter, utf8 } from './bytes';
import { MSG } from './constants';
import { generateUserKey, publicKeyBlob, signWithUserKey, type UserKey } from './user-key';

const phoneKey = generateUserKey();
const otherKey = generateUserKey();
const hostKey = generateUserKey();
const githubKey = generateUserKey();
const origin = { hostKey: publicKeyBlob(hostKey), sessionId: randomBytes(32) };

/** What a client signs to sign in (RFC 4252 section 7), or OpenSSH's host-bound variant. */
function signInData(
  sessionId: Uint8Array,
  {
    user = 'git',
    key = phoneKey,
    algorithm = key.type as string,
    method = 'publickey',
    boundTo = null as UserKey | null,
  } = {}
) {
  const writer = new SshWriter()
    .string(sessionId)
    .byte(MSG.USERAUTH_REQUEST)
    .string(user)
    .string('ssh-connection')
    .string(method)
    .boolean(true)
    .string(algorithm)
    .string(publicKeyBlob(key));
  if (boundTo) writer.string(publicKeyBlob(boundTo));
  return writer.toBytes();
}

/** session-bind@openssh.com for a session with `server`, signed by it unless `signer` says. */
function bind(server: UserKey, sessionId: Uint8Array, forwarding = false, signer = server) {
  return new SshWriter()
    .byte(AGENT.EXTENSION)
    .string('session-bind@openssh.com')
    .string(publicKeyBlob(server))
    .string(sessionId)
    .string(signWithUserKey(signer, sessionId))
    .boolean(forwarding)
    .toBytes();
}

function signRequest(data: Uint8Array, key: UserKey = phoneKey, flags = 0) {
  return new SshWriter()
    .byte(AGENT.SIGN_REQUEST)
    .string(publicKeyBlob(key))
    .string(data)
    .uint32(flags)
    .toBytes();
}

/** An agent connection listing `phoneKey`, with what it answers, one payload per message. */
function open({
  approve = async () => phoneKey as UserKey | null,
}: { approve?: AgentBackend['approve'] } = {}) {
  const replies: Uint8Array[] = [];
  const requests: SignRequest[] = [];
  const signals: AbortSignal[] = [];
  const fail = jest.fn();
  const backend: AgentBackend = {
    keys: () => [{ blob: publicKeyBlob(phoneKey), comment: 'flare-terminal' }],
    approve: (request, signal) => {
      requests.push(request);
      signals.push(signal);
      return approve(request, signal);
    },
  };
  const connection = new AgentConnection(
    (bytes) => {
      const reader = new SshReader(bytes);
      replies.push(reader.string());
      expect(reader.remaining).toBe(0);
    },
    backend,
    origin,
    fail
  );
  const send = (payload: Uint8Array) =>
    connection.receive(new SshWriter().string(payload).toBytes());
  /** Waits for the `count`th reply. */
  const reply = async (count = replies.length + 1) => {
    for (let i = 0; i < 50 && replies.length < count; i++) await Promise.resolve();
    expect(replies).toHaveLength(count);
    return replies[count - 1];
  };
  return { connection, send, reply, replies, requests, signals, fail };
}

describe('AgentConnection', () => {
  it('lists its keys, as ssh-add -L shows them', async () => {
    const { send, reply } = open();
    send(new Uint8Array([AGENT.REQUEST_IDENTITIES]));

    const r = new SshReader(await reply());
    expect(r.byte()).toBe(AGENT.IDENTITIES_ANSWER);
    expect(r.uint32()).toBe(1);
    expect(r.string()).toEqual(publicKeyBlob(phoneKey));
    expect(r.utf8()).toBe('flare-terminal');
    expect(r.remaining).toBe(0);
  });

  it('signs in to the session bound last once allowed, naming its server', async () => {
    const { send, reply, requests } = open();
    const sessionId = randomBytes(32);
    send(bind(githubKey, sessionId));
    expect(await reply()).toEqual(new Uint8Array([AGENT.SUCCESS]));

    const data = signInData(sessionId);
    send(signRequest(data));

    const r = new SshReader(await reply());
    expect(r.byte()).toBe(AGENT.SIGN_RESPONSE);
    const signature = new SshReader(r.string());
    expect(signature.utf8()).toBe('ssh-ed25519');
    expect(ed25519.verify(signature.string(), data, phoneKey.publicKey)).toBe(true);
    expect(requests).toEqual([
      {
        key: publicKeyBlob(phoneKey),
        purpose: { kind: 'sign-in', user: 'git', hostKey: publicKeyBlob(githubKey) },
        through: [],
      },
    ]);
  });

  it('names the computers it was forwarded on to', async () => {
    const { send, reply, requests } = open();
    const further = generateUserKey();
    const sessionId = randomBytes(32);
    send(bind(further, randomBytes(32), true));
    send(bind(githubKey, sessionId));
    send(signRequest(signInData(sessionId)));

    await reply(3);
    expect(requests[0].through).toEqual([publicKeyBlob(further)]);
  });

  it('refuses what the person denies', async () => {
    const { send, reply } = open({ approve: async () => null });
    send(signRequest(signInData(randomBytes(32))));
    expect(await reply()).toEqual(new Uint8Array([AGENT.FAILURE]));
  });

  it('refuses without asking for a key it doesn’t list', async () => {
    const { send, reply, requests } = open();
    send(signRequest(signInData(randomBytes(32), { key: otherKey }), otherKey));
    expect(await reply()).toEqual(new Uint8Array([AGENT.FAILURE]));
    expect(requests).toEqual([]);
  });

  it('refuses a host-bound sign-in that names another server than the bound one', async () => {
    const { send, reply, requests } = open();
    const sessionId = randomBytes(32);
    send(bind(githubKey, sessionId));
    send(
      signRequest(
        signInData(sessionId, {
          method: 'publickey-hostbound-v00@openssh.com',
          boundTo: otherKey,
        })
      )
    );

    expect(await reply(2)).toEqual(new Uint8Array([AGENT.FAILURE]));
    expect(requests).toEqual([]);
  });

  it('signs a host-bound sign-in for the bound server', async () => {
    const { send, reply, requests } = open();
    const sessionId = randomBytes(32);
    send(bind(githubKey, sessionId));
    send(
      signRequest(
        signInData(sessionId, {
          method: 'publickey-hostbound-v00@openssh.com',
          boundTo: githubKey,
        })
      )
    );

    expect((await reply(2))[0]).toBe(AGENT.SIGN_RESPONSE);
    expect(requests[0].purpose).toEqual({
      kind: 'sign-in',
      user: 'git',
      hostKey: publicKeyBlob(githubKey),
    });
  });

  it('refuses to add, remove or lock keys, and extensions it doesn’t know', async () => {
    const { send, reply, replies } = open();
    const messages = [
      [17], // add identity
      [18], // remove identity
      [19], // remove all identities
      [22], // lock
      [1], // SSH-1 identities
      [...new SshWriter().byte(AGENT.EXTENSION).string('query').toBytes()],
    ];
    messages.forEach((message) => send(new Uint8Array(message)));

    await reply(messages.length);
    expect(replies).toEqual(messages.map(() => new Uint8Array([AGENT.FAILURE])));
  });

  it('answers in order: a request waiting for the person holds up the next', async () => {
    let allow: (key: UserKey | null) => void = () => {};
    const { send, reply, replies } = open({
      approve: () => new Promise((resolve) => (allow = resolve)),
    });
    send(signRequest(signInData(randomBytes(32))));
    send(new Uint8Array([AGENT.REQUEST_IDENTITIES]));
    await Promise.resolve();
    expect(replies).toEqual([]);

    allow(phoneKey);
    expect((await reply(1))[0]).toBe(AGENT.SIGN_RESPONSE);
    expect((await reply(2))[0]).toBe(AGENT.IDENTITIES_ANSWER);
  });

  it('drops a request when the channel closes, and answers nothing after', async () => {
    let allow: (key: UserKey | null) => void = () => {};
    const { connection, send, replies, signals } = open({
      approve: () => new Promise((resolve) => (allow = resolve)),
    });
    send(signRequest(signInData(randomBytes(32))));
    await Promise.resolve();

    connection.close();
    expect(signals[0].aborted).toBe(true);
    allow(phoneKey);
    send(new Uint8Array([AGENT.REQUEST_IDENTITIES]));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(replies).toEqual([]);
  });

  it('refuses when the key it loaded isn’t the one asked for', async () => {
    const { send, reply } = open({ approve: async () => otherKey });
    send(signRequest(signInData(randomBytes(32))));
    expect(await reply()).toEqual(new Uint8Array([AGENT.FAILURE]));
  });

  it('reads messages split across and joined within channel data', async () => {
    const { connection, reply } = open();
    const one = new SshWriter().string(new Uint8Array([AGENT.REQUEST_IDENTITIES])).toBytes();
    const both = new Uint8Array([...one, ...one]);
    for (const byte of both.subarray(0, 7)) connection.receive(new Uint8Array([byte]));
    connection.receive(both.subarray(7));

    expect((await reply(2))[0]).toBe(AGENT.IDENTITIES_ANSWER);
  });

  it.each([
    ['empty', 0],
    ['over 256 KiB', 256 * 1024 + 1],
  ])('ends the channel on an %s message', (_, length) => {
    const { connection, fail, replies } = open();
    connection.receive(new SshWriter().uint32(length).toBytes());
    connection.receive(new Uint8Array([AGENT.REQUEST_IDENTITIES]));

    expect(fail).toHaveBeenCalledTimes(1);
    expect(replies).toEqual([]);
  });

  describe('session-bind@openssh.com', () => {
    it('refuses a binding its server didn’t sign', async () => {
      const { send, reply } = open();
      send(bind(githubKey, randomBytes(32), false, otherKey));
      expect(await reply()).toEqual(new Uint8Array([AGENT.EXTENSION_FAILURE]));
    });

    it('takes no more bindings once one signs in, as OpenSSH’s agent', async () => {
      const { send, reply } = open();
      send(bind(githubKey, randomBytes(32)));
      send(bind(otherKey, randomBytes(32), true));
      expect(await reply(2)).toEqual(new Uint8Array([AGENT.EXTENSION_FAILURE]));
    });

    it('takes a session again with its own key only', async () => {
      const { send, reply, replies } = open();
      const sessionId = randomBytes(32);
      send(bind(otherKey, sessionId, true));
      send(bind(otherKey, sessionId, true));
      send(bind(githubKey, sessionId, true));
      // The phone's own session to the host is bound already.
      send(bind(hostKey, origin.sessionId, true));
      await reply(4);
      expect(replies.map(([type]) => type)).toEqual([
        AGENT.SUCCESS,
        AGENT.SUCCESS,
        AGENT.EXTENSION_FAILURE,
        AGENT.SUCCESS,
      ]);
    });

    it('takes up to 16 sessions, counting the phone’s', async () => {
      const { send, reply, replies } = open();
      for (let i = 0; i < 16; i++) send(bind(otherKey, randomBytes(32), true));
      await reply(16);
      expect(replies.map(([type]) => type)).toEqual([
        ...Array(15).fill(AGENT.SUCCESS),
        AGENT.EXTENSION_FAILURE,
      ]);
    });

    it('refuses a session id over 128 bytes, as OpenSSH’s agent', async () => {
      const { send, reply, replies } = open();
      send(bind(otherKey, randomBytes(129), true));
      send(bind(otherKey, randomBytes(128), true));
      await reply(2);
      expect(replies.map(([type]) => type)).toEqual([AGENT.EXTENSION_FAILURE, AGENT.SUCCESS]);
    });
  });
});

describe('signPurpose', () => {
  const key = publicKeyBlob(phoneKey);
  const sessionId = randomBytes(32);
  const github: SessionBinding = {
    hostKey: publicKeyBlob(githubKey),
    sessionId,
    forwarding: false,
  };
  const phone: SessionBinding = { ...origin, forwarding: true };

  it('names the server only for the session bound last, to sign in over', () => {
    expect(signPurpose(signInData(sessionId), key, [phone, github])).toEqual({
      kind: 'sign-in',
      user: 'git',
      hostKey: github.hostKey,
    });
    // Unbound (OpenSSH before 8.9), another session, or one bound to forward the agent.
    for (const bindings of [[phone], [phone, { ...github, sessionId: randomBytes(32) }]]) {
      expect(signPurpose(signInData(sessionId), key, bindings)).toMatchObject({ hostKey: null });
    }
    expect(signPurpose(signInData(origin.sessionId), key, [phone])).toMatchObject({
      hostKey: null,
    });
  });

  it('reads only well-formed sign-ins with the key asked for', () => {
    const notSignIns = [
      signInData(sessionId, { key: otherKey }),
      signInData(sessionId, { method: 'password' }),
      signInData(sessionId, { algorithm: 'ecdsa-sha2-nistp256' }),
      new Uint8Array([...signInData(sessionId), 0]),
      signInData(new Uint8Array(0)),
    ];
    for (const data of notSignIns) {
      expect(signPurpose(data, key, [phone, github])).toEqual({ kind: 'unknown' });
    }
  });

  it('shows the user as one plain line', () => {
    const user = `git\x1b[31m\n${'x'.repeat(100)}`;
    expect(signPurpose(signInData(sessionId, { user }), key, [phone])).toMatchObject({
      user: `git[31m${'x'.repeat(57)}…`,
    });
  });

  it('reads SSHSIG signatures by their namespace', () => {
    const sshsig = (namespace: string) =>
      new Uint8Array([
        ...utf8('SSHSIG'),
        ...new SshWriter()
          .string(namespace)
          .string('')
          .string('sha512')
          .string(randomBytes(64))
          .toBytes(),
      ]);
    expect(signPurpose(sshsig('git'), key, [phone])).toEqual({ kind: 'sshsig', namespace: 'git' });
    expect(signPurpose(new Uint8Array([...sshsig('git'), 1]), key, [phone])).toEqual({
      kind: 'unknown',
    });
    expect(signPurpose(randomBytes(40), key, [phone])).toEqual({ kind: 'unknown' });
  });
});

describe('agentSignatureAlgorithm', () => {
  it('signs RSA with SHA-2 as the flags ask, never SHA-1', () => {
    expect(agentSignatureAlgorithm('ssh-rsa', 0)).toBeNull();
    expect(agentSignatureAlgorithm('ssh-rsa', 2)).toBe('rsa-sha2-256');
    expect(agentSignatureAlgorithm('ssh-rsa', 4)).toBe('rsa-sha2-512');
    // Both: SHA-256, as OpenSSH's agent picks.
    expect(agentSignatureAlgorithm('ssh-rsa', 6)).toBe('rsa-sha2-256');
    expect(agentSignatureAlgorithm('ssh-ed25519', 0)).toBe('ssh-ed25519');
    expect(agentSignatureAlgorithm('ecdsa-sha2-nistp256', 4)).toBe('ecdsa-sha2-nistp256');
  });
});
