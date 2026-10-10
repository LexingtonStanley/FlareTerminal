import { equalBytes, SshReader, SshWriter } from './bytes';
import { MSG } from './constants';
import { keyTypeFor, parseHostKey, verifyHostSignature } from './host-keys';
import { publicKeyBlob, signWithUserKey, type UserKey } from './user-key';

/**
 * The SSH agent protocol (RFC 9987, and OpenSSH's PROTOCOL.agent) for agent forwarding,
 * like `ssh -A`: programs on the host (git, ssh) ask the phone to list its keys and to
 * sign with one. A forwarded agent only lists and signs: the host can never add, remove or
 * lock keys, and each signature waits for the person (AgentBackend.approve). Private keys
 * stay on the phone; the host only sees public keys and signatures.
 */

/** Agent message numbers (RFC 9987 section 6.1). */
export const AGENT = {
  FAILURE: 5,
  SUCCESS: 6,
  REQUEST_IDENTITIES: 11,
  IDENTITIES_ANSWER: 12,
  SIGN_REQUEST: 13,
  SIGN_RESPONSE: 14,
  EXTENSION: 27,
  EXTENSION_FAILURE: 28,
} as const;

/** Sign request flags: RSA signatures with SHA-2 (RFC 9987 section 6.6.1). */
export const SIGN_FLAGS = { RSA_SHA2_256: 2, RSA_SHA2_512: 4 } as const;

// OpenSSH's limits: a message, the sessions bound to one connection, a session id.
const MAX_MESSAGE = 256 * 1024;
const MAX_BINDINGS = 16;
const MAX_SESSION_ID = 128;
/** What a request may show of the user or namespace it names. */
const MAX_SHOWN = 64;

const HOSTBOUND_METHOD = 'publickey-hostbound-v00@openssh.com';

/** A key the agent lists: its public blob and comment, as `ssh-add -L` shows them. */
export type AgentKey = { blob: Uint8Array; comment: string };

/**
 * An SSH connection the agent is used for, as `session-bind@openssh.com` tells it (OpenSSH
 * 8.9 and later), with the host key that signed its session id: one that forwards the agent
 * on (`forwarding`), or the one it signs in over, which is always the last.
 */
export type SessionBinding = { hostKey: Uint8Array; sessionId: Uint8Array; forwarding: boolean };

/** What a signature is for, as far as its data shows. */
export type SignPurpose =
  /** Signing in to an SSH server as `user`; `hostKey` is that server's when it was bound. */
  | { kind: 'sign-in'; user: string; hostKey: Uint8Array | null }
  /** An SSHSIG signature (`ssh-keygen -Y sign`, git's SSH commit signing) for `namespace`. */
  | { kind: 'sshsig'; namespace: string }
  | { kind: 'unknown' };

export type SignRequest = {
  /** The listed key it asks for: its public blob. */
  key: Uint8Array;
  purpose: SignPurpose;
  /** Host keys of the computers it was forwarded on to after the first, in order. */
  through: Uint8Array[];
};

export type AgentBackend = {
  /** The keys to list. */
  keys(): AgentKey[];
  /**
   * Asks the person. Resolves the key to sign with, or null to refuse. `signal` aborts when
   * the request no longer needs an answer (the program on the host gave up).
   */
  approve(request: SignRequest, signal: AbortSignal): Promise<UserKey | null>;
};

/** Text from the host as a request shows it: one line, no control characters, not too long. */
function shown(text: string): string {
  const line = text.replace(/\p{Cc}/gu, '').trim();
  return line.length > MAX_SHOWN ? `${line.slice(0, MAX_SHOWN)}…` : line;
}

/**
 * The signature algorithm a request asks for: RSA with SHA-2 by its flags, as OpenSSH
 * decides, or the key's own. Null for RSA with SHA-1, which Flare never signs.
 */
export function agentSignatureAlgorithm(keyType: string, flags: number): string | null {
  if (keyType !== 'ssh-rsa') return keyType;
  if (flags & SIGN_FLAGS.RSA_SHA2_256) return 'rsa-sha2-256';
  if (flags & SIGN_FLAGS.RSA_SHA2_512) return 'rsa-sha2-512';
  return null;
}

