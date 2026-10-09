import { x25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';

import '@/lib/random';

import { concatBytes, equalBytes, fromUtf8, SshReader, SshWriter, utf8 } from './bytes';
import {
  CIPHERS,
  CLIENT_VERSION,
  DISCONNECT_REASON,
  HOST_KEY_ALGORITHMS,
  KEX_ALGORITHMS,
  MACS,
  MSG,
  STRICT_KEX_CLIENT,
  STRICT_KEX_SERVER,
} from './constants';
import {
  fingerprint,
  keyTypeFor,
  parseHostKey,
  verifyHostSignature,
  type HostKey,
} from './host-keys';
import { CIPHER_KEY_SIZES, createCipher, PacketReader, PacketWriter } from './packet';
import { publicKeyBlob, signatureAlgorithm, signWithUserKey, type UserKey } from './user-key';

/**
 * An SSH-2 client (RFC 4251-4254) for interactive shells, written against audited
 * primitives from @noble. The caller owns the TCP socket: it passes received bytes to
 * `receive()` and reports `socketClosed()`. Flow:
 *
 *   await client.handshake();     // version, key exchange, host key check
 *   await client.authenticate();  // none, publickey, keyboard-interactive, password
 *   const shell = await client.openShell({ term, cols, rows });
 */

export type ByteSocket = { write(bytes: Uint8Array): void; close(): void };

export type HostKeyCheck = {
  algorithm: string;
  key: HostKey;
  /** `SHA256:…`, as `ssh-keygen -lf` prints it. */
  fingerprint: string;
};

export type AuthPrompt = {
  name: string;
  instruction: string;
  prompts: { prompt: string; echo: boolean }[];
};

export type SshClientOptions = {
  host: string;
  port: number;
  username: string;
  /** Resolves true to trust the key. Called once per connection, during the first key exchange. */
  verifyHostKey(check: HostKeyCheck): Promise<boolean>;
  /** Keys to offer, in order. The host is asked about each before it is used to sign. */
  userKeys?: UserKey[];
  /** A saved password, tried once before asking. */
  password?: string | null;
  /** Asks the person (password, one-time code); resolves null to give up. */
  prompt(request: AuthPrompt): Promise<string[] | null>;
  onBanner?(text: string): void;
  /** Called once when the connection ends, for any reason. */
  onClose(reason: SshCloseReason): void;
  /** Seconds between keepalives once signed in; 0 turns them off. */
  keepaliveInterval?: number;
};

export type SshCloseReason = {
  message: string;
  /** False when the network dropped or the protocol failed. */
  clean: boolean;
};

export class SshError extends Error {}

/** Why the host refused to open a channel (RFC 4254 section 5.1). */
export const OPEN_FAILURE = {
  ADMINISTRATIVELY_PROHIBITED: 1,
  CONNECT_FAILED: 2,
  UNKNOWN_CHANNEL_TYPE: 3,
  RESOURCE_SHORTAGE: 4,
} as const;

/** The host refused to open a channel; `reason` is one of OPEN_FAILURE. */
export class ChannelOpenError extends SshError {
  constructor(
    readonly reason: number,
    readonly description: string
  ) {
    super(`The host refused: ${description || 'no reason given'}`);
  }
}

type Negotiated = {
  kex: string;
  hostKey: string;
  cipherOut: string;
  cipherIn: string;
};

type KexState = {
  clientInit: Uint8Array;
  serverInit: Uint8Array | null;
  negotiated: Negotiated | null;
  ephemeral: { secretKey: Uint8Array; publicKey: Uint8Array } | null;
};

const MAX_AUTH_ATTEMPTS = 3;
/** Asks the server for EXT_INFO (RFC 8308), which says which signatures it accepts. */
const EXT_INFO_CLIENT = 'ext-info-c';
const LOCAL_WINDOW = 2 * 1024 * 1024;
const LOCAL_MAX_PACKET = 32 * 1024;
const MAX_MISSED_KEEPALIVES = 3;

// Messages a peer may send while a key exchange is running (RFC 4253 section 7.1).
const KEX_MESSAGES = new Set<number>([
  MSG.DISCONNECT,
  MSG.IGNORE,
  MSG.UNIMPLEMENTED,
  MSG.DEBUG,
  MSG.KEXINIT,
  MSG.NEWKEYS,
  MSG.KEX_ECDH_INIT,
  MSG.KEX_ECDH_REPLY,
]);

function firstCommon(ours: string[], theirs: string[]): string | null {
  return ours.find((name) => theirs.includes(name)) ?? null;
}

export class SshChannel {
  remoteId = 0;
  remoteWindow = 0;
  remoteMaxPacket = 0;
  localWindow = LOCAL_WINDOW;
  exitStatus: number | null = null;
  exitSignal: string | null = null;
  closed = false;
  closeSent = false;
  pendingWrites: Uint8Array[] = [];
  replies: ((ok: boolean) => void)[] = [];
  private dataHandler: ((bytes: Uint8Array) => void) | null = null;
  private closeHandler: ((channel: SshChannel) => void) | null = null;
  private buffered: Uint8Array[] = [];
  private closeSeen = false;

  constructor(
    private readonly client: SshClient,
    readonly localId: number
  ) {}

  /**
   * Output from the host. Servers may send output before the shell request is even
   * answered, so anything received before a handler is set is kept and replayed.
   */
  set onData(handler: (bytes: Uint8Array) => void) {
    this.dataHandler = handler;
    const buffered = this.buffered;
    this.buffered = [];
    buffered.forEach(handler);
  }

  set onClose(handler: (channel: SshChannel) => void) {
    this.closeHandler = handler;
    if (this.closeSeen) handler(this);
  }

  /** @internal */
  receiveData(bytes: Uint8Array) {
    if (this.dataHandler) this.dataHandler(bytes);
    else this.buffered.push(bytes);
  }

  /** @internal */
  receiveClose() {
    this.closeSeen = true;
    this.closeHandler?.(this);
  }

  write(bytes: Uint8Array) {
    if (this.closed || this.closeSent) return;
    this.pendingWrites.push(bytes);
    this.client.flushChannel(this);
  }

  resize(cols: number, rows: number) {
    this.client.channelRequest(this, 'window-change', false, (w) =>
      w.uint32(cols).uint32(rows).uint32(0).uint32(0)
    );
  }

  close() {
    this.client.closeChannel(this);
  }
}

export class SshClient {
  private readonly inbound = new PacketReader();
  private readonly outbound = new PacketWriter();
  private versionBuffer = '';
  private serverVersion: string | null = null;

  private kex: KexState | null = null;
  private sessionId: Uint8Array | null = null;
  private trustedHostKey: Uint8Array | null = null;
  private strictKex = false;
  private initialKexDone = false;
  private sendingKex = false;
  private queued: Uint8Array[] = [];
  private kexWaiters: (() => void)[] = [];

  private inbox: Uint8Array[] = [];
  private waiter: {
    types: number[];
    resolve: (payload: Uint8Array) => void;
    reject: (error: Error) => void;
  } | null = null;
  private pumping = false;
  private packetsReceived = 0;

  private channels = new Map<number, SshChannel>();
  private opening = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
  private nextChannelId = 0;

  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private missedKeepalives = 0;
  private closed = false;

  constructor(
    private readonly socket: ByteSocket,
    private readonly options: SshClientOptions
  ) {}

  // ───────────────────────────── socket side ─────────────────────────────

  receive(bytes: Uint8Array) {
    if (this.closed) return;
    try {
      if (this.serverVersion === null) {
        const rest = this.readVersion(bytes);
        if (rest === null) return;
        this.inbound.push(rest);
      } else {
        this.inbound.push(bytes);
      }
    } catch (error) {
      this.fail(error);
      return;
    }
    void this.pump();
  }

  socketClosed(error?: Error) {
    this.finish({
      message: error ? `Connection lost: ${error.message}` : 'Connection lost',
      clean: false,
    });
  }

  /** The server may send other lines before its version (RFC 4253 section 4.2). */
  private readVersion(bytes: Uint8Array): Uint8Array | null {
    // Only the version line is ASCII; the rest of this chunk may already be a packet.
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] !== 0x0a) continue;
      const line = (this.versionBuffer + fromUtf8(bytes.subarray(0, i))).replace(/\r$/, '');
      this.versionBuffer = '';
      if (line.startsWith('SSH-')) {
        if (!line.startsWith('SSH-2.0-') && !line.startsWith('SSH-1.99-')) {
          throw new SshError(`The host speaks an unsupported SSH version (${line})`);
        }
        this.serverVersion = line;
        return bytes.subarray(i + 1);
      }
      return this.readVersion(bytes.subarray(i + 1));
    }
    this.versionBuffer += fromUtf8(bytes);
    if (this.versionBuffer.length > 8192) throw new SshError('The host did not identify as SSH');
    return null;
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (!this.closed) {
        const payload = this.inbound.next();
        if (!payload) break;
        const seq = (this.inbound.seq - 1) >>> 0;
        this.packetsReceived++;
        await this.dispatch(payload, seq);
      }
    } catch (error) {
      this.fail(error);
    } finally {
      this.pumping = false;
    }
  }

  // ───────────────────────────── sending ─────────────────────────────

  private send(payload: Uint8Array) {
    if (this.closed) return;
    const type = payload[0];
    // Between our KEXINIT and our NEWKEYS only key exchange messages may go out.
    if (this.sendingKex && !KEX_MESSAGES.has(type)) {
      this.queued.push(payload);
      return;
    }
    this.socket.write(this.outbound.frame(payload));
  }

  private message(type: number, build?: (writer: SshWriter) => unknown): Uint8Array {
    const writer = new SshWriter().byte(type);
    build?.(writer);
    return writer.toBytes();
  }

  // ───────────────────────────── key exchange ─────────────────────────────

  async handshake(): Promise<void> {
    this.socket.write(utf8(`${CLIENT_VERSION}\r\n`));
    this.startKex();
    await new Promise<void>((resolve, reject) => {
      this.kexWaiters.push(resolve);
      this.onFailure = reject;
    });
    this.send(this.message(MSG.SERVICE_REQUEST, (w) => w.string('ssh-userauth')));
    await this.expect([MSG.SERVICE_ACCEPT]);
  }

  /** Rejects a pending handshake when the connection fails before it finishes. */
  private onFailure: ((error: Error) => void) | null = null;

  private startKex() {
    const clientInit = this.message(MSG.KEXINIT, (w) =>
      w
        .raw(randomBytes(16))
        .nameList([
          ...KEX_ALGORITHMS,
          ...(this.initialKexDone ? [] : [EXT_INFO_CLIENT]),
          STRICT_KEX_CLIENT,
        ])
        .nameList(HOST_KEY_ALGORITHMS)
        .nameList(CIPHERS)
        .nameList(CIPHERS)
        .nameList(MACS)
        .nameList(MACS)
        .nameList(['none'])
        .nameList(['none'])
        .nameList([])
        .nameList([])
        .boolean(false)
        .uint32(0)
    );
    this.kex = { clientInit, serverInit: null, negotiated: null, ephemeral: null };
    this.send(clientInit);
    this.sendingKex = true;
  }

  private handleKexInit(payload: Uint8Array) {
    // A server-initiated re-key: answer with our own KEXINIT first.
    if (!this.kex) this.startKex();
    const kex = this.kex!;
    if (kex.serverInit) throw new SshError('Unexpected KEXINIT');
    kex.serverInit = payload;

    const r = new SshReader(payload);
    r.byte();
    r.bytes(16);
    const kexAlgorithms = r.nameList();
    const hostKeyAlgorithms = r.nameList();
    const ciphersOut = r.nameList();
    const ciphersIn = r.nameList();
    r.nameList();
    r.nameList();
    const compressionOut = r.nameList();
    const compressionIn = r.nameList();

    if (!this.initialKexDone) {
      this.strictKex = kexAlgorithms.includes(STRICT_KEX_SERVER);
      // Strict key exchange: KEXINIT must be the very first packet.
      if (this.strictKex && this.packetsReceived !== 1) {
        throw new SshError('Strict key exchange violated: KEXINIT was not the first packet');
      }
    }

    const negotiated = {
      kex: firstCommon(KEX_ALGORITHMS, kexAlgorithms),
      hostKey: firstCommon(HOST_KEY_ALGORITHMS, hostKeyAlgorithms),
      cipherOut: firstCommon(CIPHERS, ciphersOut),
      cipherIn: firstCommon(CIPHERS, ciphersIn),
    };
    for (const [what, value] of Object.entries(negotiated)) {
      if (!value) throw new SshError(`No ${what} algorithm in common with the host`);
    }
    if (!compressionOut.includes('none') || !compressionIn.includes('none')) {
      throw new SshError('The host requires compression');
    }
    kex.negotiated = negotiated as Negotiated;

    const secretKey = randomBytes(32);
    kex.ephemeral = { secretKey, publicKey: x25519.getPublicKey(secretKey) };
    this.send(this.message(MSG.KEX_ECDH_INIT, (w) => w.string(kex.ephemeral!.publicKey)));
  }

  private async handleEcdhReply(payload: Uint8Array) {
    const kex = this.kex;
    if (!kex?.negotiated || !kex.ephemeral || !kex.serverInit) {
      throw new SshError('Unexpected key exchange reply');
    }
    const r = new SshReader(payload);
    r.byte();
    const hostKeyBlob = r.string();
    const serverPublic = r.string();
    const signature = r.string();
    if (serverPublic.length !== 32) throw new SshError('Bad curve25519 public key');

    const shared = x25519.getSharedSecret(kex.ephemeral.secretKey, serverPublic);
    if (shared.every((byte) => byte === 0)) throw new SshError('Bad curve25519 shared secret');
    // RFC 8731: the shared secret's bytes, read big-endian, as an mpint.
    const sharedMpint = new SshWriter().mpint(shared).toBytes();

    const exchangeHash = sha256(
      new SshWriter()
        .string(CLIENT_VERSION)
        .string(this.serverVersion ?? '')
        .string(kex.clientInit)
        .string(kex.serverInit)
        .string(hostKeyBlob)
        .string(kex.ephemeral.publicKey)
        .string(serverPublic)
        .raw(sharedMpint)
        .toBytes()
    );

    const { hostKey: algorithm } = kex.negotiated;
    const hostKey = parseHostKey(hostKeyBlob);
    if (!verifyHostSignature(algorithm, hostKey, signature, exchangeHash)) {
      throw new SshError("The host's key exchange signature is invalid");
    }

    if (!this.sessionId) {
      this.sessionId = exchangeHash;
      const trusted = await this.options.verifyHostKey({
        algorithm,
        key: hostKey,
        fingerprint: fingerprint(hostKeyBlob),
      });
      if (!trusted) {
        this.disconnect(DISCONNECT_REASON.HOST_KEY_NOT_VERIFIABLE, 'Host key not accepted');
        this.finish({ message: 'Host key not accepted', clean: true });
        return;
      }
      this.trustedHostKey = hostKeyBlob;
    } else if (!this.trustedHostKey || !equalBytes(this.trustedHostKey, hostKeyBlob)) {
      throw new SshError('The host key changed during the session');
    }

    const derive = (letter: string, length: number) => {
      let key: Uint8Array = sha256(
        concatBytes(sharedMpint, exchangeHash, utf8(letter), this.sessionId!)
      );
      while (key.length < length) {
        key = concatBytes(key, sha256(concatBytes(sharedMpint, exchangeHash, key)));
      }
      return key.slice(0, length);
    };
    const { cipherOut, cipherIn } = kex.negotiated;
    const out = CIPHER_KEY_SIZES[cipherOut];
    const inn = CIPHER_KEY_SIZES[cipherIn];
    this.pendingInboundCipher = createCipher(cipherIn, derive('D', inn.key), derive('B', inn.iv));

    this.send(this.message(MSG.NEWKEYS));
    this.outbound.cipher = createCipher(cipherOut, derive('C', out.key), derive('A', out.iv));
    if (this.strictKex) this.outbound.seq = 0;
    this.sendingKex = false;
    const queued = this.queued;
    this.queued = [];
    queued.forEach((message) => this.send(message));
  }

  private pendingInboundCipher: ReturnType<typeof createCipher> | null = null;

  private handleNewKeys() {
    if (!this.pendingInboundCipher) throw new SshError('Unexpected NEWKEYS');
    this.inbound.cipher = this.pendingInboundCipher;
    this.pendingInboundCipher = null;
    if (this.strictKex) this.inbound.seq = 0;
    this.kex = null;
    if (!this.initialKexDone) {
      this.initialKexDone = true;
      const waiters = this.kexWaiters;
      this.kexWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
  }

  // ───────────────────────────── dispatch ─────────────────────────────

  private async dispatch(payload: Uint8Array, seq: number) {
    const type = payload[0];
    if (this.strictKex && !this.initialKexDone && !KEX_MESSAGES.has(type)) {
      throw new SshError(`Strict key exchange violated by message ${type}`);
    }
    if (this.strictKex && !this.initialKexDone && (type === MSG.IGNORE || type === MSG.DEBUG)) {
      throw new SshError('Strict key exchange violated by a message during key exchange');
    }

    switch (type) {
      case MSG.DISCONNECT: {
        const r = new SshReader(payload);
        r.byte();
        r.uint32();
        const description = r.utf8();
        this.finish({ message: description || 'The host closed the connection', clean: true });
        return;
      }
      case MSG.IGNORE:
      case MSG.DEBUG:
      case MSG.UNIMPLEMENTED:
        return;
      case MSG.EXT_INFO:
        this.handleExtInfo(payload);
        return;
      case MSG.KEXINIT:
        this.handleKexInit(payload);
        return;
      case MSG.KEX_ECDH_REPLY:
        await this.handleEcdhReply(payload);
        return;
      case MSG.NEWKEYS:
        this.handleNewKeys();
        return;
    }

    if (!this.initialKexDone) throw new SshError(`Unexpected message ${type} before key exchange`);

    switch (type) {
      case MSG.USERAUTH_BANNER: {
        const r = new SshReader(payload);
        r.byte();
        this.options.onBanner?.(r.utf8());
        return;
      }
      case MSG.GLOBAL_REQUEST: {
        const r = new SshReader(payload);
        r.byte();
        r.utf8();
        if (r.boolean()) this.send(this.message(MSG.REQUEST_FAILURE));
        return;
      }
      case MSG.REQUEST_SUCCESS:
      case MSG.REQUEST_FAILURE:
        this.missedKeepalives = 0;
        return;
      case MSG.CHANNEL_OPEN:
        this.refuseChannelOpen(payload);
        return;
    }

    if (type >= MSG.CHANNEL_OPEN_CONFIRMATION && type <= MSG.CHANNEL_FAILURE) {
      this.dispatchChannel(type, payload);
      return;
    }
    if (type === MSG.SERVICE_ACCEPT || (type >= 50 && type <= 79)) {
      this.deliver(payload);
      return;
    }
    this.send(this.message(MSG.UNIMPLEMENTED, (w) => w.uint32(seq)));
  }

  private deliver(payload: Uint8Array) {
    const waiter = this.waiter;
    if (waiter && waiter.types.includes(payload[0])) {
      this.waiter = null;
      waiter.resolve(payload);
    } else {
      this.inbox.push(payload);
    }
  }

  private expect(types: number[]): Promise<Uint8Array> {
    if (this.closed) return Promise.reject(new SshError('Connection closed'));
    const index = this.inbox.findIndex((payload) => types.includes(payload[0]));
    if (index >= 0) return Promise.resolve(this.inbox.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      this.waiter = { types, resolve, reject };
    });
  }

  /** Signature algorithms the server accepts for sign-in, or null until it says. */
  private serverSigAlgs: string[] | null = null;

  private handleExtInfo(payload: Uint8Array) {
    const r = new SshReader(payload);
    r.byte();
    const count = r.uint32();
    for (let i = 0; i < count; i++) {
      const name = r.utf8();
      const value = r.string();
      if (name === 'server-sig-algs') this.serverSigAlgs = fromUtf8(value).split(',');
    }
  }

  // ───────────────────────────── authentication ─────────────────────────────

  private userauth(method: string, build?: (writer: SshWriter) => unknown) {
    this.send(
      this.message(MSG.USERAUTH_REQUEST, (w) => {
        w.string(this.options.username).string('ssh-connection').string(method);
        build?.(w);
      })
    );
  }

  /** Waits for success or failure. Returns null on success, else the methods that can continue. */
  private async authResult(onSixty?: (payload: Uint8Array) => Promise<boolean>) {
    for (;;) {
      const payload = await this.expect([
        MSG.USERAUTH_SUCCESS,
        MSG.USERAUTH_FAILURE,
        MSG.USERAUTH_60,
      ]);
      if (payload[0] === MSG.USERAUTH_SUCCESS) return null;
      if (payload[0] === MSG.USERAUTH_FAILURE) {
        const r = new SshReader(payload);
        r.byte();
        return r.nameList();
      }
      if (!onSixty || !(await onSixty(payload))) return [] as string[];
    }
  }

  async authenticate(): Promise<void> {
    const { userKeys = [], username, host } = this.options;
    let savedPassword = this.options.password ?? null;

    this.userauth('none');
    let methods = await this.authResult();
    if (methods === null) return this.signedIn();

    for (const key of userKeys) {
      if (!methods.includes('publickey')) break;
      const algorithm = signatureAlgorithm(key, this.serverSigAlgs);
      if (!algorithm) continue;
      const blob = publicKeyBlob(key);
      // Ask first (RFC 4252 section 7), so only a key the host takes signs anything.
      this.userauth('publickey', (w) => w.boolean(false).string(algorithm).string(blob));
      let signed = false;
      methods = await this.authResult(async (payload) => {
        const r = new SshReader(payload);
        r.byte();
        // Hosts may name the key type here rather than the signature algorithm (ssh-rsa
        // for rsa-sha2-512); the key itself must be the one offered.
        const named = keyTypeFor(r.utf8());
        if (signed || named !== key.type || !equalBytes(r.string(), blob)) {
          throw new SshError('The host answered for a key that wasn’t offered');
        }
        signed = true;
        const data = new SshWriter()
          .string(this.sessionId!)
          .byte(MSG.USERAUTH_REQUEST)
          .string(username)
          .string('ssh-connection')
          .string('publickey')
          .boolean(true)
          .string(algorithm)
          .string(blob)
          .toBytes();
        this.userauth('publickey', (w) =>
          w
            .boolean(true)
            .string(algorithm)
            .string(blob)
            .string(signWithUserKey(key, data, algorithm))
        );
        return true;
      });
      if (methods === null) return this.signedIn();
    }

    for (let attempt = 0; attempt < MAX_AUTH_ATTEMPTS; attempt++) {
      if (methods.includes('keyboard-interactive')) {
        let cancelled = false;
        this.userauth('keyboard-interactive', (w) => w.string('').string(''));
        methods = await this.authResult(async (payload) => {
          const r = new SshReader(payload);
          r.byte();
          const request: AuthPrompt = { name: r.utf8(), instruction: r.utf8(), prompts: [] };
          r.utf8();
          const count = r.uint32();
          for (let i = 0; i < count; i++) {
            request.prompts.push({ prompt: r.utf8(), echo: r.boolean() });
          }
          let answers: string[] | null;
          const [only] = request.prompts;
          if (savedPassword !== null && request.prompts.length === 1 && !only.echo) {
            answers = [savedPassword];
            savedPassword = null;
          } else if (request.prompts.length === 0) {
            answers = [];
          } else {
            answers = await this.options.prompt(request);
          }
          if (answers === null) {
            cancelled = true;
            return false;
          }
          this.send(
            this.message(MSG.USERAUTH_INFO_RESPONSE, (w) => {
              w.uint32(answers.length);
              answers.forEach((answer) => w.string(answer));
            })
          );
          return true;
        });
        if (cancelled) throw new SshError('Sign-in cancelled');
      } else if (methods.includes('password')) {
        let password = savedPassword;
        savedPassword = null;
        if (password === null) {
          const answers = await this.options.prompt({
            name: '',
            instruction: '',
            prompts: [{ prompt: `${username}@${host}'s password: `, echo: false }],
          });
          if (answers === null) throw new SshError('Sign-in cancelled');
          password = answers[0] ?? '';
        }
        this.userauth('password', (w) => w.boolean(false).string(password));
        methods = await this.authResult(async () => {
          throw new SshError('The password has expired. Change it on the computer first.');
        });
      } else {
        break;
      }
      if (methods === null) return this.signedIn();
    }

    this.disconnect(DISCONNECT_REASON.NO_MORE_AUTH_METHODS, 'Authentication failed');
    throw new SshError(`Permission denied (${methods.join(',') || 'no methods left'}).`);
  }

  private signedIn() {
    const interval = this.options.keepaliveInterval ?? 20;
    if (interval > 0) {
      this.keepaliveTimer = setInterval(() => this.keepalive(), interval * 1000);
    }
  }

  private keepalive() {
    if (this.missedKeepalives >= MAX_MISSED_KEEPALIVES) {
      this.finish({ message: 'Connection lost (the host stopped answering)', clean: false });
      return;
    }
    this.missedKeepalives++;
    this.send(
      this.message(MSG.GLOBAL_REQUEST, (w) => w.string('keepalive@openssh.com').boolean(true))
    );
  }

  // ───────────────────────────── channels ─────────────────────────────

  /** Opens a channel of `type`; `build` writes what that type adds to the request. */
  private async openChannel(
    type: string,
    build?: (writer: SshWriter) => unknown
  ): Promise<SshChannel> {
    if (this.closed) throw new SshError('Not connected');
    const channel = new SshChannel(this, this.nextChannelId++);
    this.channels.set(channel.localId, channel);
    const opened = new Promise<void>((resolve, reject) =>
      this.opening.set(channel.localId, { resolve, reject })
    );
    this.send(
      this.message(MSG.CHANNEL_OPEN, (w) => {
        w.string(type).uint32(channel.localId).uint32(LOCAL_WINDOW).uint32(LOCAL_MAX_PACKET);
        build?.(w);
      })
    );
    await opened;
    return channel;
  }

  async openShell({
    term,
    cols,
    rows,
  }: {
    term: string;
    cols: number;
    rows: number;
  }): Promise<SshChannel> {
    let channel: SshChannel;
    try {
      channel = await this.openChannel('session');
    } catch (error) {
      if (!(error instanceof ChannelOpenError)) throw error;
      throw new SshError(`The host refused a session: ${error.description || 'no reason given'}`);
    }

    // Terminal modes: VERASE = DEL, IUTF8 on (so backspace removes whole UTF-8 characters).
    const modes = new SshWriter().byte(3).uint32(127).byte(42).uint32(1).byte(0).toBytes();
    const pty = await this.channelRequest(channel, 'pty-req', true, (w) =>
      w.string(term).uint32(cols).uint32(rows).uint32(0).uint32(0).string(modes)
    );
    if (!pty) throw new SshError('The host refused to open a terminal');
    const shell = await this.channelRequest(channel, 'shell', true);
    if (!shell) throw new SshError('The host refused to start a shell');
    return channel;
  }

  /**
   * A byte stream to `host`:`port` as the host sees them (RFC 4254 section 7.2), like
   * `ssh -L`: `localhost` is the host itself. Rejects with a ChannelOpenError when the host
   * doesn't allow forwarding or nothing answers there.
   */
  openDirectTcpip(host: string, port: number): Promise<SshChannel> {
    // The originator is this phone, which has no address worth telling the host.
    return this.openChannel('direct-tcpip', (w) =>
      w.string(host).uint32(port).string('127.0.0.1').uint32(0)
    );
  }

  /** @internal Sends a channel request; resolves with the reply when one is wanted. */
  channelRequest(
    channel: SshChannel,
    name: string,
    wantReply: boolean,
    build?: (writer: SshWriter) => unknown
  ): Promise<boolean> {
    if (channel.closed || channel.closeSent) return Promise.resolve(false);
    const reply = wantReply
      ? new Promise<boolean>((resolve) => channel.replies.push(resolve))
      : Promise.resolve(true);
    this.send(
      this.message(MSG.CHANNEL_REQUEST, (w) => {
        w.uint32(channel.remoteId).string(name).boolean(wantReply);
        build?.(w);
      })
    );
    return reply;
  }

  /** @internal Sends as much queued data as the host's window allows. */
  flushChannel(channel: SshChannel) {
    while (channel.pendingWrites.length && channel.remoteWindow > 0) {
      const next = channel.pendingWrites[0];
      const size = Math.min(next.length, channel.remoteWindow, channel.remoteMaxPacket);
      const chunk = next.subarray(0, size);
      if (size === next.length) channel.pendingWrites.shift();
      else channel.pendingWrites[0] = next.subarray(size);
      channel.remoteWindow -= size;
      this.send(this.message(MSG.CHANNEL_DATA, (w) => w.uint32(channel.remoteId).string(chunk)));
    }
  }

  /** @internal */
  closeChannel(channel: SshChannel) {
    if (channel.closeSent || channel.closed) return;
    channel.closeSent = true;
    this.send(this.message(MSG.CHANNEL_CLOSE, (w) => w.uint32(channel.remoteId)));
  }

  private refuseChannelOpen(payload: Uint8Array) {
    const r = new SshReader(payload);
    r.byte();
    r.utf8();
    const senderId = r.uint32();
    this.send(
      this.message(MSG.CHANNEL_OPEN_FAILURE, (w) =>
        w.uint32(senderId).uint32(1).string('Not supported').string('')
      )
    );
  }

  private dispatchChannel(type: number, payload: Uint8Array) {
    const r = new SshReader(payload);
    r.byte();
    const channel = this.channels.get(r.uint32());
    if (!channel) throw new SshError(`Message ${type} for an unknown channel`);

    switch (type) {
      case MSG.CHANNEL_OPEN_CONFIRMATION: {
        channel.remoteId = r.uint32();
        channel.remoteWindow = r.uint32();
        channel.remoteMaxPacket = Math.max(1, Math.min(r.uint32(), LOCAL_MAX_PACKET));
        this.opening.get(channel.localId)?.resolve();
        this.opening.delete(channel.localId);
        return;
      }
      case MSG.CHANNEL_OPEN_FAILURE: {
        const reason = r.uint32();
        const description = r.utf8();
        this.channels.delete(channel.localId);
        this.opening.get(channel.localId)?.reject(new ChannelOpenError(reason, description));
        this.opening.delete(channel.localId);
        return;
      }
      case MSG.CHANNEL_WINDOW_ADJUST:
        channel.remoteWindow = Math.min(channel.remoteWindow + r.uint32(), 0xffffffff);
        this.flushChannel(channel);
        return;
      case MSG.CHANNEL_DATA:
      case MSG.CHANNEL_EXTENDED_DATA: {
        if (type === MSG.CHANNEL_EXTENDED_DATA) r.uint32();
        const data = r.string();
        channel.localWindow -= data.length;
        if (channel.localWindow < 0) throw new SshError('The host overran the channel window');
        if (channel.localWindow < LOCAL_WINDOW / 2) {
          const add = LOCAL_WINDOW - channel.localWindow;
          channel.localWindow = LOCAL_WINDOW;
          this.send(
            this.message(MSG.CHANNEL_WINDOW_ADJUST, (w) => w.uint32(channel.remoteId).uint32(add))
          );
        }
        channel.receiveData(data);
        return;
      }
      case MSG.CHANNEL_EOF:
        return;
      case MSG.CHANNEL_CLOSE:
        this.closeChannel(channel);
        channel.closed = true;
        this.channels.delete(channel.localId);
        channel.receiveClose();
        return;
      case MSG.CHANNEL_REQUEST: {
        const name = r.utf8();
        const wantReply = r.boolean();
        if (name === 'exit-status') channel.exitStatus = r.uint32();
        else if (name === 'exit-signal') channel.exitSignal = r.utf8();
        if (wantReply) {
          this.send(this.message(MSG.CHANNEL_FAILURE, (w) => w.uint32(channel.remoteId)));
        }
        return;
      }
      case MSG.CHANNEL_SUCCESS:
      case MSG.CHANNEL_FAILURE:
        channel.replies.shift()?.(type === MSG.CHANNEL_SUCCESS);
        return;
    }
  }

  // ───────────────────────────── closing ─────────────────────────────

  private disconnect(reason: number, description: string) {
    if (this.closed) return;
    try {
      this.send(
        this.message(MSG.DISCONNECT, (w) => w.uint32(reason).string(description).string(''))
      );
    } catch {
      // The socket may already be gone.
    }
  }

  /** Ends the connection from this side. */
  close() {
    this.disconnect(DISCONNECT_REASON.BY_APPLICATION, 'Closed by the user');
    this.finish({ message: 'Closed', clean: true });
  }

  private fail(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof SshError) this.disconnect(DISCONNECT_REASON.PROTOCOL_ERROR, message);
    this.finish({ message, clean: false });
  }

  private finish(reason: SshCloseReason) {
    if (this.closed) return;
    this.closed = true;
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    const error = new SshError(reason.message);
    this.waiter?.reject(error);
    this.waiter = null;
    this.onFailure?.(error);
    this.opening.forEach(({ reject }) => reject(error));
    this.opening.clear();
    this.channels.forEach((channel) => {
      channel.closed = true;
      channel.replies.forEach((resolve) => resolve(false));
    });
    this.channels.clear();
    try {
      this.socket.close();
    } catch {
      // Already closed.
    }
    this.options.onClose(reason);
  }
}
