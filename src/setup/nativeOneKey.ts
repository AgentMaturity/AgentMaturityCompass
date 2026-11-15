/**
 * One key without Enter at a line-editor prompt: the y or n of an approval. Only a key the person pressed after reading
 * the prompt counts. Text typed before the prompt appeared is cleared, keys in the first moment after it appears are
 * dropped, a bracketed paste is dropped whole, and a y or n counts only when it was alone on the line and nothing else
 * arrived just after it (a plain paste arrives as one burst). Any of these clears the line and the prompt keeps waiting.
 * The answer comes from this reader alone, never from the line the editor submits, so a pasted "y" and Enter is no answer.
 */
import type { Interface } from "node:readline";

/** Keys this soon after the prompt is drawn were typed before it could be read. */
export const ONE_KEY_SETTLE_MS = 300;
/** A y or n followed by another key this soon is part of a burst (a paste), not a keypress. */
export const ONE_KEY_BURST_MS = 40;
const PASTE_ON = "\u001b[?2004h";
const PASTE_OFF = "\u001b[?2004l";

type KeyInfo = { name?: string; ctrl?: boolean } | undefined;

export interface OneKeyOptions {
  readonly terminal: Interface;
  /** The stream the line editor reads (it emits "keypress"). */
  readonly input: NodeJS.EventEmitter;
  readonly output: { write(text: string): unknown };
  /** Asks at the line editor; resolves when the editor submits a line or the signal aborts. */
  readonly question: (prompt: string, signal: AbortSignal) => Promise<string | null>;
  readonly settleMs?: number;
  readonly burstMs?: number;
}

/** "y", "n", or null (Esc, Enter, Ctrl-C, abort): the caller treats null as stopping the turn. */
export function readOneKey(options: OneKeyOptions, prompt: string, signal: AbortSignal): Promise<"y" | "n" | null> {
  const { terminal, input, output } = options;
  const settleMs = options.settleMs ?? ONE_KEY_SETTLE_MS, burstMs = options.burstMs ?? ONE_KEY_BURST_MS;
  const clearLine = () => { terminal.write(null, { ctrl: true, name: "u" }); terminal.write(null, { ctrl: true, name: "k" }); };
  let chosen: "y" | "n" | null = null, pasting = false, seq = 0, timer: NodeJS.Timeout | undefined;
  let armedAt = Number.POSITIVE_INFINITY;
  const onKey = (text: string | undefined, info: KeyInfo) => {
    seq += 1;
    if (info?.name === "paste-start") { pasting = true; return; }
    if (info?.name === "paste-end") { pasting = false; clearLine(); return; }
    if (pasting) { clearLine(); return; }
    if (info?.ctrl === true || info?.name === "return" || info?.name === "enter") return;
    if (info?.name === "escape") { clearLine(); terminal.write("\r"); return; }
    const word = text?.toLowerCase();
    if (Date.now() < armedAt || (word !== "y" && word !== "n") || terminal.line.toLowerCase() !== word) { clearLine(); return; }
    const mine = seq;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (seq !== mine || terminal.line.toLowerCase() !== word) { clearLine(); return; }
      chosen = word;
      terminal.write("\r");
    }, burstMs);
  };
  output.write(PASTE_ON);
  clearLine();
  input.on("keypress", onKey);
  const asked = options.question(prompt, signal);
  armedAt = Date.now() + settleMs;
  return asked.then(() => chosen, () => null).finally(() => {
    clearTimeout(timer);
    input.removeListener("keypress", onKey);
    output.write(PASTE_OFF);
  });
}
