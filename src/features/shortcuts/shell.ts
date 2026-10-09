/**
 * Quoting for the commands shortcuts type into a POSIX shell (bash, zsh). Words that need
 * no quotes are left alone, so a generated command reads like one typed by hand.
 */

const PLAIN_WORD = /^[\w@%+=:,./-]+$/;

/** A word for the shell: unchanged when it is safe, else in single quotes. */
export function quote(text: string): string {
  if (PLAIN_WORD.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/** Quotes a folder for the shell, keeping a leading `~/` so it expands. */
export function quoteDirectory(directory: string): string {
  if (directory === '~' || directory === '~/') return directory;
  if (directory.startsWith('~/')) return `~/${quote(directory.slice(2))}`;
  return quote(directory);
}

/** `cd <folder> && `, or nothing without a folder. */
export function cdPrefix(directory: string): string {
  const folder = directory.trim();
  return folder ? `cd ${quoteDirectory(folder)} && ` : '';
}
