import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { generateResidencyReport, registerTenant, resetDataResidencyState } from "../src/compliance/dataResidency.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
const previousPassphrase = process.env.AMC_VAULT_PASSPHRASE;
beforeEach(() => { process.env.AMC_VAULT_PASSPHRASE = "residency-verified-report"; resetDataResidencyState(); });
afterEach(() => {
  resetDataResidencyState();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (previousPassphrase === undefined) delete process.env.AMC_VAULT_PASSPHRASE;
  else process.env.AMC_VAULT_PASSPHRASE = previousPassphrase;
});

function keyed(): string {
  const root = mkdtempSync(join(tmpdir(), "amc-residency-verified-"));
  roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}
const tenantFile = (ws: string, id: string) => join(ws, ".amc", "compliance", "residency", "tenants", `${id}.json`);

describe("the residency report reads only verified residency records (security sweep)", () => {
  test("a tampered tenant record does not set the report's region and is reported", () => {
    const ws = keyed();
    registerTenant({ tenantId: "t1", workspaceId: "w1", region: "eu-west-1" }, ws);
    const row = JSON.parse(readFileSync(tenantFile(ws, "t1"), "utf8")) as Record<string, unknown>;
    writeFileSync(tenantFile(ws, "t1"), JSON.stringify({ ...row, region: "us-west-2" }, null, 2));
    resetDataResidencyState();
    const report = generateResidencyReport("t1", {}, ws);
    expect(report.region).not.toBe("us-west-2");
    expect(report.compliant).toBe(false);
    expect(report.violations.join("\n")).toMatch(/HASH_MISMATCH/);
  });

  test("a forged unsigned tenant record in a keyed workspace drives no isolation check", () => {
    const ws = keyed();
    const t1 = registerTenant({ tenantId: "t1", workspaceId: "w1", region: "eu-west-1" }, ws);
    const body = { tenantId: "forged", workspaceId: "w1", region: "eu-west-1", isolationLevel: "strict", keyCustodyMode: "local", createdTs: 2 };
    const prev = (JSON.parse(readFileSync(tenantFile(ws, "t1"), "utf8")) as { record_hash: string }).record_hash;
    writeFileSync(tenantFile(ws, "forged"), JSON.stringify({ ...body, prev_record_hash: prev,
      record_hash: sha256Hex(canonicalize({ ...body, prev_record_hash: prev })), signature: "unsigned", storedTs: 2 }, null, 2));
    resetDataResidencyState();
    const report = generateResidencyReport(t1.tenantId, {}, ws);
    expect(report.isolationChecks.map((check) => check.tenantB)).not.toContain("forged");
    expect(report.violations.join("\n")).not.toMatch(/share workspace/);
  });

  test("a tenant with no residency registration is reported unconfigured, never compliant", () => {
    const ws = keyed();
    const report = generateResidencyReport("ghost", {}, ws);
    expect(report.compliant).toBe(false);
    expect(report.violations.join("\n")).toMatch(/ghost has no verified residency registration/);
  });

  test("integrity violations carry a fixed message per finding, never the reader's error text", () => {
    const ws = keyed();
    registerTenant({ tenantId: "t1", workspaceId: "w1", region: "eu-west-1" }, ws);
    writeFileSync(tenantFile(ws, "evil"), "leakedtok");
    resetDataResidencyState();
    const lines = generateResidencyReport("t1", {}, ws).violations.filter((line) => line.includes("UNREADABLE"));
    expect(lines).toHaveLength(1);
    expect(lines.join("\n")).not.toMatch(/leakedtok/);
  });
});
