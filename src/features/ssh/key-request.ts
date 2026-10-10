import type { SignRequest } from './agent';
import { toBase64 } from './bytes';
import { fingerprint } from './host-keys';
import type { SavedKey } from './keys';

/**
 * What the phone asks the person when a program on a host wants one of their keys (agent
 * forwarding): which key, and what for, with the computers involved named where Flare can
 * tell which they are.
 */

/** A computer in a key request, by its host key. */
export type RequestHost = {
  /** A code host (github.com) or a computer the phone trusts; null when Flare doesn't know it. */
  name: string | null;
  fingerprint: string;
};

export type KeyRequest = {
  key: Pick<SavedKey, 'id' | 'name' | 'kind' | 'fingerprint'>;
  purpose:
    | { kind: 'sign-in'; user: string; host: RequestHost | null }
    | { kind: 'sshsig'; namespace: string }
    | { kind: 'unknown' };
  /** Computers the agent was forwarded on to from the session's (ssh -A from there), in order. */
  through: RequestHost[];
};

/**
 * Code hosts' published host key fingerprints, so signing in to one names it, though the
 * phone never connects there itself. A key that isn't listed (a host rotated its keys) is
 * shown by its fingerprint instead.
 */
const CODE_HOSTS: Record<string, string> = {
  // https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
  'SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU': 'github.com',
  'SHA256:p2QAMXNIC1TJYWeIOttrVc98/R1BUFWu3/LiyKgUfQM': 'github.com',
  'SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s': 'github.com',
  // https://docs.gitlab.com/user/gitlab_com/#ssh-host-keys-fingerprints
  'SHA256:eUXGGm1YGsMAS7vkcx6JOJdOGHPem5gQp4taiCfCLB8': 'gitlab.com',
  'SHA256:HbW3g8zUjNSksFbqTiUWPWg2Bq1x8xdGUrliXFzSnUw': 'gitlab.com',
  'SHA256:ROQFvPThGrW4RuWLoL9tq9I9zJ42fK4XywyRtbOz/EQ': 'gitlab.com',
  // From the keys at https://bitbucket.org/site/ssh
  'SHA256:ybgmFkzwOSotHTHLJgHO0QN8L0xErw6vd0VhFA9m3SM': 'bitbucket.org',
  'SHA256:FC73VB6C4OQLSCrjEayhMp9UMxS97caD/Yyi2bhW/J0': 'bitbucket.org',
  'SHA256:46OSHA1Rmj8E8ERTC6xkNcmGOw9oFxYr0WF6zWW8l1E': 'bitbucket.org',
};

/** Finds a computer the phone trusts by its host key (base64), as known_hosts names it. */
export type TrustedHostLookup = (key: string) => string | null;

function requestHost(hostKey: Uint8Array, trusted: TrustedHostLookup): RequestHost {
  const print = fingerprint(hostKey);
  return { name: CODE_HOSTS[print] ?? trusted(toBase64(hostKey)), fingerprint: print };
}

/** A sign request as the person is asked it, using `key`, the saved key it names. */
export function describeKeyRequest(
  request: SignRequest,
  key: SavedKey,
  trusted: TrustedHostLookup
): KeyRequest {
  const { purpose } = request;
  return {
    key: { id: key.id, name: key.name, kind: key.kind, fingerprint: key.fingerprint },
    purpose:
      purpose.kind === 'sign-in'
        ? {
            kind: 'sign-in',
            user: purpose.user,
            host: purpose.hostKey ? requestHost(purpose.hostKey, trusted) : null,
          }
        : purpose,
    through: request.through.map((hostKey) => requestHost(hostKey, trusted)),
  };
}

/** What a key request asks, in words. */
export function keyRequestText({ purpose, through }: KeyRequest): {
  /** What signing does, e.g. "Sign in to github.com as git". */
  action: string;
  /** A computer Flare doesn't know, by its host key. */
  hostKey?: string;
  /** Why it's worth a second look. */
  warning?: string;
  /** Where the request came from, when the agent was forwarded on. */
  path?: string;
} {
  const path = through.length
    ? `Forwarded on to ${through.map((host) => host.name ?? host.fingerprint).join(', then ')}`
    : undefined;
  switch (purpose.kind) {
    case 'sign-in': {
      const { user, host } = purpose;
      if (host?.name) return { action: `Sign in to ${host.name} as ${user}`, path };
      if (host) {
        return {
          action: `Sign in as ${user} to a computer Flare doesn’t know`,
          hostKey: host.fingerprint,
          path,
        };
      }
      return {
        action: `Sign in as ${user}`,
        warning:
          'Flare can’t tell which computer this is for: the program asking didn’t say. ssh before OpenSSH 8.9 doesn’t.',
        path,
      };
    }
    case 'sshsig':
      return {
        action:
          purpose.namespace === 'git'
            ? 'Sign a git commit or tag'
            : purpose.namespace === 'file'
              ? 'Sign a file'
              : `Sign something for “${purpose.namespace}”`,
        path,
      };
    case 'unknown':
      return {
        action: 'Sign something Flare can’t read',
        warning:
          'It isn’t a sign-in or a signature Flare recognizes. Deny it unless you know what asked.',
        path,
      };
  }
}
