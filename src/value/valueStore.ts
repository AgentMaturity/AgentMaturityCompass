import { dirname, join } from "node:path";
import { readdirSync } from "node:fs";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { captureOrgPairsAuthority, captureOrgPairs, assertOrgPairsCurrent, orgPairBytes, publishOrgPairs, publishOrgPairsAsync, prepareOrgPairsAsync, type OrgPairsOptions, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { canonicalize } from "../utils/json.js";
import {
  defaultValuePolicy,
  defaultValueSchedulerState,
  valuePolicySchema,
  valueSchedulerStateSchema,
  type ValuePolicy,
  type ValueSchedulerState
} from "./valuePolicySchema.js";
import { valueContractSchema, type ValueContract } from "./valueContracts.js";
import { valueEventSchema, type ValueEvent } from "./valueEventSchema.js";
import { valueReportSchema, valueSnapshotSchema, type ValueReport, type ValueSnapshot } from "./valueSchema.js";

function valueRoot(workspace: string): string {
  return join(workspace, ".amc", "value");
}

export function valuePolicyPath(workspace: string): string {
  return join(valueRoot(workspace), "policy.yaml");
}

export function valuePolicySigPath(workspace: string): string {
  return `${valuePolicyPath(workspace)}.sig`;
}

export function valueContractsDir(workspace: string): string {
  return join(valueRoot(workspace), "contracts");
}

export function valueWorkspaceContractPath(workspace: string): string {
  return join(valueContractsDir(workspace), "workspace.yaml");
}

export function valueAgentContractPath(workspace: string, agentId: string): string {
  return join(valueContractsDir(workspace), "agents", `${agentId}.yaml`);
}

export function valueEventsDir(workspace: string): string {
  return join(valueRoot(workspace), "events");
}

function valueEventsMonthPath(workspace: string, month: string): string {
  return join(valueEventsDir(workspace), `${month}`, "events.ndjson");
}

function valueSnapshotsDir(workspace: string): string {
  return join(valueRoot(workspace), "snapshots");
}

function valueReportsDir(workspace: string): string {
  return join(valueRoot(workspace), "reports");
}

export function valueSchedulerPath(workspace: string): string {
  return join(valueRoot(workspace), "scheduler.json");
}

function scopeSegment(scope: { type: "WORKSPACE" | "NODE" | "AGENT"; id: string }): string {
  if (scope.type === "WORKSPACE") {
    return "workspace";
  }
  if (scope.type === "AGENT") {
    return join("agents", scope.id);
  }
  return join("nodes", scope.id);
}

export function valueSnapshotLatestPath(workspace: string, scope: { type: "WORKSPACE" | "NODE" | "AGENT"; id: string }): string {
  return join(valueSnapshotsDir(workspace), scopeSegment(scope), "latest.json");
}

function valueReportPath(workspace: string, scope: { type: "WORKSPACE" | "NODE" | "AGENT"; id: string }, ts: number): string {
  return join(valueReportsDir(workspace), scopeSegment(scope), `${ts}.json`);
}

function ensureValueDirs(workspace: string): void {
  ensureDir(valueRoot(workspace));
  ensureDir(valueContractsDir(workspace));
  ensureDir(join(valueContractsDir(workspace), "agents"));
  ensureDir(valueEventsDir(workspace));
  ensureDir(valueSnapshotsDir(workspace));
  ensureDir(valueReportsDir(workspace));
}

export function initValuePolicy(workspace: string): {
  path: string;
  sigPath: string;
  policy: ValuePolicy;
} {
  const policy = defaultValuePolicy();
  const saved = saveValuePolicy(workspace, policy);
  return {
    ...saved,
    policy
  };
}

export function loadValuePolicy(workspace: string): ValuePolicy {
  const path = valuePolicyPath(workspace);
  if (!pathExists(path)) {
    return initValuePolicy(workspace).policy;
  }
  return valuePolicySchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function saveValuePolicy(workspace: string, policy: ValuePolicy): { path: string; sigPath: string } {
  return publishOrgPairs(workspace, [{ path: valuePolicyPath(workspace), bytes: Buffer.from(YAML.stringify(valuePolicySchema.parse(policy))) }])[0]!;
}

export function verifyValuePolicySignature(workspace: string) {
  return verifyValuePair(workspace, valuePolicyPath(workspace));
}

export function saveValueContract(params: { workspace: string; contract: ValueContract; agentId?: string | null }): { path: string; sigPath: string } {
  const path = params.agentId ? valueAgentContractPath(params.workspace, params.agentId) : valueWorkspaceContractPath(params.workspace);
  return publishOrgPairs(params.workspace, [{ path, bytes: Buffer.from(YAML.stringify(valueContractSchema.parse(params.contract))) }])[0]!;
}

export function loadValueContract(params: {
  workspace: string;
  agentId?: string | null;
}): ValueContract {
  const path = params.agentId ? valueAgentContractPath(params.workspace, params.agentId) : valueWorkspaceContractPath(params.workspace);
  if (!pathExists(path)) {
    throw new Error(`value contract missing: ${path}`);
  }
  return valueContractSchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function verifyValueContractSignature(params: {
  workspace: string;
  agentId?: string | null;
}) {
  const path = params.agentId ? valueAgentContractPath(params.workspace, params.agentId) : valueWorkspaceContractPath(params.workspace);
  return verifyValuePair(params.workspace, path);
}

export function appendValueEvents(workspace: string, events: ValueEvent[]): {
  path: string;
  sha256: string;
  count: number;
} {
  ensureValueDirs(workspace);
  if (events.length === 0) {
    const month = new Date().toISOString().slice(0, 7);
    const path = valueEventsMonthPath(workspace, month);
    ensureDir(dirname(path));
    if (!pathExists(path)) {
      writeFileAtomic(path, "", 0o644);
      writeFileAtomic(`${path}.sha256`, sha256Hex(""), 0o644);
    }
    return {
      path,
      sha256: readUtf8(`${path}.sha256`).trim(),
      count: 0
    };
  }

  const byMonth = new Map<string, ValueEvent[]>();
  for (const event of events) {
    const parsed = valueEventSchema.parse(event);
    const month = new Date(parsed.ts).toISOString().slice(0, 7);
    const rows = byMonth.get(month) ?? [];
    rows.push(parsed);
    byMonth.set(month, rows);
  }

  let lastPath = "";
  let lastSha = "";
  let count = 0;

  for (const [month, rows] of [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const path = valueEventsMonthPath(workspace, month);
    ensureDir(dirname(path));
    const existing = pathExists(path) ? readUtf8(path) : "";
    const lines = rows.map((row) => canonicalize(row));
    const next = existing + (existing.length > 0 && !existing.endsWith("\n") ? "\n" : "") + lines.join("\n") + "\n";
    writeFileAtomic(path, next, 0o644);
    const sha = sha256Hex(next);
    writeFileAtomic(`${path}.sha256`, sha, 0o644);
    lastPath = path;
    lastSha = sha;
    count += rows.length;
  }

  return {
    path: lastPath,
    sha256: lastSha,
    count
  };
}

function parseEventLine(line: string): ValueEvent | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return valueEventSchema.parse(JSON.parse(trimmed) as unknown);
  } catch {
    return null;
  }
}

export function readValueEvents(params: {
  workspace: string;
  scope: { type: "WORKSPACE" | "NODE" | "AGENT"; idHash?: string };
  idHash?: string;
  startTs?: number;
  endTs?: number;
}): ValueEvent[] {
  const dir = valueEventsDir(params.workspace);
  if (!pathExists(dir)) {
    return [];
  }
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => valueEventsMonthPath(params.workspace, entry.name))
    .filter((path) => pathExists(path))
    .sort((a, b) => a.localeCompare(b));

  const out: ValueEvent[] = [];
  for (const path of files) {
    const rows = readUtf8(path)
      .split(/\r?\n/)
      .map((line) => parseEventLine(line))
      .filter((row): row is ValueEvent => row !== null);
    out.push(...rows);
  }

  return out
    .filter((event) => {
      if (params.scope.idHash && event.scope.idHash !== params.scope.idHash) {
        return false;
      }
      if (params.idHash && event.scope.idHash !== params.idHash) {
        return false;
      }
      if (params.startTs && event.ts < params.startTs) {
        return false;
      }
      if (params.endTs && event.ts > params.endTs) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.ts - b.ts);
}

export function saveValueSnapshot(workspace: string, snapshot: ValueSnapshot): { path: string; sigPath: string; sha256: string } {
  const normalized = valueSnapshotSchema.parse(snapshot), path = valueSnapshotLatestPath(workspace, normalized.scope), payload = JSON.stringify(normalized, null, 2);
  return { ...publishOrgPairs(workspace, [{ path, bytes: Buffer.from(payload) }])[0]!, sha256: sha256Hex(payload) };
}

export function loadValueSnapshot(workspace: string, scope: { type: "WORKSPACE" | "NODE" | "AGENT"; id: string }): ValueSnapshot | null {
  const path = valueSnapshotLatestPath(workspace, scope);
  if (!pathExists(path)) {
    return null;
  }
  return valueSnapshotSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function verifyValueSnapshotSignature(workspace: string, scope: { type: "WORKSPACE" | "NODE" | "AGENT"; id: string }) {
  return verifyValuePair(workspace, valueSnapshotLatestPath(workspace, scope));
}

export function saveValueReport(workspace: string, report: ValueReport): { path: string; sigPath: string; sha256: string } {
  const normalized = valueReportSchema.parse(report), path = valueReportPath(workspace, normalized.scope, normalized.generatedTs), payload = JSON.stringify(normalized, null, 2);
  return { ...publishOrgPairs(workspace, [{ path, bytes: Buffer.from(payload) }])[0]!, sha256: sha256Hex(payload) };
}

export function listValueReports(workspace: string, scope: { type: "WORKSPACE" | "NODE" | "AGENT"; id: string }): ValueReport[] {
  const dir = dirname(valueReportPath(workspace, scope, Date.now()));
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => valueReportSchema.parse(JSON.parse(readUtf8(join(dir, name))) as unknown));
}

export function loadValueSchedulerState(workspace: string): ValueSchedulerState {
  const path = valueSchedulerPath(workspace);
  if (!pathExists(path)) {
    return defaultValueSchedulerState();
  }
  return valueSchedulerStateSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function saveValueSchedulerState(workspace: string, state: ValueSchedulerState): { path: string; sigPath: string } {
  return publishOrgPairs(workspace, [{ path: valueSchedulerPath(workspace), bytes: Buffer.from(JSON.stringify(valueSchedulerStateSchema.parse(state), null, 2)) }])[0]!;
}

export function verifyValueSchedulerSignature(workspace: string) {
  const path = valueSchedulerPath(workspace);
  if (!pathExists(path)) {
    return {
      valid: true,
      signatureExists: false,
      reason: null,
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifyValuePair(workspace, path);
}

/** Same-read, exact BUNDLE admission for migrated value consumers. */
function verifyValuePair(workspace: string, path: string) {
  try {
    const before = captureOrgPairs([path]), body = orgPairBytes(before, path), sidecar = orgPairBytes(before, `${path}.sig`);
    const verdict = body === null || sidecar === null ? { valid: false, reason: body === null ? "file missing" : "signature missing" }
      : verifyAuditorSignatureBytes(workspace, "BUNDLE", body, sidecar);
    return { ...verdict, signatureExists: sidecar !== null, path, sigPath: `${path}.sig` };
  } catch { return { valid: false, signatureExists: pathExists(`${path}.sig`), reason: "invalid value signed pair", path, sigPath: `${path}.sig` }; }
}
export async function saveValuePolicyAsync(workspace: string, policy: ValuePolicy, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  return (await publishOrgPairsAsync(workspace, [{ path: valuePolicyPath(workspace), bytes: Buffer.from(YAML.stringify(valuePolicySchema.parse(policy))) }], options, previous))[0]!;
}
export async function initValuePolicyAsync(workspace: string, options: OrgPairsOptions = {}) {
  const policy = defaultValuePolicy(), saved = await saveValuePolicyAsync(workspace, policy, options); return { ...saved, policy };
}
export async function loadValuePolicyAsync(workspace: string, options: OrgPairsOptions = {}): Promise<ValuePolicy> {
  if (!pathExists(valuePolicyPath(workspace))) return (await initValuePolicyAsync(workspace, options)).policy;
  return loadValuePolicy(workspace);
}
export async function saveValueContractAsync(params: { workspace: string; contract: ValueContract; agentId?: string | null }, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  const path = params.agentId ? valueAgentContractPath(params.workspace, params.agentId) : valueWorkspaceContractPath(params.workspace);
  return (await publishOrgPairsAsync(params.workspace, [{ path, bytes: Buffer.from(YAML.stringify(valueContractSchema.parse(params.contract))) }], options, previous))[0]!;
}
export async function saveValueSnapshotAsync(workspace: string, snapshot: ValueSnapshot, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  const normalized = valueSnapshotSchema.parse(snapshot), path = valueSnapshotLatestPath(workspace, normalized.scope), payload = JSON.stringify(normalized, null, 2);
  return { ...(await publishOrgPairsAsync(workspace, [{ path, bytes: Buffer.from(payload) }], options, previous))[0]!, sha256: sha256Hex(payload) };
}
export async function saveValueReportAsync(workspace: string, report: ValueReport, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  const normalized = valueReportSchema.parse(report), path = valueReportPath(workspace, normalized.scope, normalized.generatedTs), payload = JSON.stringify(normalized, null, 2);
  return { ...(await publishOrgPairsAsync(workspace, [{ path, bytes: Buffer.from(payload) }], options, previous))[0]!, sha256: sha256Hex(payload) };
}
export async function saveValueSchedulerStateAsync(workspace: string, state: ValueSchedulerState, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  return (await publishOrgPairsAsync(workspace, [{ path: valueSchedulerPath(workspace), bytes: Buffer.from(JSON.stringify(valueSchedulerStateSchema.parse(state), null, 2)) }], options, previous))[0]!;
}
/** The initializer signs all three exact legacy BUNDLE payloads before replacing its first pair. */
export async function initValueFilesRunAsync(workspace: string, contract: ValueContract, options: OrgPairsOptions = {}) {
  const policy = defaultValuePolicy();
  const paths = [valuePolicyPath(workspace), valueWorkspaceContractPath(workspace), valueSchedulerPath(workspace)], previous = captureOrgPairs(paths), scheduler = loadValueSchedulerState(workspace);
  assertOrgPairsCurrent(previous);
  const bytes = [YAML.stringify(valuePolicySchema.parse(policy)), YAML.stringify(valueContractSchema.parse(contract)), JSON.stringify(valueSchedulerStateSchema.parse(scheduler), null, 2)];
  const prepared = await prepareOrgPairsAsync(workspace, paths.map((path, index) => ({ path, bytes: Buffer.from(bytes[index]!) })), options, previous), saved = prepared.publish();
  return { result: { policy: { ...saved[0]!, policy }, workspaceContract: saved[1]!, scheduler: saved[2]! }, assertCurrent: prepared.assertCurrent };
}

/** Internal preparations keep their original signer gate available to actual compound callers. */
export async function prepareValuePolicyAsync(workspace: string, policy: ValuePolicy, options: OrgPairsOptions = {}) {
  const bytes = Buffer.from(YAML.stringify(valuePolicySchema.parse(policy)));
  const prepared = await prepareOrgPairsAsync(workspace, [{ path: valuePolicyPath(workspace), bytes }], options);
  return { assertCurrent: prepared.assertCurrent, sha256: sha256Hex(bytes), publish: () => prepared.publish()[0]! };
}
export async function prepareValueContractAsync(params: { workspace: string; contract: ValueContract; agentId?: string | null }, options: OrgPairsOptions = {}) {
  const path = params.agentId ? valueAgentContractPath(params.workspace, params.agentId) : valueWorkspaceContractPath(params.workspace);
  const prepared = await prepareOrgPairsAsync(params.workspace, [{ path, bytes: Buffer.from(YAML.stringify(valueContractSchema.parse(params.contract))) }], options);
  return { assertCurrent: prepared.assertCurrent, publish: () => prepared.publish()[0]! };
}
export async function prepareValueSnapshotAsync(workspace: string, snapshot: ValueSnapshot, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  const normalized = valueSnapshotSchema.parse(snapshot), path = valueSnapshotLatestPath(workspace, normalized.scope), payload = JSON.stringify(normalized, null, 2);
  const prepared = await prepareOrgPairsAsync(workspace, [{ path, bytes: Buffer.from(payload) }], options, previous);
  return { assertCurrent: prepared.assertCurrent, publish: () => ({ ...prepared.publish()[0]!, sha256: sha256Hex(payload) }) };
}
export async function prepareValueReportAsync(workspace: string, report: ValueReport, options: OrgPairsOptions = {}) {
  const normalized = valueReportSchema.parse(report), path = valueReportPath(workspace, normalized.scope, normalized.generatedTs), payload = JSON.stringify(normalized, null, 2);
  const prepared = await prepareOrgPairsAsync(workspace, [{ path, bytes: Buffer.from(payload) }], options);
  return { assertCurrent: prepared.assertCurrent, publish: () => ({ ...prepared.publish()[0]!, sha256: sha256Hex(payload) }) };
}

/** Read-only health/readiness path: missing policy never creates signed state before authorization. */
export function loadValuePolicyReadOnly(workspace: string): ValuePolicy {
  return valuePolicySchema.parse(YAML.parse(readUtf8(valuePolicyPath(workspace))) as unknown);
}

/** Retain an actual missing-policy initialization gate through the caller's later real output. */
export async function loadValuePolicyAttemptAsync(workspace: string, options: OrgPairsOptions = {}) {
  const original = captureOrgPairsAuthority(workspace, options.beforePublish);
  if (pathExists(valuePolicyPath(workspace))) return { policy: loadValuePolicyReadOnly(workspace), assertCurrent: original };
  const policy = defaultValuePolicy(), prepared = await prepareValuePolicyAsync(workspace, policy, { ...options, beforePublish: original }); prepared.publish();
  return { policy, assertCurrent: prepared.assertCurrent };
}

export async function initValueFilesAsync(workspace: string, contract: ValueContract, options: OrgPairsOptions = {}) {
  return (await initValueFilesRunAsync(workspace, contract, options)).result;
}
