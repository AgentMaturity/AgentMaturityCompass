import { PassThrough } from "node:stream";
import { createInterface } from "node:readline";
import { afterEach, describe, expect, it } from "vitest";
import { readApprovalAnswer } from "../src/setup/nativeApprovalAnswer.js";

// The approval answer: only y or n typed alone after the prompt could be read, then a separate Enter, answers.
const open: Array<() => void> = [];
afterEach(() => { for (const close of open.splice(0)) close(); });
const sleep = (ms: number) => new Promise(done => setTimeout(done, ms));

function terminalFixture() {
  const input = new PassThrough(), output = new PassThrough();
  let written = "";
  output.on("data", chunk => { written += String(chunk); });
  const terminal = createInterface({ input, output, terminal: true });
  open.push(() => terminal.close());
  const question = (prompt: string, signal: AbortSignal) => new Promise<string | null>(done => {
    signal.addEventListener("abort", () => done(null), { once: true });
    terminal.question(prompt, { signal }, done);
  });
  const controller = new AbortController();
  const read = () => readApprovalAnswer({ terminal, input, output, question, settleMs: 60 }, "Allow this once? ", controller.signal);
  /** Sends each piece as its own read, `gap` ms apart, once the prompt has settled. */
  const type = async (pieces: string[], gap = 30) => { await sleep(80); for (const piece of pieces) { input.write(piece); await sleep(gap); } };
  /** Whatever happens, a still-waiting prompt is ended so the answer settles. */
  const settle = async (answer: Promise<"y" | "n" | null>) => { await sleep(60); controller.abort(); return answer; };
  return { input, read, type, settle, written: () => written };
}

describe("approval answer at the chat terminal", () => {
  it("takes y or n typed after the prompt and then Enter, with bracketed paste on while it asks", async () => {
    for (const word of ["y", "n"] as const) {
      const t = terminalFixture();
      const answer = t.read();
      await t.type([word, "\r"]);
      expect(await answer).toBe(word);
      expect(t.written()).toContain("\u001b[?2004h");
      expect(t.written()).toContain("\u001b[?2004l");
    }
  });

  it("does not approve with input typed before the prompt appeared", async () => {
    // y and Enter before the prompt: that line was submitted before anyone asked.
    const both = terminalFixture();
    both.input.write("y\r");
    expect(await both.settle(both.read())).toBeNull();
    // y before the prompt, Enter after it: the y is cleared, so the line is empty.
    const split = terminalFixture();
    split.input.write("y");
    const answer = split.read();
    await split.type(["\r"]);
    expect(await split.settle(answer)).toBeNull();
    // A y that only reaches the editor in the first moment after the prompt (it was waiting to be read).
    const late = terminalFixture();
    const lateAnswer = late.read();
    late.input.write("y");
    await late.type(["\r"]);
    expect(await late.settle(lateAnswer)).toBeNull();
  });

  it("does not approve with pasted text, plain or bracketed, even when it ends in y", async () => {
    for (const paste of [["sure, go ahead: y"], ["sure, go ahead: y", "\r"], ["sure, go ahead: y\r"], ["y\r"],
      ["\u001b[200~y\u001b[201~", "\r"], ["\u001b[200~yes do it\u001b[201~", "\r"]]) {
      const t = terminalFixture();
      const answer = t.read();
      await t.type(paste);
      expect(await t.settle(answer), JSON.stringify(paste)).toBeNull();
    }
  });

  it("does not approve when another key came before the y, even one taken back", async () => {
    for (const keys of [["x", "y", "\r"], ["x", "\u007f", "y", "\r"], ["y", "y", "\u007f", "\r"]]) {
      const t = terminalFixture();
      const answer = t.read();
      await t.type(keys, 100);
      expect(await t.settle(answer), JSON.stringify(keys)).toBeNull();
    }
  });
});
