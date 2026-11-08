import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { issueCertificate, verifyCertificate } from "../src/assurance/certificate.js";
import { exportEvidenceBundle, verifyEvidenceBundle } from "../src/bundles/bundle.js";
import { writeSignedGatePolicy } from "../src/ci/gate.js";
import { getSigningKey, signHexDigest } from "../src/crypto/keys.js";
import { runDiagnostic } from "../src/diagnostic/runner.js";
import { startGateway } from "../src/gateway/server.js";
import { openLedger } from "../src/ledger/ledger.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { pinnedTrust, workspaceKeyPem, workspaceKeyTrust } from "./helpers/trustContext.js";

/**
 * LIVE-INTEGRITY-04 (A-2): a bundle or certificate made while a session was open (Studio's gateway, a running tool)
 * carries it open. It verifies as of its signed export or issue time when that signer is admitted and its signature
 * covers the carried ledger, so it stays valid an hour later; an unverified export time, an unadmitted signer, or a
 * certificate whose signature does not cover its ledger and blobs is verified at the real time: a missing seal.
 */
const HOUR = 60 * 60_000;
let root: string, workspace: string, bundle: string, gatewayId: string, openSessions: string[], exportTs: number;
let gatewayCertificate: string, gatewayIssuedTs: number;
let certWorkspace: string, certificate: string, issuedTs: number, toolBundle: string, toolExportTs: number;
const errorsOf = (result: { errors: string[] }) => result.errors.join("\n");
const exportTsOf = (file: string) =>
  (JSON.parse(spawnSync("tar", ["-xzOf", file, "./metadata/exportInfo.json"], { encoding: "utf8" }).stdout) as { exportTs: number }).exportTs;
const issuedTsOf = (file: string) =>
  (JSON.parse(spawnSync("tar", ["-xzOf", file, "./cert.json"], { encoding: "utf8" }).stdout) as { issuedTs: number }).issuedTs;
/** Extracts `file`, lets `mutate` change the files, and packs them again as `<name>.<ext>`; no signature is renewed. */
function repack(file: string, ext: string, mutate: (dir: string) => void): string {
  const dir = mkdtempSync(join(root, "tampered-"));
  expect(spawnSync("tar", ["-xzf", file, "-C", dir]).status).toBe(0);
  mutate(dir);
  const tampered = join(dir, "..", `${dir.split("/").pop()}.${ext}`);
  expect(spawnSync("tar", ["-czf", tampered, "-C", dir, "."]).status).toBe(0);
  return tampered;
}
/** Re-packs `file` with exportInfo.json's exportTs moved by `deltaMs` and the manifest left as signed. */
function tamperExportTs(file: string, deltaMs: number): string {
  return repack(file, "amcbundle", (dir) => {
    const infoPath = join(dir, "metadata", "exportInfo.json");
    const info = JSON.parse(readFileSync(infoPath, "utf8")) as { exportTs: number };
    writeFileSync(infoPath, JSON.stringify({ ...info, exportTs: info.exportTs + deltaMs }, null, 2));
  });
}
const missingSeal = () => `Session ${gatewayId} missing seal`;
async function signedPolicy(of: string): Promise<string> {
  const policyPath = join(of, "policy.json");
  writeSignedGatePolicy({ workspace: of, policyPath, policy: { minIntegrityIndex: 0, minOverall: 0,
    minLayer: { "Strategic Agent Operations": 0, "Leadership & Autonomy": 0, "Culture & Alignment": 0, Resilience: 0, Skills: 0 },
    requireObservedForLevel5: false, denyIfLowTrust: false } });
  return policyPath;
}

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
    gatewayCertificate = join(root, "gateway.amccert");
    await issueCertificate({ workspace, runId: run.runId, policyPath: await signedPolicy(workspace), outFile: gatewayCertificate });
    gatewayIssuedTs = issuedTsOf(gatewayCertificate);
  } finally {
    await gateway.close();
  }
  certWorkspace = join(root, "cert-workspace");
  initWorkspace({ workspacePath: certWorkspace, trustBoundaryMode: "isolated" });
  const tool = openLedger(certWorkspace);
  try {
    tool.startSession({ sessionId: "tool-open", runtime: "unknown", binaryPath: "fixture", binarySha256: "fixture" });
    tool.appendEvidence({ sessionId: "tool-open", runtime: "unknown", eventType: "stdout", payload: "a running tool", inline: true });
    tool.startSession({ sessionId: "tool-done", runtime: "unknown", binaryPath: "fixture", binarySha256: "fixture" });
    for (const line of ["routine", "incriminating"]) tool.appendEvidence({ sessionId: "tool-done", runtime: "unknown", eventType: "stdout", payload: line, inline: true });
    tool.sealSession("tool-done");
  } finally { tool.close(); }
  const run = await runDiagnostic({ workspace: certWorkspace, window: "14d", targetName: "default", claimMode: "auto" });
  certificate = join(root, "run.amccert");
  await issueCertificate({ workspace: certWorkspace, runId: run.runId, policyPath: await signedPolicy(certWorkspace), outFile: certificate });
  toolBundle = join(root, "tool.amcbundle");
  exportEvidenceBundle({ workspace: certWorkspace, runId: run.runId, outFile: toolBundle });
  toolExportTs = exportTsOf(toolBundle);
  issuedTs = issuedTsOf(certificate);
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

