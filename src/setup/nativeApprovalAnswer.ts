/**
 * The y or n of an approval at the chat terminal: typed on an empty line, then Enter. It counts only when the submitted
 * line is exactly y or n and that key and the Enter were the only keys since the prompt could be read. Text typed before
 * the prompt is cleared; a key in the first moment after the prompt appears, any second key (a typo and its correction
 * too), a bracketed paste, and a key and Enter that arrive in one read (a plain paste) each spoil the answer, and a
 * spoiled answer is no answer: the caller stops the turn. No timing on the key itself decides anything.
 */
import type { Interface } from "node:readline";

/** Keys this soon after the prompt is drawn were typed before it could be read. */
const SETTLE_MS = 300;
const PASTE_ON = "\u001b[?2004h";
const PASTE_OFF = "\u001b[?2004l";

type KeyInfo = { name?: string } | undefined;

export interface ApprovalAnswerOptions {
  readonly terminal: Interface;
  /** The stream the line editor reads (it emits "keypress"). */
  readonly input: NodeJS.EventEmitter;
  readonly output: { write(text: string): unknown };
  /** Asks at the line editor; resolves with the submitted line, or null when the signal aborts. */
  readonly question: (prompt: string, signal: AbortSignal) => Promise<string | null>;
  readonly settleMs?: number;
}

/** "y", "n", or null (anything else, Esc, Ctrl-C, abort): the caller treats null as stopping the turn. */
export function readApprovalAnswer(options: ApprovalAnswerOptions, prompt: string, signal: AbortSignal): Promise<"y" | "n" | null> {
  const { terminal, input, output } = options;
  let keys = 0, spoiled = false, sameRead = false, armedAt = Number.POSITIVE_INFINITY;
  const onKey = (_text: string | undefined, info: KeyInfo) => {
    if (info?.name === "return" || info?.name === "enter") { if (sameRead) spoiled = true; return; }
    keys += 1;
    if (info?.name === "paste-start" || info?.name === "paste-end" || Date.now() < armedAt) spoiled = true;
    if (info?.name === "escape") { spoiled = true; terminal.write("\r"); return; }
    // Keys from one read are emitted before the event loop turns; an Enter in the same read as a key is a paste.
    sameRead = true;
    setImmediate(() => { sameRead = false; });
  };
  output.write(PASTE_ON);
  terminal.write(null, { ctrl: true, name: "u" });
  terminal.write(null, { ctrl: true, name: "k" });
  input.on("keypress", onKey);
  const asked = options.question(prompt, signal);
  armedAt = Date.now() + (options.settleMs ?? SETTLE_MS);
  return asked.then((line) => {
    if (line === null) return null;
    const word = line.toLowerCase();
    if (word !== "y" && word !== "n") return null;
    if (spoiled || keys !== 1) {
      output.write("That answer does not count: type y or n on its own after the question appears, then Enter.\n");
      return null;
    }
    return word;
  }, () => null).finally(() => {
    input.removeListener("keypress", onKey);
    output.write(PASTE_OFF);
  });
}
