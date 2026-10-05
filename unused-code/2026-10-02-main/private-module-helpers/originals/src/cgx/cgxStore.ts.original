import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { signFileWithAuditor, verifySignedFileWithAuditor } from "../org/orgSigner.js";
import {
  cgxContextPackSchema,
  cgxGraphSchema,
  cgxPolicySchema,
  type CgxContextPack,
  type CgxGraph,
  type CgxPolicy,
  type CgxScope
} from "./cgxSchema.js";

export function cgxRoot(workspace: string): string {
  return join(workspace, ".amc", "cgx");
}

export function cgxPolicyPath(workspace: string): string {
  return join(cgxRoot(workspace), "policy.yaml");
}

export function cgxPolicySigPath(workspace: string): string {
  return `${cgxPolicyPath(workspace)}.sig`;
}

function scopeSegment(scope: CgxScope): string {
  return scope.type === "workspace" ? "workspace" : `agents/${scope.id}`;
}

export function cgxLatestGraphPath(workspace: string, scope: CgxScope): string {
  return join(cgxRoot(workspace), "graphs", scopeSegment(scope), "latest.json");
}

export function cgxSnapshotGraphDir(workspace: string, scope: CgxScope): string {
  return join(cgxRoot(workspace), "snapshots", scopeSegment(scope));
}

export function cgxLatestPackPath(workspace: string, agentId: string): string {
  return join(cgxRoot(workspace), "packs", "agents", agentId, "latest.pack.json");
}

export function defaultCgxPolicy(): CgxPolicy {
  return cgxPolicySchema.parse({
    cgxPolicy: {
      version: 1,
      buildCadenceHours: 24,
      rebuildOnEvents: [
        "POLICY_APPLIED",
        "PLUGIN_INSTALLED",
        "APPROVAL_DECIDED",
        "DIAGNOSTIC_COMPLETED",
        "FORECAST_CREATED",
        "BENCH_CREATED"
      ],
      maxGraphNodes: 50_000,
      pruning: {
        maxEdges: 120_000,
        maxEvidenceRefsPerNode: 16
      },
      privacy: {
        hashAgentIds: true,
        hashWorkspaceId: true,
        noSecrets: true
      },
      evidenceGates: {
        minIntegrityIndex: 0.85,
        minCorrelationRatio: 0.9
      }
    }
  });
}

export function saveCgxPolicy(workspace: string, policy: CgxPolicy): {
  path: string;
  sigPath: string;
} {
  ensureDir(cgxRoot(workspace));
  const path = cgxPolicyPath(workspace);
  writeFileAtomic(path, YAML.stringify(cgxPolicySchema.parse(policy)), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
}

export function initCgxPolicy(workspace: string): {
  path: string;
  sigPath: string;
  policy: CgxPolicy;
} {
  const policy = defaultCgxPolicy();
  const saved = saveCgxPolicy(workspace, policy);
  return {
    ...saved,
    policy
  };
}

export function loadCgxPolicy(workspace: string): CgxPolicy {
  const path = cgxPolicyPath(workspace);
  if (!pathExists(path)) {
    return initCgxPolicy(workspace).policy;
  }
  return cgxPolicySchema.parse(YAML.parse(readUtf8(path)) as unknown);
}

export function verifyCgxPolicySignature(workspace: string) {
  const path = cgxPolicyPath(workspace);
  if (!pathExists(path)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "cgx policy missing",
      path,
      sigPath: `${path}.sig`
    };
  }
  return verifySignedFileWithAuditor(workspace, path);
}

export function cgxPolicySha256(workspace: string): string {
  const path = cgxPolicyPath(workspace);
  if (!pathExists(path)) {
    return "0".repeat(64);
  }
  return sha256Hex(readFileSync(path));
}

export function saveCgxGraph(workspace: string, scope: CgxScope, graph: CgxGraph): {
  latestPath: string;
  latestSigPath: string;
  snapshotPath: string;
  snapshotSigPath: string;
} {
  const latestPath = cgxLatestGraphPath(workspace, scope);
  ensureDir(dirname(latestPath));
  const normalized = cgxGraphSchema.parse(graph);
  const payload = JSON.stringify(normalized, null, 2);
  writeFileAtomic(latestPath, payload, 0o644);
  const latestSigPath = signFileWithAuditor(workspace, latestPath);

  const snapshots = cgxSnapshotGraphDir(workspace, scope);
  ensureDir(snapshots);
  const snapshotPath = join(snapshots, `${normalized.generatedTs}.json`);
  writeFileAtomic(snapshotPath, payload, 0o644);
  const snapshotSigPath = signFileWithAuditor(workspace, snapshotPath);

  return {
    latestPath,
    latestSigPath,
    snapshotPath,
    snapshotSigPath
  };
}

export function loadLatestCgxGraph(workspace: string, scope: CgxScope): CgxGraph | null {
  const path = cgxLatestGraphPath(workspace, scope);
  if (!pathExists(path)) {
    return null;
  }
  return cgxGraphSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function verifyLatestCgxGraph(workspace: string, scope: CgxScope) {
  return verifySignedFileWithAuditor(workspace, cgxLatestGraphPath(workspace, scope));
}

export function saveCgxContextPack(workspace: string, agentId: string, pack: CgxContextPack): {
  path: string;
  sigPath: string;
} {
  const path = cgxLatestPackPath(workspace, agentId);
  ensureDir(dirname(path));
  writeFileAtomic(path, JSON.stringify(cgxContextPackSchema.parse(pack), null, 2), 0o644);
  const sigPath = signFileWithAuditor(workspace, path);
  return { path, sigPath };
}

export function loadLatestCgxContextPack(workspace: string, agentId: string): CgxContextPack | null {
  const path = cgxLatestPackPath(workspace, agentId);
  if (!pathExists(path)) {
    return null;
  }
  return cgxContextPackSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function verifyLatestCgxContextPack(workspace: string, agentId: string) {
  return verifySignedFileWithAuditor(workspace, cgxLatestPackPath(workspace, agentId));
}
