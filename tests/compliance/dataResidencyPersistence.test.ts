import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  registerTenant,
  getTenant,
  getTenants,
  issueLegalHold,
  releaseLegalHold,
  getActiveLegalHolds,
  isTenantUnderLegalHold,
  createResidencyPolicy,
  getPolicyForRegion,
  checkAllTenantIsolation,
  generateResidencyReport,
  resetDataResidencyState
} from "../../src/compliance/dataResidency.js";
import {
  holdVerdict,
  legalHoldRegistryRoot,
  LegalHoldRegistryError,
  readLegalHoldRegistry
} from "../../src/residency/legalHoldRegistry.js";
import { assertDeletionAllowed, DeletionDenied } from "../../src/residency/deletionGate.js";

const logsDeletion = (workspace: string) => ({ workspace, executor: "residency-test", target: { kind: "logs" as const } });

/**
 * Residency policies, tenants and legal holds lived only in module-level
 * arrays, so every CLI invocation started empty while the commands reported
 * success. Reproduced against the real CLI before the fix:
 *
 *   tenant-register --tenant acme --region eu-west-1  -> "registered in eu-west-1"
 *   legal-hold --issue --tenant acme                  -> "Legal hold issued: lh_..."
 *   legal-hold --list                                 -> "No active legal holds."
 *   residency-report --tenant acme                    -> "Region: us-east-1" + "COMPLIANT"
 *
 * An auditor-facing report named the wrong region, omitted an active hold and
 * stamped COMPLIANT on a configuration it had never read. A vanishing legal
 * hold is spoliation-relevant.
 *
 * resetDataResidencyState() clears the in-process cache between assertions,
 * which is what a second CLI invocation looks like from the module's side.
 */
describe("data residency survives the process", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-residency-"));
    resetDataResidencyState();
  });

  afterEach(() => {
    resetDataResidencyState();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("keeps a tenant's region across invocations", () => {
    registerTenant({ tenantId: "acme", workspaceId: "w1", region: "eu-west-1" }, workspace);
    resetDataResidencyState();
    expect(getTenant("acme", workspace)?.region).toBe("eu-west-1");
  });

  it("reports the registered region, not the us-east-1 fallback", () => {
    registerTenant({ tenantId: "acme", workspaceId: "w1", region: "eu-west-1" }, workspace);
    resetDataResidencyState();
    const report = generateResidencyReport("acme", undefined, workspace);
    expect(report.region).toBe("eu-west-1");
  });

  it("keeps a legal hold visible after the issuing process exits", () => {
    const hold = issueLegalHold(
      { tenantId: "acme", reason: "litigation", issuedBy: "legal" },
      workspace
    );
    resetDataResidencyState();
    const active = getActiveLegalHolds("acme", workspace);
    expect(active.map((h) => h.holdId)).toContain(hold.holdId);
    expect(isTenantUnderLegalHold("acme", workspace)).toBe(true);
    // Deletion admission reads the same registry, so a later process is refused.
    expect(() => assertDeletionAllowed(logsDeletion(workspace))).toThrow(DeletionDenied);
  });

  it("records a release so a later process sees it", () => {
    const hold = issueLegalHold(
      { tenantId: "acme", reason: "litigation", issuedBy: "legal" },
      workspace
    );
    resetDataResidencyState();
    expect(releaseLegalHold(hold.holdId, workspace)).toBe(true);
    resetDataResidencyState();
    expect(getActiveLegalHolds("acme", workspace)).toHaveLength(0);
    expect(isTenantUnderLegalHold("acme", workspace)).toBe(false);
    expect(assertDeletionAllowed(logsDeletion(workspace)).verdict).toBe("clear");
  });

  it("sees every registered tenant when checking isolation", () => {
    registerTenant({ tenantId: "acme", workspaceId: "w1", region: "eu-west-1" }, workspace);
    resetDataResidencyState();
    registerTenant({ tenantId: "globex", workspaceId: "w2", region: "us-east-1" }, workspace);
    resetDataResidencyState();
    // Previously always empty: each invocation saw only its own tenant.
    expect(checkAllTenantIsolation(workspace)).toHaveLength(1);
  });

  it("keeps a residency policy retrievable by region", () => {
    const policy = createResidencyPolicy({ region: "eu-west-1" }, workspace);
    resetDataResidencyState();
    expect(getPolicyForRegion("eu-west-1", workspace)?.policyId).toBe(policy.policyId);
  });

  it("signs each stored hold and anchors the set in HEAD and the journal (P2-01)", () => {
    const hold = issueLegalHold(
      { tenantId: "acme", reason: "litigation", issuedBy: "legal" },
      workspace
    );
    const root = legalHoldRegistryRoot(workspace);
    const path = join(root, `${hold.holdId}.json`);
    for (const file of [path, `${path}.sig`, join(root, "HEAD.json"), join(root, "HEAD.json.sig"), join(root, "journal")]) {
      expect(existsSync(file), file).toBe(true);
    }
    expect(JSON.parse(readFileSync(path, "utf8"))).toMatchObject({
      schemaVersion: "amc.legal-hold/v1", holdId: hold.holdId, active: true, scope: { tenantId: "acme" }
    });
    const snapshot = readLegalHoldRegistry(workspace);
    expect(snapshot.holdsChecked).toBe(1);
    expect(snapshot.registryDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.journalRevision).toBeGreaterThan(0);
  });

  // Each tamper must surface as an integrity failure, never as "no active holds".
  const tampers: Array<[string, (path: string) => void, string]> = [
    ["a forged release in the record", (path) => {
      const record = JSON.parse(readFileSync(path, "utf8"));
      writeFileSync(path, JSON.stringify({ ...record, active: false, releasedTs: record.issuedTs }) + "\n");
    }, "signature_invalid"],
    ["a broken record signature", (path) => {
      const sig = JSON.parse(readFileSync(`${path}.sig`, "utf8"));
      writeFileSync(`${path}.sig`, JSON.stringify({ ...sig, signature: Buffer.alloc(64).toString("base64") }));
    }, "signature_invalid"],
    ["a deleted record and signature", (path) => {
      rmSync(path); rmSync(`${path}.sig`);
    }, "record_corrupt"]
  ];
  for (const [name, tamper, reason] of tampers) {
    it(`refuses ${name} instead of reporting the tenant unheld`, () => {
      const hold = issueLegalHold(
        { tenantId: "acme", reason: "litigation", issuedBy: "legal" },
        workspace
      );
      tamper(join(legalHoldRegistryRoot(workspace), `${hold.holdId}.json`));
      resetDataResidencyState();
      expect(() => readLegalHoldRegistry(workspace)).toThrow(LegalHoldRegistryError);
      expect(() => getActiveLegalHolds("acme", workspace)).toThrow(LegalHoldRegistryError);
      expect(holdVerdict({ workspace })).toEqual({ verdict: "unknown", reason });
    });
  }

  it("still works without a workspace, for library callers", () => {
    const hold = issueLegalHold({ tenantId: "acme", reason: "x", issuedBy: "y" });
    expect(getActiveLegalHolds("acme").map((h) => h.holdId)).toContain(hold.holdId);
    expect(getTenants()).toEqual([]);
  });
});
