import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { ACTION_CLASSES, isActionClass } from "../governor/actionCatalog.js";
import { actionPolicyPath, loadActionPolicy, verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import type { LeasePayload } from "../leases/leaseSchema.js";
import type { ActionClass } from "../types.js";

export interface StudioState {
  pid: number;
  startedTs: number;
  apiPort: number;
  gatewayPort: number;
  proxyPort: number;
  dashboardPort: number;
  metricsPort?: number;
  metricsHost?: string;
  host: string;
  lanEnabled?: boolean;
  pairingRequired?: boolean;
  currentAgent: string;
  vaultUnlocked: boolean;
  untrustedConfig: boolean;
  logFile: string;
  lastLease?: {
    agentId: string;
    leaseId: string;
    issuedTs: number;
    expiresTs: number;
  };
}

export function studioDir(workspace: string): string {
  return join(workspace, ".amc", "studio");
}

export function studioLogsDir(workspace: string): string {
  return join(studioDir(workspace), "logs");
}

export function studioSessionsDir(workspace: string): string {
  return join(studioDir(workspace), "sessions");
}

export function studioHumanAuditPath(workspace: string): string {
  return join(studioDir(workspace), "audit", "human.log");
}

function studioStatePath(workspace: string): string {
  return join(studioDir(workspace), "state.json");
}

function studioTokenPath(workspace: string): string {
  return join(studioDir(workspace), "admin.token");
}

function studioAgentTokenDir(workspace: string): string {
  return join(studioDir(workspace), "agent.tokens");
}

export function studioAgentTokenPath(workspace: string, agentId: string): string {
  return join(studioAgentTokenDir(workspace), `${agentId}.token`);
}

export function studioAgentTokenMetaPath(workspace: string, agentId: string): string {
  return join(studioAgentTokenDir(workspace), `${agentId}.token.meta.json`);
}

export function writeStudioState(workspace: string, state: StudioState): void {
  ensureDir(studioDir(workspace));
  writeFileAtomic(studioStatePath(workspace), JSON.stringify(state, null, 2), 0o644);
}

export function readStudioState(workspace: string): StudioState | null {
  const file = studioStatePath(workspace);
  if (!pathExists(file)) {
    return null;
  }
  return JSON.parse(readFileSync(file, "utf8")) as StudioState;
}

export function updateStudioLastLease(workspace: string, lease: {
  agentId: string;
  leaseId: string;
  issuedTs: number;
  expiresTs: number;
}): void {
  const current = readStudioState(workspace);
  if (!current) {
    return;
  }
  writeStudioState(workspace, {
    ...current,
    lastLease: lease
  });
}

export function clearStudioState(workspace: string): void {
  const file = studioStatePath(workspace);
  if (pathExists(file)) {
    rmSync(file, { force: true });
  }
}

export function ensureAdminToken(workspace: string): string {
  const tokenFile = studioTokenPath(workspace);
  ensureDir(studioDir(workspace));
  if (pathExists(tokenFile)) {
    return readFileSync(tokenFile, "utf8").trim();
  }
  const token = randomBytes(32).toString("hex");
  writeFileAtomic(tokenFile, `${token}\n`, 0o600);
  return token;
}

export function readAdminToken(workspace: string): string {
  const file = studioTokenPath(workspace);
  if (!pathExists(file)) {
    throw new Error("Studio admin token not found. Start studio with `amc up` first.");
  }
  return readFileSync(file, "utf8").trim();
}

/**
 * Capability scopes an agent bearer token may carry. A static token never grants
 * gateway, proxy, hook or wire scopes; those exist only on a signed lease.
 */
export const AGENT_TOKEN_SCOPES = ["toolhub:intent", "toolhub:execute", "governor:check", "receipt:verify"] as const;
export type AgentTokenScope = (typeof AGENT_TOKEN_SCOPES)[number];
const AGENT_TOKEN_META_VERSION = 2;

export type AgentTokenGrantSource =
  | { kind: "action-policy"; path: string; sigPath: string }
  | { kind: "lease"; leaseId: string; executeClassesFrom: "action-policy" | "none"; reason: string; path?: string; sigPath?: string }
  | { kind: "operator"; reason: string }
  | { kind: "legacy-unconditional"; reason: string };

export interface AgentTokenGrant {
  scopes: readonly string[];
  executeActionClasses: readonly ActionClass[];
  grantedBy: AgentTokenGrantSource;
}

export interface AgentTokenRecord {
  token: string;
  scopes: string[];
  executeActionClasses: ActionClass[];
  grantedBy: AgentTokenGrantSource;
}

export interface AgentTokenRefusal {
  kind: "action-policy" | "agent-token";
  path?: string;
  sigPath?: string;
  metaPath?: string;
  reason?: string;
  scopes?: readonly string[];
  executeActionClasses?: readonly ActionClass[];
  grantedBy?: AgentTokenGrantSource;
}

export class AgentTokenGrantError extends Error {
  constructor(message: string, readonly refusedBy: AgentTokenRefusal, readonly widen: string) {
    super(message);
    this.name = "AgentTokenGrantError";
  }
}

/** Names the signed policy an operator edits and the token files they re-issue. */
export function agentTokenWidenText(workspace: string, agentId: string, missing: string): string {
  return [
    `Widen by editing ${actionPolicyPath(workspace)} so the rule for ${missing} sets allowExecute: true,`,
    `re-sign it (signActionPolicy in src/governor/actionPolicyEngine.ts; \`amc policy action verify\` confirms),`,
    `then re-issue the agent token: remove ${studioAgentTokenPath(workspace, agentId)} and`,
    `${studioAgentTokenMetaPath(workspace, agentId)} so GET /agents mints a fresh token under the current signed policy,`,
    "or call issueAgentToken with an explicit operator grant."
  ].join(" ");
}

/** The signed action policy is the grant: no valid signature, no token. */
export function agentTokenGrantFromActionPolicy(workspace: string): AgentTokenGrant {
  const signature = verifyActionPolicySignature(workspace);
  if (!signature.valid) {
    const reason = signature.reason ?? "signature invalid";
    throw new AgentTokenGrantError(
      `agent token refused: action policy ${signature.path} ${reason}`,
      { kind: "action-policy", path: signature.path, sigPath: signature.sigPath, reason },
      `Restore a valid signature for ${signature.path} (signActionPolicy, or \`amc policy action init\` for a new policy) before any agent token is minted.`
    );
  }
  const policy = loadActionPolicy(workspace);
  const executeActionClasses = ACTION_CLASSES.filter((actionClass) =>
    policy.actions.some((rule) => rule.actionClass === actionClass && rule.allowExecute)
  );
  const proposable = policy.actions.length > 0;
  return {
    scopes: [
      ...(proposable ? (["toolhub:intent", "governor:check", "receipt:verify"] as const) : []),
      ...(executeActionClasses.length > 0 ? (["toolhub:execute"] as const) : [])
    ],
    executeActionClasses,
    grantedBy: { kind: "action-policy", path: signature.path, sigPath: signature.sigPath }
  };
}

/**
 * A lease's own scopes bound the token. leaseScopeSchema (src/leases/leaseSchema.ts)
 * is a closed enum with no per-action-class execute scope, so when the lease
 * grants toolhub:execute the classes come from the signed action policy.
 */
export function agentTokenGrantFromLease(workspace: string, lease: LeasePayload): AgentTokenGrant {
  const scopes = AGENT_TOKEN_SCOPES.filter((scope) => lease.scopes.includes(scope));
  if (!scopes.includes("toolhub:execute")) {
    return {
      scopes,
      executeActionClasses: [],
      grantedBy: { kind: "lease", leaseId: lease.leaseId, executeClassesFrom: "none", reason: "lease grants no toolhub:execute" }
    };
  }
  const policyGrant = agentTokenGrantFromActionPolicy(workspace);
  const source = policyGrant.grantedBy as { kind: "action-policy"; path: string; sigPath: string };
  return {
    scopes,
    executeActionClasses: policyGrant.executeActionClasses,
    grantedBy: {
      kind: "lease",
      leaseId: lease.leaseId,
      executeClassesFrom: "action-policy",
      path: source.path,
      sigPath: source.sigPath,
      reason: "leaseScopeSchema is a closed enum with no per-action-class execute scope; execute classes come from the signed action policy at issuance"
    }
  };
}

function writeAgentTokenMeta(metaPath: string, agentId: string, grant: AgentTokenGrant): void {
  writeFileAtomic(
    metaPath,
    JSON.stringify(
      {
        v: AGENT_TOKEN_META_VERSION,
        agentId,
        issuedTs: Date.now(),
        scopes: [...grant.scopes],
        executeActionClasses: [...grant.executeActionClasses],
        grantedBy: grant.grantedBy
      },
      null,
      2
    ),
    0o600
  );
}

/** Rotates the agent's token under an explicit grant. Never widens silently. */
export function issueAgentToken(workspace: string, agentId: string, grant: AgentTokenGrant): AgentTokenRecord & { tokenPath: string } {
  const dir = studioAgentTokenDir(workspace);
  ensureDir(dir);
  const tokenPath = studioAgentTokenPath(workspace, agentId);
  const metaPath = studioAgentTokenMetaPath(workspace, agentId);
  const token = randomBytes(32).toString("hex");
  writeFileAtomic(tokenPath, `${token}\n`, 0o600);
  writeAgentTokenMeta(metaPath, agentId, grant);
  return { ...readAgentToken(workspace, agentId), tokenPath };
}

/**
 * Returns the agent's token, minting one only under a grant. Without an explicit
 * grant the signed action policy grants; an existing token keeps the scopes it
 * was issued with even when the live policy has since widened.
 */
export function ensureAgentToken(workspace: string, agentId: string, grant?: AgentTokenGrant): AgentTokenRecord & { tokenPath: string } {
  const tokenPath = studioAgentTokenPath(workspace, agentId);
  const metaPath = studioAgentTokenMetaPath(workspace, agentId);
  if (pathExists(tokenPath)) {
    if (!pathExists(metaPath)) {
      writeAgentTokenMeta(metaPath, agentId, grant ?? agentTokenGrantFromActionPolicy(workspace));
    }
    return { ...readAgentToken(workspace, agentId), tokenPath };
  }
  return issueAgentToken(workspace, agentId, grant ?? agentTokenGrantFromActionPolicy(workspace));
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function readAgentToken(workspace: string, agentId: string): AgentTokenRecord {
  const tokenPath = studioAgentTokenPath(workspace, agentId);
  const metaPath = studioAgentTokenMetaPath(workspace, agentId);
  if (!pathExists(tokenPath) || !pathExists(metaPath)) {
    throw new Error(`Agent token not found for ${agentId}.`);
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
    v?: unknown; scopes?: unknown; executeActionClasses?: unknown; grantedBy?: unknown;
  };
  const token = readFileSync(tokenPath, "utf8").trim();
  const scopes = stringList(meta.scopes);
  if (meta.v !== AGENT_TOKEN_META_VERSION || typeof meta.grantedBy !== "object" || meta.grantedBy === null) {
    // A meta written before action-class grants existed granted every scope
    // unconditionally. It keeps its scopes on disk but covers no execute class.
    return {
      token,
      scopes,
      executeActionClasses: [],
      grantedBy: { kind: "legacy-unconditional", reason: "agent token meta predates action-class grants (v1); re-issue the token" }
    };
  }
  return {
    token,
    scopes,
    executeActionClasses: stringList(meta.executeActionClasses).filter(isActionClass),
    grantedBy: meta.grantedBy as AgentTokenGrantSource
  };
}

export function findAgentByToken(workspace: string, token: string): AgentTokenRecord & { agentId: string } | null {
  const dir = studioAgentTokenDir(workspace);
  if (!pathExists(dir)) {
    return null;
  }
  const files = readdirSync(dir).filter((name) => name.endsWith(".token"));
  for (const file of files) {
    const agentId = file.slice(0, -".token".length);
    try {
      const record = readAgentToken(workspace, agentId);
      if (record.token === token) {
        return { agentId, ...record };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function processRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
