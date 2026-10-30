import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { verifyLedgerIntegrity } from "../../src/ledger/ledgerVerification.js";
import { runDiagnostic } from "../../src/diagnostic/runner.js";
import { exportEvidenceBundle, verifyEvidenceBundle } from "../../src/bundles/bundle.js";
import { issueCertificate, verifyCertificate } from "../../src/assurance/certificate.js";
import { writeSignedGatePolicy } from "../../src/ci/gate.js";
import { addPublicKeyToHistory, ensureSigningKeys, getAuthenticatedKeyHistory, getPrivateKeyPem, getPublicKeyHistory, getPublicKeyPem, signHexDigest, verifyKeyHistoryChain } from "../../src/crypto/keys.js";
import { buildKeyHistoryEntry } from "../../src/crypto/keyHistoryChain.js";
import { lockVault, setVaultSecret, unlockVault, vaultPaths } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { keyHistoryTrust, workspaceKeyPem } from "../helpers/trustContext.js";

// AMC-1525 guards, one case each, as named by P0-30's mutation batch: the envelope signature, explicit migration,
// portable verification of a tampered raw history file, and cold verification that never initializes trust.
const PASSPHRASE = "key-history-mutation-guards-fixture";
const roots: string[] = [];
function directory(prefix = "amc-key-history-guards-"): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(root);
  return root;
}
function workspace(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASSPHRASE);
  const root = directory();
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
const historyFile = (root: string) => join(root, ".amc", "keys", "auditor_history.json");
const listing = (root: string) => readdirSync(root, { recursive: true }).map(String).sort();
const tar = (...args: string[]) => {
  const result = spawnSync("tar", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`tar failed: ${result.stderr}`);
};

