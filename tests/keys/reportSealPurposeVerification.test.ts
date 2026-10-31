import { generateKeyPairSync, sign, verify } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { sealedRunReportVerifies } from "../../src/diagnostic/reportSeal.js";
import { addPublicKeyToHistory, getAuthenticatedKeyHistory, getPublicKeyHistory, getSigningKey,
  getSigningPublicKeyPem, verifyHexDigestAny } from "../../src/crypto/keys.js";
import { getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

const PASS = "owned-report-seal-purpose-passphrase";
const owned: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  for (const f of owned.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-report-purpose-")), workspace = join(root, "workspace");
  owned.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return { root, workspace };
}
function body(label: string) {
  const base = { runId: label, ts: 1, layerScores: [], reportJsonSha256: "", runSealSig: "" };
  return { base, digest: sha256Hex(canonicalize(base)) };
}
function actualReport(workspace: string, label: string) {
  const { base, digest } = body(label), ledger = openLedger(workspace);
  try { return { ...base, reportJsonSha256: digest, runSealSig: ledger.signRunHash(digest) }; }
  finally { ledger.close(); }
}
function rawReport(label: string, privateKeyPem: string, publicKeyPem: string) {
  const { base, digest } = body(label), bytes = Buffer.from(digest, "hex");
  const runSealSig = sign(null, bytes, privateKeyPem).toString("base64");
  expect(verify(null, bytes, publicKeyPem, Buffer.from(runSealSig, "base64"))).toBe(true);
  return { ...base, reportJsonSha256: digest, runSealSig };
}

describe("run-report seals use artifact purpose history", () => {
  test("keeps real old and current report seals through purpose-split and scheduled artifact rotations", () => {
    const f = fixture(), before = actualReport(f.workspace, "before-split");
    expect(sealedRunReportVerifies(f.workspace, before)).toBe(true);
    const split = rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS });
    expect(split.rotated[0]).toMatchObject({ purpose: "artifact-seal", reason: "purpose-split" });
    const middle = actualReport(f.workspace, "after-split");
    expect(sealedRunReportVerifies(f.workspace, before)).toBe(true);
    expect(sealedRunReportVerifies(f.workspace, middle)).toBe(true);
    const scheduled = rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS });
    expect(scheduled.rotated[0]).toMatchObject({ purpose: "artifact-seal", reason: "scheduled" });
    for (const report of [before, middle, actualReport(f.workspace, "after-scheduled")]) {
      expect(sealedRunReportVerifies(f.workspace, report)).toBe(true);
      expect(Object.keys(report).sort()).toEqual(["layerScores", "reportJsonSha256", "runId", "runSealSig", "ts"]);
    }
  });

  test.each(["config-signature", "revocation-list"] as const)("rejects a real distinct %s rotation key admitted only to the broader auditor history", purpose => {
    const f = fixture(), oldArtifact = getSigningPublicKeyPem(f.workspace, "artifact-seal");
    rotatePurposeKeys({ workspace: f.workspace, purposes: [purpose], passphrase: PASS });
    const publicKeyPem = getSigningPublicKeyPem(f.workspace, purpose);
    expect(publicKeyPem).not.toBe(oldArtifact);
    expect(getPublicKeyHistory(f.workspace, "auditor")).toContain(publicKeyPem);
    expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(publicKeyPem);
    const report = rawReport(purpose, getSigningKey(f.workspace, purpose), publicKeyPem);
    expect(verifyHexDigestAny(report.reportJsonSha256, report.runSealSig, getPublicKeyHistory(f.workspace, "auditor"))).toBe(true);
    expect(sealedRunReportVerifies(f.workspace, report)).toBe(false);
    expect(sealedRunReportVerifies(f.workspace, actualReport(f.workspace, "artifact-control"))).toBe(true);
  });

  test("keeps an explicitly owner-imported historical auditor while the artifact purpose is unbound", () => {
    const f = fixture(), pair = generateKeyPairSync("ed25519");
    const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
    const privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const report = rawReport("historical-owner-import", privateKeyPem, publicKeyPem);
    expect(sealedRunReportVerifies(f.workspace, report)).toBe(false);
    addPublicKeyToHistory(f.workspace, "auditor", publicKeyPem, "imported");
    expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(publicKeyPem);
    expect(getAuthenticatedKeyHistory(f.workspace, "auditor")?.entries.find(entry => entry.publicKeyPem === publicKeyPem)?.source).toBe("imported");
    lockVault(f.workspace);
    expect(sealedRunReportVerifies(f.workspace, report)).toBe(true);
  });

  test("an unsigned imported-source relabel cannot confer report authority on a rotated config key", () => {
    const f = fixture();
    rotatePurposeKeys({ workspace: f.workspace, purposes: ["config-signature"], passphrase: PASS });
    const publicKeyPem = getSigningPublicKeyPem(f.workspace, "config-signature");
    const report = rawReport("source-relabel", getSigningKey(f.workspace, "config-signature"), publicKeyPem);
    const path = join(f.workspace, ".amc", "keys", "auditor_history.json"), bytes = readFileSync(path);
    const history = JSON.parse(bytes.toString("utf8")) as { entries: Array<{ publicKeyPem: string; source?: string }> };
    const entry = history.entries.find(row => row.publicKeyPem === publicKeyPem)!;
    expect(entry.source).toBe("local"); entry.source = "imported";
    try {
      writeFileSync(path, JSON.stringify(history));
      expect(getAuthenticatedKeyHistory(f.workspace, "auditor")).toBeNull();
      expect(sealedRunReportVerifies(f.workspace, report)).toBe(false);
    } finally { writeFileSync(path, bytes); }
    expect(sealedRunReportVerifies(f.workspace, report)).toBe(false);
    expect(sealedRunReportVerifies(f.workspace, actualReport(f.workspace, "restored-artifact"))).toBe(true);
  });

  test.each(["corrupt", "missing"] as const)("keeps the existing default auditor-alias %s refusal", change => {
    const f = fixture(), report = actualReport(f.workspace, "alias-control");
    const path = join(f.workspace, ".amc", "keys", "auditor_ed25519.pub"), bytes = readFileSync(path);
    expect(sealedRunReportVerifies(f.workspace, report)).toBe(true);
    try {
      if (change === "corrupt") writeFileSync(path, "owned corrupt public alias\n"); else rmSync(path);
      expect(sealedRunReportVerifies(f.workspace, report)).toBe(false);
    } finally { writeFileSync(path, bytes); }
    expect(sealedRunReportVerifies(f.workspace, report)).toBe(true);
  });
});
