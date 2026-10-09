/**
 * A4 Forge project store (P1-56; design §4.2–§4.3). One write path, copied from the action journal: under the
 * project's control-file lock, build the transition body on a pre-read head and sign any A4_RECORD envelope OUTSIDE
 * the ledger transaction; then, in one `BEGIN IMMEDIATE`, dedupe the request, check the head has not moved (else
 * rebuild and re-sign once, then 409 A4_STALE_HEAD), verify the rows after `verified_seq`, append the signed audit row,
 * insert the transition and the side rows its body names, and advance the head.
 *
 * Every row this store writes is `meta.source: "a4-store"`, `trustTier: "SELF_REPORTED"`, `claimKind: "self_reported"`;
 * there is no producer parameter and no path to OBSERVED. Observed facts enter only by reference (src/a4/a4Evidence.ts).
 * Only this file may contain the literal `auditType: "A4_STATE"` (`npm run check:gates` scans literals per file and
 * `NON_MATURITY_AUDIT_MODULES` classifies this module alone). Signatures are checked against the workspace's own
 * keys: a local audit trail, not a portable verdict.
 */
import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { verifyApprovalPolicySignature } from "../approvals/approvalPolicyEngine.js";
import { verifyUsersConfigSignature } from "../auth/authApi.js";
import { eventMeta } from "../claims/evidenceProvenance.js";
import type { ClaimKind } from "../claims/eligibility/types.js";
import { signDigestWithPolicy } from "../crypto/signing/signer.js";
import type { SignedDigest } from "../crypto/signing/signerTypes.js";
import { activeFreezeStatus } from "../drift/freezeEngine.js";
import { openLedger, type Ledger } from "../ledger/ledger.js";
import { ledgerSynchronousMode } from "../ledger/ledgerDurability.js";
import { runImmediateTransaction } from "../ledger/ledgerSessionTransactions.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { highSeveritySecretTypes } from "../release/releaseSecretScan.js";
import { verifyTrustConfigSignature } from "../trust/trustConfig.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { A4BlobError, a4ProjectsRoot, ensureA4Kek, putPrivate } from "./a4Blobs.js";
import { principalPopulation } from "./a4Identity.js";
import {
  A4_ENVELOPE_KINDS, A4_STAGE_STATES, DEFAULT_A4_GATE_POLICY, a4MemberRowSchema, a4ProjectRowSchema, a4RevisionRowSchema,
  a4TransitionRowSchema, deriveSelfApprovalAllowed, laneForClaimKind, ratchetedFromChain, type A4ChainLink, type A4GatePolicyV1,
  type A4Member, type A4Principal, type A4ProjectRow, type A4RefKind, type A4ResourceDigests, type A4Stage, type A4TransitionKind,
  type A4TransitionRow, a4ResourceDigestsSchema
} from "./a4Schema.js";

export const A4_AUDIT_TYPE = "A4_STATE" as const;
/** Marks the store's ledger sessions, one per transition: `a4-<projectId>-<seq>`. */
export const A4_STORE_BINARY = "a4-store";
/** ponytail: native tasks keep request ids for a descriptor's life and name no window; A4 keeps them 24 h. Raise it if clients retry later. */
export const A4_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;
/** A lease token: base64url canonical JSON payload, a dot, a base64url Ed25519 signature (src/leases/leaseSigner.ts). */
const LEASE_TOKEN = /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{40,}/;

export class A4StoreError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly detail?: unknown) {
    super(`${code}: ${message}`);
    this.name = "A4StoreError";
  }
}
class HeadMoved extends Error {}

type A4StageState = (typeof A4_STAGE_STATES)[number];
export type A4Actor = Pick<A4Principal, "key" | "username">;
type Cell = string | number | null;
/** The append-only tables a transition may insert into, with their key columns. */
const SIDE_TABLE_KEYS = {
  a4_revisions: ["project_id", "revision_no"], a4_gates: ["gate_id"], a4_decisions: ["decision_id"], a4_members: ["project_id", "seq"],
  a4_comments: ["comment_id"], a4_evidence_refs: ["project_id", "seq"], a4_releases: ["release_id"], a4_deployments: ["deployment_id"]
} as const;
export type A4SideTable = keyof typeof SIDE_TABLE_KEYS;
/** Every column except `evidence_event_id`, which the store fills from the transition's audit row. */
export interface A4SideRow { readonly table: A4SideTable; readonly values: Readonly<Record<string, Cell>> }

