import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/utils/hash.js";
import { MAX_WIRE_LINE_BYTES, NdjsonFramer } from "../src/wire/ndjsonFraming.js";
import { parseWireObject } from "../src/wire/wireJson.js";

const buf = (s: string) => Buffer.from(s, "utf8");
const texts = (lines: readonly { bytes: Buffer }[]) => lines.map((l) => l.bytes.toString("utf8"));

describe("NdjsonFramer", () => {
  it("splits at newlines and reassembles a record split across chunks", () => {
    const framer = new NdjsonFramer();
    expect(texts(framer.push(buf('{"a":1}\n{"b":')).lines)).toEqual(['{"a":1}']);
    expect(texts(framer.push(buf('2}\n')).lines)).toEqual(['{"b":2}']);
  });

  it("survives a multi-byte character split across a chunk boundary", () => {
    const framer = new NdjsonFramer();
    const whole = buf('{"a":"é"}\n');
    // Split inside the two-byte encoding of e-acute. Bytes are never decoded in
    // the framer, which is exactly why this cannot corrupt.
    const cut = whole.indexOf(0xc3) + 1;
    expect(framer.push(whole.subarray(0, cut)).lines).toHaveLength(0);
    const done = framer.push(whole.subarray(cut)).lines;
    expect(texts(done)).toEqual(['{"a":"é"}']);
    expect(parseWireObject(done[0]!.bytes, 1).ok).toBe(true);
  });

  it("strips CRLF and skips blank lines while still counting them", () => {
    const framer = new NdjsonFramer();
    const { lines } = framer.push(buf('{"a":1}\r\n\n\n{"b":2}\r\n'));
    expect(texts(lines)).toEqual(['{"a":1}', '{"b":2}']);
    // Ordinals are stream line numbers, so an error cites the line an operator
    // will count to in a capture -- not the index among accepted records.
    expect(lines.map((l) => l.ordinal)).toEqual([1, 4]);
  });

  it("latches after an over-long record instead of resynchronising", () => {
    const framer = new NdjsonFramer();
    const huge = "x".repeat(MAX_WIRE_LINE_BYTES + 1);
    const first = framer.push(buf(`${huge}\n{"after":1}\n`));
    expect(first.refusal?.code).toBe("line-too-long");

    // The decisive assertion. ReadBuffer clears and lets the caller continue,
    // which resumes mid-frame on attacker-chosen bytes. Nothing more is ever
    // produced here, including the perfectly valid record that followed.
    const later = framer.push(buf('{"legit":1}\n'));
    expect(later.lines).toHaveLength(0);
    expect(later.refusal?.code).toBe("line-too-long");
  });

  it("refuses an unterminated record that is already over the limit", () => {
    const framer = new NdjsonFramer();
    // No newline will ever arrive; without this the peer buffers without bound.
    const { refusal } = framer.push(Buffer.alloc(MAX_WIRE_LINE_BYTES + 1, 0x78));
    expect(refusal?.code).toBe("line-too-long");
  });

  it("discards an unterminated tail rather than emitting it as a record", () => {
    const framer = new NdjsonFramer();
    expect(texts(framer.push(buf('{"a":1}\n{"trunc')).lines)).toEqual(['{"a":1}']);
    // A truncated record is not a short record: its remainder never arrived.
    expect(framer.end().discardedBytes).toBe('{"trunc'.length);
  });

  it("never puts record content in a refusal", () => {
    const framer = new NdjsonFramer();
    const secret = "s3cr3t-".repeat(MAX_WIRE_LINE_BYTES / 4);
    const { refusal } = framer.push(buf(`${secret}\n`));
    expect(refusal).not.toBeNull();
    expect(refusal!.reason).not.toContain("s3cr3t");
    expect(refusal!.reason).toContain("over the");
  });
});

describe("parseWireObject", () => {
  it("returns a digest of the exact bytes that produced the value", () => {
    const bytes = buf('{"method":"work/accept","id":1}');
    const parsed = parseWireObject(bytes, 1);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value["method"]).toBe("work/accept");
    // The property the module exists for: digest and value describe each other.
    expect(parsed.sha256).toBe(sha256Hex(bytes));
  });

  it("refuses a record that sets the same key twice", () => {
    // Both names are in the bytes; JSON.parse keeps only the last. Signing the
    // bytes while acting on the last is a forgery inside attested output.
    const bytes = buf('{"agentId":"auditor","agentId":"attacker"}');
    expect(JSON.parse(bytes.toString("utf8")).agentId).toBe("attacker");

    const parsed = parseWireObject(bytes, 7);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("duplicate-key");
    expect(parsed.reason).toContain("agentId");
    expect(parsed.reason).toContain("7");
  });

  it("catches a duplicate written with a different escape", () => {
    // Comparing raw spans would miss this; keys are compared decoded.
    const parsed = parseWireObject(buf('{"a":1,"\\u0061":2}'), 1);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("duplicate-key");
  });

  it("does not mistake a repeated key in a sibling object for a duplicate", () => {
    const parsed = parseWireObject(buf('{"a":{"k":1},"b":{"k":2},"c":[{"k":3},{"k":4}]}'), 1);
    expect(parsed.ok).toBe(true);
  });

  it("does not mistake a string VALUE that looks like a key", () => {
    const parsed = parseWireObject(buf('{"a":"b","c":"a"}'), 1);
    expect(parsed.ok).toBe(true);
  });

  it("refuses bytes that are not valid UTF-8", () => {
    // toString("utf8") substitutes U+FFFD silently, so the value acted on would
    // not be the bytes digested.
    const bytes = Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);
    const parsed = parseWireObject(bytes, 3);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("not-utf8");
  });

  it("refuses arrays, scalars and malformed JSON without echoing them", () => {
    expect((parseWireObject(buf('[{"a":1}]'), 1) as { code: string }).code).toBe("not-an-object");
    expect((parseWireObject(buf('"just a string"'), 1) as { code: string }).code).toBe("not-an-object");

    const bad = parseWireObject(buf('{"a": s3cr3t}'), 9);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.code).toBe("not-json");
    // V8 embeds a slice of the offending input in its message; it must not
    // travel into a response or a log line.
    expect(bad.reason).not.toContain("s3cr3t");
  });

  it("refuses a reserved key at any depth", () => {
    expect((parseWireObject(buf('{"__proto__":{"x":1}}'), 1) as { code: string }).code).toBe("unsafe-key");
    expect((parseWireObject(buf('{"p":{"q":[{"__proto__":{}}]}}'), 1) as { code: string }).code)
      .toBe("unsafe-key");
  });
});
