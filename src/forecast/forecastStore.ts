import { join } from "node:path";
import { readdirSync } from "node:fs";
import YAML from "yaml";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import type { SignedFileVerification } from "../org/orgSigner.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { captureOrgPairs, assertOrgPairsCurrent, orgPairBytes, prepareOrgPairsAsync, publishOrgPairs,
  type OrgPairsOptions, type OrgPairWrite, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { advisorySchema, forecastArtifactSchema, forecastPolicySchema, forecastSchedulerStateSchema,
  type AdvisoryRecord, type ForecastArtifact, type ForecastPolicy, type ForecastScope, type ForecastSchedulerState } from "./forecastSchema.js";

function forecastRoot(workspace: string): string { return join(workspace, ".amc", "forecast"); }
export function forecastPolicyPath(workspace: string): string { return join(forecastRoot(workspace), "policy.yaml"); }
export function forecastPolicySigPath(workspace: string): string { return `${forecastPolicyPath(workspace)}.sig`; }
export function forecastScopeLatestPath(workspace: string, scope: ForecastScope): string {
  return scope.type === "WORKSPACE" ? join(forecastRoot(workspace), "scopes", "workspace", "latest.json")
    : scope.type === "AGENT" ? join(forecastRoot(workspace), "scopes", "agents", scope.id, "latest.json")
      : join(forecastRoot(workspace), "scopes", "nodes", scope.id, "latest.json");
}
function forecastScopeSnapshotsDir(workspace: string, scope: ForecastScope): string {
  const segment = scope.type === "WORKSPACE" ? "workspace" : scope.type === "AGENT" ? `agents/${scope.id}` : `nodes/${scope.id}`;
  return join(forecastRoot(workspace), "snapshots", segment);
}
function forecastAdvisoriesDir(workspace: string): string { return join(forecastRoot(workspace), "advisories"); }
function forecastAdvisoryPath(workspace: string, id: string): string { return join(forecastAdvisoriesDir(workspace), `${id}.json`); }
function forecastSchedulerPath(workspace: string): string { return join(forecastRoot(workspace), "scheduler.json"); }
function write(path: string, bytes: string): OrgPairWrite { return { path, bytes: Buffer.from(bytes) }; }
function pairVerification(workspace: string, path: string, snapshot?: OrgPairsSnapshot): { file: SignedFileVerification; bytes: Buffer | null; before: OrgPairsSnapshot } {
  const before = snapshot ?? captureOrgPairs([path]), bytes = orgPairBytes(before, path), sidecar = orgPairBytes(before, `${path}.sig`);
  const base = { path, sigPath: `${path}.sig` };
  if (bytes === null) return { before, bytes, file: { ...base, valid: false, signatureExists: false, reason: "file missing" } };
  if (sidecar === null) return { before, bytes, file: { ...base, valid: false, signatureExists: false, reason: "signature missing" } };
  const result = verifyAuditorSignatureBytes(workspace, "BUNDLE", bytes, sidecar);
  return { before, bytes, file: { ...base, valid: result.valid, signatureExists: true,
    reason: result.reason === "signature verification failed" ? "signature verify failed" : result.reason } };
}
/** Unauthenticated policy calculation is used only by the inherited ERROR/SKIPPED scheduler-state branch. */
export function captureForecastPolicyInput(workspace: string) {
  const before = captureOrgPairs([forecastPolicyPath(workspace)]), bytes = orgPairBytes(before, forecastPolicyPath(workspace));
  if (bytes === null) throw new Error(`forecast policy not found: ${forecastPolicyPath(workspace)}`);
  return { policy: forecastPolicySchema.parse(YAML.parse(bytes.toString("utf8")) as unknown), before,
    assertCurrent() { assertOrgPairsCurrent(before); } };
}
/** Same captured bytes supply the verified decision input and its final currency check. */
export function captureVerifiedForecastPolicy(workspace: string) {
  const captured = pairVerification(workspace, forecastPolicyPath(workspace));
  if (!captured.file.valid || captured.bytes === null) throw new Error(`forecast policy signature invalid: ${captured.file.reason ?? "unknown"}`);
  const policy = forecastPolicySchema.parse(YAML.parse(captured.bytes.toString("utf8")) as unknown);
  return { policy, assertCurrent() { assertOrgPairsCurrent(captured.before); } };
}
export function defaultForecastSchedulerState(): ForecastSchedulerState {
  return forecastSchedulerStateSchema.parse({ enabled: true, lastRefreshTs: null, nextRefreshTs: null, lastOutcome: { status: "OK", reason: "" } });
}
export function loadForecastSchedulerState(workspace: string): ForecastSchedulerState {
  const path = forecastSchedulerPath(workspace);
  return pathExists(path) ? forecastSchedulerStateSchema.parse(JSON.parse(readUtf8(path)) as unknown) : defaultForecastSchedulerState();
}
export function captureForecastSchedulerState(workspace: string) {
  const before = captureOrgPairs([forecastSchedulerPath(workspace)]), bytes = orgPairBytes(before, forecastSchedulerPath(workspace));
  const state = bytes === null ? defaultForecastSchedulerState() : forecastSchedulerStateSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
  return { state, before, assertCurrent() { assertOrgPairsCurrent(before); } };
}
function schedulerWrites(workspace: string, state: ForecastSchedulerState) { return [write(forecastSchedulerPath(workspace), JSON.stringify(forecastSchedulerStateSchema.parse(state), null, 2))]; }
function policyWrites(workspace: string, policy: ForecastPolicy) { return [write(forecastPolicyPath(workspace), YAML.stringify(forecastPolicySchema.parse(policy)))]; }
function advisoryWrites(workspace: string, advisory: AdvisoryRecord) { return [write(forecastAdvisoryPath(workspace, advisory.advisoryId), JSON.stringify(advisorySchema.parse(advisory), null, 2))]; }
function artifactWrites(workspace: string, scope: ForecastScope, forecast: ForecastArtifact) {
  const normalized = forecastArtifactSchema.parse(forecast), bytes = JSON.stringify(normalized, null, 2);
  const latestPath = forecastScopeLatestPath(workspace, scope), snapshotPath = join(forecastScopeSnapshotsDir(workspace, scope), `${normalized.generatedTs}.json`);
  return { writes: [write(latestPath, bytes), write(snapshotPath, bytes)], result: { latestPath, latestSigPath: `${latestPath}.sig`,
    snapshotPath, snapshotSigPath: `${snapshotPath}.sig`, snapshotSha256: sha256Hex(bytes) } };
}
export function saveForecastSchedulerState(workspace: string, state: ForecastSchedulerState) { return publishOrgPairs(workspace, schedulerWrites(workspace, state))[0]!; }
export function saveForecastPolicy(workspace: string, policy: ForecastPolicy) { return publishOrgPairs(workspace, policyWrites(workspace, policy))[0]!; }
export function loadForecastPolicy(workspace: string): ForecastPolicy {
  const path = forecastPolicyPath(workspace); if (!pathExists(path)) throw new Error(`forecast policy not found: ${path}`);
  return forecastPolicySchema.parse(YAML.parse(readUtf8(path)) as unknown);
}
export function verifyForecastPolicySignature(workspace: string): SignedFileVerification {
  try { return pairVerification(workspace, forecastPolicyPath(workspace)).file; }
  catch { return { path: forecastPolicyPath(workspace), sigPath: forecastPolicySigPath(workspace), valid: false, signatureExists: pathExists(forecastPolicySigPath(workspace)), reason: "invalid file signature" }; }
}
export function saveForecastArtifact(workspace: string, scope: ForecastScope, forecast: ForecastArtifact) {
  const planned = artifactWrites(workspace, scope, forecast); publishOrgPairs(workspace, planned.writes); return planned.result;
}
export function loadLatestForecastArtifact(workspace: string, scope: ForecastScope): ForecastArtifact | null {
  const path = forecastScopeLatestPath(workspace, scope); return pathExists(path) ? forecastArtifactSchema.parse(JSON.parse(readUtf8(path)) as unknown) : null;
}
export function captureVerifiedForecastArtifact(workspace: string, scope: ForecastScope) {
  try {
    const captured = pairVerification(workspace, forecastScopeLatestPath(workspace, scope));
    return { file: captured.file, parse() { if (captured.bytes === null) throw new Error("file missing"); return forecastArtifactSchema.parse(JSON.parse(captured.bytes.toString("utf8")) as unknown); } };
  } catch {
    const path = forecastScopeLatestPath(workspace, scope);
    return { file: { path, sigPath: `${path}.sig`, valid: false, signatureExists: pathExists(`${path}.sig`), reason: "invalid file signature" }, parse(): ForecastArtifact { throw new Error("invalid file signature"); } };
  }
}
export function verifyLatestForecastArtifact(workspace: string, scope: ForecastScope): SignedFileVerification { return captureVerifiedForecastArtifact(workspace, scope).file; }
export function saveAdvisory(workspace: string, advisory: AdvisoryRecord) { return publishOrgPairs(workspace, advisoryWrites(workspace, advisory))[0]!; }
export function captureAdvisory(workspace: string, advisoryId: string) {
  const path = forecastAdvisoryPath(workspace, advisoryId), captured = pairVerification(workspace, path);
  if (captured.bytes === null) return null;
  if (!captured.file.valid) throw new Error(`advisory signature invalid: ${captured.file.reason ?? "unknown"}`);
  return { advisory: advisorySchema.parse(JSON.parse(captured.bytes.toString("utf8")) as unknown), before: captured.before,
    assertCurrent() { assertOrgPairsCurrent(captured.before); } };
}
export function loadAdvisory(workspace: string, advisoryId: string): AdvisoryRecord | null { return captureAdvisory(workspace, advisoryId)?.advisory ?? null; }
export function listAdvisories(workspace: string): AdvisoryRecord[] {
  const dir = forecastAdvisoriesDir(workspace); if (!pathExists(dir)) return [];
  return readdirSync(dir).filter(name => name.endsWith(".json")).sort((a, b) => a.localeCompare(b)).map(name => {
    const path = join(dir, name), captured = pairVerification(workspace, path);
    if (!captured.file.valid || captured.bytes === null) throw new Error(`advisory signature invalid for ${name}: ${captured.file.reason ?? "unknown"}`);
    return advisorySchema.parse(JSON.parse(captured.bytes.toString("utf8")) as unknown);
  });
}
/** Internal maintained preparations; each real publisher retains its original gate through later log waits. */
export async function prepareForecastArtifact(workspace: string, scope: ForecastScope, forecast: ForecastArtifact, options: OrgPairsOptions = {}) {
  const planned = artifactWrites(workspace, scope, forecast), prepared = await prepareOrgPairsAsync(workspace, planned.writes, options);
  return { assertCurrent: prepared.assertCurrent, publish() { prepared.publish(); return planned.result; } };
}
export async function prepareForecastPolicy(workspace: string, policy: ForecastPolicy, options: OrgPairsOptions = {}, before?: OrgPairsSnapshot) {
  const writes = policyWrites(workspace, policy), digest = sha256Hex(writes[0]!.bytes);
  const prepared = await prepareOrgPairsAsync(workspace, writes, options, before);
  return { sha256: digest, assertCurrent: prepared.assertCurrent, publish() { return prepared.publish()[0]!; } };
}
export async function prepareForecastSchedulerState(workspace: string, state: ForecastSchedulerState, options: OrgPairsOptions = {}, before?: OrgPairsSnapshot) {
  const prepared = await prepareOrgPairsAsync(workspace, schedulerWrites(workspace, state), options, before);
  return { assertCurrent: prepared.assertCurrent, publish() { return prepared.publish()[0]!; } };
}
export async function prepareAdvisory(workspace: string, advisory: AdvisoryRecord, options: OrgPairsOptions = {}, before?: OrgPairsSnapshot) {
  const writes = advisoryWrites(workspace, advisory), digest = sha256Hex(writes[0]!.bytes);
  const prepared = await prepareOrgPairsAsync(workspace, writes, options, before);
  return { sha256: digest, assertCurrent: prepared.assertCurrent, publish() { return prepared.publish()[0]!; } };
}

export function verifyForecastSchedulerSignature(workspace: string): SignedFileVerification {
  try { return pairVerification(workspace, forecastSchedulerPath(workspace)).file; }
  catch { const path = forecastSchedulerPath(workspace); return { path, sigPath: `${path}.sig`, valid: false,
    signatureExists: pathExists(`${path}.sig`), reason: "invalid file signature" }; }
}
