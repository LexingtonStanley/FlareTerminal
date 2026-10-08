/** SSH message numbers (RFC 4250 section 4.1) and the algorithms this client offers. */

export const MSG = {
  DISCONNECT: 1,
  IGNORE: 2,
  UNIMPLEMENTED: 3,
  DEBUG: 4,
  SERVICE_REQUEST: 5,
  SERVICE_ACCEPT: 6,
  EXT_INFO: 7,
  KEXINIT: 20,
  NEWKEYS: 21,
  KEX_ECDH_INIT: 30,
  KEX_ECDH_REPLY: 31,
  USERAUTH_REQUEST: 50,
  USERAUTH_FAILURE: 51,
  USERAUTH_SUCCESS: 52,
  USERAUTH_BANNER: 53,
  /** PK_OK for publickey, PASSWD_CHANGEREQ for password, INFO_REQUEST for keyboard-interactive. */
  USERAUTH_60: 60,
  USERAUTH_INFO_RESPONSE: 61,
  GLOBAL_REQUEST: 80,
  REQUEST_SUCCESS: 81,
  REQUEST_FAILURE: 82,
  CHANNEL_OPEN: 90,
  CHANNEL_OPEN_CONFIRMATION: 91,
  CHANNEL_OPEN_FAILURE: 92,
  CHANNEL_WINDOW_ADJUST: 93,
  CHANNEL_DATA: 94,
  CHANNEL_EXTENDED_DATA: 95,
  CHANNEL_EOF: 96,
  CHANNEL_CLOSE: 97,
  CHANNEL_REQUEST: 98,
  CHANNEL_SUCCESS: 99,
  CHANNEL_FAILURE: 100,
} as const;

export const DISCONNECT_REASON = {
  PROTOCOL_ERROR: 2,
  KEY_EXCHANGE_FAILED: 3,
  HOST_KEY_NOT_VERIFIABLE: 9,
  BY_APPLICATION: 11,
  NO_MORE_AUTH_METHODS: 14,
} as const;

export const CLIENT_VERSION = 'SSH-2.0-FlareTerminal_1.0';

/**
 * Only modern algorithms: curve25519 key exchange, AEAD ciphers and the host key types
 * current servers use. `kex-strict-c-v00@openssh.com` opts into strict key exchange, the
 * fix for the Terrapin attack (CVE-2023-48795).
 */
export const KEX_ALGORITHMS = ['curve25519-sha256', 'curve25519-sha256@libssh.org'];
export const STRICT_KEX_CLIENT = 'kex-strict-c-v00@openssh.com';
export const STRICT_KEX_SERVER = 'kex-strict-s-v00@openssh.com';
export const HOST_KEY_ALGORITHMS = [
  'ssh-ed25519',
  'ecdsa-sha2-nistp256',
  'rsa-sha2-512',
  'rsa-sha2-256',
];
export const CIPHERS = [
  'chacha20-poly1305@openssh.com',
  'aes256-gcm@openssh.com',
  'aes128-gcm@openssh.com',
];
/** Ignored with AEAD ciphers, but some servers expect a non-empty list. */
export const MACS = ['hmac-sha2-256-etm@openssh.com', 'hmac-sha2-256'];

/** Upper bound for an incoming packet; OpenSSH uses the same. */
export const MAX_PACKET_LENGTH = 256 * 1024;
