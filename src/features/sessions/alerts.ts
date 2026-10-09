/**
 * Desktop-notification escape sequences that terminal programs send. Claude Code can
 * use any of them (`claude config set --global preferredNotifChannel iterm2`), and
 * many other tools ring the bell (BEL), which sessions also treat as an alert.
 */

export type AgentAlert = { title: string | null; body: string };

/** OSC 9 (iTerm2): `ESC ] 9 ; message BEL`. `9;4;…` is a progress bar, not a message. */
export function parseOsc9(data: string): AgentAlert | null {
  if (/^4;/.test(data) || !data.trim()) return null;
  return { title: null, body: data.trim() };
}

/** OSC 777 (rxvt, Ghostty, WezTerm): `ESC ] 777 ; notify ; title ; body BEL`. */
export function parseOsc777(data: string): AgentAlert | null {
  const [kind, title = '', ...body] = data.split(';');
  if (kind !== 'notify') return null;
  return { title: title.trim() || null, body: body.join(';').trim() };
}

/** OSC 99 (kitty): `ESC ] 99 ; key=value:… ; payload BEL`. Single-chunk messages only. */
export function parseOsc99(data: string): AgentAlert | null {
  const separator = data.indexOf(';');
  if (separator < 0) return null;
  const fields = new Map(
    data
      .slice(0, separator)
      .split(':')
      .filter(Boolean)
      .map((pair) => pair.split('=') as [string, string])
  );
  let payload = data.slice(separator + 1);
  if (fields.get('e') === '1') {
    try {
      payload = atob(payload);
    } catch {
      return null;
    }
  }
  const part = fields.get('p') ?? 'title';
  if (part !== 'title' && part !== 'body') return null;
  if (!payload.trim()) return null;
  return part === 'title' ? { title: payload.trim(), body: '' } : { title: null, body: payload };
}
