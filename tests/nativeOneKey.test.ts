import { PassThrough } from "node:stream";
import { createInterface } from "node:readline";
import { afterEach, describe, expect, it } from "vitest";
import { readOneKey } from "../src/setup/nativeOneKey.js";

// The one-key approval answer: only a y or n pressed alone, after the prompt could be read, answers.
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
  const read = () => readOneKey({ terminal, input, output, question, settleMs: 60, burstMs: 20 }, "Allow this once? ", controller.signal);
  return { input, terminal, controller, read, written: () => written };
}

describe("one-key answer at the chat terminal", () => {
  it("takes a y pressed alone after the prompt is up, with bracketed paste on while it asks", async () => {
    const t = terminalFixture();
    const answer = t.read();
    await sleep(80); t.input.write("y");
    expect(await answer).toBe("y");
    expect(t.written()).toContain("\u001b[?2004h");
    expect(t.written()).toContain("\u001b[?2004l");
  });

  it("does not approve with a y typed before the prompt appeared, even after Enter", async () => {
    const t = terminalFixture();
    t.input.write("y");
    const answer = t.read();
    await sleep(80); t.input.write("\r");
    expect(await answer).toBeNull();
  });

  it("drops keys pressed in the first moment after the prompt appears", async () => {
    const t = terminalFixture();
    const answer = t.read();
    t.input.write("y");
    await sleep(80);
    expect(t.terminal.line).toBe("");
    t.controller.abort();
    expect(await answer).toBeNull();
  });

  it("does not approve with a pasted block, plain or bracketed, even one ending in Enter", async () => {
    for (const paste of ["yes please and also something else", "\u001b[200~yes do it\u001b[201~", "\u001b[200~y\u001b[201~", "y\r"]) {
      const t = terminalFixture();
      const answer = t.read();
      await sleep(80); t.input.write(paste);
      await sleep(60);
      expect(t.terminal.line).toBe("");
      t.controller.abort();
      expect(await answer).toBeNull();
    }
  });
});
