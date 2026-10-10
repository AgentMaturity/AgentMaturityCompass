/**
 * The A4 slice of an audit binder (P1-63; design §16 item 12). Built only from a chain that verifies, through an
 * allowlisted, hashed projection in the P1-16 pattern (src/audit/binderConformanceRun.ts): ids, kinds, statuses, digests,
 * counts and times, principals hashed with the binder's identifier hashing. Specification text, comment bodies, decision
 * reasons, ref labels and transition bodies never leave as text: each is represented by the digest the chain already
 * binds. Every file passes the binder PII scan and a key-material scan before the manifest is signed (`a4-binder`), and
 * the slice is written only under `.amc/audit/binders/exports/` (P0-20). A signature proves these bytes, not their truth.
 */
import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { auditBindersExportsDir, loadAuditPolicy, verifyAuditPolicySignature } from "../audit/auditPolicyStore.js";
import { hashAuditId, scanBinderForPii } from "../audit/binderRedaction.js";
import { openLedger } from "../ledger/ledger.js";
import { signArtifactFile } from "../lifecycle/artifactSignature.js";
import { highSeveritySecretTypes } from "../release/releaseSecretScan.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";
import { loadTrustContext, type TrustContext } from "../trust/trustContext.js";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { containedPath } from "../utils/pathSafety.js";
import { resolveRefs } from "./a4Evidence.js";
import { a4EvidenceRefRowSchema, a4PreviewEnabled, type A4Stage } from "./a4Schema.js";
import { A4StoreError, readA4Store } from "./a4Store.js";
import { verifyA4Chain } from "./a4Verify.js";

/** An id a binder may carry as is (the binderConformanceRun rule): never a path, URL, address or free text. */
const SAFE_ID = /^[A-Za-z0-9._:-]{1,200}$/;
/** The agent id shape the store accepts at project creation (src/a4/a4Store.ts). */
const AGENT_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/;
const KEY_MATERIAL = /PRIVATE KEY|\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/;
const CLAIM_BOUNDARY = "A4 project record as stored in this workspace: digests and statuses of bytes, not evidence about the agent; every decision is self_reported";

type Cell = string | number | null | undefined;
const text = (value: Cell): string => String(value ?? "");
const json = (value: unknown): string => `${canonicalize(value)}\n`;
const parsed = (value: Cell): unknown => JSON.parse(text(value)) as unknown;

/** The first token of each reason: a code, never the sentence around it. */
const codes = (reasons: readonly string[]): string[] => [...new Set(reasons.map((reason) => reason.split(/[:\s]/, 1)[0] ?? ""))];

/** Why `files` may not leave the workspace: a PII-scan finding in any JSON value, or key material anywhere. */
function exportProblems(files: Record<string, string>): string[] {
  return Object.entries(files).flatMap(([path, body]) => {
    const values = path.endsWith(".jsonl") ? body.trim().split("\n").map((line) => JSON.parse(line) as object) : [JSON.parse(body) as object];
    const findings = values.flatMap((value) => scanBinderForPii(value).findings.filter((finding) => finding.severity === "HIGH"));
    const secrets = [...highSeveritySecretTypes(body), ...(KEY_MATERIAL.test(body) ? ["KEY_MATERIAL"] : [])];
    return [...findings.map((finding) => `${path}: ${finding.type} at ${finding.path}`), ...secrets.map((type) => `${path}: ${type}`)];
  });
}

/**
 * Writes the A4 slice of one project (optionally one stage, optionally one gate) as `revisions/`, `gates/`,
 * `transitions.jsonl`, `evidence/refs.json` and `verifier/report.json` beside a signed `manifest.json` that names the
 * verified head. The report and the slice are read in one read transaction, so the slice is exactly the chain the
 * report verified. Refuses a project whose chain does not verify (409 A4_INTEGRITY_FAILED) and any slice the scans flag
 * (409 A4_BINDER_REFUSED). The slice is staged in a sibling directory, signed there and renamed into place, so a refusal
 * or a signing failure leaves nothing behind. Absent without `AMC_A4_PREVIEW=1` (404 A4_PREVIEW_DISABLED), for every caller.
 */
