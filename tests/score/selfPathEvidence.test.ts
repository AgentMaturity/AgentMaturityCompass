import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreFailSecureGovernance } from "../../src/score/failSecureGovernance.js";
import { scoreISO42001Coverage } from "../../src/score/regulatoryReadiness.js";
import { evidencePathExists } from "../../src/score/controlSurfaceScope.js";
import { markAsAmcCheckout } from "../helpers/amcCheckout.js";

/**
 * Scorers award points for candidate paths that mix real evidence
 * (".amc/tool_allowlist.json", "ACTION_POLICY.md") with AMC's own source tree
 * ("src/enforce"). Outside an AMC checkout the third kind proves only that a
 * directory has a certain name.
 *
 * Concretely: an unrelated TypeScript project containing src/policy and
 * src/enforce scored 43 on fail-secure governance and was reported as having
 * failsClosedByDefault, hasToolCallWhitelist and hasExcessiveAgencyControls —
 * three governance controls it did not implement. A false pass on a safety
 * control is worse than a false failure, so this is pinned.
 */
describe("self-referential path evidence", () => {
  let foreign: string;
  let checkout: string;

  beforeAll(() => {
    foreign = mkdtempSync(join(tmpdir(), "amc-foreign-"));
    // Directory names that happen to collide with AMC's own module layout.
    for (const d of ["src/policy", "src/enforce", "src/ops", "src/vault", "src/assurance"]) {
      mkdirSync(join(foreign, d), { recursive: true });
    }

    checkout = mkdtempSync(join(tmpdir(), "amc-checkout-"));
    markAsAmcCheckout(checkout);
    for (const d of ["src/policy", "src/enforce"]) {
      mkdirSync(join(checkout, d), { recursive: true });
    }
  });

  afterAll(() => {
    rmSync(foreign, { recursive: true, force: true });
    rmSync(checkout, { recursive: true, force: true });
  });

  it("does not credit an unrelated project for AMC-shaped directory names", () => {
    const result = scoreFailSecureGovernance(foreign);
    expect(result.failsClosedByDefault).toBe(false);
    expect(result.hasToolCallWhitelist).toBe(false);
    expect(result.hasExcessiveAgencyControls).toBe(false);
    expect(result.score).toBe(0);
  });

  it("still credits the same paths inside an AMC checkout", () => {
    const result = scoreFailSecureGovernance(checkout);
    expect(result.failsClosedByDefault).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it("counts genuine workspace evidence regardless of checkout status", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-workspace-"));
    try {
      mkdirSync(join(workspace, ".amc"), { recursive: true });
      writeFileSync(join(workspace, ".amc/tool_allowlist.json"), "[]");
      writeFileSync(join(workspace, "ACTION_POLICY.md"), "# policy\n");

      const result = scoreFailSecureGovernance(workspace);
      expect(result.hasToolCallWhitelist).toBe(true);
      expect(result.failsClosedByDefault).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("gates only src/ candidates, never workspace or doc paths", () => {
    mkdirSync(join(foreign, "docs"), { recursive: true });
    writeFileSync(join(foreign, "docs/POLICY.md"), "");
    expect(evidencePathExists(foreign, "src/policy")).toBe(false);
    expect(evidencePathExists(foreign, "docs/POLICY.md")).toBe(true);
    expect(evidencePathExists(checkout, "src/policy")).toBe(true);
  });

  it("reports every ISO 42001 control as not evaluated, whatever files a non-AMC agent has", () => {
    // Three controls previously listed only src/ paths, capping any external
    // ISO score at 5 of 8 no matter what the operator actually had in place.
    const workspace = mkdtempSync(join(tmpdir(), "amc-iso-"));
    try {
      mkdirSync(join(workspace, ".amc/incidents"), { recursive: true });
      mkdirSync(join(workspace, ".amc/snapshots"), { recursive: true });
      mkdirSync(join(workspace, "docs"), { recursive: true });
      for (const f of [
        "docs/AI_GOVERNANCE.md", "docs/POLICY.md", "docs/RISK_MANAGEMENT.md",
        "docs/OPERATIONS.md", "docs/MONITORING.md", "docs/MANAGEMENT_REVIEW.md"
      ]) {
        writeFileSync(join(workspace, f), "");
      }
      writeFileSync(join(workspace, ".amc/evidence.sqlite"), "");

      // Since P0-15 no file satisfies a control: file presence is not evidence.
      const result = scoreISO42001Coverage(workspace);
      expect(result.score).toBeNull();
      expect(result.controls.every((control) => control.status === "not_evaluated")).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
