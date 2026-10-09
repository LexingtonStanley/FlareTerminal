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
/** A one-letter shortcut at the end of an option: Codex's "Yes, proceed (y)". */
const SHORTCUT = /\s*\(([a-z])\)$/i;
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
  // The last run of numbered lines counting up from 1.
  let end = -1;
  for (let index = live.length - 1; index >= 0; index--) {
    if (OPTION.test(live[index])) {
      end = index;
      break;
    }
  }
  if (end < 0) return null;
  let start = end;
  while (start > 0 && OPTION.test(live[start - 1])) start--;
  const matches = live.slice(start, end + 1).map((line) => line.match(OPTION)!);
  if (matches.length < 2) return null;
  if (matches.some((match, index) => Number(match[2]) !== index + 1)) return null;
  if (matches.filter((match) => match[1]).length !== 1) return null;

  let question: string | null = null;
  for (let index = start - 1; index >= Math.max(0, start - QUESTION_REACH); index--) {
    if (live[index].endsWith('?') || live[index].endsWith('?:')) {
      question = live[index].replace(POINTER, '').replace(/:$/, '');
      break;
    }
  }
  if (!question) return null;

  return {
    question,
    options: matches.map(([, , number, text]) => {
      const shortcut = text.match(SHORTCUT);
      return {
        label: text.replace(SHORTCUT, '').trim(),
        input: shortcut ? shortcut[1].toLowerCase() : number,
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
