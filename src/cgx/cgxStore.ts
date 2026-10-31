import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { pathExists, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { captureOrgPairsAuthority, captureOrgPairs, orgPairBytes, publishOrgPairs, publishOrgPairsAsync, prepareOrgPairsAsync, type OrgPairsOptions, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import {
  cgxContextPackSchema,
  cgxGraphSchema,
  cgxPolicySchema,
  type CgxContextPack,
  type CgxGraph,
  type CgxPolicy,
  type CgxScope
} from "./cgxSchema.js";

function cgxRoot(workspace: string): string {
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

export function saveCgxPolicy(workspace: string, policy: CgxPolicy): { path: string; sigPath: string } {
  return publishOrgPairs(workspace, [{ path: cgxPolicyPath(workspace), bytes: Buffer.from(YAML.stringify(cgxPolicySchema.parse(policy))) }])[0]!;
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
  return verifyCgxPair(workspace, path);
}

export function cgxPolicySha256(workspace: string): string {
  const path = cgxPolicyPath(workspace);
  if (!pathExists(path)) {
    return "0".repeat(64);
  }
  return sha256Hex(readFileSync(path));
}

export function saveCgxGraph(workspace: string, scope: CgxScope, graph: CgxGraph) {
  const normalized = cgxGraphSchema.parse(graph), payload = Buffer.from(JSON.stringify(normalized, null, 2));
  const latestPath = cgxLatestGraphPath(workspace, scope), snapshotPath = join(cgxSnapshotGraphDir(workspace, scope), `${normalized.generatedTs}.json`);
  const saved = publishOrgPairs(workspace, [{ path: latestPath, bytes: payload }, { path: snapshotPath, bytes: payload }]);
  return { latestPath, latestSigPath: saved[0]!.sigPath, snapshotPath, snapshotSigPath: saved[1]!.sigPath };
}

export function loadLatestCgxGraph(workspace: string, scope: CgxScope): CgxGraph | null {
  const path = cgxLatestGraphPath(workspace, scope);
  if (!pathExists(path)) {
    return null;
  }
  return cgxGraphSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function verifyLatestCgxGraph(workspace: string, scope: CgxScope) {
  return verifyCgxPair(workspace, cgxLatestGraphPath(workspace, scope));
}

export function saveCgxContextPack(workspace: string, agentId: string, pack: CgxContextPack) {
  return publishOrgPairs(workspace, [{ path: cgxLatestPackPath(workspace, agentId), bytes: Buffer.from(JSON.stringify(cgxContextPackSchema.parse(pack), null, 2)) }])[0]!;
}

export function loadLatestCgxContextPack(workspace: string, agentId: string): CgxContextPack | null {
  const path = cgxLatestPackPath(workspace, agentId);
  if (!pathExists(path)) {
    return null;
  }
  return cgxContextPackSchema.parse(JSON.parse(readUtf8(path)) as unknown);
}

export function verifyLatestCgxContextPack(workspace: string, agentId: string) {
  return verifyCgxPair(workspace, cgxLatestPackPath(workspace, agentId));
}

function verifyCgxPair(workspace: string, path: string) {
  try {
    const before = captureOrgPairs([path]), body = orgPairBytes(before, path), sidecar = orgPairBytes(before, `${path}.sig`);
    const verdict = body === null || sidecar === null ? { valid: false, reason: body === null ? "file missing" : "signature missing" }
      : verifyAuditorSignatureBytes(workspace, "BUNDLE", body, sidecar);
    return { ...verdict, signatureExists: sidecar !== null, path, sigPath: `${path}.sig` };
  } catch { return { valid: false, signatureExists: pathExists(`${path}.sig`), reason: "invalid CGX signed pair", path, sigPath: `${path}.sig` }; }
}
export async function saveCgxPolicyAsync(workspace: string, policy: CgxPolicy, options: OrgPairsOptions = {}, previous?: OrgPairsSnapshot) {
  return (await publishOrgPairsAsync(workspace, [{ path: cgxPolicyPath(workspace), bytes: Buffer.from(YAML.stringify(cgxPolicySchema.parse(policy))) }], options, previous))[0]!;
}
export async function initCgxPolicyAsync(workspace: string, options: OrgPairsOptions = {}) {
  const policy = defaultCgxPolicy(), saved = await saveCgxPolicyAsync(workspace, policy, options); return { ...saved, policy };
}
export async function loadCgxPolicyAsync(workspace: string, options: OrgPairsOptions = {}): Promise<CgxPolicy> {
  if (!pathExists(cgxPolicyPath(workspace))) return (await initCgxPolicyAsync(workspace, options)).policy;
  return loadCgxPolicy(workspace);
}

export async function prepareCgxGraphAsync(workspace: string, scope: CgxScope, graph: CgxGraph, options: OrgPairsOptions = {}) {
  const normalized = cgxGraphSchema.parse(graph), payload = Buffer.from(JSON.stringify(normalized, null, 2));
  const latestPath = cgxLatestGraphPath(workspace, scope), snapshotPath = join(cgxSnapshotGraphDir(workspace, scope), `${normalized.generatedTs}.json`);
  const prepared = await prepareOrgPairsAsync(workspace, [{ path: latestPath, bytes: payload }, { path: snapshotPath, bytes: payload }], options);
  return { assertCurrent: prepared.assertCurrent, publish() { const saved = prepared.publish();
    return { latestPath, latestSigPath: saved[0]!.sigPath, snapshotPath, snapshotSigPath: saved[1]!.sigPath }; } };
}
export async function prepareCgxContextPackAsync(workspace: string, agentId: string, pack: CgxContextPack, options: OrgPairsOptions = {}) {
  const prepared = await prepareOrgPairsAsync(workspace, [{ path: cgxLatestPackPath(workspace, agentId), bytes: Buffer.from(JSON.stringify(cgxContextPackSchema.parse(pack), null, 2)) }], options);
  return { assertCurrent: prepared.assertCurrent, publish: () => prepared.publish()[0]! };
}

export function loadCgxPolicyReadOnly(workspace: string): CgxPolicy {
  return cgxPolicySchema.parse(YAML.parse(readUtf8(cgxPolicyPath(workspace))) as unknown);
}

export async function loadCgxPolicyAttemptAsync(workspace: string, options: OrgPairsOptions = {}) {
  const original = captureOrgPairsAuthority(workspace, options.beforePublish);
  if (pathExists(cgxPolicyPath(workspace))) return { policy: loadCgxPolicyReadOnly(workspace), assertCurrent: original };
  const policy = defaultCgxPolicy(), prepared = await prepareOrgPairsAsync(workspace, [{ path: cgxPolicyPath(workspace), bytes: Buffer.from(YAML.stringify(policy)) }], { ...options, beforePublish: original });
  prepared.publish(); return { policy, assertCurrent: prepared.assertCurrent };
}
