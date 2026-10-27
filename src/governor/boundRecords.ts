/**
 * Signed, approval-bound governance records (P2-24): scoped exceptions, break-glass records and review records.
 *
 * Each record is approved before it exists. Its draft (every field but `approval`) is digested, the digest is raised
 * as an approval request whose intent is `{ kind, digest }`, and only decisions bound to that exact request
 * (`expectedRequestDigestSha256`) count. The finished record is signed with a domain-separated artifact signature
 * through the awaitable policy signer and written under `.amc/governor/`. There is no unsigned fallback: a missing
 * key refuses the operation. A signature proves AMC recorded the approved draft unchanged, not that it was justified.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { boundApprovalSchema, type BoundApproval } from "../contracts/v1/governanceRecords.js";
import { approvalRequestBindingDigest, inspectApprovalChainIntegrity, listApprovalDecisions, loadApprovalRequestRecord } from "../approvals/approvalChainStore.js";
import { consumeApprovedExecution, createApprovalForIntentAsync, verifyApprovalForExecution } from "../approvals/approvalEngine.js";
import { readAndVerifyArtifactFileSignature, signArtifactBytesAsync, verifyArtifactBytesSignature, type ArtifactSignature } from "../lifecycle/artifactSignature.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type BoundRecordKind = "scoped-exception" | "break-glass" | "review-record";

export type { BoundApproval };

/** Governance deviations are approved under the signed policy's SECURITY rule (roles, quorum, distinct users, TTL). */
const APPROVAL_CLASS = "SECURITY" as const;
const toolNameFor = (kind: BoundRecordKind): string => `amc.governor.${kind}`;

export class BoundRecordError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "BoundRecordError";
  }
}

/** sha256 of the canonical draft: the record without its `approval` field. */
export function draftDigest(record: object): string {
  const { approval: _approval, ...draft } = record as Record<string, unknown>;
  return sha256Hex(canonicalize(draft));
}

const intentHash = (kind: BoundRecordKind, digest: string): string => sha256Hex(canonicalize({ kind, digest }));

/**
 * Raise the approval a draft needs. The requester is excluded when the decisions are counted (assertRecordApproved), not
 * recorded as the request's initiator: the native CLI's bound decision (`--expect-request-digest`) checks a digest that
 * covers the whole request, which only equals the binding digest for a request without one.
 */
export async function raiseRecordApproval(workspace: string, input: {
  kind: BoundRecordKind; recordId: string; digest: string; agentId: string;
}): Promise<BoundApproval> {
  const created = await createApprovalForIntentAsync({ workspace, agentId: input.agentId, intentId: `${input.kind}:${input.recordId}`,
    toolName: toolNameFor(input.kind), actionClass: APPROVAL_CLASS, requestedMode: "EXECUTE", effectiveMode: "EXECUTE",
    riskTier: "critical", intentPayload: { kind: input.kind, digest: input.digest } });
  const request = created.result.request;
  return { agentId: request.agentId, approvalRequestId: request.approvalRequestId, requestBindingDigest: approvalRequestBindingDigest(request) };
}

/** The binding of an existing approval request, as an operator names it by id (CLI activation). */
export function boundApprovalFor(workspace: string, agentId: string, approvalRequestId: string): BoundApproval {
  const request = loadApprovalRequestRecord({ workspace, agentId, approvalRequestId, requireValidSignature: true });
  return boundApprovalSchema.parse({ agentId: request.agentId, approvalRequestId: request.approvalRequestId, requestBindingDigest: approvalRequestBindingDigest(request) });
}

/** The signed request, if it is the one this record's kind and digest raised. */
function boundRequest(workspace: string, approval: BoundApproval, kind: BoundRecordKind, digest: string) {
  const request = loadApprovalRequestRecord({ workspace, agentId: approval.agentId, approvalRequestId: approval.approvalRequestId, requireValidSignature: true });
  if (request.toolName !== toolNameFor(kind) || request.actionClass !== APPROVAL_CLASS || request.boundHashes.intentHash !== intentHash(kind, digest)
    || approvalRequestBindingDigest(request) !== approval.requestBindingDigest) {
    throw new BoundRecordError("approval_mismatch", `approval ${approval.approvalRequestId} was not raised for this ${kind}`);
  }
  if (!inspectApprovalChainIntegrity({ workspace, agentId: request.agentId, approvalRequestId: request.approvalRequestId }).valid) {
    throw new BoundRecordError("approval_mismatch", `approval ${approval.approvalRequestId} fails its chain integrity check`);
  }
  return request;
}

/**
 * Before signing: the approval must be granted for exactly this draft. `single` (break-glass) needs one bound approving
 * decision from an allowed role and no denial; `quorum` needs the signed rule's quorum, every counted decision bound,
 * and spends the approval so it approves one record. Neither counts the initiator, and neither accepts zero approvers.
 */
