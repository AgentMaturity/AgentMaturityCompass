import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { getAgentPaths } from "../../src/fleet/paths.js";
import { initAlertsConfig, loadAlertsConfig, signAlertsConfig } from "../../src/drift/alerts.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import type { ActionClass } from "../../src/types.js";
import { writeSealedReport } from "./sealedRun.js";

export const FREEZE_PASS = "owned-freeze-publication-passphrase";
const roots: Array<{ root: string; workspace: string }> = [], closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  const failures: unknown[] = [];
  for (const close of closers.splice(0).reverse()) try { await close(); } catch (error) { failures.push(error); }
  vi.restoreAllMocks();
  for (const f of roots.splice(0)) try { closeSqlitePool(`ledger:${f.workspace}:${join(f.workspace, ".amc", "evidence.sqlite")}`); lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); } catch (error) { failures.push(error); }
  vi.unstubAllEnvs();
  if (failures.length) throw new AggregateError(failures, "owned freeze fixture cleanup failed");
});
export const ownFreezeCloser = (close: () => Promise<void>) => { closers.push(close); };
export function freezeFixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-freeze-publication-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", FREEZE_PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_STORAGE_PROFILE", "FULL"); vi.stubEnv("AMC_SESSION_STORE", "sqlite"); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); initAlertsConfig(workspace);
  const paths = getAgentPaths(workspace, "default"), dir = join(paths.rootDir, "incidents"), provider = loadKeyProvider(workspace, "file");
  const alertsPath = join(workspace, ".amc", "alerts.yaml"), config = loadAlertsConfig(workspace);
  config.alerts.channels = []; config.alerts.rules[0]!.actions = ["FREEZE_EXECUTE", "CREATE_INCIDENT"];
  writeFileSync(alertsPath, JSON.stringify(config)); signAlertsConfig(workspace);
  const params = () => ({ workspace, agentId: "default", ruleId: "owned-rule", previousRunId: "owned-before", currentRunId: "owned-after",
    deltas: { overallDrop: 1, integrityDrop: 0.2, correlationDrop: 0.1, maxLayerDrop: 1 }, actionClasses: ["DEPLOY", "WRITE_HIGH"] as ActionClass[],
    reason: "owned freeze reason", remediation: { concept: ["owned concept"], culture: ["owned culture"], capabilities: ["owned capability"], configuration: ["owned configuration"] } });
  return { root, workspace, dir, provider, params, paths, alertsPath, privateKey: getSigningKey(workspace, "artifact-seal"),
    publicKey: getSigningPublicKeyPem(workspace, "artifact-seal"), incidentPath: (id: string) => join(dir, id + ".json"),
    liftPath: (id: string) => join(dir, id + ".lift.json"), unlock() { vi.stubEnv("AMC_VAULT_PASSPHRASE", FREEZE_PASS); unlockVault(workspace, FREEZE_PASS); } };
}
export type FreezeFixture = ReturnType<typeof freezeFixture>;
function freezeDeferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
export function pauseFreezeSign(f: FreezeFixture) {
  const entered = freezeDeferred(), release = freezeDeferred(), actual = f.provider.sign.bind(f.provider);
  const spy = vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, bytes) => {
    expect(existsSync(join(f.dir, ".freeze-publication.lock"))).toBe(false);
    const signature = await actual(ref, bytes); entered.resolve(); await release.promise; return signature;
  });
  return { entered, release, spy };
}
export async function atFreezeSign(paused: ReturnType<typeof pauseFreezeSign>, pending: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([paused.entered.promise, pending.then(() => { throw new Error("producer settled before its real file Sign pause"); }, error => { throw error; }),
    new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("producer did not enter its real file Sign pause")), 5_000); })]); }
  finally { clearTimeout(timer); }
}
/** Clearly labelled unqualified diagnostic/assurance INPUTS; the real selector/evaluation/ledger/signing/output run. */
export function writeFreezeDecisionInputs(f: FreezeFixture) {
  mkdirSync(f.paths.runsDir, { recursive: true }); mkdirSync(join(f.paths.reportsDir, "assurance"), { recursive: true });
  const report = (runId: string, ts: number, score: number) => ({ runId, agentId: "default", ts, windowStartTs: 0, windowEndTs: 1_000_000,
    layerScores: [{ layerName: "Strategic Agent Operations", avgFinalLevel: score, confidenceWeightedFinalLevel: score }], integrityIndex: score / 5, correlationRatio: 0.95,
    reportJsonSha256: "owned unqualified diagnostic INPUT", runSealSig: "unsigned", status: "UNSIGNED", verificationPassed: false,
    trustBoundaryViolated: false, trustBoundaryMessage: null, trustLabel: "UNRELIABLE — DO NOT USE FOR CLAIMS", targetProfileId: null,
    questionScores: [], inflationAttempts: [], unsupportedClaimCount: 0, contradictionCount: 0, invalidReceiptsCount: 0,
    correlationWarnings: ["owned unqualified diagnostic INPUT"], evidenceCoverage: 0, evidenceTrustCoverage: { observed: 0, attested: 0, selfReported: 0 },
    targetDiff: [], prioritizedUpgradeActions: [], evidenceToCollectNext: [] });
  const older = join(f.paths.runsDir, "owned-old.json"), previous = join(f.paths.runsDir, "owned-before.json"), current = join(f.paths.runsDir, "owned-after.json");
  // Sealed with the workspace key (WP37: drift reads only runs and assurance reports whose seal verifies); the content
  // stays an unqualified INPUT, so its status remains UNSIGNED.
  writeSealedReport(f.workspace, f.paths.runsDir, "owned-old", report("owned-old", 10, 2));
  writeSealedReport(f.workspace, f.paths.runsDir, "owned-before", report("owned-before", 100, 4.8));
  writeSealedReport(f.workspace, f.paths.runsDir, "owned-after", report("owned-after", 200, 3.8));
  const assurance = writeSealedReport(f.workspace, join(f.paths.reportsDir, "assurance"), "owned-input",
    { agentId: "default", ts: 150, packResults: [{ packId: "injection", score0to100: 90 }, { packId: "hallucination", score0to100: 90 }] });
  expect(JSON.parse(readFileSync(current, "utf8")).status).toBe("UNSIGNED");
  return { older, previous, current, assurance };
}
