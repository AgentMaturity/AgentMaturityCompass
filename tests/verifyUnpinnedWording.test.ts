import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { finishVerify } from "../src/cli-trust-flags.js";
import { LEDGER_UNANCHORED_MESSAGE } from "../src/ledger/ledgerVerification.js";
import type { VerifierReportV1 } from "../src/trust/verifierReport.js";

// CLI-11: a healthy fresh workspace read "FAILED" because its keys were not pinned, and the bundle refusal never
// named the workspace's own artifact-seal key as the --pubkey to pass.
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const unpinned = {
  integrity: { status: "pass", errors: [] },
  issuerAdmission: { status: "fail", signatures: [{ signature: "bundle", purpose: "artifact-seal", status: "not-pinned", detail: "key k is not pinned" }] },
  anchoring: { status: "not-applicable", detail: null },
  overrides: []
} as unknown as VerifierReportV1;

describe("verdicts on intact records whose keys are not pinned", () => {
  test("an intact bundle with an unpinned signer is NOT TRUSTED (exit 1), not FAILED, and names the key to pin", () => {
    const root = mkdtempSync(join(tmpdir(), "amc-unpinned-"));
    roots.push(root);
    mkdirSync(join(root, ".amc", "keys"), { recursive: true });
    writeFileSync(join(root, ".amc", "keys", "artifact-seal.pub"), "fixture");
    vi.spyOn(process, "cwd").mockReturnValue(root);
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => { lines.push(String(line)); });
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => { throw new Error(`exit ${code}`); }) as never);
    expect(() => finishVerify("Bundle", unpinned, {})).toThrow("exit 1");
    const out = lines.join("\n");
    expect(out).not.toContain("verification FAILED");
    expect(out).toContain("NOT TRUSTED");
    // Security review: the folder's own key is no trust root; its sha256 is given to compare with an outside record.
    expect(out).not.toContain("shows this workspace signed it");
    expect(out).toContain("matches the key kept in this folder");
    expect(out).toContain("sha256 ");
    expect(out).toContain("recorded outside this folder");
    expect(out).not.toMatch(/Next: [^\n]*pass --pubkey \.amc\/keys\/artifact-seal\.pub/);
  });

  test("the unanchored ledger verdict does not say FAILED", () => {
    expect(LEDGER_UNANCHORED_MESSAGE).not.toContain("FAILED");
    expect(LEDGER_UNANCHORED_MESSAGE).toContain("--expect-monitor");
  });
});
