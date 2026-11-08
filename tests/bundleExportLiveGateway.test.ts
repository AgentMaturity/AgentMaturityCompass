import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { issueCertificate, verifyCertificate } from "../src/assurance/certificate.js";
import { exportEvidenceBundle, verifyEvidenceBundle } from "../src/bundles/bundle.js";
import { writeSignedGatePolicy } from "../src/ci/gate.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { startGateway } from "../src/gateway/server.js";
import { openLedger } from "../src/ledger/ledger.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { pinnedTrust, workspaceKeyPem, workspaceKeyTrust } from "./helpers/trustContext.js";

/**
 * LIVE-INTEGRITY-04 (A-2): a bundle or certificate made while a session was open (Studio's gateway, a running tool)
 * carries it open. It verifies as of its signed export or issue time when that signer is admitted, so it stays valid an
 * hour later; an unverified export time or an unadmitted signer is verified at the real time: a missing seal.
 *
 * The certificate case uses a running tool's session with inline rows, not the gateway: a certificate signs only
 * cert.json, so an encrypted blob payload it carries (every gateway row) fails "payload authentication failed" whatever
 * the session state, on the base too. That pre-existing gap is reported to the director, not changed here.
 */
const HOUR = 60 * 60_000;
let root: string, workspace: string, bundle: string, gatewayId: string, openSessions: string[], exportTs: number;
let certWorkspace: string, certificate: string, issuedTs: number, toolBundle: string, toolExportTs: number;
const errorsOf = (result: { errors: string[] }) => result.errors.join("\n");
const exportTsOf = (file: string) =>
  (JSON.parse(spawnSync("tar", ["-xzOf", file, "./metadata/exportInfo.json"], { encoding: "utf8" }).stdout) as { exportTs: number }).exportTs;
/** Re-packs `file` with exportInfo.json's exportTs moved by `deltaMs` and the manifest left as signed. */
function tamperExportTs(file: string, deltaMs: number): string {
  const dir = mkdtempSync(join(root, "tampered-"));
  expect(spawnSync("tar", ["-xzf", file, "-C", dir]).status).toBe(0);
  const infoPath = join(dir, "metadata", "exportInfo.json");
  const info = JSON.parse(readFileSync(infoPath, "utf8")) as { exportTs: number };
  writeFileSync(infoPath, JSON.stringify({ ...info, exportTs: info.exportTs + deltaMs }, null, 2));
  const tampered = join(dir, "..", `${dir.split("/").pop()}.amcbundle`);
  expect(spawnSync("tar", ["-czf", tampered, "-C", dir, "."]).status).toBe(0);
  return tampered;
}
const missingSeal = () => `Session ${gatewayId} missing seal`;

beforeAll(async () => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-live-gateway-copies");
  root = mkdtempSync(join(tmpdir(), "amc-live-gateway-copies-"));
  workspace = join(root, "workspace");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const gateway = await startGateway({ workspace, listenPort: 0, proxyPort: 0, logger: { log() {}, error() {} } });
  try {
    gatewayId = gateway.gatewaySessionId;
    const run = await runDiagnostic({ workspace, window: "14d", targetName: "default", claimMode: "auto" });
    bundle = join(root, "run.amcbundle");
    ({ openSessions } = exportEvidenceBundle({ workspace, runId: run.runId, outFile: bundle }));
    exportTs = exportTsOf(bundle);
  } finally {
    await gateway.close();
  }
  certWorkspace = join(root, "cert-workspace");
  initWorkspace({ workspacePath: certWorkspace, trustBoundaryMode: "isolated" });
  const tool = openLedger(certWorkspace);
  try {
    tool.startSession({ sessionId: "tool-open", runtime: "unknown", binaryPath: "fixture", binarySha256: "fixture" });
    tool.appendEvidence({ sessionId: "tool-open", runtime: "unknown", eventType: "stdout", payload: "a running tool", inline: true });
  } finally { tool.close(); }
  const run = await runDiagnostic({ workspace: certWorkspace, window: "14d", targetName: "default", claimMode: "auto" });
  const policyPath = join(certWorkspace, "policy.json");
  writeSignedGatePolicy({ workspace: certWorkspace, policyPath, policy: { minIntegrityIndex: 0, minOverall: 0,
    minLayer: { "Strategic Agent Operations": 0, "Leadership & Autonomy": 0, "Culture & Alignment": 0, Resilience: 0, Skills: 0 },
    requireObservedForLevel5: false, denyIfLowTrust: false } });
  certificate = join(root, "run.amccert");
  await issueCertificate({ workspace: certWorkspace, runId: run.runId, policyPath, outFile: certificate });
  toolBundle = join(root, "tool.amcbundle");
  exportEvidenceBundle({ workspace: certWorkspace, runId: run.runId, outFile: toolBundle });
  toolExportTs = exportTsOf(toolBundle);
  issuedTs = (JSON.parse(spawnSync("tar", ["-xzOf", certificate, "./cert.json"], { encoding: "utf8" }).stdout) as { issuedTs: number }).issuedTs;
}, 180_000);
afterEach(() => { vi.useRealTimers(); });
afterAll(() => { lockVault(workspace); lockVault(certWorkspace); rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs(); });