/**
 * Reads `data` as an SSH sign-in (RFC 4252 section 7, or OpenSSH's host-bound variant) with
 * `key`, as OpenSSH's agent does: every field as a client sends it and nothing after.
 */
function readSignIn(data: Uint8Array, key: Uint8Array) {
  try {
    const r = new SshReader(data);
    const sessionId = r.string();
    if (!sessionId.length || r.byte() !== MSG.USERAUTH_REQUEST) return null;
    const user = r.utf8();
    const service = r.utf8();
    const method = r.utf8();
    const signatureFollows = r.byte();
    const algorithm = r.utf8();
    const blob = r.string();
    if (service !== 'ssh-connection' || signatureFollows !== 1 || !equalBytes(blob, key)) {
      return null;
    }
    if (keyTypeFor(algorithm) !== new SshReader(key).utf8()) return null;
    let hostKey: Uint8Array | null = null;
    if (method === HOSTBOUND_METHOD) hostKey = r.string();
    else if (method !== 'publickey') return null;
    if (r.remaining) return null;
    return { sessionId, user, hostKey };
  } catch {
    return null;
  }
}

/** Reads `data` as an SSHSIG signature's signed data (OpenSSH's PROTOCOL.sshsig). */
function readSshsig(data: Uint8Array): string | null {
  const magic = [0x53, 0x53, 0x48, 0x53, 0x49, 0x47]; // "SSHSIG"
  if (data.length < magic.length || magic.some((byte, i) => data[i] !== byte)) return null;
  try {
    const r = new SshReader(data.subarray(magic.length));
    const namespace = r.utf8();
    r.string(); // reserved
    r.utf8(); // hash algorithm
    r.string(); // the message's hash
    return r.remaining ? null : namespace;
  } catch {
    return null;
  }
}

/**
 * What signing `data` with `key` is for. A sign-in names its server when it is for the
 * session bound last, which ssh binds just before it signs in; any other session is
 * unidentified, since the host could name any. Null refuses: a host-bound sign-in that names
 * a host key other than the bound session's.
 */
export function signPurpose(
  data: Uint8Array,
  key: Uint8Array,
  bindings: SessionBinding[]
): SignPurpose | null {
  const signIn = readSignIn(data, key);
  if (signIn) {
    const last = bindings.at(-1);
    const bound =
      last && !last.forwarding && equalBytes(last.sessionId, signIn.sessionId) ? last : null;
    if (bound && signIn.hostKey && !equalBytes(signIn.hostKey, bound.hostKey)) return null;
    return { kind: 'sign-in', user: shown(signIn.user), hostKey: bound?.hostKey ?? null };
  }
  const namespace = readSshsig(data);
  if (namespace !== null) return { kind: 'sshsig', namespace: shown(namespace) };
  return { kind: 'unknown' };
}

/**
 * One program's connection to the agent: an `auth-agent@openssh.com` channel, which the host
 * opens each time something there connects to $SSH_AUTH_SOCK. Requests are answered in
 * order; one waiting for the person holds up the rest, as with OpenSSH's agent.
 */
export class AgentConnection {
  private input = new Uint8Array(0);
  private queue: Promise<void> = Promise.resolve();
  private readonly bindings: SessionBinding[];
  private readonly aborter = new AbortController();
  private closed = false;

  /**
   * `origin` is the phone's own connection to the host, which the agent is forwarded over:
   * the first hop, as OpenSSH's ssh binds it.
   */
  constructor(
    private readonly send: (bytes: Uint8Array) => void,
    private readonly backend: AgentBackend,
    origin: { hostKey: Uint8Array; sessionId: Uint8Array },
    /** Ends the channel: the host broke the protocol. */
    private readonly fail: () => void
  ) {
    this.bindings = [{ ...origin, forwarding: true }];
  }

