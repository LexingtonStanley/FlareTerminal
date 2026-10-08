import { isPrivateHost, ttydSocketUrl } from '@/features/terminal/ttyd';

/** A saved host. The password lives in secure storage under `passwordKey(id)`. */
export type Connection = {
  id: string;
  name: string;
  /** What the person typed; see ttydSocketUrl for the accepted forms. */
  url: string;
  /** Empty when the host has no credential (`ttyd -c` not set). */
  username: string;
};

export type ConnectionInput = Omit<Connection, 'id'> & { password: string };

export type ConnectionErrors = Partial<Record<'name' | 'url' | 'password', string>>;

/** What to run on the computer: writable (-W), password-protected (-c), in a lasting tmux session. */
export const TTYD_COMMAND = 'ttyd -W -c you:a-long-password tmux new -A -s main';

export const passwordKey = (id: string) => `connection.${id}.password`;

export function newConnectionId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function validateConnection({ name, url, username, password }: ConnectionInput) {
  const errors: ConnectionErrors = {};
  if (!name.trim()) errors.name = 'Enter a name';
  if (!url.trim()) errors.url = 'Enter the address ttyd is listening on';
  else {
    try {
      ttydSocketUrl(url);
    } catch (error) {
      errors.url = (error as Error).message;
    }
  }
  if (username.trim() && !password) errors.password = 'Enter the password for this username';
  return errors;
}

/** A warning for addresses that would send the session unencrypted over the internet. */
export function connectionWarning(url: string): string | null {
  let socketUrl: URL;
  try {
    socketUrl = new URL(ttydSocketUrl(url));
  } catch {
    return null;
  }
  if (socketUrl.protocol === 'wss:' || isPrivateHost(socketUrl.hostname)) return null;
  return 'This address is not encrypted. Use https:// or a private network such as Tailscale.';
}
