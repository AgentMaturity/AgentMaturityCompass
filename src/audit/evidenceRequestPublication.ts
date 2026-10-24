import { randomUUID } from "node:crypto";
import { renameSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { assertOrgPairsCurrent, captureOrgFiles, captureOrgPairs, captureOrgPairsAuthority, orgPairBytes, type OrgPairsSnapshot } from "../org/preparedOrgPairs.js";
import { prepareFileSignatureWithAuditor } from "../org/orgSigner.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { appendTransparencyEntryAttemptAsync, captureWorkspaceLogAuthority } from "../transparency/asyncWorkspaceAppend.js";
import { TransparencyMerkleLagError } from "../transparency/merkleIndexState.js";
import { sha256Hex } from "../utils/hash.js";
import { safeIdSchema } from "../utils/pathSafety.js";
import { auditRequestsClosedDir, auditRequestsOpenDir } from "./auditPolicyStore.js";
import { captureDirectories } from "./auditPolicyMapPublication.js";
import { captureAuditOutputAliases } from "./binderOutputAliases.js";
import { AuditBinderPublicationError, publishAuditFiles, type AuditPublicationOptions } from "./binderPublication.js";
import { evidenceRequestSchema, type EvidenceRequest } from "./evidenceRequestSchema.js";

export interface CreateEvidenceRequestInput {
  workspace: string; scopeType: "WORKSPACE" | "NODE" | "AGENT"; scopeId: string;
  requestedItems: EvidenceRequest["requestedItems"]; requesterUserIdHash: string;
}
interface ReturnedMember { operation: "replace" | "rename"; path: string; source?: string }
export interface EvidenceRequestPublicationProgress {
  phase: string; returnedMembers: readonly Readonly<ReturnedMember>[]; acknowledgedSteps: readonly string[];
  attemptedPath: string | null; attemptedSource: string | null; publicationSetupAttempted: boolean;
  returnedDirectories: readonly string[]; attemptedDirectory: string | null; completedLogHashes: readonly string[];
  acknowledgedLogHash: string | null;
}
export class EvidenceRequestPublicationError extends AuditBinderPublicationError {
  constructor(readonly requestId: string, readonly progress: Readonly<EvidenceRequestPublicationProgress>, cause: unknown) {
    super(progress.phase, Object.freeze(progress.returnedMembers.map(row => row.path)), progress.completedLogHashes, cause, progress.attemptedPath);
    this.name = "EvidenceRequestPublicationError";
  }
}
function requestPaths(workspace: string, requestId: string) {
  return { open: join(auditRequestsOpenDir(workspace), `${requestId}.json`), closed: join(auditRequestsClosedDir(workspace), `${requestId}.json`) };
}
/** Fixed request body0600 / BUNDLE sidecar0644. There is no caller-selected recipe or signer. */
function captureRequestPublication(workspace: string, next: EvidenceRequest, before: OrgPairsSnapshot,
  selected: { bytes: Buffer; signature: Buffer | null } | null, close: boolean, options: AuditPublicationOptions) {
  const caller = { ...options }, paths = requestPaths(workspace, next.requestId), outputPaths = Object.freeze(before.members.map(row => row.path));
  const aliases = captureAuditOutputAliases(outputPaths, []), dirs = captureDirectories(workspace);
  const original = captureOrgPairsAuthority(workspace), originalLog = captureWorkspaceLogAuthority(workspace);
  const signatures: Awaited<ReturnType<typeof prepareFileSignatureWithAuditor>>[] = [];
  const returned: ReturnedMember[] = [], acknowledged: string[] = [], logs: string[] = [];
  let phase = "capture", attemptedPath: string | null = null, attemptedSource: string | null = null, setup = false, acknowledgedLogHash: string | null = null;
  let expected: OrgPairsSnapshot = { members: before.members.map(row => ({ ...row, bytes: row.bytes === null ? null : Buffer.from(row.bytes) })) };
  let ownLog: (() => void) | null = null, preparingOriginal = true;
  const stable = () => {
    if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
    caller.beforePublish?.(); caller.assertInputsCurrent?.(); caller.assertOutputsSafe?.(outputPaths); aliases();
    if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
    if (selected !== null && (selected.signature === null || !verifyAuditorSignatureBytes(workspace, "BUNDLE", selected.bytes, selected.signature).valid))
      throw new Error("original evidence request is not historically admitted for BUNDLE");
    original(); originalLog.assertCurrent(); for (const signature of signatures) signature.assertCurrent(); dirs.assertCurrent();
  };
  const assertCurrent = () => { stable(); ownLog?.(); assertOrgPairsCurrent(expected); };
  const beforeSign = () => {
    if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
    if (preparingOriginal) caller.assertPreparationInputsCurrent?.(); assertCurrent();
  };
  const lock = <T>(operation: () => T) => withControlFileLock({ root: join(workspace, ".amc", "audit"), name: "binder-publication", operation });
  const progress = (): Readonly<EvidenceRequestPublicationProgress> => Object.freeze({ phase,
    returnedMembers: Object.freeze(returned.map(row => Object.freeze({ ...row }))), acknowledgedSteps: Object.freeze([...acknowledged]),
    attemptedPath, attemptedSource, publicationSetupAttempted: setup, returnedDirectories: Object.freeze([...dirs.created]),
    attemptedDirectory: dirs.attempted, completedLogHashes: Object.freeze([...logs]), acknowledgedLogHash });
  const path = close ? paths.closed : paths.open, bytes = Buffer.from(JSON.stringify(next, null, 2));
  beforeSign();
  async function pair(stage: string) {
    phase = `${stage}-sign`; beforeSign();
    const signature = await prepareFileSignatureWithAuditor(workspace, path, bytes, "BUNDLE", beforeSign);
    signatures.push(signature); beforeSign();
    phase = `${stage}-directories`; dirs.create(beforeSign);
    phase = `${stage}-files`; setup = true;
    let files: ReturnType<typeof publishAuditFiles>;
    try { files = publishAuditFiles(workspace, [{ path, bytes, mode: 0o600 }, { path: `${path}.sig`, bytes: Buffer.from(signature.signatureBytes), mode: 0o644 }], expected, stable, beforeSign); }
    catch (cause) {
      if (cause instanceof AuditBinderPublicationError) {
        returned.push(...cause.publishedPaths.map(path => ({ operation: "replace" as const, path }))); attemptedPath = cause.attemptedPath;
      }
      throw cause;
    }
    returned.push(...files.publishedPaths.map(path => ({ operation: "replace" as const, path }))); acknowledged.push(`${stage}-pair`); preparingOriginal = false;
    // Transfer only a genuine publisher's exact owned identity, under the same common lock and its retained negative.
    lock(() => { stable(); files.assertCurrent(); const current = captureOrgFiles(outputPaths); stable(); files.assertCurrent(); expected = current; });
  }
  function move(source: string, target: string, label: string) {
    phase = label;
    lock(() => {
      assertCurrent(); const prior = expected.members.find(row => row.path === source)!;
      if (prior.bytes === null) throw new Error("selected evidence request move source is absent");
      attemptedSource = relative(workspace, source); attemptedPath = relative(workspace, target);
      renameSync(source, target); returned.push({ operation: "rename", path: attemptedPath, source: attemptedSource });
      const observed = captureOrgFiles([source, target]), absent = observed.members[0]!, own = observed.members[1]!;
      if (absent.bytes !== null || own.bytes === null || !own.bytes.equals(prior.bytes) || own.mode !== prior.mode || own.identity !== prior.identity)
        throw new Error("moved evidence request differs from its exact selected source or source is not absent");
      expected = { members: expected.members.map(row => row.path === source ? absent : row.path === target ? own : row) };
      acknowledged.push(label); attemptedPath = null; attemptedSource = null; assertCurrent();
    });
  }
  return Object.freeze({ async publish() {
    try {
      await pair("first");
      if (close && orgPairBytes(before, paths.open) !== null) {
        move(paths.open, paths.closed, "move-open-body");
        if (orgPairBytes(before, `${paths.open}.sig`) !== null) move(`${paths.open}.sig`, `${paths.closed}.sig`, "move-open-signature");
        // This second real Sign is reached only after the actual selected moves returned and were acknowledged.
        await pair("second");
      }
      phase = "request-log"; assertCurrent();
      const attempt = await appendTransparencyEntryAttemptAsync({ workspace,
        type: close ? "AUDIT_EVIDENCE_REQUEST_REJECTED" : "AUDIT_EVIDENCE_REQUEST_CREATED", agentId: "workspace",
        artifact: { kind: "approval", id: next.requestId, sha256: sha256Hex(Buffer.from(JSON.stringify(next), "utf8")) } },
        { beforeCommit: assertCurrent, beforeMember: assertCurrent });
      logs.push(attempt.entry.hash); acknowledgedLogHash = attempt.entry.hash; ownLog = attempt.assertCurrent;
      phase = "complete"; assertCurrent();
      return Object.freeze({ request: structuredClone(next), path, sigPath: `${path}.sig`, assertCurrent, progress: progress() });
    } catch (cause) {
      if (cause instanceof TransparencyMerkleLagError) acknowledgedLogHash = cause.entryHash;
      throw new EvidenceRequestPublicationError(next.requestId, progress(), cause);
    }
  } });
}
export async function createEvidenceRequestAsync(params: CreateEvidenceRequestInput, options: AuditPublicationOptions = {}) {
  const input = structuredClone(params), workspace = resolve(input.workspace), caller = { ...options };
  if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
  caller.beforePublish?.();
  const request = evidenceRequestSchema.parse({ v: 1, requestId: `req_${randomUUID().replace(/-/g, "")}`, createdTs: Date.now(),
    scope: { type: input.scopeType, id: input.scopeId }, requestedItems: input.requestedItems, status: "OPEN", requesterUserIdHash: input.requesterUserIdHash });
  const paths = requestPaths(workspace, request.requestId), before = captureOrgPairs([paths.open, paths.closed]);
  return captureRequestPublication(workspace, request, before, null, false, caller).publish();
}
export async function rejectEvidenceRequestAsync(params: { workspace: string; requestId: string }, options: AuditPublicationOptions = {}) {
  const requestId = safeIdSchema.parse(params.requestId), workspace = resolve(params.workspace), caller = { ...options };
  if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
  caller.beforePublish?.();
  const paths = requestPaths(workspace, requestId), before = captureOrgPairs([paths.open, paths.closed]);
  const selectedPath = orgPairBytes(before, paths.open) === null ? paths.closed : paths.open, bytes = orgPairBytes(before, selectedPath);
  if (bytes === null) throw new Error(`evidence request not found: ${requestId}`);
  const request = evidenceRequestSchema.parse(JSON.parse(bytes.toString("utf8")) as unknown);
  if (request.requestId !== requestId) throw new Error("evidence request identity differs from selected path");
  if (request.status === "FULFILLED") throw new Error("fulfilled request cannot be rejected");
  const next = evidenceRequestSchema.parse({ ...request, status: "REJECTED" });
  return captureRequestPublication(workspace, next, before, { bytes, signature: orgPairBytes(before, `${selectedPath}.sig`) }, true, caller).publish();
}
