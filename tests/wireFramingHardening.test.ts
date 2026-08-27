import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/utils/hash.js";
import { MAX_WIRE_LINE_BYTES, NdjsonFramer } from "../src/wire/ndjsonFraming.js";
import { MAX_WIRE_DEPTH, parseWireObject } from "../src/wire/wireJson.js";

/**
 * Regressions for defects found by adversarially attacking the first version.
 *
 * Each test here failed against the code as originally committed. They are kept
 * apart from tests/wireFraming.test.ts because that file states what the wire
 * does; this one states what it was once wrong about, which is a different thing
 * to keep true.
 */

const buf = (s: string) => Buffer.from(s, "utf8");

/** A duplicate-key record that corrupts V8's key cache for the process. */
const POISON = String.raw`{"\u0000":[{"\r":{},"\\":null,"\u0000":{},"\u0000":[]}]}`;
/** A record of the shape the corruption silently strips a key from. */
const VICTIM = String.raw`{"\r":0,"\u0000":{"smuggled":true},"":0,"\\":1}`;

describe("a refused record cannot change what a later record means", () => {
  it("does not let a duplicate-key record poison the parse that follows it", () => {
    // The scan runs before JSON.parse, so the poison record is refused without
    // ever being handed to it. With the original ordering the refusal was still
    // correct -- and the NEXT record silently lost a key, while its digest went
    // on committing to bytes that contained one.
    const refused = parseWireObject(buf(POISON), 1);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.code).toBe("duplicate-key");

    const victim = parseWireObject(buf(VICTIM), 2);
    expect(victim.ok).toBe(true);
    if (!victim.ok) return;

    // The key the corruption removes, and the subtree hanging off it.
    expect(Object.hasOwn(victim.value, "\u0000")).toBe(true);
    expect(JSON.stringify(victim.value)).toContain("smuggled");
    // And the digest still describes exactly these bytes.
    expect(victim.sha256).toBe(sha256Hex(buf(VICTIM)));
  });
});

describe("emitted records are copies", () => {
  it("keeps its bytes when the caller reuses the chunk they came from", () => {
    const framer = new NdjsonFramer();
    const chunk = buf('{"amount":1}\n');
    const [line] = framer.push(chunk).lines;
    expect(line).toBeDefined();
    const before = line!.bytes.toString("utf8");
    const digest = sha256Hex(line!.bytes);

    // Node pools and reuses socket buffers, so this is ordinary behaviour, not
    // an exotic attack. As a view the record read {"amount":9} afterwards.
    chunk.write("9", chunk.indexOf("1"));

    expect(line!.bytes.toString("utf8")).toBe(before);
    expect(sha256Hex(line!.bytes)).toBe(digest);
  });
});

describe("a refusal names the record that caused it", () => {
  it("blames the record being read, not the last one accepted", () => {
    const framer = new NdjsonFramer();
    expect(framer.push(buf('{"ok":1}\n')).lines).toHaveLength(1);
    // The over-long record is the SECOND. Reporting 1 accused a record that had
    // already been accepted and acted on.
    const { refusal } = framer.push(Buffer.alloc(MAX_WIRE_LINE_BYTES + 1, 0x78));
    expect(refusal?.ordinal).toBe(2);
  });

  it("never reports ordinal 0, which no record can have", () => {
    const framer = new NdjsonFramer();
    const { refusal } = framer.push(Buffer.alloc(MAX_WIRE_LINE_BYTES + 1, 0x78));
    expect(refusal?.ordinal).toBe(1);
  });
});