export interface A4ChangeSpec {
  readonly kind: A4TransitionKind;
  readonly actor: A4Actor;
  readonly stage?: A4StageState | null;
  readonly revisionNo?: number;
  /** Merged into the signed body; it may not reuse a field the store sets. */
  readonly payload: Record<string, unknown>;
  readonly sideRows?: readonly A4SideRow[];
  readonly head?: Partial<Pick<A4ProjectRow, "stage" | "step" | "hold" | "hold_reason" | "revision_no" | "deployed_release_id" | "base_release_id">>;
}
export interface A4RequestKey {
  readonly principalKey: string;
  readonly clientRequestId: string;
  readonly bodyHash: string;
  /** Credential-bearing routes store only this allowlist projection, never the response; a replay answers token: null. */
  readonly credential?: { readonly releaseId: string; readonly leaseIds: readonly string[] };
}
export interface A4TransitionOptions {
  /** 409 A4_STALE_HEAD unless the head is at this seq. Omit for changes that may land on any head (decisions). */
  readonly expectedHeadSeq?: number;
  readonly request?: A4RequestKey;
  /** P1-57's readiness, as the fullDigest of an evaluation on rows read here; evaluated before signing and again inside the tx. */
  readonly readiness?: (db: Database.Database, projectId: string) => string;
}
export type A4TransitionResult =
  | { readonly replay: false; readonly projectId: string; readonly seq: number; readonly kind: A4TransitionKind; readonly bodyDigest: string;
      readonly evidenceEventId: string; readonly envelope: SignedDigest | null }
  | { readonly replay: true; readonly response: Record<string, unknown> };
type Build = (ctx: { head: A4ProjectRow | null; seq: number; ts: number }) => A4ChangeSpec;
type NewHead = Pick<A4ProjectRow, "project_id" | "workspace_id" | "agent_id" | "name" | "created_by_key">;

const RESERVED_BODY_KEYS = new Set(["kind", "projectId", "seq", "stage", "revisionNo", "actorKey", "actorUsername", "ts", "prevDigest", "readinessSha256", "sideRows"]);
const COLUMN = /^[a-z][a-z0-9_]*$/;
const sideRowDigest = (values: Readonly<Record<string, Cell>>): string => sha256Hex(canonicalize(values));
const keyOf = (row: A4SideRow): Record<string, Cell> => Object.fromEntries(SIDE_TABLE_KEYS[row.table].map((column) => [column, row.values[column] ?? null]));
const randomId = (prefix: string): string => `${prefix}_${randomBytes(16).toString("hex")}`;

/** Studio's read-only rule (users or trust signature invalid), re-read here because studioServer keeps it private. */
function readOnlyNow(workspace: string): boolean | null {
  try {
    const users = verifyUsersConfigSignature(workspace);
    return (users.signatureExists && !users.valid) || !verifyTrustConfigSignature(workspace).valid;
  } catch {
    return null;
  }
}

/** Freeze and read-only facts; P1-57 calls this inside the transaction for consume, complete and effect transitions. Null = unreadable. */
export function refreshVolatileFacts(workspace: string, project: Pick<A4ProjectRow, "agent_id">): {
  freeze: ReturnType<typeof activeFreezeStatus> | null; readOnly: boolean | null;
} {
  let freeze: ReturnType<typeof activeFreezeStatus> | null;
  try {
    freeze = activeFreezeStatus(workspace, project.agent_id);
  } catch {
    freeze = null;
  }
  return { freeze, readOnly: readOnlyNow(workspace) };
}

/** The live facts readiness reads; each source the store cannot read is null, never "all clear". Stage lanes add theirs. */
export function collectLiveFacts(workspace: string, project: Pick<A4ProjectRow, "agent_id">, options: { hostedRouter: boolean }): {
  activeLocal: string[] | null; hostPrincipals: number; hostedRouter: boolean
} & ReturnType<typeof refreshVolatileFacts> {
  return { ...principalPopulation(workspace), hostedRouter: options.hostedRouter, ...refreshVolatileFacts(workspace, project) };
}