export function buildA4BinderSlice(workspace: string, input: { projectId: string; stage?: A4Stage; gateId?: string; trust?: TrustContext }): {
  dir: string; manifestSha256: string; files: string[];
} {
  if (!a4PreviewEnabled()) throw new A4StoreError(404, "A4_PREVIEW_DISABLED", "A4 Forge is not enabled in this workspace.");
  const now = Date.now();
  const policy = verifyAuditPolicySignature(workspace).valid ? loadAuditPolicy(workspace).auditPolicy.privacy.hashTruncBytes : 8;
  const hashed = (value: Cell): string => `hash:${hashAuditId(text(value), policy)}`;
  const safeId = (value: Cell): string => (SAFE_ID.test(text(value)) ? text(value) : hashed(value));
  const trust = input.trust ?? loadTrustContext();
  const ledger = openLedger(workspace, { readonly: true });
  let built: { files: Record<string, string>; agentId: string; headSeq: number; headDigest: string };
  try {
    built = ledger.db.transaction(() => {
      const report = verifyA4Chain(ledger, input.projectId, trust, now);
      if (report.integrity.status === "fail") throw new A4StoreError(409, "A4_INTEGRITY_FAILED", "A binder slice is built only from a chain that verifies.", report.integrity.errors);
      const { head, links, rows } = readA4Store(ledger).snapshot(input.projectId);
      if (head.head_digest !== report.artifact.sha256) throw new A4StoreError(409, "A4_INTEGRITY_FAILED", "The slice's head is not the head the report verified.");
      // The agent named by the signed CREATED body, in the store's id shape; never the unsigned head row's column.
      const created = links.find((link) => link.seq === 0)?.body.agentId;
      if (typeof created !== "string" || !AGENT_ID.test(created)) throw new A4StoreError(409, "A4_INTEGRITY_FAILED", "The CREATED record names no valid agent.");
      const gates = rows.a4_gates.filter((gate) => (input.stage === undefined || gate.stage === input.stage) && (input.gateId === undefined || gate.gate_id === input.gateId));
      if (input.gateId !== undefined && gates.length === 0) throw new A4StoreError(404, "A4_GATE_NOT_FOUND", `no gate ${input.gateId} on this project`);
      const revisionNos = new Set(gates.map((gate) => gate.revision_no));
      const inSlice = (row: Record<string, Cell>): boolean => input.gateId !== undefined ? revisionNos.has(row.revision_no) : input.stage === undefined || row.stage === input.stage;
      const refs = rows.a4_evidence_refs.filter(inSlice).map((row) => a4EvidenceRefRowSchema.parse(row));
      const files = Object.fromEntries([
        ...rows.a4_revisions.filter(inSlice).map((row) => [`revisions/r${text(row.revision_no)}.json`, json({
          revisionNo: row.revision_no, stage: row.stage, parentRevisionNo: row.parent_revision_no, specDigest: row.spec_digest,
          resourceDigestsSha256: row.resource_digests_sha256, operatingScopeSha256: row.operating_scope_json === null ? null : sha256Hex(text(row.operating_scope_json)),
          createdBy: hashed(row.created_by_key), evidenceEventId: safeId(row.evidence_event_id), ts: row.ts })]),
        ...gates.map((gate) => [`gates/${text(gate.gate_id)}.json`, json({
          gateId: gate.gate_id, stage: gate.stage, gate: gate.gate, revisionNo: gate.revision_no, bindingDigest: gate.binding_digest,
          intentSha256: sha256Hex(text(gate.intent_json)), readinessSha256: gate.readiness_sha256, boundItemIds: parsed(gate.bound_items_json),
          gatePolicyDigest: gate.gate_policy_digest, requestedBy: hashed(gate.requested_by_key),
          excludedKeys: (parsed(gate.excluded_keys_json) as string[]).map((key) => hashed(key)), expiresTs: gate.expires_ts, ts: gate.ts,
          decisions: rows.a4_decisions.filter((row) => row.gate_id === gate.gate_id).map((row) => ({
            decisionId: row.decision_id, decisionSha256: sha256Hex(text(row.decision_json)), requestDigest: row.request_digest, approver: hashed(row.approver_key),
            authSource: row.auth_source, admission: row.admission, identityCheck: row.identity_check, selfApproved: row.self_approved === 1,
            decision: (parsed(row.decision_json) as { decision?: unknown }).decision, claimKind: "self_reported", ts: row.ts })) })]),
        ["transitions.jsonl", links.map((link) => canonicalize({ seq: link.seq, kind: link.kind, stage: link.body.stage ?? null, revisionNo: link.revisionNo,
          actor: hashed(typeof link.body.actorKey === "string" ? link.body.actorKey : ""), bodyDigest: sha256Hex(canonicalize(link.body)),
          prevDigest: link.body.prevDigest ?? null, ts: link.body.ts ?? null })).join("\n") + "\n"],
        ["evidence/refs.json", json(resolveRefs(ledger, refs, trust, now).map((ref, index) => ({ seq: refs[index]!.seq, revisionNo: refs[index]!.revision_no,
          // A ledger row id points into the ledger; any other ref (a file name, a receipt or external id) is hashed with its kind.
          refKind: ref.refKind, ref: ref.refKind === "ledger_event" ? safeId(ref.refId) : hashed(`${ref.refKind}:${ref.refId}`), sha256: ref.sha256,
          status: ref.status, lane: ref.lane, claimKind: ref.claimKind, trustTier: ref.trustTier, method: ref.method, reasonCodes: ref.reasonCodes })))],
        ["verifier/report.json", json({ type: report.type, version: report.version, verifiedAt: report.verifiedAt, reportSha256: sha256Hex(canonicalize(report)),
          integrity: { status: report.integrity.status, codes: codes(report.integrity.errors) },
          issuerAdmission: { status: report.issuerAdmission.status, signatures: report.issuerAdmission.signatures.map((entry) => ({ keyId: entry.keyId, purpose: entry.purpose, status: entry.status })) },
          anchoring: { status: report.anchoring.status }, freshness: { status: report.freshness.status, codes: codes(report.freshness.reasons) },
          warnings: codes(report.warnings), trusted: report.trusted })]
      ]) as Record<string, string>;
      return { files, agentId: created, headSeq: head.head_seq, headDigest: head.head_digest };
    })();
  } finally {
    ledger.close();
  }
  const { files, agentId } = built;
  const problems = exportProblems(files);
  if (problems.length > 0) throw new A4StoreError(409, "A4_BINDER_REFUSED", "The binder slice failed the PII or key-material scan; nothing was written.", problems);
  const manifest = Buffer.from(json({ schema: "amc.a4-binder/v1", projectId: input.projectId, agentIdHash: hashAuditId(agentId, policy), stage: input.stage ?? null,
    gateId: input.gateId ?? null, headSeq: built.headSeq, headDigest: built.headDigest, generatedTs: now, claimBoundary: CLAIM_BOUNDARY,
    files: Object.entries(files).map(([path, body]) => ({ path, sha256: sha256Hex(body) })).sort((a, b) => a.path.localeCompare(b.path)) }), "utf8");
  if (KEY_MATERIAL.test(manifest.toString("utf8")) || highSeveritySecretTypes(manifest.toString("utf8")).length > 0) {
    throw new A4StoreError(409, "A4_BINDER_REFUSED", "The binder manifest failed the key-material scan; nothing was written.");
  }
  const parent = containedPath(auditBindersExportsDir(workspace), "audit binder exports", "agent", agentId);
  const dir = containedPath(parent, "audit binder exports", `a4-${input.projectId}-${now}`);
  ensureDir(parent);
  const staging = mkdtempSync(join(parent, `.a4-${input.projectId}-`));
  try {
    for (const [path, body] of Object.entries(files)) {
      const target = containedPath(staging, "A4 binder slice", path);
      ensureDir(join(target, ".."));
      writeFileAtomic(target, body, 0o644);
    }
    const manifestPath = join(staging, "manifest.json");
    writeFileAtomic(manifestPath, manifest, 0o644);
    signArtifactFile({ workspace, path: manifestPath, artifactKind: "a4-binder", bytes: manifest });
    renameSync(staging, dir);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  const manifestSha256 = sha256Hex(manifest);
  appendTransparencyEntry({ workspace, type: "A4_BINDER_EXPORTED", agentId, artifact: { kind: "a4-binder", sha256: manifestSha256, id: input.projectId } });
  return { dir, manifestSha256, files: [...Object.keys(files).sort(), "manifest.json"] };
}
