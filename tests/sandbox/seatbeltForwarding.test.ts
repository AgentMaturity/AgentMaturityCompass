import { describe, expect, test, vi } from "vitest";

/** The write-only Seatbelt backend forwards output scrubbing and streaming to the process, as bwrap does. */
const launched = vi.hoisted(() => ({ options: [] as Array<Record<string, unknown>> }));
vi.mock("../../src/exec/runProcess.js", () => ({ runProcess: (options: Record<string, unknown>) => {
  launched.options.push(options);
  return { done: Promise.resolve({ exitCode: 0, terminatedBy: null, stdout: { text: "", truncated: false }, stderr: { text: "", truncated: false } }) };
} }));
import { seatbeltBackend } from "../../src/sandbox/seatbeltBackend.js";

describe("seatbelt backend", () => {
  test("passes scrubValues and onOutput through instead of silently dropping them", async () => {
    const onOutput = () => undefined;
    await seatbeltBackend().run(["/bin/echo", "x"], process.cwd(), { writableRoots: [], timeoutMs: 1_000, scrubValues: ["s3cret-value"], onOutput });
    expect(launched.options).toHaveLength(1);
    expect(launched.options[0]).toMatchObject({ scrubValues: ["s3cret-value"], onOutput });
  });
});
