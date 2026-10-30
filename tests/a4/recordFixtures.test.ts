/**
 * P2-35 / P1-63 debt: each `amc.a4-record/v1` fixture's verdict (tests/fixtures/contracts/a4-record/README.md) as a test,
 * through AMC's own verifier (`verifyA4Bundle`). The second verifier (P1-06's packages/verifier) has no a4-record
 * kind yet; running these files through it is pending (DEBT.md).
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { verifyA4Bundle } from "../../src/a4/a4Verify.js";
import { loadTrustContext } from "../../src/trust/trustContext.js";

// An empty AMC home: no operator trust list or roots of this machine reaches the verdicts.
let home: string;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "amc-p235-record-"));
  vi.stubEnv("HOME", home);
  vi.stubEnv("AMC_HOME", home);
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});

const DIR = join(__dirname, "../fixtures/contracts/a4-record");
type Dimension = "integrity" | "scope" | "freshness" | "completeness" | "satisfaction";
type Expected = Record<Dimension, string>;
const DIMENSIONS: readonly Dimension[] = ["integrity", "scope", "freshness", "completeness", "satisfaction"];
/** status, or `status:CODE` for a code the dimension must name. */
const VERDICTS: Record<string, Expected> = {
  valid: { integrity: "pass", scope: "pass", freshness: "pass", completeness: "pass", satisfaction: "pass:GATE_OPEN" },
  "second-vote-lands": { integrity: "pass", scope: "pass", freshness: "pass", completeness: "pass", satisfaction: "pass" },
  "builder-approved-own-revision": { integrity: "pass", scope: "pass", freshness: "pass", completeness: "pass", satisfaction: "fail:builder_not_completion_approver" },
  "stale-approval": { integrity: "pass", scope: "pass", freshness: "fail:DECISION_NOT_BOUND", completeness: "pass", satisfaction: "pass" },
  "dangling-evidence-ref": { integrity: "pass", scope: "pass", freshness: "pass", completeness: "fail:REF_DANGLING", satisfaction: "not-evaluated" },
  "deleted-evidence-ref": { integrity: "fail:A4_SIDE_ROW_MISMATCH", scope: "pass", freshness: "pass", completeness: "fail:A4_SIDE_ROW_MISMATCH", satisfaction: "not-evaluated" },
  "tampered-transition": { integrity: "fail:A4_CHAIN_INVALID", scope: "not-evaluated", freshness: "not-evaluated", completeness: "not-evaluated", satisfaction: "not-evaluated" }
};

const pinned = () => loadTrustContext({ trustLists: [join(DIR, "trust/amc-trust-list.json")],
  trustRoots: (JSON.parse(readFileSync(join(DIR, "trust/trust-roots.json"), "utf8")) as { roots: string[] }).roots });

describe("a4-record fixture verdicts under the fixture trust list", () => {
  test.each(Object.entries(VERDICTS))("%s", async (name, expected) => {
    const report = await verifyA4Bundle(join(DIR, `${name}.json`), pinned()) as unknown as Record<Dimension, { status: string }>;
    for (const dimension of DIMENSIONS) {
      const [status, code] = expected[dimension].split(":");
      expect([dimension, report[dimension].status]).toEqual([dimension, status]);
      if (code !== undefined) expect(JSON.stringify(report[dimension])).toContain(code);
    }
  });

  test("second-vote-lands binds the same gate digests as valid", () => {
    const gateOf = (name: string) => (JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8")) as { tables: { a4_gates: Array<{ binding_digest: string; readiness_sha256: string }> } })
      .tables.a4_gates.map(({ binding_digest, readiness_sha256 }) => ({ binding_digest, readiness_sha256 }));
    expect(gateOf("second-vote-lands")).toEqual(gateOf("valid"));
  });
});

describe("a4-record fixtures with no trust list: integrity only", () => {
  test.each(Object.keys(VERDICTS).filter((name) => name !== "tampered-transition"))("%s", async (name) => {
    const report = await verifyA4Bundle(join(DIR, `${name}.json`), loadTrustContext({ trustLists: [], trustRoots: [] })) as unknown as
      Record<string, { status: string }> & { trusted: boolean };
    expect(report.issuerAdmission.status).toBe("fail");
    expect(report.trusted).toBe(false);
    for (const dimension of ["scope", "freshness", "completeness", "satisfaction"]) {
      expect([dimension, report[dimension]!.status, JSON.stringify(report[dimension]).includes("ISSUER_NOT_ADMITTED")]).toEqual([dimension, "not-evaluated", true]);
    }
  });
});
