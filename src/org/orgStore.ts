import { randomUUID } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { prepareFileSignatureWithAuditor, signSerializedPayloadWithAuditor, type SignedFileVerification } from "./orgSigner.js";
import { verifyAuditorSignatureBytes } from "./orgSignatureBytes.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { assertPolicySignerCurrent, describePolicySigner } from "../crypto/signing/signer.js";
import { capturePurposePublication } from "../keys/purposePublication.js";
import { assertKeysetComplete } from "../keys/keyset.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { canonicalize } from "../utils/json.js";
import { orgSchema, type OrgConfig, type OrgNodeType } from "./orgSchema.js";
import { assertValidOrgGraph } from "./orgValidator.js";

export function orgConfigPath(workspace: string): string {
  return join(workspace, ".amc", "org.yaml");
}

export function orgConfigSigPath(workspace: string): string {
  return `${orgConfigPath(workspace)}.sig`;
}

export function orgRootDir(workspace: string): string {
  return join(workspace, ".amc", "org");
}

export function orgScorecardsDir(workspace: string): string {
  return join(orgRootDir(workspace), "scorecards");
}

export function orgScorecardHistoryDir(workspace: string): string {
  return join(orgScorecardsDir(workspace), "history");
}

export function orgCommitmentsDir(workspace: string): string {
  return join(orgRootDir(workspace), "commitments");
}

export function defaultOrgConfig(enterpriseName = "AMC Enterprise"): OrgConfig {
  return {
    version: 1,
    enterpriseId: `ent_${randomUUID()}`,
    enterpriseName,
    nodes: [
      {
        id: "enterprise",
        type: "ENTERPRISE",
        name: enterpriseName,
        parentId: null
      },
      {
        id: "ecosystem",
        type: "ECOSYSTEM",
        name: "Partner Ecosystem",
        parentId: null
      }
    ],
    memberships: [],
    policies: {
      inheritance: {
        enabled: true
      },
      defaultsByNode: {}
    }
  };
}

