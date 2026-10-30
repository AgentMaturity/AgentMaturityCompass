import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "../src/exec/runProcess.js";
import { OutputCollector, SCRUB_PLACEHOLDER } from "../src/exec/outputCollector.js";

/**
 * The collector is the only thing between a child's stdout and both the
 * operator's terminal and the signed ledger.
 *
 * `spawnMonitoredProcess` had neither a cap nor a scrubber: a process emitting
 * a gigabyte wrote a gigabyte of evidence, and a key echoed by a child landed
 * verbatim in the log and on screen.
 */
const collect = (max: number, secrets: readonly string[] = []): { c: OutputCollector; teed: string[] } => {
  const teed: string[] = [];
  return { c: new OutputCollector(max, secrets, (t) => teed.push(t)), teed };
};

describe("bounding", () => {
  it("keeps the cap and reports how much was dropped", () => {
    // A truncated tail that cannot say what it omitted is a claim about output
    // nobody checked.
    const { c } = collect(10);
    c.push(Buffer.from("0123456789ABCDEFGHIJ"));
    c.end();
    const snap = c.snapshot();

    expect(snap.text).toHaveLength(10);
    expect(snap.totalBytes, "everything the process wrote").toBe(20);
    expect(snap.droppedBytes, "and how much of it was not kept").toBe(11);
  });

  it("retains the first and rolling last bytes across chunks", () => {
    const { c } = collect(10);
    c.push(Buffer.from("0123456789"));
    c.push(Buffer.from("ABCDEFGHIJ"));
    c.push(Buffer.from("KLM"));
    c.end();
    expect(c.snapshot()).toEqual({ text: "0123\nIJKLM", totalBytes: 23, droppedBytes: 14 });
  });

  it("keeps UTF-8 characters intact at stream and retention boundaries", () => {
    const { c } = collect(9);
    const bytes = Buffer.from("猫猫猫猫猫");
    c.push(bytes.subarray(0, 1));
    c.push(bytes.subarray(1, 8));
    c.push(bytes.subarray(8));
    c.end();
    expect(c.snapshot()).toEqual({ text: "猫\n猫", totalBytes: 15, droppedBytes: 9 });
    expect(c.snapshot().text).not.toContain("\uFFFD");
  });

  it("scrubs secrets in the retained tail after the cap is full", () => {
    const secret = "lease-abcdef0123456789";
    const { c, teed } = collect(100, [secret]);
    c.push(Buffer.from("HEAD" + "x".repeat(200) + secret.slice(0, 8)));
    c.push(Buffer.from(secret.slice(8) + "FINAL"));
    c.end();
    expect(c.snapshot().text).toContain("HEAD");
    expect(c.snapshot().text).toContain(SCRUB_PLACEHOLDER + "FINAL");
    expect(c.snapshot().text).not.toContain(secret);
    expect(teed.join("")).not.toContain(secret);
  });

  it("does not reconstruct a secret across the omitted middle", () => {
    const { c } = collect(8, ["abcdefgh"]);
    c.push(Buffer.from("abcd" + "x".repeat(40) + "efgh"));
    c.end();
    expect(c.snapshot().text).not.toContain("abcdefgh");
    expect(Buffer.byteLength(c.snapshot().text)).toBeLessThanOrEqual(8);
  });

  it("scrubs secrets formed by the preview separator and keeps its byte cap", () => {
    const secret = "abcd\n[amc: output middle omitted]\nefgh";
    const { c } = collect(38, [secret]);
    c.push(Buffer.from("abcd" + "x".repeat(100) + "efgh"));
    c.end();
    expect(c.snapshot().text).not.toContain(secret);
    expect(c.snapshot().text).toContain(SCRUB_PLACEHOLDER);
    expect(Buffer.byteLength(c.snapshot().text)).toBeLessThanOrEqual(38);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])("refuses invalid capture cap %s", max => {
    expect(() => collect(max)).toThrow(/nonnegative safe integer/);
  });

  it("retains no text for a zero-byte cap", () => {
    const { c } = collect(0);
    c.push(Buffer.from("log")); c.end();
    expect(c.snapshot()).toEqual({ text: "", totalBytes: 3, droppedBytes: 3 });
  });

  it("reports nothing dropped when nothing was", () => {
    const { c } = collect(100);
    c.push(Buffer.from("short"));
    c.end();
    expect(c.snapshot()).toMatchObject({ text: "short", totalBytes: 5, droppedBytes: 0 });
  });

  it("counts bytes dropped by a chunk that arrives once the cap is FULL", () => {
    // A different code path from a single over-long chunk: the first fills the
    // cap, the second is discarded whole. Testing only the first leaves the
    // second unaccounted, and a dropped-byte count that silently stops
    // counting is worse than none.
    const { c } = collect(5);
    c.push(Buffer.from("12345"));
    c.push(Buffer.from("6789"));
    c.end();
    const snap = c.snapshot();

    expect(snap.text).toBe("12\n89");
    expect(snap.totalBytes).toBe(9);
    expect(snap.droppedBytes, "omitted bytes exclude the separator").toBe(5);
  });

  it("keeps teeing after the capture cap is reached", () => {
    // The operator must keep seeing the program's output after evidence
    // capture has stopped retaining it, or the cap silently changes what the
    // command appears to do.
    const { c, teed } = collect(5);
    c.push(Buffer.from("12345"));
    c.push(Buffer.from("6789"));
    c.end();
    expect(teed.join(""), "the terminal is not subject to the evidence cap").toBe("123456789");
  });

  it("tees everything even while retaining only the cap", () => {
    // The cap bounds EVIDENCE, not what the operator sees. Truncating the
    // terminal too would make the cap silently change the program's behaviour.
    const { c, teed } = collect(4);
    c.push(Buffer.from("hello world"));
    c.end();
    expect(teed.join("")).toBe("hello world");
    expect(c.snapshot().text).toBe("h\nld");
  });
});

