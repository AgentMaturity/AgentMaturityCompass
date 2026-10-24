import { captureAuditOutputAliases } from "./binderOutputAliases.js";
import { captureAuditPolicyMapPublication, AuditPolicyMapPublicationError, verifyAuditMapSelection } from "./auditPolicyMapPublication.js";
import { defaultAuditMapBuiltin } from "./auditMapBuiltin.js";
import { appendTransparencyEntryAttemptAsync, captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { TransparencyMerkleLagError } from "../transparency/merkleIndexState.js";
import { KeyProviderError } from "../keys/provider.js";
import { KeyRevokedError } from "../keys/keyRevocations.js";
import { captureOrgFiles, orgPairBytes, assertOrgPairsCurrent } from "../org/preparedOrgPairs.js";
import { captureAuditApiAuthority, captureBinderEvidenceRequest, captureBinderFulfillment, AuditBinderExecutionError } from "./binderRequestBoundary.js";
import { AuditBinderPublicationError, type AuditPublicationOptions } from "./binderPublication.js";
import { randomUUID } from "node:crypto";
import { join, relative, resolve } from "node:path";
import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { z } from "zod";
import { createApprovalForIntent, consumeApprovedExecution, verifyApprovalForExecution } from "../approvals/approvalEngine.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { auditMapSchema, type AuditMapFile } from "./auditMapSchema.js";
import { auditPolicySchema, defaultAuditPolicy, type AuditPolicy } from "./auditPolicySchema.js";
import {
  initAuditMaps, prepareAuditMapActiveAsync, loadAuditMapsAttemptAsync,
  loadAuditMapActive,
  loadAuditMapBuiltin,
  saveAuditMapActive,
  verifyAuditMapActiveSignature,
  verifyAuditMapBuiltinSignature
} from "./auditMapStore.js";
import {
  auditBindersExportsDir,
  initAuditPolicy, prepareAuditPolicyAsync, loadAuditPolicyAttemptAsync,
  loadAuditPolicy,
  saveAuditPolicy,
  verifyAuditPolicySignature
} from "./auditPolicyStore.js";
import {
  createAuditBinderArtifact,
  defaultAuditExportPath, defaultAuditPublicationPath,
  listExportedAuditBinders
} from "./binderArtifact.js";
import { verifyAuditBinderFile, verifyAuditWorkspace } from "./binderVerifier.js";
import { unreadableAuditResult, verifyIndustryPackAuditFile } from "../domains/industryPackAudit.js";
import { isWithin, safeIdSchema } from "../utils/pathSafety.js";
import { loadBinderCache } from "./binderStore.js";
import {
  createAuditEvidenceRequest, createAuditEvidenceRequestAsync,
  listAuditEvidenceRequests,
  markAuditEvidenceRequestFulfilled,
  rejectAuditEvidenceRequest, rejectAuditEvidenceRequestAsync,
  requestAuditEvidenceApproval
} from "./evidenceRequests.js";
import { evidenceRequestItemSchema } from "./evidenceRequestSchema.js";
import { auditSchedulerRunNow, auditSchedulerSetEnabled, auditSchedulerSetEnabledAsync, auditSchedulerStatus } from "./auditScheduler.js";
import type { TrustContext } from "../trust/trustContext.js";

const pendingExportSchema = z.object({
  v: z.literal(1),
  requestId: z.string().min(1),
  approvalRequestId: z.string().min(1),
  intentId: z.string().min(1),
  agentId: z.string().min(1),
  scopeType: z.enum(["WORKSPACE", "NODE", "AGENT"]),
  scopeId: z.string().min(1),
  outFile: z.string().min(1),
  evidenceRequestId: z.string().min(1).nullable().optional(),
  createdTs: z.number().int()
});

function pendingExportDir(workspace: string): string {
  return join(workspace, ".amc", "audit", "binders", "pending");
}

function pendingExportPath(workspace: string, approvalRequestId: string): string {
  return join(pendingExportDir(workspace), `${approvalRequestId}.json`);
}

function savePendingExport(workspace: string, pending: z.infer<typeof pendingExportSchema>): string {
  ensureDir(pendingExportDir(workspace));
  const path = pendingExportPath(workspace, pending.approvalRequestId);
  writeFileAtomic(path, JSON.stringify(pendingExportSchema.parse(pending), null, 2), 0o600);
  return path;
}

function removePendingExport(workspace: string, approvalRequestId: string): void {
  const path = pendingExportPath(workspace, approvalRequestId);
  if (pathExists(path)) {
    rmSync(path, { force: true });
  }
}

function parseScope(params: {
  scopeType?: string | null;
  scopeId?: string | null;
}): { scopeType: "WORKSPACE" | "NODE" | "AGENT"; scopeId: string } {
  const scopeTypeRaw = String(params.scopeType ?? "WORKSPACE").toUpperCase();
  const scopeType = scopeTypeRaw === "NODE" || scopeTypeRaw === "AGENT" ? scopeTypeRaw : "WORKSPACE";
  const scopeId = scopeType === "WORKSPACE" ? "workspace" : ((params.scopeId ?? "").trim() || "default");
  return {
    scopeType,
    scopeId
  };
}

export function auditInitForApi(workspace: string) {
  const policy = initAuditPolicy(workspace);
  const maps = initAuditMaps(workspace);
  return {
    policy,
    maps
  };
}

export function auditPolicyForApi(workspace: string): {
  policy: AuditPolicy;
  signature: ReturnType<typeof verifyAuditPolicySignature>;
} {
  return {
    policy: loadAuditPolicy(workspace),
    signature: verifyAuditPolicySignature(workspace)
  };
}

export function auditPolicyApplyForApi(params: {
  workspace: string;
  policy: unknown;
}) {
  const parsed = auditPolicySchema.parse(params.policy);
  const saved = saveAuditPolicy(params.workspace, parsed);
  const entry = appendTransparencyEntry({
    workspace: params.workspace,
    type: "AUDIT_POLICY_APPLIED",
    agentId: "workspace",
    artifact: {
      kind: "policy",
      sha256: sha256Hex(Buffer.from(canonicalize(parsed), "utf8")),
      id: "audit-policy"
    }
  });
  return {
    ...saved,
    transparencyHash: entry.hash
  };
}

export function auditMapListForApi(workspace: string): Array<{ id: string; name: string; source: "builtin" | "active" }> {
  const builtin = loadAuditMapBuiltin(workspace);
  const active = loadAuditMapActive(workspace);
  const rows: Array<{ id: string; name: string; source: "builtin" | "active" }> = [
    {
      id: builtin.auditMap.id,
      name: builtin.auditMap.name,
      source: "builtin"
    }
  ];
  if (active.auditMap.id !== builtin.auditMap.id || active.auditMap.name !== builtin.auditMap.name) {
    rows.push({
      id: active.auditMap.id,
      name: active.auditMap.name,
      source: "active"
    });
  } else {
    rows.push({
      id: active.auditMap.id,
      name: active.auditMap.name,
      source: "active"
    });
  }
  return rows;
}

export function auditMapShowForApi(params: {
  workspace: string;
  id?: "builtin" | "active";
}): {
  map: AuditMapFile;
  signatures: {
    builtin: ReturnType<typeof verifyAuditMapBuiltinSignature>;
    active: ReturnType<typeof verifyAuditMapActiveSignature>;
  };
} {
  const id = params.id ?? "active";
  return {
    map: id === "builtin" ? loadAuditMapBuiltin(params.workspace) : loadAuditMapActive(params.workspace),
    signatures: {
      builtin: verifyAuditMapBuiltinSignature(params.workspace),
      active: verifyAuditMapActiveSignature(params.workspace)
    }
  };
}

export function auditMapApplyForApi(params: {
  workspace: string;
  map: unknown;
}) {
  const parsed = auditMapSchema.parse(params.map);
  const saved = saveAuditMapActive(params.workspace, parsed);
  const entry = appendTransparencyEntry({
    workspace: params.workspace,
    type: "AUDIT_MAP_APPLIED",
    agentId: "workspace",
    artifact: {
      kind: "policy",
      sha256: sha256Hex(Buffer.from(canonicalize(parsed), "utf8")),
      id: parsed.auditMap.id
    }
  });
  return {
    ...saved,
    transparencyHash: entry.hash
  };
}

export function auditMapVerifyForApi(workspace: string) {
  return {
    builtin: verifyAuditMapBuiltinSignature(workspace),
    active: verifyAuditMapActiveSignature(workspace)
  };
}

export function auditReadinessGate(workspace: string): {
  ok: boolean;
  reasons: string[];
  warnings: string[];
} {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const policy = verifyAuditPolicySignature(workspace);
  if (!policy.valid) {
    reasons.push(`AUDIT_POLICY_UNTRUSTED:${policy.reason ?? "unknown"}`);
  }
  const activeMap = verifyAuditMapActiveSignature(workspace);
  if (!activeMap.valid) {
    reasons.push(`AUDIT_MAP_UNTRUSTED:${activeMap.reason ?? "unknown"}`);
  }
  const verify = verifyAuditWorkspace({ workspace });
  if (!verify.ok) {
    warnings.push(...verify.errors.map((row) => `AUDIT_VERIFY_WARN:${row}`));
  }
  return {
    ok: reasons.length === 0,
    reasons,
    warnings
  };
}

export async function auditBinderCreateForApi(params: {
  workspace: string;
  scopeType?: string | null;
  scopeId?: string | null;
  requestId?: string | null;
}, options: AuditPublicationOptions = {}) {
  try {
  params = { ...params }; options = { ...options };
  const scope = parseScope(params);
  const original = captureAuditApiAuthority(params.workspace, options), selected = captureBinderEvidenceRequest(params.workspace, params.requestId);
  const request = selected.request, beforePublish = () => { original(); selected.assertCurrent(); };
  const out = await auditSchedulerRunNow({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    request
  }, { beforePublish, assertInputsCurrent: options.assertInputsCurrent, assertPreparationInputsCurrent: options.assertPreparationInputsCurrent,
    assertOutputsSafe: paths => { options.assertOutputsSafe?.(paths); selected.assertOutputsSafe(paths); } });
  return {
    binder: out.binder,
    cache: out.cache,
    scheduler: out.scheduler,
    transparencyHash: out.transparencyHash
  };
  } catch (cause) { if (cause instanceof AuditBinderPublicationError || cause instanceof AuditBinderExecutionError || cause instanceof KeyProviderError || cause instanceof KeyRevokedError) throw cause;
    throw new AuditBinderPublicationError("api-prepare", [], [], cause); }

}

export async function auditBinderExportForApi(params: {
  workspace: string;
  scopeType?: string | null;
  scopeId?: string | null;
  outFile?: string | null;
  requestId?: string | null;
}, options: AuditPublicationOptions = {}) {
  try {
  params = { ...params }; options = { ...options };
  const original = captureAuditApiAuthority(params.workspace, options), scope = parseScope(params);
  const outFile = params.outFile?.trim() || defaultAuditPublicationPath({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId
  });
  const selected = captureBinderEvidenceRequest(params.workspace, params.requestId), request = selected.request;
  const beforePublish = () => { original(); selected.assertCurrent(); };
  return await createAuditBinderArtifact({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    outFile: resolve(params.workspace, outFile),
    request
  }, { beforePublish, assertInputsCurrent: options.assertInputsCurrent, assertPreparationInputsCurrent: options.assertPreparationInputsCurrent,
    assertOutputsSafe: paths => { options.assertOutputsSafe?.(paths); selected.assertOutputsSafe(paths); } });
  } catch (cause) { if (cause instanceof AuditBinderPublicationError || cause instanceof AuditBinderExecutionError || cause instanceof KeyProviderError || cause instanceof KeyRevokedError) throw cause;
    throw new AuditBinderPublicationError("api-prepare", [], [], cause); }

}

export function auditBinderExportRequestForApi(params: {
  workspace: string;
  agentId: string;
  /** Who raises the approval request (P1-78): the authenticated principal, or the CLI's self-reported OS user. */
  initiator: string;
  scopeType?: string | null;
  scopeId?: string | null;
  outFile?: string | null;
  requestId?: string | null;
}): {
  requestId: string;
  approvalRequestId: string;
  intentId: string;
} {
  const scope = parseScope(params);
  const outFile = params.outFile?.trim() || defaultAuditExportPath({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId
  });
  const requestId = `auditexp_${randomUUID().replace(/-/g, "")}`;
  const intentId = `audit-export-${requestId}`;
  const approval = createApprovalForIntent({
    workspace: params.workspace,
    initiator: params.initiator,
    agentId: params.agentId,
    intentId,
    toolName: "audit.binder.export",
    actionClass: "SECURITY",
    requestedMode: "EXECUTE",
    effectiveMode: "EXECUTE",
    riskTier: "high",
    intentPayload: {
      requestId,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      outFile: resolve(params.workspace, outFile),
      evidenceRequestId: params.requestId ?? null
    },
    leaseConstraints: {
      scopes: [],
      routeAllowlist: [],
      modelAllowlist: []
    }
  });
  savePendingExport(params.workspace, {
    v: 1,
    requestId,
    approvalRequestId: approval.approval.approvalRequestId,
    intentId,
    agentId: params.agentId,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    outFile: resolve(params.workspace, outFile),
    evidenceRequestId: params.requestId ?? null,
    createdTs: Date.now()
  });
  return {
    requestId,
    approvalRequestId: approval.approval.approvalRequestId,
    intentId
  };
}

export async function auditBinderExportExecuteForApi(params: {
  workspace: string;
  approvalRequestId: string;
}, options: AuditPublicationOptions = {}) {
  try {
  params = { ...params }; options = { ...options };
  const workspace = params.workspace, approvalRequestId = params.approvalRequestId, original = captureAuditApiAuthority(workspace, options);
  const path = pendingExportPath(workspace, approvalRequestId), before = captureOrgFiles([path]), bytes = orgPairBytes(before, path);
  if (bytes === null) throw new Error("pending audit export is missing");
  const pending = pendingExportSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
  if (pending.approvalRequestId !== approvalRequestId) throw new Error("audit export approval identity differs");
  const selected = captureBinderEvidenceRequest(workspace, pending.evidenceRequestId);
  const expectedIntentHash = sha256Hex(canonicalize({ requestId: pending.requestId, scopeType: pending.scopeType, scopeId: pending.scopeId,
    outFile: resolve(workspace, pending.outFile), evidenceRequestId: pending.evidenceRequestId ?? null }));
  const approval = { workspace, approvalId: pending.approvalRequestId, expectedAgentId: pending.agentId, expectedIntentId: pending.intentId,
    expectedIntentHash, expectedToolName: "audit.binder.export", expectedActionClass: "SECURITY" as const };
  const beforePublish = () => { original(); selected.assertCurrent(); assertOrgPairsCurrent(before);
    const verified = verifyApprovalForExecution(approval); if (!verified.ok) throw new Error("audit export approval is not executable");
    original(); selected.assertCurrent(); assertOrgPairsCurrent(before);
  };
  beforePublish(); let created: Awaited<ReturnType<typeof createAuditBinderArtifact>> | null = null, consumed: boolean | null = null, removed = false;
  try {
    created = await createAuditBinderArtifact({ workspace, scopeType: pending.scopeType, scopeId: pending.scopeId,
      outFile: pending.outFile, request: selected.request }, { beforePublish, assertInputsCurrent: options.assertInputsCurrent,
        assertPreparationInputsCurrent: options.assertPreparationInputsCurrent, assertOutputsSafe: paths => {
          options.assertOutputsSafe?.(paths); selected.assertOutputsSafe(paths); captureAuditOutputAliases(paths, [path])();
        } });
    beforePublish();
    const consumption = consumeApprovedExecution({ workspace, approvalId: pending.approvalRequestId, expectedAgentId: pending.agentId, executionId: pending.requestId });
    consumed = consumption.consumed && !consumption.replay;
    if (!consumed) throw new Error("audit export approval was not consumed by this execution");
    original(); selected.assertCurrent(); assertOrgPairsCurrent(before); removePendingExport(workspace, pending.approvalRequestId); removed = true;
    return created;
  } catch (cause) { if (created === null && (cause instanceof KeyProviderError || cause instanceof KeyRevokedError)) throw cause;
    throw new AuditBinderExecutionError("approved-export", created === null ? null : { outFile: created.outFile, sha256: created.sha256 }, consumed, removed, cause); }
  } catch (cause) { if (cause instanceof AuditBinderPublicationError || cause instanceof AuditBinderExecutionError || cause instanceof KeyProviderError || cause instanceof KeyRevokedError) throw cause;
    throw new AuditBinderPublicationError("api-prepare", [], [], cause); }

}

export function auditBindersForApi(workspace: string) {
  return {
    exports: listExportedAuditBinders(workspace),
    cache: {
      workspace: loadBinderCache({
        workspace,
        scopeType: "WORKSPACE",
        scopeId: "workspace"
      })
    }
  };
}

/**
 * The bytes of `file` when it is a regular, singly linked file whose real path lies under the workspace's own
 * `.amc/audit/binders/exports/` with no symbolic link on the way there (P0-55), read through one descriptor that is
 * re-checked against that path after opening; else null. A FIFO, device, hard link or swapped path reads nothing.
 */
function readExportedBinderBytes(workspace: string, file: string): Buffer | null {
  try {
    const root = join(realpathSync(workspace), ".amc", "audit", "binders", "exports");
    if (realpathSync(auditBindersExportsDir(workspace)) !== root) return null;
    // The real path must be the requested path re-rooted at the real exports dir: no link anywhere below exports.
    const unlinked = join(root, relative(resolve(auditBindersExportsDir(workspace)), file));
    const inside = () => {
      const real = realpathSync(file);
      return real === unlinked && isWithin(root, real) ? real : null;
    };
    const real = inside();
    if (real === null) return null;
    const fd = openSync(real, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const opened = fstatSync(fd);
      const again = inside();
      const now = again === null ? null : statSync(again);
      if (!opened.isFile() || opened.nlink !== 1 || now === null || now.dev !== opened.dev || now.ino !== opened.ino) return null;
      return readFileSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

/**
 * Studio's binder verify (P0-20): the route confines `file` to the binder exports directory by path, and only bytes
 * read under that directory's real path are verified (P0-55). A file reached through a link, or not a regular file,
 * reads as the same generic UNREADABLE as a missing one. A request never names a public key.
 */
export function auditBinderVerifyForApi(params: { file: string; workspace: string; trust: TrustContext }) {
  const file = resolve(params.file);
  const bytes = readExportedBinderBytes(params.workspace, file);
  if (bytes === null) return unreadableAuditResult(file, params.trust);
  return auditBinderVerifyFile({ file, bytes, workspace: params.workspace, trust: params.trust });
}

/** `amc audit binder verify`: the operator names any file, and may pin a key. */
export function auditBinderVerifyFile(params: {
  file: string;
  /** The file's bytes, already read; verified in place of re-reading `file`, which then only labels the report. */
  bytes?: Buffer;
  workspace?: string;
  publicKeyPath?: string;
  trust: TrustContext;
}) {
  const file = resolve(params.file);
  const publicKeyPath = params.publicKeyPath ? resolve(params.publicKeyPath) : undefined;
  // P0-20: a .json industry-pack audit verifies here too, under the same pinned trust as a binder.
  return verifyIndustryPackAuditFile({ file, bytes: params.bytes, publicKeyPath, trust: params.trust })
    ?? verifyAuditBinderFile({ file, bytes: params.bytes, workspace: params.workspace, publicKeyPath, trust: params.trust });
}

export function auditRequestCreateForApi(params: {
  workspace: string;
  scopeType?: string | null;
  scopeId?: string | null;
  requestedItems: Array<string | z.infer<typeof evidenceRequestItemSchema>>;
  requesterUserId: string;
}) {
  const scope = parseScope(params);
  return createAuditEvidenceRequest({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    requestedItems: params.requestedItems,
    requesterUserId: params.requesterUserId
  });
}

export function auditRequestListForApi(workspace: string) {
  return listAuditEvidenceRequests(workspace);
}

export function auditRequestApproveForApi(params: {
  workspace: string;
  requestId: string;
  agentId?: string;
  actorUserId: string;
  actorUsername: string;
  actorRoles: Array<"OWNER" | "AUDITOR" | "APPROVER" | "OPERATOR" | "VIEWER" | "AGENT">;
  reason: string;
}) {
  return requestAuditEvidenceApproval({
    workspace: params.workspace,
    requestId: params.requestId,
    agentId: params.agentId,
    actorUserId: params.actorUserId,
    actorUsername: params.actorUsername,
    actorRoles: params.actorRoles,
    reason: params.reason
  });
}

export function auditRequestRejectForApi(params: {
  workspace: string;
  requestId: string;
}) {
  return rejectAuditEvidenceRequest(params);
}

export async function auditRequestFulfillForApi(params: {
  workspace: string;
  requestId: string;
  outFile?: string | null;
}, options: AuditPublicationOptions = {}) {
  try {
  params = { ...params }; options = { ...options };
  const original = captureAuditApiAuthority(params.workspace, options), selected = captureBinderFulfillment(params.workspace, params.requestId, original);
  const request = selected.request;
  const scope = parseScope({
    scopeType: request.scope.type,
    scopeId: request.scope.id
  });
  const outFile = params.outFile?.trim() || defaultAuditPublicationPath({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId
  });
  const created = await createAuditBinderArtifact({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    outFile: resolve(params.workspace, outFile),
    request
  }, { beforePublish: selected.assertCurrent, assertInputsCurrent: options.assertInputsCurrent, assertPreparationInputsCurrent: options.assertPreparationInputsCurrent,
    assertOutputsSafe: paths => { options.assertOutputsSafe?.(paths); selected.assertOutputsSafe(paths); } });
  try {
  selected.assertCurrent();
  const fulfilled = markAuditEvidenceRequestFulfilled({
    workspace: params.workspace,
    requestId: request.requestId,
    binderSha256: created.sha256
  });
  return {
    request: fulfilled.request,
    approvalRequestId: fulfilled.approvalRequestId,
    export: created
  };
  } catch (cause) { throw new AuditBinderExecutionError("request-fulfillment", { outFile: created.outFile, sha256: created.sha256 }, null, false, cause); }
  } catch (cause) { if (cause instanceof AuditBinderPublicationError || cause instanceof AuditBinderExecutionError || cause instanceof KeyProviderError || cause instanceof KeyRevokedError) throw cause;
    throw new AuditBinderPublicationError("api-prepare", [], [], cause); }

}

export function auditSchedulerStatusForApi(workspace: string) {
  return auditSchedulerStatus(workspace);
}

export async function auditSchedulerRunNowForApi(params: {
  workspace: string;
  scopeType?: string | null;
  scopeId?: string | null;
}, options: AuditPublicationOptions = {}) {
  try {
  params = { ...params }; options = { ...options };
  const scope = parseScope(params);
  return await auditSchedulerRunNow({
    workspace: params.workspace,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId
  }, options);
  } catch (cause) { if (cause instanceof AuditBinderPublicationError || cause instanceof AuditBinderExecutionError || cause instanceof KeyProviderError || cause instanceof KeyRevokedError) throw cause;
    throw new AuditBinderPublicationError("api-prepare", [], [], cause); }

}

export function auditSchedulerEnableForApi(params: {
  workspace: string;
  enabled: boolean;
}) {
  return auditSchedulerSetEnabled(params);
}

export async function auditSchedulerEnableForApiAsync(params: Parameters<typeof auditSchedulerEnableForApi>[0], options: AuditPublicationOptions = {}) {
  try {
  return await auditSchedulerSetEnabledAsync(params, options);
  } catch (cause) { if (cause instanceof AuditBinderPublicationError || cause instanceof AuditBinderExecutionError || cause instanceof KeyProviderError || cause instanceof KeyRevokedError) throw cause;
    throw new AuditBinderPublicationError("api-prepare", [], [], cause); }

}

/** Explicit initialization prepares all three real recipes before replacing any member. */
export async function auditInitForApiAsync(workspace: string, options: AuditPublicationOptions = {}) {
  const policy = defaultAuditPolicy(), map = defaultAuditMapBuiltin();
  const prepared = await captureAuditPolicyMapPublication(workspace, { policy, builtin: map, active: map }, options).prepare();
  const saved = prepared.publish(); prepared.assertCurrent();
  return { policy: { ...saved.policy!, policy }, maps: { builtinPath: saved.builtin!.path, builtinSigPath: saved.builtin!.sigPath,
    activePath: saved.active!.path, activeSigPath: saved.active!.sigPath, map } };
}
export async function auditPolicyForApiAsync(workspace: string, options: AuditPublicationOptions = {}) {
  const selected = await loadAuditPolicyAttemptAsync(workspace, options); selected.assertCurrent();
  return { policy: selected.policy, signature: selected.verification() };
}
export async function auditMapListForApiAsync(workspace: string, options: AuditPublicationOptions = {}) {
  const selected = await loadAuditMapsAttemptAsync(workspace, "list", options); selected.assertCurrent();
  return [{ id: selected.builtin!.auditMap.id, name: selected.builtin!.auditMap.name, source: "builtin" as const },
    { id: selected.active!.auditMap.id, name: selected.active!.auditMap.name, source: "active" as const }];
}
export async function auditMapShowForApiAsync(params: Parameters<typeof auditMapShowForApi>[0], options: AuditPublicationOptions = {}) {
  const input = { ...params }, id = input.id ?? "active", selected = await loadAuditMapsAttemptAsync(input.workspace, id, options);
  selected.assertCurrent(); const signatures = { builtin: verifyAuditMapSelection(input.workspace, "builtin"), active: verifyAuditMapSelection(input.workspace, "active") };
  selected.assertCurrent(); return { map: selected.map, signatures };
}
export async function auditPolicyApplyForApiAsync(params: Parameters<typeof auditPolicyApplyForApi>[0], options: AuditPublicationOptions = {}) {
  const input = structuredClone(params), caller = { ...options }, parsed = auditPolicySchema.parse(input.policy);
  caller.beforePublish?.(); caller.assertInputsCurrent?.(); caller.assertPreparationInputsCurrent?.();
  const originalLog = captureWorkspaceLogAuthority(input.workspace), beforePublish = () => { caller.beforePublish?.(); originalLog.assertCurrent(); };
  const prepared = await prepareAuditPolicyAsync(input.workspace, parsed, { ...caller, beforePublish }), saved = prepared.publish().policy!;
  let hash: string | null = null;
  try {
    const stable = () => { prepared.assertCurrent(); originalLog.assertCurrent(); };
    const attempt = await appendTransparencyEntryAttemptAsync({ workspace: input.workspace, type: "AUDIT_POLICY_APPLIED", agentId: "workspace",
      artifact: { kind: "policy", sha256: sha256Hex(Buffer.from(canonicalize(parsed), "utf8")), id: "audit-policy" } }, { beforeCommit: stable, beforeMember: stable });
    hash = attempt.entry.hash; stable(); attempt.assertCurrent(); return { ...saved, transparencyHash: hash };
  } catch (cause) {
    if (cause instanceof TransparencyMerkleLagError) hash = cause.entryHash;
    throw new AuditPolicyMapPublicationError("policy-log", prepared.paths, hash === null ? [] : [hash], cause, prepared.createdDirectories, null, true);
  }
}
export async function auditMapApplyForApiAsync(params: Parameters<typeof auditMapApplyForApi>[0], options: AuditPublicationOptions = {}) {
  const input = structuredClone(params), caller = { ...options }, parsed = auditMapSchema.parse(input.map);
  caller.beforePublish?.(); caller.assertInputsCurrent?.(); caller.assertPreparationInputsCurrent?.();
  const originalLog = captureWorkspaceLogAuthority(input.workspace), beforePublish = () => { caller.beforePublish?.(); originalLog.assertCurrent(); };
  const prepared = await prepareAuditMapActiveAsync(input.workspace, parsed, { ...caller, beforePublish }), saved = prepared.publish().active!;
  let hash: string | null = null;
  try {
    const stable = () => { prepared.assertCurrent(); originalLog.assertCurrent(); };
    const attempt = await appendTransparencyEntryAttemptAsync({ workspace: input.workspace, type: "AUDIT_MAP_APPLIED", agentId: "workspace",
      artifact: { kind: "policy", sha256: sha256Hex(Buffer.from(canonicalize(parsed), "utf8")), id: parsed.auditMap.id } }, { beforeCommit: stable, beforeMember: stable });
    hash = attempt.entry.hash; stable(); attempt.assertCurrent(); return { ...saved, transparencyHash: hash };
  } catch (cause) {
    if (cause instanceof TransparencyMerkleLagError) hash = cause.entryHash;
    throw new AuditPolicyMapPublicationError("map-log", prepared.paths, hash === null ? [] : [hash], cause, prepared.createdDirectories, null, true);
  }
}

export function auditRequestCreateForApiAsync(params: Parameters<typeof auditRequestCreateForApi>[0], options: AuditPublicationOptions = {}) {
  const input = structuredClone(params), scope = parseScope(input);
  return createAuditEvidenceRequestAsync({ workspace: resolve(input.workspace), scopeType: scope.scopeType, scopeId: scope.scopeId,
    requestedItems: input.requestedItems, requesterUserId: input.requesterUserId }, { ...options });
}
export function auditRequestRejectForApiAsync(params: Parameters<typeof auditRequestRejectForApi>[0], options: AuditPublicationOptions = {}) {
  const requestId = safeIdSchema.parse(params.requestId); return rejectAuditEvidenceRequestAsync({ ...params, requestId, workspace: resolve(params.workspace) }, { ...options });
}