  receive(bytes: Uint8Array) {
    if (this.closed) return;
    const joined = new Uint8Array(this.input.length + bytes.length);
    joined.set(this.input);
    joined.set(bytes, this.input.length);
    this.input = joined;
    while (this.input.length >= 4) {
      const length = new SshReader(this.input).uint32();
      if (length === 0 || length > MAX_MESSAGE) {
        this.close();
        this.fail();
        return;
      }
      if (this.input.length < 4 + length) return;
      const message = this.input.slice(4, 4 + length);
      this.input = this.input.slice(4 + length);
      this.queue = this.queue.then(() => this.handle(message));
    }
  }

  /** The channel closed: requests still waiting for the person are dropped. */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.aborter.abort();
  }

  private reply(build: (writer: SshWriter) => unknown) {
    if (this.closed) return;
    const writer = new SshWriter();
    build(writer);
    const payload = writer.toBytes();
    this.send(new SshWriter().string(payload).toBytes());
  }

  private status(type: number) {
    this.reply((w) => w.byte(type));
  }

  private async handle(message: Uint8Array) {
    if (this.closed) return;
    const r = new SshReader(message);
    const type = r.byte();
    try {
      switch (type) {
        case AGENT.REQUEST_IDENTITIES:
          return this.listKeys();
        case AGENT.SIGN_REQUEST:
          return await this.sign(r);
        case AGENT.EXTENSION:
          return this.extension(r);
        default:
          // Adding, removing and locking keys, smartcards, the old SSH-1 messages.
          return this.status(AGENT.FAILURE);
      }
    } catch {
      this.status(AGENT.FAILURE);
    }
  }

  private listKeys() {
    const keys = this.backend.keys();
    this.reply((w) => {
      w.byte(AGENT.IDENTITIES_ANSWER).uint32(keys.length);
      keys.forEach(({ blob, comment }) => w.string(blob).string(comment));
    });
  }

  private async sign(r: SshReader) {
    const key = r.string().slice();
    const data = r.string().slice();
    const flags = r.uint32();
    const listed = this.backend.keys().some(({ blob }) => equalBytes(blob, key));
    const algorithm = agentSignatureAlgorithm(new SshReader(key).utf8(), flags);
    const purpose = listed && algorithm ? signPurpose(data, key, this.bindings) : null;
    if (!purpose || !algorithm) return this.status(AGENT.FAILURE);

    const through = this.bindings
      .slice(1)
      .filter(({ forwarding }) => forwarding)
      .map(({ hostKey }) => hostKey);
    const userKey = await this.backend.approve({ key, purpose, through }, this.aborter.signal);
    // The key it loaded must be the one asked for, whatever happened to the list meanwhile.
    if (!userKey || this.closed || !equalBytes(publicKeyBlob(userKey), key)) {
      return this.status(AGENT.FAILURE);
    }
    const signature = signWithUserKey(userKey, data, algorithm);
    this.reply((w) => w.byte(AGENT.SIGN_RESPONSE).string(signature));
  }

  private extension(r: SshReader) {
    const name = r.utf8();
    if (name !== 'session-bind@openssh.com') return this.status(AGENT.FAILURE);
    this.status(this.bind(r) ? AGENT.SUCCESS : AGENT.EXTENSION_FAILURE);
  }

  /** Records a session, as OpenSSH's agent does (process_ext_session_bind). */
  private bind(r: SshReader): boolean {
    const hostKey = r.string().slice();
    const sessionId = r.string().slice();
    const signature = r.string();
    const forwarding = r.boolean();
    if (sessionId.length > MAX_SESSION_ID) return false;
    // The host key's signature over the session id, from that session's key exchange.
    const algorithm = new SshReader(signature).utf8();
    if (!verifyHostSignature(algorithm, parseHostKey(hostKey), signature, sessionId)) {
      return false;
    }
    for (const bound of this.bindings) {
      // Nothing more once a session signs in through this connection.
      if (!bound.forwarding) return false;
      if (equalBytes(bound.sessionId, sessionId)) return equalBytes(bound.hostKey, hostKey);
    }
    if (this.bindings.length >= MAX_BINDINGS) return false;
    this.bindings.push({ hostKey, sessionId, forwarding });
    return true;
  }
}