describe("scrubbing", () => {
  const SECRET = "sk-live-abcdef0123456789";

  it("removes a secret from both the tee and the retained text", () => {
    const { c, teed } = collect(1000, [SECRET]);
    c.push(Buffer.from(`before ${SECRET} after`));
    c.end();

    expect(teed.join("")).not.toContain(SECRET);
    expect(c.snapshot().text).not.toContain(SECRET);
    expect(c.snapshot().text).toContain(SCRUB_PLACEHOLDER);
  });

  it("removes a secret SPLIT ACROSS two chunks", () => {
    // The normal case, not an edge case: pipes chunk on buffer sizes, not on
    // tokens. A collector that scrubbed each chunk independently would let
    // every secret through simply by being unlucky about where the read landed.
    const { c, teed } = collect(1000, [SECRET]);
    c.push(Buffer.from(`before ${SECRET.slice(0, 9)}`));
    c.push(Buffer.from(`${SECRET.slice(9)} after`));
    c.end();

    expect(teed.join(""), "the tee is where a leak would be visible first").not.toContain(SECRET);
    expect(c.snapshot().text).not.toContain(SECRET);
  });

  it("emits nothing that could still be completed into a secret", () => {
    // Before end(), the tail must be held back rather than teed optimistically.
    const { c, teed } = collect(1000, [SECRET]);
    c.push(Buffer.from(`before ${SECRET.slice(0, 9)}`));
    expect(teed.join(""), "the partial secret is withheld until it can be judged").not.toContain(SECRET.slice(0, 9));
    c.push(Buffer.from(`${SECRET.slice(9)} after`));
    c.end();
    expect(teed.join("")).toContain("before ");
  });

  it("does not split UTF-16 pairs at the scrubbing carry boundary", () => {
    const { c, teed } = collect(100, ["123456789"]);
    c.push(Buffer.from("A😀xxxxxxx"));
    c.end();
    expect(c.snapshot().text).toBe("A😀xxxxxxx");
    expect(teed.join("")).toBe("A😀xxxxxxx");
  });

  it("does not scrub values too short to be secrets", () => {
    // Removing "a" would turn every line into confetti, which is a worse
    // outcome than the risk. Recorded as a deliberate floor.
    const { c } = collect(1000, ["abc"]);
    c.push(Buffer.from("abc def abc"));
    c.end();
    expect(c.snapshot().text).toBe("abc def abc");
  });

  it("removes every occurrence, not only the first", () => {
    const { c } = collect(1000, [SECRET]);
    c.push(Buffer.from(`${SECRET} middle ${SECRET}`));
    c.end();
    expect(c.snapshot().text).not.toContain(SECRET);
    expect(c.snapshot().text.split(SCRUB_PLACEHOLDER)).toHaveLength(3);
  });

  it("handles several secrets of different lengths", () => {
    const other = "lease-9876543210fedcba";
    const { c } = collect(1000, [SECRET, other]);
    c.push(Buffer.from(`${other} and ${SECRET}`));
    c.end();
    const text = c.snapshot().text;
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(other);
  });
});


it("refuses an invalid capture cap before starting the child", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "amc-capture-admission-"));
  const marker = join(workspace, "started");
  try {
    expect(() => runProcess({ argv: [process.execPath, "-e", `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "started")`],
      cwd: workspace, env: {}, stdin: "ignore", stdout: "ignore", stderr: "ignore", maxCaptureBytes: -1,
      scrubValues: [], graceMs: 10 })).toThrow(/nonnegative safe integer/);
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(existsSync(marker), "invalid capture configuration must start no process").toBe(false);
  } finally { rmSync(workspace, { recursive: true, force: true }); }
});
