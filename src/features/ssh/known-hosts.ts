import { readJson, writeJson } from '@/lib/storage';

/**
 * Host keys the person has trusted, like OpenSSH's ~/.ssh/known_hosts. The first
 * connection asks; later connections must present the same key.
 */

const STORAGE_KEY = 'flare.known-hosts.v1';

export type KnownHost = {
  /** ssh-ed25519, ecdsa-sha2-nistp256 or ssh-rsa. */
  type: string;
  /** Base64 of the public key blob. */
  key: string;
  fingerprint: string;
  addedAt: string;
};

export type KnownHosts = {
  get(host: string, port: number): KnownHost | null;
  trust(host: string, port: number, entry: KnownHost): void;
  forget(host: string, port: number): void;
};

/** OpenSSH's known_hosts naming: `host`, or `[host]:port` off port 22. */
export function hostId(host: string, port: number): string {
  const name = host.toLowerCase();
  return port === 22 ? name : `[${name}]:${port}`;
}

function load(): Record<string, KnownHost> {
  return readJson<Record<string, KnownHost>>(STORAGE_KEY) ?? {};
}

export const knownHosts: KnownHosts = {
  get: (host, port) => load()[hostId(host, port)] ?? null,
  trust(host, port, entry) {
    writeJson(STORAGE_KEY, { ...load(), [hostId(host, port)]: entry });
  },
  forget(host, port) {
    const all = load();
    delete all[hostId(host, port)];
    writeJson(STORAGE_KEY, all);
  },
};
