import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkPayee } from "../src/enforce/payeeGuard.js";
import { guardClipboard } from "../src/enforce/clipboardGuard.js";

/**
 * G1-36: ~53 guards emitted a hardcoded decision ('allow' or 'deny') with the
 * boilerplate reason 'EXX decision' regardless of what they actually decided.
 * payeeGuard, for example, blocked a risky payee while logging 'allow', so
 * guard_events.sqlite — the largest store in a workspace — misrepresented the
 * decisions it recorded.
 */
describe("guards log the decision they actually reached", () => {
  it("no guard still emits the boilerplate reason", () => {
    for (const file of ["payeeGuard", "clipboardGuard", "configLinter", "consensus", "twoPersonAuth"]) {
      const source = readFileSync(
        new URL(`../src/enforce/${file}.ts`, import.meta.url),
        "utf8"
      );
      expect(source).not.toMatch(/reason: '[ES]\d+ decision'/);
    }
  });

  it("derives the decision from the guard's own verdict", () => {
    const source = readFileSync(new URL("../src/enforce/payeeGuard.ts", import.meta.url), "utf8");
    expect(source).toContain("? 'allow' : 'deny'");
    expect(source).not.toContain("decision: 'allow', reason:");
  });

  it("still returns correct verdicts after the change", () => {
    expect(checkPayee({ name: "Acme Corp", account: "12345678", amount: 500 }).safe).toBe(true);
    const risky = checkPayee({ name: "fake test", account: "zz", amount: -5 });
    expect(risky.safe).toBe(false);
    expect(risky.flags.length).toBeGreaterThan(0);
  });

  it("clipboard guard verdict is unchanged", () => {
    expect(guardClipboard("nothing sensitive here").safe).toBe(true);
  });

  it("paths with no verdict say so rather than asserting one", () => {
    const source = readFileSync(new URL("../src/shield/sbom.ts", import.meta.url), "utf8");
    expect(source).toContain("no allow/deny decision was made here");
  });
});