describe("AMC-1525 key-history guards fail their mutations", () => {
  it("refuses an attacker key appended with a valid hash chain but no valid envelope signature", () => {
    const root = workspace(), attacker = workspace();
    const envelope = JSON.parse(readFileSync(historyFile(root), "utf8"));
    const attackerPem = getPublicKeyPem(attacker, "auditor");
    envelope.entries.push(buildKeyHistoryEntry(attackerPem, envelope.entries, "imported"));
    writeFileSync(historyFile(root), JSON.stringify(envelope));
    expect(verifyKeyHistoryChain(root, "auditor")).toMatchObject({ ok: false, reason: "history admission signature is invalid" });
    expect(getAuthenticatedKeyHistory(root, "auditor")).toBeNull();
    expect(getPublicKeyHistory(root, "auditor")).not.toContain(attackerPem);
  });

  it("never admits an unsigned legacy history without explicit migration", () => {
    const root = workspace(), attacker = workspace();
    const attackerPem = getPublicKeyPem(attacker, "auditor");
    const entries = getAuthenticatedKeyHistory(root, "auditor")!.entries;
    const legacy = JSON.stringify([...entries, buildKeyHistoryEntry(attackerPem, entries, "imported")]);
    writeFileSync(historyFile(root), legacy);
    // Every ordinary path that rewrites the vault or its public keys, none of which is the reviewed migration.
    lockVault(root);
    unlockVault(root, PASSPHRASE);
    ensureSigningKeys(root);
    setVaultSecret(root, "mutation-guard", "ordinary secret rewrite");
    expect(() => addPublicKeyToHistory(root, "auditor", attackerPem)).toThrow(/migrate/);
    expect(readFileSync(historyFile(root), "utf8")).toBe(legacy);
    expect(getPublicKeyHistory(root, "auditor")).toEqual([getPublicKeyPem(root, "auditor")]);
  });

  it("bundle and certificate refuse a signer admitted only by a tampered raw history file", async () => {
    const source = workspace(), attacker = workspace();
    const ledger = openLedger(source);
    ledger.startSession({ sessionId: "guards", runtime: "unknown", binaryPath: "test", binarySha256: "fixture" });
    ledger.appendEvidence({ sessionId: "guards", runtime: "unknown", eventType: "stdout", payload: "observed fixture output",
      inline: true, meta: { questionId: "AMC-1.1", trustTier: "OBSERVED", agentId: "default" } });
    ledger.sealSession("guards");
    ledger.close();
    const run = await runDiagnostic({ workspace: source, window: "14d", targetName: "default", claimMode: "auto" });
    const policyPath = join(source, "policy.json");
    writeSignedGatePolicy({ workspace: source, policyPath, policy: { minIntegrityIndex: 0, minOverall: 0,
      minLayer: { "Strategic Agent Operations": 0, "Leadership & Autonomy": 0, "Culture & Alignment": 0, Resilience: 0, Skills: 0 },
      requireObservedForLevel5: false, denyIfLowTrust: false } });
    const artifacts = { bundle: join(source, "run.amcbundle"), certificate: join(source, "run.amccert") };
    exportEvidenceBundle({ workspace: source, runId: run.runId, outFile: artifacts.bundle });
    await issueCertificate({ workspace: source, runId: run.runId, policyPath, outFile: artifacts.certificate });
    // The verifier pins the source auditor AND lets its key history admit older keys, so only the history's
    // authentication stands between the attacker's key and an accepted signature.
    const trust = keyHistoryTrust(workspaceKeyPem(source, "auditor"), workspaceKeyPem(source, "monitor"));
    const attackerPem = getPublicKeyPem(attacker, "auditor");
    const sign = (digest: string) => signHexDigest(digest, getPrivateKeyPem(attacker, "auditor"));
    for (const kind of ["bundle", "certificate"] as const) {
      const root = directory();
      tar("-xzf", artifacts[kind], "-C", root);
      const historyPath = join(root, "public-keys", "key-history.json");
      const history = JSON.parse(readFileSync(historyPath, "utf8"));
      history.auditor.entries.push(buildKeyHistoryEntry(attackerPem, history.auditor.entries, "imported"));
      writeFileSync(historyPath, JSON.stringify(history, null, 2));
      if (kind === "bundle") {
        const manifestPath = join(root, "manifest.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        manifest.files = manifest.files.map((file: { path: string }) => {
          const bytes = readFileSync(join(root, file.path));
          return { path: file.path, sha256: sha256Hex(bytes), size: bytes.length };
        });
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        const manifestSha256 = sha256Hex(readFileSync(manifestPath));
        writeFileSync(join(root, "manifest.sig"), JSON.stringify({ manifestSha256, signature: sign(manifestSha256), signedTs: Date.now(), signer: "auditor" }));
      } else {
        const certSha256 = sha256Hex(readFileSync(join(root, "cert.json")));
        writeFileSync(join(root, "cert.sig"), JSON.stringify({ certSha256, signature: sign(certSha256), signedTs: Date.now(), signer: "auditor" }));
      }
      const path = join(directory(), `tampered.amc${kind === "bundle" ? "bundle" : "cert"}`);
      tar("-czf", path, "-C", root, ".");
      const result = kind === "bundle" ? await verifyEvidenceBundle(path, trust) : await verifyCertificate({ certFile: path, trust });
      expect(result.ok, `${kind}: ${result.errors.join("; ")}`).toBe(false);
      expect(result.errors).toContain(kind === "bundle" ? "Manifest signature verification failed." : "cert signature invalid");
    }
  }, 60_000);

  it("cold verification without a vault refuses and leaves the workspace listing unchanged", () => {
    const root = workspace();
    const ledger = openLedger(root);
    ledger.startSession({ sessionId: "cold", runtime: "unknown", binaryPath: "test", binarySha256: "fixture" });
    ledger.appendEvidence({ sessionId: "cold", runtime: "unknown", eventType: "stdout", payload: "encrypted fixture event", inline: false });
    ledger.sealSession("cold");
    ledger.close();
    lockVault(root);
    rmSync(vaultPaths(root).vaultFile);
    const before = listing(root);
    const verdict = verifyLedgerIntegrity(root);
    expect(verdict.ok).toBe(false);
    expect(verdict.chain.errors.join(" ")).toMatch(/payload authentication failed/);
    expect(listing(root)).toEqual(before);
  });
});