/** The in-force gate policy's digest: the latest GATE_POLICY_CHANGED payload, else CREATED's (design §4.4). */
export function gatePolicyDigestOf(chain: readonly A4ChainLink[]): string | null {
  const source = [...chain].sort((a, b) => b.seq - a.seq).find((link) => link.kind === "GATE_POLICY_CHANGED" || link.kind === "CREATED");
  return source?.body.gatePolicy === undefined ? null : sha256Hex(canonicalize(source.body.gatePolicy));
}

export type A4Store = ReturnType<typeof createStore>;

/** Opens the store on the workspace's evidence ledger. Refuses unsigned, non-durable and evaluated-agent processes. */
export function openA4Store(workspace: string): A4Store {
  if (process.env.AMC_NO_SIGN === "1") throw new A4StoreError(503, "UNSIGNED_STORE", "AMC_NO_SIGN=1: an unsigned A4 record attests to nothing");
  if (process.env.AMC_EVALUATED_AGENT === "1") throw new A4StoreError(403, "EVALUATED_AGENT", "an evaluated agent process cannot write A4 records");
  const mode = ledgerSynchronousMode();
  if (mode === "OFF" || mode === "NORMAL") throw new A4StoreError(503, "LEDGER_NOT_DURABLE", `AMC_LEDGER_SQLITE_SYNCHRONOUS=${mode}; use FULL or EXTRA`);
  const ledger = openLedger(workspace);
  if (Number(ledger.db.pragma("synchronous", { simple: true })) < 2) {
    ledger.close();
    throw new A4StoreError(503, "LEDGER_NOT_DURABLE", "the ledger connection commits below synchronous=FULL");
  }
  return createStore(workspace, ledger);
}