export function assertRecordApproved(workspace: string, approval: BoundApproval, input: {
  kind: BoundRecordKind; recordId: string; digest: string; initiator: string; mode: "single" | "quorum";
}): void {
  const request = boundRequest(workspace, approval, input.kind, input.digest);
  if (request.expiresTs <= Date.now()) throw new BoundRecordError("approval_expired", `approval ${approval.approvalRequestId} expired`);
  const decisions = listApprovalDecisions({ workspace, agentId: request.agentId, approvalRequestId: request.approvalRequestId });
  if (decisions.some((decision) => decision.decision === "DENY")) throw new BoundRecordError("approval_denied", `approval ${approval.approvalRequestId} was denied`);
  const unbound = decisions.filter((decision) => decision.requestDigestSha256 !== approval.requestBindingDigest);
  const approving = decisions.filter((decision) => decision.decision === "APPROVE_EXECUTE" && decision.requestDigestSha256 === approval.requestBindingDigest
    && decision.userId !== input.initiator && decision.roles.some((role) => request.rolesAllowed.includes(role)));
  if (approving.length === 0) throw new BoundRecordError("approval_missing", `approval ${approval.approvalRequestId} has no bound decision from an allowed role`);
  if (input.mode === "single") return;
  if (unbound.length > 0) throw new BoundRecordError("approval_unbound", "every decision must be bound to the reviewed request digest");
  // The engine's quorum would count the requester; this one never does.
  if (new Set(approving.map((decision) => decision.userId)).size < request.requiredApprovals) {
    throw new BoundRecordError("approval_missing", `approval ${approval.approvalRequestId} lacks ${request.requiredApprovals} bound approvers other than the requester`);
  }
  const verified = verifyApprovalForExecution({ workspace, approvalId: request.approvalRequestId, expectedAgentId: request.agentId,
    expectedToolName: toolNameFor(input.kind), expectedActionClass: APPROVAL_CLASS, expectedIntentHash: intentHash(input.kind, input.digest) });
  if (!verified.ok) throw new BoundRecordError("approval_missing", `approval ${approval.approvalRequestId}: ${verified.error ?? "quorum not met"}`);
  if (!consumeApprovedExecution({ workspace, approvalId: request.approvalRequestId, expectedAgentId: request.agentId, executionId: input.recordId }).consumed) {
    throw new BoundRecordError("approval_consumed", `approval ${approval.approvalRequestId} was already spent`);
  }
}

/** On read: the record names the signed request its kind and digest raised (the record's own signature covers the rest). */
export function approvalMatches(workspace: string, approval: BoundApproval, kind: BoundRecordKind, digest: string): boolean {
  try {
    boundRequest(workspace, approval, kind, digest);
    return true;
  } catch {
    return false;
  }
}

/** Sign the exact bytes, verify them, then write record and `.sig`. Never overwrites: records are append-only. */
export async function publishSignedRecord(workspace: string, dir: string, id: string, record: unknown,
  artifactKind: ArtifactSignature["artifactKind"]): Promise<string> {
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(id)) throw new BoundRecordError("invalid_id", "record id must be 1-96 safe characters");
  const path = join(dir, `${id}.json`);
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8");
  let signature: ArtifactSignature;
  try {
    signature = await signArtifactBytesAsync({ workspace, artifactKind, bytes });
  } catch (error) {
    throw new BoundRecordError("signing_unavailable", `no ${artifactKind} record is written without a signing key (${error instanceof Error ? error.name : "error"}); unlock the vault and retry`);
  }
  if (!verifyArtifactBytesSignature({ workspace, artifactKind, bytes, signature })) {
    throw new BoundRecordError("signing_unavailable", `the ${artifactKind} signature does not verify against the workspace auditor key`);
  }
  if (pathExists(path)) throw new BoundRecordError("record_exists", `${artifactKind} ${id} already exists`);
  ensureDir(dir);
  writeFileAtomic(path, bytes, 0o644);
  writeFileAtomic(`${path}.sig`, `${JSON.stringify(signature, null, 2)}\n`, 0o644);
  return path;
}

export interface SignedRecordRead<T> {
  readonly records: readonly { readonly record: T; readonly sha256: string; readonly file: string }[];
  readonly invalid: readonly { readonly file: string; readonly reason: string }[];
}

/** Every `*.json` in `dir`, split into records whose signature and shape verify and files that are never honoured. */
export function readSignedRecords<T>(workspace: string, dir: string, artifactKind: ArtifactSignature["artifactKind"],
  parse: (raw: unknown) => T): SignedRecordRead<T> {
  if (!pathExists(dir)) return { records: [], invalid: [] };
  const records: { record: T; sha256: string; file: string }[] = [];
  const invalid: { file: string; reason: string }[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
    const read = readAndVerifyArtifactFileSignature({ workspace, path: join(dir, file), artifactKind, requireDomainSeparated: true,
      maxArtifactBytes: 1024 * 1024, maxSignatureBytes: 64 * 1024 });
    if (!read.valid || read.artifactBytes === null || read.artifactSha256 === null) {
      invalid.push({ file, reason: read.reason ?? "signature verification failed" });
      continue;
    }
    try {
      records.push({ record: parse(JSON.parse(read.artifactBytes.toString("utf8")) as unknown), sha256: read.artifactSha256, file });
    } catch {
      invalid.push({ file, reason: "record does not match its schema" });
    }
  }
  return { records, invalid };
}

/** Exact decimal comparison of non-negative amounts in one currency: `value <= max`. */
export function amountWithin(amount: { value: string; currency: string } | null, max: { value: string; currency: string }): boolean {
  if (amount === null || amount.currency !== max.currency) return false;
  const scaled = (value: string, places: number): bigint | null => {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
    return match ? BigInt(`${match[1]}${(match[2] ?? "").padEnd(places, "0")}`) : null;
  };
  const places = Math.max(amount.value.split(".")[1]?.length ?? 0, max.value.split(".")[1]?.length ?? 0);
  const a = scaled(amount.value, places), m = scaled(max.value, places);
  return a !== null && m !== null && a <= m;
}

/** ISO window check against AMC's clock: `notBefore <= now < notAfter`. */
export function inWindow(window: { notBefore: string; notAfter: string }, now: number): boolean {
  return Date.parse(window.notBefore) <= now && now < Date.parse(window.notAfter);
}

