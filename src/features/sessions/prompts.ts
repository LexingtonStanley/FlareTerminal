/**
 * Recognises an agent or a program waiting for an answer from what's on its screen, so it
 * needs no escape codes, hooks or settings on the host. Covers the menus coding agents draw
 * for approvals (Claude Code, Codex, Gemini CLI: a question, then numbered options with a
 * pointer on one), Aider's "(Y)es/(N)o" questions, and shell-style "[y/N]" prompts.
 */

export type PromptOption = {
  /** As the screen shows it: "Yes", "No, and tell Claude what to do differently". */
  label: string;
  /** What to type to choose it. */
  input: string;
};

export type DetectedPrompt = {
  question: string;
  options: PromptOption[];
};

/** A prompt only counts while it's near the bottom of the screen, where the cursor is. */
const LIVE_LINES = 16;
/** How far above its options a menu's question may be (Codex puts the command between). */
const QUESTION_REACH = 8;

// Box drawing (borders around agents' dialogs), not the pointers and bullets inside them.
const BORDER = /[─-╿]/g;
const POINTER = /^[❯›>▶▸●◉→]\s*/u;
const OPTION = /^(?:([❯›>▶▸●◉→])\s*)?(\d)[.)]\s+(.+)$/u;
/** A key shortcut at the end of an option: Codex's "Yes, proceed (y)", "No, … (esc)". */
const SHORTCUT = /\s*\(([a-z]|esc)\)$/i;
/** "[y/N]", "(y/n)", "[Y/n]", "(yes/no)", at the end of the line or before a default. */
const YES_NO = /[[(](y(?:es)?)\/(n(?:o)?)[\])]\s*\??:?\s*$/i;
/** Aider: "Run shell command? (Y)es/(N)o/(D)on't ask again [Yes]:". */
const LETTER_CHOICES = /\(([A-Za-z])\)([\w' ]*)/g;

const clean = (line: string) => line.replace(BORDER, ' ').replace(/\s+/g, ' ').trim();

/** What a screen is asking, or null. `lines` are the screen's rows, top to bottom. */
export function detectPrompt(lines: readonly string[]): DetectedPrompt | null {
  const live = lines.map(clean).filter(Boolean).slice(-LIVE_LINES);
  if (!live.length) return null;
  return menuPrompt(live) ?? letterPrompt(live.at(-1)!) ?? yesNoPrompt(live.at(-1)!);
}

/** Numbered options, one of them under a pointer: an interactive menu, not a list in prose. */
function menuPrompt(live: string[]): DetectedPrompt | null {
  let end = live.length - 1;
  while (end >= 0 && !OPTION.test(live[end])) end--;
  if (end < 0) return null;
  // The last run of numbered options, from the bottom up to "1.". An option too long for a
  // narrow screen goes on over a line or two (the agent wraps it), which belong to its label.
  const options: { match: RegExpMatchArray; more: string[] }[] = [];
  let more: string[] = [];
  let index = end;
  for (; index >= 0; index--) {
    const match = live[index].match(OPTION);
    if (match) {
      options.unshift({ match, more });
      more = [];
      if (match[2] === '1') {
        index--;
        break;
      }
    } else if (more.length === 2 || live[index].endsWith('?')) {
      break;
    } else {
      more.unshift(live[index]);
    }
  }
  if (options.length < 2) return null;
  if (options.some(({ match }, number) => Number(match[2]) !== number + 1)) return null;
  if (options.filter(({ match }) => match[1]).length !== 1) return null;

  let question: string | null = null;
  for (let above = index; above >= 0 && above > index - QUESTION_REACH; above--) {
    if (live[above].endsWith('?') || live[above].endsWith('?:')) {
      question = live[above].replace(POINTER, '').replace(/:$/, '');
      break;
    }
  }
  if (!question) return null;

  return {
    question,
    options: options.map(({ match: [, , number, text], more }) => {
      const label = [text, ...more].join(' ');
      const shortcut = label.match(SHORTCUT)?.[1].toLowerCase();
      return {
        label: label.replace(SHORTCUT, '').trim(),
        input: shortcut === 'esc' ? '\x1b' : (shortcut ?? number),
      };
    }),
  };
}

function letterPrompt(line: string): DetectedPrompt | null {
  const questionEnd = line.indexOf('? (');
  if (questionEnd < 0 || !/\[[\w' ]+\]:?\s*$/.test(line)) return null;
  const options = [...line.slice(questionEnd).matchAll(LETTER_CHOICES)].map(([, letter, rest]) => ({
    label: `${letter}${rest}`.trim(),
    input: `${letter.toLowerCase()}\r`,
  }));
  if (options.length < 2) return null;
  return { question: line.slice(0, questionEnd + 1), options };
}

function yesNoPrompt(line: string): DetectedPrompt | null {
  if (!YES_NO.test(line)) return null;
  const question = line.replace(YES_NO, '').trim();
  return {
    question: question || line,
    options: [
      { label: 'Yes', input: 'y\r' },
      { label: 'No', input: 'n\r' },
    ],
  };
}

/** Whether two detections are the same prompt (the screen redrew it, nothing changed). */
export function samePrompt(a: DetectedPrompt, b: DetectedPrompt): boolean {
  return (
    a.question === b.question &&
    a.options.length === b.options.length &&
    a.options.every((option, index) => option.label === b.options[index].label)
  );
}

export type PromptAnswer = 'approve' | 'deny';

const APPROVE = /^(yes|allow|approve|proceed|accept|run|continue|ok)\b/i;
const DENY = /^(no|deny|reject|decline|cancel)\b/i;

/**
 * What to type to approve or deny a prompt: its first option when that is a yes, and its
 * first no. Null when the prompt isn't a plain yes/no (a choice between plans, say), so
 * nothing guesses on the person's behalf.
 */
export function answersFor(prompt: DetectedPrompt): Record<PromptAnswer, string> | null {
  const [first] = prompt.options;
  const deny = prompt.options.find(({ label }) => DENY.test(label));
  if (!first || !APPROVE.test(first.label) || !deny) return null;
  return { approve: first.input, deny: deny.input };
}

/**
 * The line agents keep on screen while they work: Claude Code's "✻ Pondering… (12s · esc to
 * interrupt)", Codex's "Working (8s • esc to interrupt)", Gemini CLI's "Thinking... (esc to
 * cancel, 5s)". A bare "Esc to cancel" (under a menu) has no timer, so it doesn't count.
 */
const WORKING = [
  /\besc to interrupt\b/i,
  /\besc to cancel\b.*\b\d+s\b|\b\d+s\b.*\besc to cancel\b/i,
];

/** Whether a line is an agent's working line. */
export function isWorkingLine(line: string): boolean {
  const cleaned = clean(line);
  return WORKING.some((pattern) => pattern.test(cleaned));
}

/** Whether an agent's working line is near the bottom of the screen. */
export function isWorking(lines: readonly string[]): boolean {
  return lines
    .map(clean)
    .filter(Boolean)
    .slice(-LIVE_LINES)
    .some((line) => WORKING.some((pattern) => pattern.test(line)));
}
