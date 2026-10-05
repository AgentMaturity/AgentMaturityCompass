import { dirname, join } from "node:path";
import { readdirSync } from "node:fs";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import {
  advisorySchema,
  forecastArtifactSchema,
  forecastPolicySchema,
  forecastSchedulerStateSchema,
  type AdvisoryRecord,
  type ForecastArtifact,
  type ForecastPolicy,
  type ForecastScope,
  type ForecastSchedulerState
} from "./forecastSchema.js";

export function forecastRoot(workspace: string): string {
  return join(workspace, ".amc", "forecast");
}

export function forecastPolicyPath(workspace: string): string {
  return join(forecastRoot(workspace), "policy.yaml");
}

export function forecastPolicySigPath(workspace: string): string {
  return `${forecastPolicyPath(workspace)}.sig`;
}

export function forecastScopeLatestPath(workspace: string, scope: ForecastScope): string {
  const normalized =
    scope.type === "WORKSPACE"
      ? join(forecastRoot(workspace), "scopes", "workspace", "latest.json")
      : scope.type === "AGENT"
        ? join(forecastRoot(workspace), "scopes", "agents", scope.id, "latest.json")
        : join(forecastRoot(workspace), "scopes", "nodes", scope.id, "latest.json");
  return normalized;
}

export function forecastScopeSnapshotsDir(workspace: string, scope: ForecastScope): string {
  const segment =
    scope.type === "WORKSPACE"
      ? "workspace"
      : scope.type === "AGENT"
        ? `agents/${scope.id}`
        : `nodes/${scope.id}`;
  return join(forecastRoot(workspace), "snapshots", segment);
}

export function forecastAdvisoriesDir(workspace: string): string {
  return join(forecastRoot(workspace), "advisories");
}

export function forecastAdvisoryPath(workspace: string, advisoryId: string): string {
  return join(forecastAdvisoriesDir(workspace), `${advisoryId}.json`);
}

export function forecastSchedulerPath(workspace: string): string {
  return join(forecastRoot(workspace), "scheduler.json");
}

export function defaultForecastSchedulerState(): ForecastSchedulerState {
  return forecastSchedulerStateSchema.parse({
    enabled: true,
    lastRefreshTs: null,
    nextRefreshTs: null,
    lastOutcome: {
      status: "OK",
      reason: ""
    }
  });
}

export function loadForecastSchedulerState(workspace: string): ForecastSchedulerState {
  const path = forecastSchedulerPath(workspace);
  if (!pathExists(path)) {
    return defaultForecastSchedulerState();
  }
  return forecastSchedulerStateSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function saveForecastSchedulerState(workspace: string, state: ForecastSchedulerState): {
  path: string;
  sigPath: string;
} {
  ensureDir(forecastRoot(workspace));
  const path = forecastSchedulerPath(workspace);
  writeFileAtomic(path, JSON.stringify(forecastSchedulerStateSchema.parse(state), null, 2), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
}

export function saveForecastPolicy(workspace: string, policy: ForecastPolicy): {
  path: string;
  sigPath: string;
} {
  ensureDir(forecastRoot(workspace));
  const path = forecastPolicyPath(workspace);
  writeFileAtomic(path, YAML.stringify(forecastPolicySchema.parse(policy)), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
}

export function loadForecastPolicy(workspace: string): ForecastPolicy {
  const path = forecastPolicyPath(workspace);
  if (!pathExists(path)) {
    throw new Error(`forecast policy not found: ${path}`);
  }
  return forecastPolicySchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function verifyForecastPolicySignature(workspace: string): ReturnType<typeof verifySignedFileWithAuditor> {
  return verifySignedFileWithAuditor(workspace, forecastPolicyPath(workspace));
}

export function saveForecastArtifact(workspace: string, scope: ForecastScope, forecast: ForecastArtifact): {
  latestPath: string;
  latestSigPath: string;
  snapshotPath: string;
  snapshotSigPath: string;
  snapshotSha256: string;
} {
  ensureDir(forecastRoot(workspace));
  const latestPath = forecastScopeLatestPath(workspace, scope);
  ensureDir(dirname(latestPath));
  const normalized = forecastArtifactSchema.parse(forecast);
  const payload = JSON.stringify(normalized, null, 2);
  writeFileAtomic(latestPath, payload, 0o644);
  const latestSigPath = signFileWithAuditor(workspace, latestPath);

  const snapshotDir = forecastScopeSnapshotsDir(workspace, scope);
  ensureDir(snapshotDir);
  const snapshotPath = join(snapshotDir, `${normalized.generatedTs}.json`);
  writeFileAtomic(snapshotPath, payload, 0o644);
  const snapshotSigPath = signFileWithAuditor(workspace, snapshotPath);

  return {
    latestPath,
    latestSigPath,
    snapshotPath,
    snapshotSigPath,
    snapshotSha256: sha256Hex(payload)
  };
}

export function loadLatestForecastArtifact(workspace: string, scope: ForecastScope): ForecastArtifact | null {
  const path = forecastScopeLatestPath(workspace, scope);
  if (!pathExists(path)) {
    return null;
  }
  return forecastArtifactSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function verifyLatestForecastArtifact(workspace: string, scope: ForecastScope): ReturnType<typeof verifySignedFileWithAuditor> {
  return verifySignedFileWithAuditor(workspace, forecastScopeLatestPath(workspace, scope));
}

export function saveAdvisory(workspace: string, advisory: AdvisoryRecord): {
  path: string;
  sigPath: string;
} {
  ensureDir(forecastAdvisoriesDir(workspace));
  const path = forecastAdvisoryPath(workspace, advisory.advisoryId);
  writeFileAtomic(path, JSON.stringify(advisorySchema.parse(advisory), null, 2), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
}

export function loadAdvisory(workspace: string, advisoryId: string): AdvisoryRecord | null {
  const path = forecastAdvisoryPath(workspace, advisoryId);
  if (!pathExists(path)) {
    return null;
  }
  const verify = verifySignedFileWithAuditor(workspace, path);
  if (!verify.valid) {
    throw new Error(`advisory signature invalid: ${verify.reason ?? "unknown"}`);
  }
  return advisorySchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function listAdvisories(workspace: string): AdvisoryRecord[] {
  const dir = forecastAdvisoriesDir(workspace);
  if (!pathExists(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const path = join(dir, name);
      const verify = verifySignedFileWithAuditor(workspace, path);
      if (!verify.valid) {
        throw new Error(`advisory signature invalid for ${name}: ${verify.reason ?? "unknown"}`);
      }
      return advisorySchema.parse(JSON.parse(readUtf8(path)) as unknown);
    });
}