export interface OrgConfigPublicationOptions { beforePublish?: () => void }
type OrgConfigResult = { path: string; sigPath: string; config: OrgConfig };
type FileState = { bytes: Buffer; mode: number };
type OrgPair = { body: FileState | null; sidecar: FileState | null };
function readOrgFile(path: string): FileState | null {
  try { return { bytes: readFileSync(path), mode: statSync(path).mode & 0o777 }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
function readOrgPair(path: string): OrgPair {
  return { body: readOrgFile(path), sidecar: readOrgFile(`${path}.sig`) };
}
const equalOrgFile = (a: FileState | null, b: FileState | null): boolean =>
  a === null ? b === null : b !== null && a.mode === b.mode && a.bytes.equals(b.bytes);
function normalizeOrgConfig(input: unknown): OrgConfig {
  const config = orgSchema.parse(input); assertValidOrgGraph(config); return config;
}
function configFromPair(workspace: string, pair: OrgPair): OrgConfig {
  if (pair.body === null && pair.sidecar === null) return defaultOrgConfig();
  if (pair.body === null || pair.sidecar === null
    || !verifyAuditorSignatureBytes(workspace, "BUNDLE", pair.body.bytes, pair.sidecar.bytes).valid) {
    throw new Error("org config pair is missing or invalid; restore the signed pair before editing");
  }
  return normalizeOrgConfig(YAML.parse(pair.body.bytes.toString("utf8")));
}
function orgPairPlan(workspace: string, beforePublish?: () => void) {
  const path = orgConfigPath(workspace);
  return { workspace, path, previous: readOrgPair(path), beforePublish };
}
function asyncOrgPairPlan(workspace: string, options: OrgConfigPublicationOptions) {
  const beforePublish = options.beforePublish; beforePublish?.();
  if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
  // Fix the original authority before reading any RMW input. Reuse the normal vault migration/lock gate.
  const descriptor = describePolicySigner(workspace, "BUNDLE"), policy = JSON.stringify(loadTrustConfig(workspace));
  const purpose = descriptor.mode === "VAULT" ? capturePurposePublication(workspace, "artifact-seal") : null;
  const keyset = purpose?.keyset ?? canonicalize(assertKeysetComplete(workspace));
  const plan = orgPairPlan(workspace, beforePublish);
  return { ...plan, assertOriginalCurrent() {
    assertPolicySignerCurrent(workspace, descriptor);
    if (JSON.stringify(loadTrustConfig(workspace)) !== policy || canonicalize(assertKeysetComplete(workspace)) !== keyset) {
      throw new Error("org config signing authority changed while preparing the edit");
    }
  } };
}
export class OrgConfigPublicationError extends Error {
  readonly code = "ORG_CONFIG_PARTIAL";
  constructor(readonly phase: "directories" | "body" | "signature", readonly publishedPaths: readonly string[], cause: unknown) {
    super("org config publication is incomplete; inspect the signed pair before retrying", { cause });
    this.name = "OrgConfigPublicationError";
  }
}
function publishOrgPair(plan: ReturnType<typeof orgPairPlan>, config: OrgConfig, bytes: Buffer, signatureBytes: string,
  assertCurrent: () => void, initialize: boolean): OrgConfigResult {
  return withControlFileLock({ root: join(plan.workspace, ".amc"), name: "org-config-pair", operation: () => {
    // Trusted caller continuation may only refuse. Run it before the fixed authority and pair gates.
    plan.beforePublish?.(); assertCurrent();
    const current = readOrgPair(plan.path);
    if (!equalOrgFile(current.body, plan.previous.body) || !equalOrgFile(current.sidecar, plan.previous.sidecar)) {
      throw new Error("org config pair changed while signing; retry");
    }
    const published: string[] = [];
    let phase: "directories" | "body" | "signature" = "directories";
    try {
      if (initialize) {
        ensureDir(orgRootDir(plan.workspace)); ensureDir(orgScorecardsDir(plan.workspace));
        ensureDir(orgScorecardHistoryDir(plan.workspace)); ensureDir(orgCommitmentsDir(plan.workspace));
      }
      phase = "body"; writeFileAtomic(plan.path, bytes, 0o644); published.push(".amc/org.yaml");
      phase = "signature"; writeFileAtomic(`${plan.path}.sig`, signatureBytes, 0o644); published.push(".amc/org.yaml.sig");
    } catch (error) { throw new OrgConfigPublicationError(phase, Object.freeze([...published]), error); }
    return { path: plan.path, sigPath: `${plan.path}.sig`, config };
  } });
}
function publishOrgConfigSync(plan: ReturnType<typeof orgPairPlan>, input: OrgConfig, initialize = false): OrgConfigResult {
  const config = normalizeOrgConfig(input), serialized = YAML.stringify(config), bytes = Buffer.from(serialized);
  const signatureBytes = JSON.stringify(signSerializedPayloadWithAuditor(plan.workspace, serialized), null, 2);
  // Preserve genuine unlocked synchronous no-sign compatibility; never publish an unrelated ephemeral signature.
  if (!verifyAuditorSignatureBytes(plan.workspace, "BUNDLE", bytes, Buffer.from(signatureBytes)).valid) {
    throw new Error("prepared org config signature is not authenticated");
  }
  return publishOrgPair(plan, config, bytes, signatureBytes, () => {}, initialize);
}
async function publishOrgConfigAsync(plan: ReturnType<typeof asyncOrgPairPlan>, input: OrgConfig,
  initialize = false): Promise<OrgConfigResult> {
  const config = normalizeOrgConfig(input), bytes = Buffer.from(YAML.stringify(config));
  const beforeSign = () => {
    plan.beforePublish?.(); plan.assertOriginalCurrent();
    const current = readOrgPair(plan.path);
    if (!equalOrgFile(current.body, plan.previous.body) || !equalOrgFile(current.sidecar, plan.previous.sidecar))
      throw new Error("org config pair changed while signing; retry");
  };
  const prepared = await prepareFileSignatureWithAuditor(plan.workspace, plan.path, bytes, "BUNDLE", beforeSign);
  return publishOrgPair(plan, config, bytes, prepared.signatureBytes, () => {
    plan.assertOriginalCurrent(); prepared.assertCurrent();
  }, initialize);
}

export function initOrgConfig(workspace: string, config?: OrgConfig,
  options: { enterpriseName?: string } = {}): OrgConfigResult {
  const plan = orgPairPlan(workspace), enterpriseName = options.enterpriseName;
  const next = config ?? (enterpriseName ? { ...configFromPair(workspace, plan.previous), enterpriseName } : defaultOrgConfig());
  return publishOrgConfigSync(plan, next, true);
}
export async function initOrgConfigAsync(workspace: string, config?: OrgConfig,
  options: OrgConfigPublicationOptions & { enterpriseName?: string } = {}): Promise<OrgConfigResult> {
  const copied = config === undefined ? undefined : normalizeOrgConfig(config), enterpriseName = options.enterpriseName;
  const plan = asyncOrgPairPlan(workspace, options);
  // The maintained init CLI renames an existing organization; authenticate that exact pair before deriving it.
  const next = copied ?? (enterpriseName ? { ...configFromPair(workspace, plan.previous), enterpriseName } : defaultOrgConfig());
  return publishOrgConfigAsync(plan, next, true);
}
export function loadOrgConfig(workspace: string): OrgConfig {
  const path = orgConfigPath(workspace);
  if (!pathExists(path)) return defaultOrgConfig();
  return normalizeOrgConfig(YAML.parse(readUtf8(path)));
}
export function verifyOrgConfigSignature(workspace: string): SignedFileVerification {
  const path = orgConfigPath(workspace), sigPath = `${path}.sig`;
  try {
    const pair = readOrgPair(path);
    if (pair.body === null) return { valid: false, signatureExists: false, reason: "file missing", path, sigPath };
    if (pair.sidecar === null) return { valid: false, signatureExists: false, reason: "signature missing", path, sigPath };
    return { ...verifyAuditorSignatureBytes(workspace, "BUNDLE", pair.body.bytes, pair.sidecar.bytes), signatureExists: true, path, sigPath };
  } catch { return { valid: false, signatureExists: pathExists(sigPath), reason: "org config signature read failed", path, sigPath }; }
}
export function saveOrgConfig(workspace: string, config: OrgConfig): OrgConfigResult {
  return publishOrgConfigSync(orgPairPlan(workspace), config);
}
export async function saveOrgConfigAsync(workspace: string, config: OrgConfig,
  options: OrgConfigPublicationOptions = {}): Promise<OrgConfigResult> {
  const copied = normalizeOrgConfig(config), plan = asyncOrgPairPlan(workspace, options);
  return publishOrgConfigAsync(plan, copied);
}

type AddOrgNodeInput = { workspace: string; id: string; type: OrgNodeType; name: string; parentId: string | null };
type AssignAgentInput = { workspace: string; agentId: string; nodeId: string; weight?: number };
type UnassignAgentInput = { workspace: string; agentId: string; nodeId: string };
function withOrgNode(config: OrgConfig, params: AddOrgNodeInput): OrgConfig {
  if (config.nodes.some(node => node.id === params.id)) throw new Error(`Node already exists: ${params.id}`);
  return { ...config, nodes: [...config.nodes, { id: params.id, type: params.type, name: params.name, parentId: params.parentId }] };
}
function withAgentAssigned(config: OrgConfig, params: AssignAgentInput): OrgConfig {
  if (!config.nodes.some(node => node.id === params.nodeId)) throw new Error(`Node not found: ${params.nodeId}`);
  const weight = params.weight ?? 1, memberships = [...config.memberships];
  const existingIndex = memberships.findIndex(row => row.agentId === params.agentId);
  if (existingIndex >= 0) {
    const row = memberships[existingIndex]!;
    memberships[existingIndex] = { ...row, nodeIds: [...new Set([...row.nodeIds, params.nodeId])], weight };
  } else memberships.push({ agentId: params.agentId, nodeIds: [params.nodeId], weight });
  return { ...config, memberships };
}
function withAgentUnassigned(config: OrgConfig, params: UnassignAgentInput): OrgConfig {
  const memberships = config.memberships.map(row => row.agentId !== params.agentId ? row
    : { ...row, nodeIds: row.nodeIds.filter(id => id !== params.nodeId) }).filter(row => row.nodeIds.length > 0);
  return { ...config, memberships };
}
export function addOrgNode(params: AddOrgNodeInput): OrgConfigResult {
  const input = { ...params }, plan = orgPairPlan(input.workspace);
  return publishOrgConfigSync(plan, withOrgNode(configFromPair(input.workspace, plan.previous), input));
}
export async function addOrgNodeAsync(params: AddOrgNodeInput, options: OrgConfigPublicationOptions = {}): Promise<OrgConfigResult> {
  const input = { ...params }, plan = asyncOrgPairPlan(input.workspace, options);
  return publishOrgConfigAsync(plan, withOrgNode(configFromPair(input.workspace, plan.previous), input));
}
export function assignAgentToNode(params: AssignAgentInput): OrgConfigResult {
  const input = { ...params }, plan = orgPairPlan(input.workspace);
  return publishOrgConfigSync(plan, withAgentAssigned(configFromPair(input.workspace, plan.previous), input));
}
export async function assignAgentToNodeAsync(params: AssignAgentInput, options: OrgConfigPublicationOptions = {}): Promise<OrgConfigResult> {
  const input = { ...params }, plan = asyncOrgPairPlan(input.workspace, options);
  return publishOrgConfigAsync(plan, withAgentAssigned(configFromPair(input.workspace, plan.previous), input));
}
export function unassignAgentFromNode(params: UnassignAgentInput): OrgConfigResult {
  const input = { ...params }, plan = orgPairPlan(input.workspace);
  return publishOrgConfigSync(plan, withAgentUnassigned(configFromPair(input.workspace, plan.previous), input));
}
export async function unassignAgentFromNodeAsync(params: UnassignAgentInput, options: OrgConfigPublicationOptions = {}): Promise<OrgConfigResult> {
  const input = { ...params }, plan = asyncOrgPairPlan(input.workspace, options);
  return publishOrgConfigAsync(plan, withAgentUnassigned(configFromPair(input.workspace, plan.previous), input));
}

export function memberWeightForNode(config: OrgConfig, agentId: string, nodeId: string): number {
  for (const membership of config.memberships) {
    if (membership.agentId === agentId && membership.nodeIds.includes(nodeId)) {
      return membership.weight;
    }
  }
  return 0;
}

export function nodeAgentIds(config: OrgConfig, nodeId: string): string[] {
  return config.memberships
    .filter((membership) => membership.nodeIds.includes(nodeId))
    .map((membership) => membership.agentId)
    .sort((a, b) => a.localeCompare(b));
}
