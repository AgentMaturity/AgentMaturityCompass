import { dirname, join } from "node:path";
import { readdirSync } from "node:fs";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
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

export function valueRoot(workspace: string): string {
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

export function valueEventsMonthPath(workspace: string, month: string): string {
  return join(valueEventsDir(workspace), `${month}`, "events.ndjson");
}

export function valueSnapshotsDir(workspace: string): string {
  return join(valueRoot(workspace), "snapshots");
}

export function valueReportsDir(workspace: string): string {
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

export function valueReportPath(workspace: string, scope: { type: "WORKSPACE" | "NODE" | "AGENT"; id: string }, ts: number): string {
  return join(valueReportsDir(workspace), scopeSegment(scope), `${ts}.json`);
}

export function ensureValueDirs(workspace: string): void {
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

export function saveValuePolicy(workspace: string, policy: ValuePolicy): {
  path: string;
  sigPath: string;
} {
  ensureValueDirs(workspace);
  const path = valuePolicyPath(workspace);
  writeFileAtomic(path, YAML.stringify(valuePolicySchema.parse(policy)), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return {
    path,
    sigPath
  };
}

export function verifyValuePolicySignature(workspace: string) {
  return verifySignedFileWithAuditor(workspace, valuePolicyPath(workspace));
}

export function saveValueContract(params: {
  workspace: string;
  contract: ValueContract;
  agentId?: string | null;
}): {
  path: string;
  sigPath: string;
} {
  ensureValueDirs(params.workspace);
  const normalized = valueContractSchema.parse(params.contract);
  const path = params.agentId ? valueAgentContractPath(params.workspace, params.agentId) : valueWorkspaceContractPath(params.workspace);
  ensureDir(dirname(path));
  writeFileAtomic(path, YAML.stringify(normalized), 0o644);
  const sigPath = signFileWithAuditor(params.workspace, path);
  return {
    path,
    sigPath
  };
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
  return verifySignedFileWithAuditor(params.workspace, path);
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

export function saveValueSnapshot(workspace: string, snapshot: ValueSnapshot): {
  path: string;
  sigPath: string;
  sha256: string;
} {
  ensureValueDirs(workspace);
  const normalized = valueSnapshotSchema.parse(snapshot);
  const path = valueSnapshotLatestPath(workspace, normalized.scope);
  ensureDir(dirname(path));
  const payload = JSON.stringify(normalized, null, 2);
  writeFileAtomic(path, payload, 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return {
    path,
    sigPath,
    sha256: sha256Hex(payload)
  };
}

export function loadValueSnapshot(workspace: string, scope: { type: "WORKSPACE" | "NODE" | "AGENT"; id: string }): ValueSnapshot | null {
  const path = valueSnapshotLatestPath(workspace, scope);
  if (!pathExists(path)) {
    return null;
  }
  return valueSnapshotSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function verifyValueSnapshotSignature(workspace: string, scope: { type: "WORKSPACE" | "NODE" | "AGENT"; id: string }) {
  return verifySignedFileWithAuditor(workspace, valueSnapshotLatestPath(workspace, scope));
}

export function saveValueReport(workspace: string, report: ValueReport): {
  path: string;
  sigPath: string;
  sha256: string;
} {
  ensureValueDirs(workspace);
  const normalized = valueReportSchema.parse(report);
  const path = valueReportPath(workspace, normalized.scope, normalized.generatedTs);
  ensureDir(dirname(path));
  const payload = JSON.stringify(normalized, null, 2);
  writeFileAtomic(path, payload, 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return {
    path,
    sigPath,
    sha256: sha256Hex(payload)
  };
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

export function saveValueSchedulerState(workspace: string, state: ValueSchedulerState): {
  path: string;
  sigPath: string;
} {
  ensureValueDirs(workspace);
  const path = valueSchedulerPath(workspace);
  writeFileAtomic(path, JSON.stringify(valueSchedulerStateSchema.parse(state), null, 2), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return {
    path,
    sigPath
  };
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
  return verifySignedFileWithAuditor(workspace, path);
}