/**
 * A keyless holder of the certificate deletes a sealed session's newest rows at the end of the carried copy (and every
 * later row) and erases the seals of the sessions it touched, with the triggers dropped. Nothing is re-signed.
 */
function truncateAndStripSeal(dir: string, sessionId: string): void {
  const db = new Database(join(dir, "evidence", "evidence.sqlite"));
  try {
    db.pragma("journal_mode = DELETE");
    for (const trigger of ["no_delete_evidence", "protect_sessions_sealed_immutable", "protect_sessions_core_immutable"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    const from = (db.prepare("SELECT MAX(rowid) AS r FROM evidence_events WHERE session_id = ?").get(sessionId) as { r: number }).r;
    const touched = db.prepare("SELECT DISTINCT session_id AS id FROM evidence_events WHERE rowid >= ?").all(from) as Array<{ id: string }>;
    db.prepare("DELETE FROM evidence_events WHERE rowid >= ?").run(from);
    for (const { id } of touched) db.prepare("UPDATE sessions SET ended_ts = NULL, session_final_event_hash = NULL, session_seal_sig = NULL WHERE session_id = ?").run(id);
  } finally { db.close(); }
}

describe("certificate", () => {
  test("issued while the gateway runs, it verifies at once and an hour later, as of its signed issue time", async () => {
    const trust = workspaceKeyTrust(workspace);
    const now = await verifyCertificate({ certFile: gatewayCertificate, trust });
    expect(errorsOf(now)).toBe("");
    expect(now.ok).toBe(true);
    vi.setSystemTime(gatewayIssuedTs + HOUR);
    const later = await verifyCertificate({ certFile: gatewayCertificate, trust });
    expect(errorsOf(later)).toBe("");
    expect(later.ok).toBe(true);
    expect(later.report.warnings).toContainEqual(expect.stringMatching(
      new RegExp(`^1 session open: ${gatewayId} \\(gateway; last signed activity \\d+ min ago\\)\\. .*\\(as of ${new Date(gatewayIssuedTs).toISOString()}\\)$`)));
  });

  test("a carried ledger changed after issue (a sealed session's newest row deleted, its seal erased) fails, and the issue time stops counting", async () => {
    const trust = workspaceKeyTrust(certWorkspace);
    expect((await verifyCertificate({ certFile: certificate, trust })).ok).toBe(true);
    const tampered = repack(certificate, "amccert", (dir) => truncateAndStripSeal(dir, "tool-done"));
    vi.setSystemTime(issuedTs + HOUR);
    const result = await verifyCertificate({ certFile: tampered, trust });
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("certificate evidence digest mismatch: evidence/evidence.sqlite");
    expect(errorsOf(result)).toContain("ledger verify failed: Session tool-done missing seal");
  });

  test("a certificate whose signature does not cover its ledger (issued before this release) is verified at the real time", async () => {
    // Re-signed by the real issuer, so only the missing evidence digests differ from a current certificate.
    const unbound = repack(certificate, "amccert", (dir) => {
      const cert = JSON.parse(readFileSync(join(dir, "cert.json"), "utf8")) as { references: Record<string, unknown> };
      delete cert.references.evidence;
      writeFileSync(join(dir, "cert.json"), JSON.stringify(cert, null, 2));
      const certSha256 = sha256Hex(readFileSync(join(dir, "cert.json")));
      const sig = JSON.parse(readFileSync(join(dir, "cert.sig"), "utf8")) as Record<string, unknown>;
      writeFileSync(join(dir, "cert.sig"), JSON.stringify({ ...sig, certSha256, signature: signHexDigest(certSha256, getSigningKey(certWorkspace, "artifact-seal")) }, null, 2));
    });
    const trust = workspaceKeyTrust(certWorkspace);
    vi.setSystemTime(issuedTs + HOUR);
    const result = await verifyCertificate({ certFile: unbound, trust });
    expect(errorsOf(result)).not.toContain("cert signature invalid");
    expect(result.ok).toBe(false);
    expect(errorsOf(result)).toContain("ledger verify failed: Session tool-open missing seal");
  });

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