function createStore(workspace: string, ledger: Ledger) {
  const db = ledger.db;
  const workspaceId = workspaceIdFromDirectory(workspace);

  const readHead = (projectId: string): A4ProjectRow | null => {
    const row = db.prepare("SELECT * FROM a4_projects WHERE project_id = ?").get(projectId);
    return row === undefined ? null : a4ProjectRowSchema.parse(row);
  };
  const readChain = (projectId: string): Array<A4ChainLink & { readonly row: A4TransitionRow }> =>
    (db.prepare("SELECT * FROM a4_transitions WHERE project_id = ? ORDER BY seq").all(projectId) as unknown[]).map((raw) => {
      const row = a4TransitionRowSchema.parse(raw);
      return { seq: row.seq, kind: row.kind, revisionNo: row.revision_no, body: JSON.parse(row.body_json) as Record<string, unknown>, row };
    });

  /** The side row as stored now, minus its evidence id, hashed the way the body named it. */
  const storedSideRowDigest = (ref: { table: string; key: Record<string, unknown> }): string | null => {
    if (!Object.hasOwn(SIDE_TABLE_KEYS, ref.table)) return null;
    const columns = SIDE_TABLE_KEYS[ref.table as A4SideTable];
    const row = db.prepare(`SELECT * FROM ${ref.table} WHERE ${columns.map((column) => `${column} = ?`).join(" AND ")}`)
      .get(...columns.map((column) => ref.key[column])) as Record<string, Cell> | undefined;
    if (!row) return null;
    const { evidence_event_id: _evidenceEventId, ...values } = row;
    return sideRowDigest(values);
  };

  /**
   * Head continuity and the rows after `verified_seq` only (design §7 rule 2): prev-digest linkage, body digests, the
   * audit row each names and every side row each body names. O(new rows) under the ledger write lock.
   */
  const verifyIncremental = (projectId: string, head: A4ProjectRow): void => {
    const problems: string[] = [];
    let prev = "GENESIS";
    let expected = 0;
    if (head.verified_seq !== null) {
      const anchor = db.prepare("SELECT body_digest FROM a4_transitions WHERE project_id = ? AND seq = ?").get(projectId, head.verified_seq) as { body_digest: string } | undefined;
      if (anchor?.body_digest !== head.verified_digest) problems.push(`verified row ${head.verified_seq} changed`);
      prev = head.verified_digest ?? "";
      expected = head.verified_seq + 1;
    }
    const rows = (db.prepare("SELECT * FROM a4_transitions WHERE project_id = ? AND seq >= ? ORDER BY seq").all(projectId, expected) as unknown[])
      .map((raw) => a4TransitionRowSchema.parse(raw));
    for (const row of rows) {
      if (row.seq !== expected || row.prev_digest !== prev) problems.push(`transition ${row.seq} does not link to ${expected - 1}`);
      if (sha256Hex(row.body_json) !== row.body_digest) problems.push(`transition ${row.seq} body digest mismatch`);
      const event = ledger.getEventById(row.evidence_event_id);
      if (!event || event.writer_sig === "unsigned" || (event.payload_pruned !== 1 && event.payload_sha256 !== row.body_digest)) {
        problems.push(`transition ${row.seq} audit row missing, unsigned or different`);
      }
      const named = (JSON.parse(row.body_json) as { sideRows?: Array<{ table: string; key: Record<string, unknown>; sha256: string }> }).sideRows ?? [];
      for (const ref of named) if (storedSideRowDigest(ref) !== ref.sha256) problems.push(`A4_SIDE_ROW_MISMATCH ${ref.table} ${JSON.stringify(ref.key)}`);
      prev = row.body_digest;
      expected += 1;
    }
    if (head.head_seq !== expected - 1 || head.head_digest !== prev) problems.push("head does not equal the last transition");
    if (problems.length > 0) throw new A4StoreError(409, "A4_INTEGRITY_FAILED", `project ${projectId} failed verification`, problems);
  };

  /** Inside the transaction, before any side row: a replay answers the stored response; a different body is 409. */
  const dedupeRequest = (request: A4RequestKey, projectId: string, response: Record<string, unknown> | null, ts: number): A4TransitionResult | null => {
    const existing = db.prepare("SELECT body_hash, response_json, redacted FROM a4_requests WHERE principal_key = ? AND client_request_id = ?")
      .get(request.principalKey, request.clientRequestId) as { body_hash: string; response_json: string; redacted: number } | undefined;
    if (existing) {
      if (existing.body_hash !== request.bodyHash) throw new A4StoreError(409, "REQUEST_CONFLICT", "That request ID already names a different A4 request.");
      const stored = JSON.parse(existing.response_json) as Record<string, unknown>;
      return { replay: true, response: existing.redacted === 1 ? { ...stored, token: null, reasonCode: "TOKEN_ALREADY_DELIVERED" } : stored };
    }
    if (response === null) return null;
    const stored = request.credential ? { releaseId: request.credential.releaseId, leaseIds: [...request.credential.leaseIds], tokenDelivered: true } : response;
    const json = JSON.stringify(stored);
    if (highSeveritySecretTypes(json).length > 0 || LEASE_TOKEN.test(json)) throw new A4StoreError(500, "SECRET_IN_REQUEST_ROW", "refused to store a credential in a4_requests");
    db.prepare("INSERT INTO a4_requests (principal_key, client_request_id, body_hash, project_id, response_json, redacted, ts) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(request.principalKey, request.clientRequestId, request.bodyHash, projectId, json, request.credential ? 1 : 0, ts);
    return null;
  };

  const signEnvelope = (digestHex: string): SignedDigest => {
    try {
      return signDigestWithPolicy({ workspace, kind: "A4_RECORD", digestHex });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (/vault locked/i.test(text)) throw new A4StoreError(423, "A4_VAULT_LOCKED", "Unlock the vault to record this.");
      throw new A4StoreError(503, "A4_SIGNING_UNAVAILABLE", text);
    }
  };

  const commit = (projectId: string, build: Build, options: A4TransitionOptions, create: NewHead | null): A4TransitionResult =>
    withControlFileLock({ root: a4ProjectsRoot(workspace), name: create ? "a4-requests" : `project-${projectId}`, operation: () => {
      for (let attempt = 0; ; attempt += 1) {
        const replay = options.request ? dedupeRequest(options.request, projectId, null, 0) : null;
        if (replay) return replay;
        const head0 = readHead(projectId);
        if (create === null && head0 === null) throw new A4StoreError(404, "A4_PROJECT_NOT_FOUND", `no A4 project ${projectId}`);
        if (create !== null && head0 !== null) throw new A4StoreError(409, "A4_PROJECT_EXISTS", projectId);
        if (options.expectedHeadSeq !== undefined && head0?.head_seq !== options.expectedHeadSeq) {
          throw new A4StoreError(409, "A4_STALE_HEAD", "The project moved; reload and retry.", { headSeq: head0?.head_seq ?? null });
        }
        // (a) Build and sign outside the ledger transaction: a notary round trip must never hold the ledger write lock.
        const ts = Date.now();
        const seq = head0 === null ? 0 : head0.head_seq + 1;
        const spec = build({ head: head0, seq, ts });
        for (const key of Object.keys(spec.payload)) if (RESERVED_BODY_KEYS.has(key)) throw new Error(`A4 payload may not set ${key}`);
        const sideRows = spec.sideRows ?? [];
        const stage = spec.stage !== undefined ? spec.stage : head0?.stage ?? "aspire";
        const revisionNo = spec.revisionNo ?? head0?.revision_no ?? 0;
        const readinessSha256 = options.readiness ? options.readiness(db, projectId) : null;
        const prevDigest = head0?.head_digest ?? "GENESIS";
        const body = { ...spec.payload, kind: spec.kind, projectId, seq, stage, revisionNo, actorKey: spec.actor.key, actorUsername: spec.actor.username,
          ts, prevDigest, readinessSha256, sideRows: sideRows.map((row) => ({ table: row.table, key: keyOf(row), sha256: sideRowDigest(row.values) })) };
        const bytes = canonicalize(body);
        const digest = sha256Hex(bytes);
        const envelope = A4_ENVELOPE_KINDS.includes(spec.kind) ? signEnvelope(digest) : null;
        const agentId = create?.agent_id ?? head0!.agent_id;
        try {
          return runImmediateTransaction(db, (): A4TransitionResult => {
            // (b) One transaction on rows read inside it.
            const replayed = options.request ? dedupeRequest(options.request, projectId, { projectId, seq, kind: spec.kind, bodyDigest: digest }, ts) : null;
            if (replayed) return replayed;
            const head = readHead(projectId);
            if (head?.head_seq !== head0?.head_seq || head?.head_digest !== head0?.head_digest) throw new HeadMoved();
            if (head) verifyIncremental(projectId, head);
            if (options.readiness && options.readiness(db, projectId) !== readinessSha256) throw new HeadMoved();
            const sessionId = `a4-${projectId}-${seq}`;
            ledger.startSession({ sessionId, runtime: "unknown", binaryPath: A4_STORE_BINARY, binarySha256: A4_STORE_BINARY });
            let evidence: { id: string };
            try {
              evidence = ledger.appendEvidenceWithReceipt({
                sessionId, runtime: "unknown", eventType: "audit", payload: bytes, inline: true,
                // Key order is load-bearing for the row hash; these are human statements recorded by AMC, never observations.
                meta: { source: "a4-store", trustTier: "SELF_REPORTED", auditType: "A4_STATE", a4Kind: spec.kind, projectId, seq, revisionNo, stage,
                  claimKind: "self_reported", actorKey: spec.actor.key, prevDigest },
                receipt: { kind: "guard_check", agentId, providerId: A4_STORE_BINARY, model: null, bodySha256: digest }
              });
            } finally {
              ledger.sealSession(sessionId);
            }
            if (create) {
              db.prepare(`INSERT INTO a4_projects (project_id, workspace_id, agent_id, name, stage, step, hold, hold_reason, revision_no, head_seq,
                  head_digest, created_by_key, created_ts, updated_ts) VALUES (?, ?, ?, ?, 'aspire', 'asked', 0, NULL, 0, 0, ?, ?, ?, ?)`)
                .run(create.project_id, create.workspace_id, create.agent_id, create.name, digest, create.created_by_key, ts, ts);
            }
            db.prepare(`INSERT INTO a4_transitions (project_id, seq, kind, stage, revision_no, actor_key, actor_username, body_json, body_digest,
                prev_digest, readiness_sha256, envelope_json, evidence_event_id, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
              .run(projectId, seq, spec.kind, stage, revisionNo, spec.actor.key, spec.actor.username, bytes, digest, prevDigest, readinessSha256,
                envelope ? JSON.stringify(envelope) : null, evidence.id, ts);
            for (const row of sideRows) {
              const columns = [...Object.keys(row.values), "evidence_event_id"];
              if (!columns.every((column) => COLUMN.test(column))) throw new Error(`invalid column in ${row.table}`);
              db.prepare(`INSERT INTO ${row.table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...Object.values(row.values), evidence.id);
              // A column the writer left to a default, or a value SQLite coerced, would make the signed name unverifiable.
              if (storedSideRowDigest({ table: row.table, key: keyOf(row) }) !== sideRowDigest(row.values)) throw new Error(`A4_SIDE_ROW_MISMATCH: ${row.table} must name every column`);
            }
            const patch = { ...spec.head, head_seq: seq, head_digest: digest, verified_seq: seq, verified_digest: digest, updated_ts: ts };
            db.prepare(`UPDATE a4_projects SET ${Object.keys(patch).map((column) => `${column} = @${column}`).join(", ")} WHERE project_id = @project_id`)
              .run({ ...patch, project_id: projectId });
            db.prepare("DELETE FROM a4_requests WHERE ts < ?").run(ts - A4_REQUEST_WINDOW_MS);
            return { replay: false, projectId, seq, kind: spec.kind, bodyDigest: digest, evidenceEventId: evidence.id, envelope };
          });
        } catch (error) {
          if (error instanceof HeadMoved) {
            if (attempt === 0) continue;
            throw new A4StoreError(409, "A4_STALE_HEAD", "The project moved twice while this change was signed; reload and retry.");
          }
          if (create && /UNIQUE constraint failed: a4_projects\.workspace_id, a4_projects\.agent_id/.test(String(error))) {
            throw new A4StoreError(409, "A4_AGENT_HAS_ACTIVE_PROJECT", `agent ${create.agent_id} already has an active A4 project; retire it first`);
          }
          throw error;
        }
      }
    } });

  const membersOf = (projectId: string): A4Member[] => {
    const latest = new Map<string, A4Member | null>();
    for (const raw of db.prepare("SELECT * FROM a4_members WHERE project_id = ? ORDER BY seq").all(projectId) as unknown[]) {
      const row = a4MemberRowSchema.parse(raw);
      latest.set(row.principal_key, row.event === "removed" ? null : {
        principalKey: row.principal_key, authSource: row.auth_source as A4Member["authSource"], userId: row.user_id, username: row.username,
        roles: JSON.parse(row.roles_json) as A4Member["roles"]
      });
    }
    return [...latest.values()].filter((member): member is A4Member => member !== null);
  };

  const memberRow = (projectId: string, seq: number, ts: number, actor: A4Actor, event: "added" | "roles_changed" | "removed",
    member: Pick<A4Member, "principalKey" | "authSource" | "userId" | "username">, roles: readonly string[]): A4SideRow => ({
    table: "a4_members",
    values: { project_id: projectId, seq, event, principal_key: member.principalKey, auth_source: member.authSource, user_id: member.userId,
      username: member.username, roles_json: JSON.stringify(roles), actor_key: actor.key, ts }
  });

  return {
    workspace,
    ledger,
    readHead,
    readChain,
    membersOf,
    verifyIncremental,
    transition: (projectId: string, build: Build, options: A4TransitionOptions = {}): A4TransitionResult => commit(projectId, build, options, null),
    readRevision: (projectId: string, revisionNo: number) => {
      const row = db.prepare("SELECT * FROM a4_revisions WHERE project_id = ? AND revision_no = ?").get(projectId, revisionNo);
      return row === undefined ? null : a4RevisionRowSchema.parse(row);
    },
    listProjects: (): A4ProjectRow[] => (db.prepare("SELECT * FROM a4_projects WHERE workspace_id = ? ORDER BY created_ts")
      .all(workspaceId) as unknown[]).map((row) => a4ProjectRowSchema.parse(row)),

    /**
     * Refused without a signed approval policy. CREATED carries the default gate policy and the derived single-user
     * self-approval facts; the creator becomes the first owner. One active project per agent (partial unique index).
     */
    createProject(input: { actor: A4Principal; agentId: string; name: string; hostedRouter: boolean; request?: A4RequestKey }): A4TransitionResult {
      const policy = verifyApprovalPolicySignature(workspace);
      if (!policy.signatureExists && policy.reason === "approval policy missing") {
        throw new A4StoreError(409, "APPROVAL_POLICY_MISSING", "Run `amc policy approval init` before creating an A4 project.");
      }
      if (!policy.valid) throw new A4StoreError(409, "APPROVAL_POLICY_UNSIGNED", `the approval policy does not verify: ${policy.reason ?? "unknown"}`);
      if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(input.agentId)) throw new A4StoreError(400, "INPUT_INVALID", "Choose a valid agent ID.");
      if (input.name.trim().length === 0) throw new A4StoreError(400, "INPUT_INVALID", "Name the project.");
      try {
        ensureA4Kek(workspace);
      } catch (error) {
        if (error instanceof A4BlobError) throw new A4StoreError(423, "A4_VAULT_LOCKED", "Unlock the vault once so the workspace's A4 key can be created.");
        throw error;
      }
      const projectId = randomId("a4p");
      const population = principalPopulation(workspace);
      const selfApprovalAllowed = deriveSelfApprovalAllowed({ activeLocal: population.activeLocal, hostPrincipals: population.hostPrincipals,
        hostedRouter: input.hostedRouter, regulated: false, workspaceFloor: undefined, ratcheted: false, decidingPrincipal: input.actor });
      const gatePolicy: A4GatePolicyV1 = DEFAULT_A4_GATE_POLICY;
      return commit(projectId, ({ seq, ts }) => ({
        kind: "CREATED", actor: input.actor, stage: "aspire", revisionNo: 0,
        payload: { workspaceId, agentId: input.agentId, name: input.name.trim(), gatePolicy, gatePolicyDigest: sha256Hex(canonicalize(gatePolicy)),
          selfApprovalAllowed, selfApprovalFacts: { activeUserCount: population.activeLocal?.length ?? null, hostPrincipals: population.hostPrincipals,
            hostedRouter: input.hostedRouter, ratcheted: false, regulated: false, selfApprovalAllowed } },
        sideRows: [memberRow(projectId, seq, ts, input.actor, "added",
          { principalKey: input.actor.key, authSource: input.actor.authSource, userId: input.actor.userId, username: input.actor.username }, ["owner"])]
      }), { request: input.request }, { project_id: projectId, workspace_id: workspaceId, agent_id: input.agentId, name: input.name.trim(),
        created_by_key: input.actor.key });
    },

    /** A new accepted specification: revision N+1 with its content digest and the resource digests it depends on. */
    appendRevision(projectId: string, input: { actor: A4Actor; stage: A4Stage; spec: Record<string, unknown>; resourceDigests: A4ResourceDigests;
      operatingScope?: Record<string, unknown> | null; expectedHeadSeq: number; request?: A4RequestKey }): A4TransitionResult {
      const resourceDigests = a4ResourceDigestsSchema.parse(input.resourceDigests);
      return commit(projectId, ({ head, ts }) => {
        const revisionNo = head!.revision_no + 1;
        const values = { project_id: projectId, revision_no: revisionNo, stage: input.stage, parent_revision_no: head!.revision_no === 0 ? null : head!.revision_no,
          spec_json: canonicalize(input.spec), spec_digest: sha256Hex(canonicalize(input.spec)), resource_digests_json: canonicalize(resourceDigests),
          resource_digests_sha256: sha256Hex(canonicalize(resourceDigests)), operating_scope_json: input.operatingScope ? canonicalize(input.operatingScope) : null,
          created_by_key: input.actor.key, ts };
        return { kind: "REVISION", actor: input.actor, stage: input.stage, revisionNo, payload: { specDigest: values.spec_digest,
          resourceDigestsSha256: values.resource_digests_sha256 }, sideRows: [{ table: "a4_revisions", values }], head: { revision_no: revisionNo } };
      }, { expectedHeadSeq: input.expectedHeadSeq, request: input.request }, null);
    },

    /** A membership event; refused when it would leave the project without an owner. Authorization is the router's (P1-57). */
    recordMember(projectId: string, input: { actor: A4Actor; event: "added" | "roles_changed" | "removed";
      member: Pick<A4Member, "principalKey" | "authSource" | "userId" | "username">; roles: A4Member["roles"]; expectedHeadSeq: number;
      request?: A4RequestKey }): A4TransitionResult {
      return commit(projectId, ({ seq, ts }) => {
        const after = membersOf(projectId).filter((member) => member.principalKey !== input.member.principalKey);
        if (input.event !== "removed") after.push({ ...input.member, roles: input.roles });
        if (!after.some((member) => member.roles.includes("owner"))) throw new A4StoreError(409, "A4_LAST_OWNER", "A project keeps at least one owner.");
        return { kind: "MEMBER", actor: input.actor, payload: { event: input.event, principalKey: input.member.principalKey, roles: [...input.roles] },
          sideRows: [memberRow(projectId, seq, ts, input.actor, input.event, input.member, input.event === "removed" ? [] : input.roles)] };
      }, { expectedHeadSeq: input.expectedHeadSeq, request: input.request }, null);
    },

    /**
     * The body goes to the project's encrypted blob store (no vault needed to write); the row keeps only the salted
     * hash and the ciphertext reference. ponytail: a blob whose transition then fails stays as an unreferenced file.
     */
    addComment(projectId: string, input: { actor: A4Actor; body: string; cardId: string; inReplyTo?: string | null; request?: A4RequestKey }): A4TransitionResult {
      if (input.body.trim().length === 0 || input.cardId.trim().length === 0) throw new A4StoreError(400, "INPUT_INVALID", "A comment needs text and a card.");
      const blob = putPrivate(workspace, projectId, Buffer.from(input.body, "utf8"));
      const commentId = randomId("a4c");
      return commit(projectId, ({ head, ts }) => ({
        kind: "COMMENT", actor: input.actor, payload: { commentId, cardId: input.cardId, bodySha256: blob.bodySha256, blobRef: blob.blobRef },
        sideRows: [{ table: "a4_comments", values: { comment_id: commentId, project_id: projectId, revision_no: head!.revision_no, stage: head!.stage,
          card_id: input.cardId, author_key: input.actor.key, body_sha256: blob.bodySha256, blob_ref: blob.blobRef, in_reply_to: input.inReplyTo ?? null, ts } }]
      }), { request: input.request }, null);
    },

    /**
     * An EVIDENCE_REF transition. The lane is derived, never chosen: the writer names only the self-reported column; a
     * ledger_event ref's trust tier is read from the referenced row, and a dangling ledger ref is refused.
     */
    addEvidenceRef(projectId: string, input: { actor: A4Actor; refKind: A4RefKind; refId: string; sha256: string; claimKind: ClaimKind;
      method: string | null; label: string; column: "recommendation" | "implementation"; expectedHeadSeq: number; request?: A4RequestKey }): A4TransitionResult {
      if (!/^[0-9a-f]{64}$/.test(input.sha256)) throw new A4StoreError(400, "INPUT_INVALID", "sha256 must be 64 lowercase hex characters.");
      let trustTier: string | null = null;
      if (input.refKind === "ledger_event") {
        const event = ledger.getEventById(input.refId);
        if (!event) throw new A4StoreError(409, "EVIDENCE_REF_DANGLING", `no ledger row ${input.refId}`);
        const tier = eventMeta(event).trustTier;
        trustTier = typeof tier === "string" ? tier : null;
      }
      const derived = laneForClaimKind(input.claimKind, trustTier, input.method, input.column);
      return commit(projectId, ({ head, seq, ts }) => ({
        kind: "EVIDENCE_REF", actor: input.actor,
        payload: { refKind: input.refKind, refId: input.refId, sha256: input.sha256, lane: derived.lane, claimKind: derived.claimKind },
        sideRows: [{ table: "a4_evidence_refs", values: { project_id: projectId, seq, revision_no: head!.revision_no, stage: head!.stage, lane: derived.lane,
          ref_kind: input.refKind, ref_id: input.refId, sha256: input.sha256, claim_kind: derived.claimKind, trust_tier: trustTier, method: input.method,
          label: input.label, actor_key: input.actor.key, ts } }]
      }), { expectedHeadSeq: input.expectedHeadSeq, request: input.request }, null);
    },

    /** Whether the chain ratchets single-user self-approval off (design §5.3). */
    ratcheted: (projectId: string): boolean => ratchetedFromChain(readChain(projectId)),
    close: (): void => ledger.close()
  };
}