/** Trust that pins only the monitor key: the auditor that signed the manifest or the certificate is not admitted. */
const monitorOnly = (of: string) => pinnedTrust([{ publicKeyPem: workspaceKeyPem(of, "monitor"), purposes: ["ledger-row"] }]);

describe("bundle", () => {
  test("the export names the gateway session it carries open", () => {
    expect(openSessions).toEqual([gatewayId]);
  });

  test("an hour later it verifies as of its export time and names the open session as information", async () => {
    const trust = workspaceKeyTrust(workspace);
    vi.setSystemTime(exportTs + HOUR);
    const result = await verifyEvidenceBundle(bundle, trust);
    expect(errorsOf(result)).not.toContain("Ledger verify:");
    expect(result.ok).toBe(true);
    expect(result.report.warnings).toContainEqual(expect.stringMatching(
      new RegExp(`^1 session open: ${gatewayId} \\(gateway; last signed activity \\d+ min ago\\)\\. .*\\(as of ${new Date(exportTs).toISOString()}\\)$`)));
  });

  test("a tampered export time (+1 year, unsigned) fails the manifest check and is never a verification instant", async () => {
    const tampered = tamperExportTs(bundle, 365 * 24 * HOUR);
    vi.setSystemTime(exportTs + HOUR);
    const result = await verifyEvidenceBundle(tampered, workspaceKeyTrust(workspace));
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("File hash mismatch: metadata/exportInfo.json");
    expect(errorsOf(result)).toContain(`Ledger verify: ${missingSeal()}`);
  });

  test("a bundle whose files did not verify is verified at the real time, even when its export time would keep a session open", async () => {
    // Inline rows only, so no blob payload loses its manifest authentication: the missing seal comes from the time alone.
    expect((await verifyEvidenceBundle(toolBundle, workspaceKeyTrust(certWorkspace))).ok).toBe(true);
    const tampered = tamperExportTs(toolBundle, 60_000); // inside the window, if it were trusted
    vi.setSystemTime(toolExportTs + HOUR);
    const result = await verifyEvidenceBundle(tampered, workspaceKeyTrust(certWorkspace));
    expect(errorsOf(result)).toContain("File hash mismatch: metadata/exportInfo.json");
    expect(errorsOf(result)).toContain("Ledger verify: Session tool-open missing seal");
  });

  test("an unadmitted manifest signer's export time does not count: the copy is verified at the real time", async () => {
    const trust = monitorOnly(workspace);
    vi.setSystemTime(exportTs + HOUR);
    const result = await verifyEvidenceBundle(bundle, trust);
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain(`Ledger verify: ${missingSeal()}`);
  });
});

describe("certificate", () => {
  test("issued while a tool session was open, it verifies an hour later as of its signed issue time", async () => {
    const trust = workspaceKeyTrust(certWorkspace);
    vi.setSystemTime(issuedTs + HOUR);
    const result = await verifyCertificate({ certFile: certificate, trust });
    expect(errorsOf(result)).not.toContain("ledger verify failed");
    expect(result.ok).toBe(true);
    expect(result.report.warnings).toContainEqual(expect.stringMatching(
      new RegExp(`^1 session open: tool-open \\(unknown; .*\\(as of ${new Date(issuedTs).toISOString()}\\)$`)));
  });

  test("with the certificate signer unadmitted, the carried ledger is verified at the real time", async () => {
    const trust = monitorOnly(certWorkspace);
    vi.setSystemTime(issuedTs + HOUR);
    const result = await verifyCertificate({ certFile: certificate, trust });
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("ledger verify failed: Session tool-open missing seal");
  });
});