describe("framing does not depend on how the stream was chunked", () => {
  it("gives identical records and refusals byte-at-a-time and all at once", () => {
    const stream = buf('{"a":1}\r\n\n{"b":2}\n{"c":3}\n');

    const whole = new NdjsonFramer();
    const wholeRun = whole.push(stream);

    const drip = new NdjsonFramer();
    const dripLines: { text: string; ordinal: number }[] = [];
    for (const byte of stream) {
      for (const line of drip.push(Buffer.from([byte])).lines) {
        dripLines.push({ text: line.bytes.toString("utf8"), ordinal: line.ordinal });
      }
    }

    expect(dripLines).toEqual(
      wholeRun.lines.map((l) => ({ text: l.bytes.toString("utf8"), ordinal: l.ordinal }))
    );
  });

  it("refuses an over-long record the same way whichever chunking delivers it", () => {
    const stream = Buffer.concat([Buffer.alloc(MAX_WIRE_LINE_BYTES + 1, 0x78), buf("\n")]);

    const whole = new NdjsonFramer().push(stream).refusal;

    const drip = new NdjsonFramer();
    let dripRefusal = null as ReturnType<NdjsonFramer["push"]>["refusal"];
    for (let at = 0; at < stream.length && dripRefusal === null; at += 4096) {
      dripRefusal = drip.push(stream.subarray(at, at + 4096)).refusal;
    }

    expect(whole?.code).toBe(dripRefusal?.code);
    expect(whole?.ordinal).toBe(dripRefusal?.ordinal);
  });

  it("stays linear when fed one byte at a time", () => {
    // Joining the buffer on every push made this quadratic: bytes arriving one
    // at a time recopied everything before them. The work is now done once, when
    // a record completes.
    //
    // A wall-clock budget is a blunt instrument, so it is sized from a measured
    // gap rather than guessed. The worst case is bounded by MAX_WIRE_LINE_BYTES
    // -- a longer record is refused before it can be recopied -- so the test
    // sits just under it, where the old code took 1676ms and the new one 44ms.
    // 800ms leaves the current code eighteen times its own runtime before it
    // fails, and still fails the quadratic version by double, so it
    // discriminates without being a stopwatch on a loaded runner.
    const framer = new NdjsonFramer();
    const body = Buffer.alloc(MAX_WIRE_LINE_BYTES - 144, 0x78);
    const startedAt = Date.now();
    for (const byte of body) framer.push(Buffer.from([byte]));
    expect(framer.push(buf("\n")).lines).toHaveLength(1);
    expect(Date.now() - startedAt).toBeLessThan(800);
  }, 30_000);
});

describe("record limits are measured on the record", () => {
  it("gives a CRLF peer the same allowance as an LF peer", () => {
    const exact = Buffer.alloc(MAX_WIRE_LINE_BYTES, 0x78);
    // Testing the length before stripping the CR cost CRLF senders one byte,
    // so a record at exactly the documented limit was refused.
    const framer = new NdjsonFramer();
    const { lines, refusal } = framer.push(Buffer.concat([exact, buf("\r\n")]));
    expect(refusal).toBeNull();
    expect(lines[0]?.bytes.length).toBe(MAX_WIRE_LINE_BYTES);
  });

  it("still refuses one byte over, with CRLF", () => {
    const over = Buffer.alloc(MAX_WIRE_LINE_BYTES + 1, 0x78);
    const { refusal } = new NdjsonFramer().push(Buffer.concat([over, buf("\r\n")]));
    expect(refusal?.code).toBe("line-too-long");
  });
});

describe("parseWireObject returns rather than throws", () => {
  it("refuses deep nesting instead of exhausting the stack", () => {
    // The reserved-key check used to walk the parsed value recursively, so this
    // threw RangeError out of a function whose type promises a result union.
    const deep = `{"a":${"[".repeat(10_000)}1${"]".repeat(10_000)}}`;
    const parsed = parseWireObject(buf(deep), 1);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("too-deep");
  });

  it("accepts nesting up to the documented depth", () => {
    const atLimit = `{"a":${"[".repeat(MAX_WIRE_DEPTH - 1)}1${"]".repeat(MAX_WIRE_DEPTH - 1)}}`;
    expect(parseWireObject(buf(atLimit), 1).ok).toBe(true);
  });
});

describe("numbers the value cannot hold", () => {
  it("refuses an integer past exact precision", () => {
    // The bytes say ...567890 and the value is ...567000: a reader of each
    // disagrees about the amount, not merely its spelling.
    const parsed = parseWireObject(buf('{"amount":12345678901234567890}'), 4);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("unsafe-number");
  });

  it("refuses a magnitude that becomes Infinity", () => {
    expect((parseWireObject(buf('{"n":1e999}'), 1) as { code: string }).code).toBe("unsafe-number");
  });

  it("still accepts ordinary numbers, including fractions that round", () => {
    expect(parseWireObject(buf('{"a":0.1,"b":-2.5e3,"c":9007199254740991}'), 1).ok).toBe(true);
  });
});

describe("reserved keys", () => {
  it("refuses the prototype-gadget names as well as __proto__", () => {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      const parsed = parseWireObject(buf(`{${JSON.stringify(key)}:{"x":1}}`), 1);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) continue;
      expect(parsed.code).toBe("unsafe-key");
    }
  });

  it("refuses them nested inside arrays, where a recursive walk could miss them", () => {
    expect((parseWireObject(buf('{"p":[[{"constructor":1}]]}'), 1) as { code: string }).code)
      .toBe("unsafe-key");
  });
});
