import { describe, expect, it } from "vitest";
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
    expect(snap.droppedBytes, "and how much of it was not kept").toBe(10);
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

    expect(snap.text).toBe("12345");
    expect(snap.totalBytes).toBe(9);
    expect(snap.droppedBytes, "the whole second chunk was dropped").toBe(4);
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
    expect(c.snapshot().text).toBe("hell");
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
