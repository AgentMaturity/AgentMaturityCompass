import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDoctorRules } from "../src/doctor/doctorRules.js";
import { renderDoctorText } from "../src/doctor/doctorReport.js";
import { runDoctorCli } from "../src/doctor/doctorCli.js";

// Dependency seams isolate diagnostic control flow. Passing these cases would
// not qualify a real notary, platform ABI, gateway or signed policy.
const seam = vi.hoisted(() => ({
  signature: { valid: true, signatureExists: true, reason: null as string | null },
  studioRunning: true,
  notary: vi.fn(async () => ({ ok: true, reasons: [] })),
  sign: vi.fn(),
  lease: vi.fn(() => ({ token: "synthetic-lease-must-not-render" })),
  http: vi.fn(async () => ({ status: 200, failure: null })),
  sqlite: vi.fn(() => ({ id: "native-modules", status: "PASS", message: "Fixture SQLite seam" }))
}));
vi.mock("../src/studio/studioSupervisor.js", () => ({ studioStatus: () => ({ running: seam.studioRunning, state: { host: "127.0.0.1", apiPort: 3212, gatewayPort: 3210 } }) }));
vi.mock("../src/vault/vaultCli.js", () => ({ vaultStatusNow: () => ({ unlocked: true }) }));
vi.mock("../src/governor/actionPolicyEngine.js", () => ({ verifyActionPolicySignature: () => seam.signature }));
vi.mock("../src/toolhub/toolhubCli.js", () => ({ verifyToolhubConfig: () => seam.signature }));
vi.mock("../src/budgets/budgets.js", () => ({ verifyBudgetsConfigSignature: () => seam.signature }));
vi.mock("../src/approvals/approvalPolicyEngine.js", () => ({ verifyApprovalPolicySignature: () => seam.signature }));
vi.mock("../src/adapters/adapterConfigStore.js", () => ({ verifyAdaptersConfigSignature: () => seam.signature }));
vi.mock("../src/gateway/config.js", () => ({ loadGatewayConfig: () => ({}), routeBaseUrls: () => [{ prefix: "/openai" }] }));
vi.mock("../src/leases/leaseCli.js", () => ({ issueLeaseForCli: seam.lease }));
vi.mock("../src/workspaces/workspaceId.js", () => ({ workspaceIdFromDirectory: () => "fixture-workspace" }));
vi.mock("../src/adapters/adapterCli.js", () => ({ adaptersDetectCli: () => [] }));
vi.mock("../src/toolhub/toolhubValidators.js", () => ({ pathAllowedByPatterns: () => ({ ok: false }) }));
vi.mock("../src/trust/trustConfig.js", () => ({ checkNotaryTrust: seam.notary, loadTrustConfig: () => ({ trust: { mode: "NOTARY" } }), verifyTrustConfigSignature: () => seam.signature }));
vi.mock("../src/crypto/signing/signer.js", () => ({ signDigestWithPolicy: seam.sign }));
vi.mock("../src/crypto/keys.js", () => ({ verifyKeyHistoryChain: () => ({ ok: true }) }));
vi.mock("../src/doctor/nativeModuleProbe.js", () => ({ nativeModuleCheck: seam.sqlite }));
vi.mock("../src/doctor/doctorLiveProbe.js", async importOriginal => ({ ...await importOriginal<typeof import("../src/doctor/doctorLiveProbe.js")>(), requestDoctorStatus: seam.http }));

describe("local doctor and explicit live-probe boundary", () => {
  let root: string;
  beforeEach(() => {
    vi.clearAllMocks();
    seam.signature = { valid: true, signatureExists: true, reason: null };
    seam.studioRunning = true;
    root = mkdtempSync(join(tmpdir(), "amc-doctor-local-boundary-"));
    mkdirSync(join(root, ".amc"));
    writeFileSync(join(root, ".amc", "amc.config.yaml"), "{}\n");
    writeFileSync(join(root, ".amc", "gateway.yaml"), "{}\n");
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });
  it("never issues a diagnostic lease, signs at a notary or sends model requests by default", async () => {
    const report = await runDoctorRules(root);
    expect(report.liveProbes).toBe(false);
    expect(seam.sqlite).toHaveBeenCalledOnce();
    expect(seam.notary).not.toHaveBeenCalled();
    expect(seam.sign).not.toHaveBeenCalled();
    expect(seam.lease).not.toHaveBeenCalled();
    expect(seam.http).not.toHaveBeenCalled();
    expect(report.checks.find(row => row.id === "notary-live-probes")?.status).toBe("INFO");
    expect(report.checks.find(row => row.id === "lease-carriers-live")?.fixHint).toContain("may incur provider charges");
    expect(renderDoctorText(report)).toContain("no live notary signing");
  });
  it("strict mode does not grant live-probe consent", async () => {
    const result = await runDoctorCli(root, { strict: true });
    expect(result.strict).toBe(true);
    expect(result.liveProbes).toBe(false);
    expect(seam.http).not.toHaveBeenCalled();
    expect(seam.sign).not.toHaveBeenCalled();
  });
  it("uses the explicit live option and reports its scope without exposing the lease", async () => {
    const result = await runDoctorCli(root, { liveProbes: true });
    expect(result.liveProbes).toBe(true);
    expect(seam.notary).toHaveBeenCalledOnce();
    expect(seam.sign).toHaveBeenCalledOnce();
    expect(seam.lease).toHaveBeenCalledOnce();
    expect(seam.http).toHaveBeenCalledTimes(2);
    expect(result.text).toContain("provider charges may apply");
    expect(JSON.stringify(result)).not.toContain("synthetic-lease-must-not-render");
  });
  it("keeps invalid signed configuration a failure instead of marketing it as mostly ready", async () => {
    seam.signature = { valid: false, signatureExists: true, reason: "fixture altered bytes" };
    const report = await runDoctorRules(root);
    expect(report.ok).toBe(false);
    const row = report.checks.find(row => row.id === "sig-action-policy");
    expect(row?.status).toBe("FAIL");
    expect(row?.fixHint).toContain("restore its approved contents first");
    expect(renderDoctorText(report)).not.toContain("MOSTLY READY");
    expect(seam.sign).not.toHaveBeenCalled();
    expect(seam.lease).not.toHaveBeenCalled();
  });
  it("does not silently promote a requested but unavailable live probe to PASS", async () => {
    seam.studioRunning = false;
    const report = await runDoctorRules(root, { liveProbes: true });
    expect(report.checks.find(row => row.id === "lease-carriers-live")?.status).toBe("WARN");
    expect(seam.http).not.toHaveBeenCalled();
    expect(seam.lease).not.toHaveBeenCalled();
    expect(renderDoctorText(report)).toContain("Skipped probes are not passed");
  });
});
