/**
 * Reading an OpenSSH client config (`~/.ssh/config`, ssh_config(5)) for the hosts in it, to
 * add them as connections. Only what a connection holds is read: HostName, User and Port, and
 * whether the host is reached through another (ProxyJump, ProxyCommand), which Flare can't do
 * yet. Settings resolve as OpenSSH resolves them: for each name, the first value from any
 * block that matches it wins, so `Host *` defaults at the end fill in what's left.
 */

/** A host named in the config, with what OpenSSH would use to reach it. */
export type ConfigHost = {
  /** The name after `Host`, as typed in `ssh <alias>`. */
  alias: string;
  /** HostName, else the alias. */
  hostName: string;
  /** User, else null: OpenSSH uses the computer's own username. */
  user: string | null;
  port: number;
  /** Reached through another host (ProxyJump or ProxyCommand). */
  jump: boolean;
};

export type SshConfig = {
  hosts: ConfigHost[];
  /** Include patterns whose files weren't supplied, as written. */
  missing: string[];
  /** Whether it has Match blocks, which can't be judged off the computer and are skipped. */
  skippedMatch: boolean;
};

/**
 * The text of each file an Include pattern names, in order, or undefined when the reader
 * doesn't have them (a pasted config).
 */
export type IncludeFiles = (pattern: string) => string[] | undefined;

/** As deep as OpenSSH follows Include. */
const MAX_DEPTH = 16;

type Line = { keyword: string; args: string[] };

/**
 * A line's keyword (lower case) and arguments: `Keyword value`, or `Keyword=value`, with
 * quoted arguments, and a `#` starting a word as a comment.
 */
export function splitLine(text: string): Line | null {
  const line = text.trim();
  const match = /^([A-Za-z]\w*)(?:\s*=\s*|\s+)([\s\S]*)$/.exec(line);
  if (!match || line.startsWith('#')) return null;
  const args: string[] = [];
  let word: string | null = null;
  let quote: string | null = null;
  const rest = match[2];
  for (let i = 0; i < rest.length; i++) {
    const char = rest[i];
    if (quote) {
      if (char === quote) quote = null;
      else word = (word ?? '') + char;
    } else if (char === '"' || char === "'") {
      quote = char;
      word ??= '';
    } else if (char === '\\' && i + 1 < rest.length) {
      word = (word ?? '') + rest[++i];
    } else if (/\s/.test(char)) {
      if (word !== null) args.push(word);
      word = null;
    } else if (char === '#' && word === null) {
      break;
    } else {
      word = (word ?? '') + char;
    }
  }
  if (word !== null) args.push(word);
  return args.length ? { keyword: match[1].toLowerCase(), args } : null;
}

/** OpenSSH's patterns: `*` and `?`, case-insensitive. */
function matchesPattern(name: string, pattern: string): boolean {
  const source = pattern
    .split('')
    .map((char) =>
      char === '*' ? '.*' : char === '?' ? '.' : char.replace(/[.+^${}()|[\]\\]/, '\\$&')
    )
    .join('');
  return new RegExp(`^${source}$`, 'i').test(name);
}

/** A `Host` line: some pattern matches and no `!pattern` does. */
function hostMatches(name: string, patterns: string[]): boolean {
  let matched = false;
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      if (matchesPattern(name, pattern.slice(1))) return false;
    } else if (matchesPattern(name, pattern)) matched = true;
  }
  return matched;
}

/** Whether a `Host` line holds for every name: what a block of defaults looks like. */
const matchesAll = (patterns: string[]) =>
  patterns.includes('*') && !patterns.some((pattern) => pattern.startsWith('!'));

const isMatchAll = (args: string[]) => args.length === 1 && args[0].toLowerCase() === 'all';

/** A name typed after `Host`, not a pattern (nor one `ssh` refuses): a host to add. */
const isAlias = (pattern: string) => !/[*?!\s]/.test(pattern);

type Settings = { hostName?: string; user?: string; port?: number; jump?: boolean };

class Reader {
  missing = new Set<string>();
  skippedMatch = false;

  constructor(
    private readonly text: string,
    private readonly include: IncludeFiles
  ) {}

  /** Every alias, in order. Includes inside a block for particular hosts add none. */
  aliases(): string[] {
    const found = new Set<string>();
    const lowered = new Set<string>();
    const visit = (text: string, depth: number) => {
      // Lines before any block apply to every host.
      let open = true;
      for (const line of this.lines(text)) {
        if (line.keyword === 'host') {
          open = matchesAll(line.args);
          for (const alias of line.args.filter(isAlias)) {
            if (lowered.has(alias.toLowerCase())) continue;
            lowered.add(alias.toLowerCase());
            found.add(alias);
          }
        } else if (line.keyword === 'match') {
          open = isMatchAll(line.args);
          if (!open) this.skippedMatch = true;
        } else if (line.keyword === 'include' && open && depth < MAX_DEPTH) {
          for (const file of this.files(line.args)) visit(file, depth + 1);
        }
      }
    };
    visit(this.text, 0);
    return [...found];
  }

  /** What OpenSSH would use for `ssh <alias>`. */
  resolve(alias: string): ConfigHost {
    const settings: Settings = {};
    const visit = (text: string, depth: number, outer: boolean) => {
      let active = outer;
      for (const line of this.lines(text)) {
        const [value] = line.args;
        switch (line.keyword) {
          case 'host':
            active = outer && hostMatches(alias, line.args);
            break;
          case 'match':
            // Only `Match all` can be judged here; the rest depend on the computer.
            active = outer && isMatchAll(line.args);
            break;
          case 'include':
            // An Include in a block that doesn't apply still runs, matching nothing.
            if (depth < MAX_DEPTH) {
              for (const file of this.files(line.args)) visit(file, depth + 1, active);
            }
            break;
          case 'hostname':
            if (active) settings.hostName ??= value;
            break;
          case 'user':
            if (active) settings.user ??= value;
            break;
          case 'port': {
            const port = Number(value);
            if (active && Number.isInteger(port) && port > 0 && port < 65536)
              settings.port ??= port;
            break;
          }
          case 'proxyjump':
          case 'proxycommand':
            if (active) settings.jump ??= value.toLowerCase() !== 'none';
            break;
        }
      }
    };
    visit(this.text, 0, true);
    return {
      alias,
      // %h is the alias; %% a percent sign.
      hostName: (settings.hostName ?? alias).replace(/%([h%])/g, (_, token: string) =>
        token === 'h' ? alias : '%'
      ),
      user: settings.user ?? null,
      port: settings.port ?? 22,
      jump: settings.jump ?? false,
    };
  }

  private *lines(text: string): Generator<Line> {
    for (const raw of text.split(/\r?\n/)) {
      const line = splitLine(raw);
      if (line) yield line;
    }
  }

  private files(patterns: string[]): string[] {
    return patterns.flatMap((pattern) => {
      const files = this.include(pattern);
      if (files === undefined) this.missing.add(pattern);
      return files ?? [];
    });
  }
}

/** The hosts in a config. `include` gives the files its Include lines name. */
export function parseSshConfig(text: string, include: IncludeFiles = () => undefined): SshConfig {
  const reader = new Reader(text, include);
  const hosts = reader.aliases().map((alias) => reader.resolve(alias));
  return { hosts, missing: [...reader.missing], skippedMatch: reader.skippedMatch };
}
