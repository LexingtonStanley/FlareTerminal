/**
 * Dev servers print where they listen ("Local: http://localhost:5173/"). On the phone,
 * localhost is the phone, so these addresses mean the host's own ports: the ones a preview
 * forwards. Terminal output is untrusted; this only ever yields a port and a path.
 */

export type LocalAddress = { port: number; path: string };

const LOCAL_URL =
  /\bhttp:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{1,5})(\/[^\s"'<>`]*)?/gi;

function toPort(text: string): number | null {
  const port = Number(text);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

/** The address a link points to on the host, if it's a local http:// URL with a port. */
export function parseLocalUrl(url: string): LocalAddress | null {
  const match = new RegExp(`^${LOCAL_URL.source}$`, 'i').exec(url.trim());
  const port = match && toPort(match[1]);
  return port ? { port, path: match[2] ?? '/' } : null;
}

/** Ports of the local URLs in `text`, the last one printed first, each once. */
export function findLocalPorts(text: string): number[] {
  const ports: number[] = [];
  for (const match of text.matchAll(LOCAL_URL)) {
    const port = toPort(match[1]);
    if (port === null) continue;
    const seen = ports.indexOf(port);
    if (seen !== -1) ports.splice(seen, 1);
    ports.unshift(port);
  }
  return ports;
}

/** A port typed by the person, or null. */
export function parsePort(text: string): number | null {
  return /^\d{1,5}$/.test(text.trim()) ? toPort(text.trim()) : null;
}
