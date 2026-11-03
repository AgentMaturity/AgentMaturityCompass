import { describe, expect, it } from "vitest";
import { detectProtectedRequest, MAX_REQUEST_SCAN_CHARS, protectedWalk } from "../../src/dataflow/detectors.js";
import { FoldOverflow, foldedView, foldLimit, foldText } from "../../src/dataflow/textViews.js";
import { redactSecrets } from "../../src/shield/redaction/redactSecrets.js";

// Synthetic values, spelled in parts so no scanner reads a secret here.
const PASSWORD = ["hunter2", "fixture"].join("-");
const base64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
const redact = (text: string) => redactSecrets(text, type => `[${type}]`);
const walk = (text: string) => {
  const run = protectedWalk({ budget: MAX_REQUEST_SCAN_CHARS, replace: finding => `[${finding.detector}]`, opaque: reason => `<${reason}>` });
  return { text: run.text(text), findings: run.findings };
};
const timed = <T>(fn: () => T): { readonly out: T; readonly ms: number } => {
  const started = performance.now();
  const out = fn();
  return { out, ms: performance.now() - started };
};

describe("Basic tokens with an empty user name or a UTF-8 password", () => {
  // The last two encode to letters only, so the decode check (not the non-letter shortcut) decides them.
  const tokens = [base64(`:${PASSWORD}`), base64(":qñsppthetc"), base64("txsu:kurépkbld")];
  it("include letters-only tokens, where the decode check decides", () => {
    expect(tokens.slice(1).every(token => /^[A-Za-z]+$/.test(token))).toBe(true);
  });
  for (const token of tokens) {
    for (const [label, text] of [
      ["outside a header", `retry with basic ${token} please`],
      ["inside a header", `Authorization: Basic ${token}`],
      ["inside a JSON header", `{"Authorization": "Basic ${token}"}`]
    ] as const) {
      it(`counts ${Buffer.from(token, "base64").toString("utf8")} ${label}`, () => {
        const walked = walk(text);
        expect(walked.text, "walk").not.toContain(token);
        expect(walked.findings.some(finding => finding.dataClass === "credential"), "walk").toBe(true);
        expect(redact(text).redacted, "redactSecrets").not.toContain(token);
      });
    }
  }

  it("still reads headings and words as prose", () => {
    for (const text of ["## Basic Overview\nChapter 2: Basic Operations", "Basic Authentication is covered in Basic Settings"]) {
      expect(walk(text).text).toBe(text);
      expect(redact(text).redacted).toBe(text);
    }
  });
});

describe("a Basic header in JSON escaped more than once", () => {
  it("is redacted by redactSecrets and the walk", () => {
    // No colon, so only the header rule (src/shield/redaction/secretPatterns.ts) reads it as a credential.
    const token = base64(PASSWORD);
    for (const text of [`{\\"Authorization\\": \\"Basic ${token}\\"}`, `{\\\\\\"Authorization\\\\\\": \\\\\\"Basic ${token}\\\\\\"}`]) {
      expect(redact(text).redacted, text).not.toContain(token);
      expect(walk(text).text, text).not.toContain(token);
    }
  });
});

describe("the folded view's length limit", () => {
  const MIB = 1_048_576;
  const hostile = [["U+FDFA", "ﷺ"], ["U+337F", "㍿"], ["ligature U+FB01", "ﬁ"]] as const;

  it("refuses a fold past its limit before building it, and keeps benign expanding text", () => {
    expect(() => foldText("ﷺ".repeat(MIB))).toThrow(FoldOverflow);
    expect(() => foldedView("ﷺ".repeat(MIB))).toThrow(FoldOverflow);
    expect(foldText("ﷺ".repeat(60_000)).length).toBe(18 * 60_000);
    expect(foldLimit(MIB)).toBe(5 * MIB);
    const view = foldedView(`xﷺ ａｐｉ`)!;
    expect(view.from).toBeInstanceOf(Int32Array);
    expect(view.view.length).toBe(view.from.length);
    expect(view.view.endsWith(" api")).toBe(true);
    expect(Array.from(view.from.slice(-4))).toEqual([2, 3, 4, 5]);
  });

  it("bounds the walk and redactSecrets on megabyte inputs of expanding characters", () => {
    for (const [label, char] of hostile) {
      const text = char.repeat(MIB);
      const walked = timed(() => walk(text)), redacted = timed(() => redact(text));
      console.info(`fold ${label}: walk ${Math.round(walked.ms)} ms, redactSecrets ${Math.round(redacted.ms)} ms`);
      expect(walked.ms, label).toBeLessThan(10_000);
      expect(redacted.ms, label).toBeLessThan(10_000);
    }
  });

  it("fails closed where the fold would pass the limit", () => {
    const flood = "ﷺ".repeat(MIB), secret = ` api_key=${["abcdefghij", "klmnop123"].join("")}`;
    expect(walk(flood + secret).text).toBe("<too_long>");
    expect(() => detectProtectedRequest({ model: "m", system: null, params: {}, tools: [], messages: [{ role: "user", parts: [{ kind: "text", text: flood }] }] } as never)).toThrow();
    const { redacted, findings } = redact(flood + secret);
    expect(redacted).toBe("[fold_overflow]");
    expect(findings[0]).toEqual({ type: "fold_overflow", index: 0 });
  });
});
