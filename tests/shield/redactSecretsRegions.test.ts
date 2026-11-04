import { afterEach, describe, expect, it, vi } from "vitest";

// Synthetic values, spelled in parts so no scanner reads a secret here.
const VALUE = ["abcdefghij", "klmnop123"].join("");

/** A switch for the one test that needs the folded view to fail in a way it never does on its own. */
const fold = vi.hoisted(() => ({ failure: undefined as Error | undefined }));
vi.mock("../../src/dataflow/textViews.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/dataflow/textViews.js")>();
  return { ...actual, foldedView: (text: string) => { if (fold.failure) throw fold.failure; return actual.foldedView(text); } };
});
const { redactSecrets } = await import("../../src/shield/redaction/redactSecrets.js");
const redact = (text: string, extra: readonly RegExp[] = []) => redactSecrets(text, type => `[${type}]`, extra);

afterEach(() => { fold.failure = undefined; });

describe("redactSecrets' regions of the original text", () => {
  it("replaces a fullwidth key whose value ends in an astral look-alike digit, surrogate pair and all", () => {
    // U+1D7D1 MATHEMATICAL BOLD DIGIT THREE folds to "3" but is two UTF-16 units in the original.
    const text = `ａｐｉ＿ｋｅｙ=${VALUE.slice(0, -1)}\u{1D7D1} tail`;
    const { redacted, findings } = redact(text);
    expect(redacted).toBe("[generic_api_key] tail");
    expect(redacted).not.toMatch(/[\uD800-\uDFFF]/);
    expect(findings).toEqual([{ type: "generic_api_key", index: 0 }]);
  });

  it("writes one placeholder where a folded match lies inside a secret field's value, and reports both", () => {
    const text = `<password>ａｐｉ＿ｋｅｙ=${VALUE}</password> and <token>${VALUE}</token>`;
    const { redacted, findings } = redact(text);
    expect(redacted).toBe("<password>[secret_field]</password> and <token>[secret_field]</token>");
    expect(findings.map(finding => finding.type).sort()).toEqual(["generic_api_key", "secret_field", "secret_field"]);
    const inner = findings.find(finding => finding.type === "generic_api_key")!;
    expect(text.slice(inner.index)).toMatch(/^ａｐｉ/);
  });

  it("stops on a caller's pattern that matches the empty string, counting each position", () => {
    const { redacted, findings } = redact("ab", [/x*/]);
    expect(redacted).toBe("[custom]a[custom]b[custom]");
    expect(findings).toEqual([0, 1, 2].map(index => ({ type: "custom", index })));
  });

  it("propagates a folded-view failure other than its length limit instead of returning the text unread", () => {
    fold.failure = new RangeError("probe failure");
    expect(() => redact(`ａｐｉ＿ｋｅｙ=${VALUE}`)).toThrow("probe failure");
    fold.failure = undefined;
    expect(redact(`ａｐｉ＿ｋｅｙ=${VALUE}`).redacted).toBe("[generic_api_key]");
  });
});
