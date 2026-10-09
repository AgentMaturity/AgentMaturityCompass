/**
 * A4 Forge project store (P1-56; design §4.2–§4.3). One write path, copied from the action journal: under the
 * project's control-file lock, build the transition body on a pre-read head and sign any A4_RECORD envelope OUTSIDE
 * the ledger transaction; then, in one `BEGIN IMMEDIATE`, dedupe the request, check the head has not moved (else
 * rebuild and re-sign once, then 409 A4_STALE_HEAD), verify the chain (`verifyIncremental`), append the signed audit
 * row, insert the transition and the side rows its body names, and advance the head. Readers (`readChain`, `membersOf`,
 * `readRevision`, `ratcheted`) use only a chain that verifies whole up to its signed head.
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
import { eventMeta, readerTrustFor } from "../claims/evidenceProvenance.js";
import type { ClaimKind } from "../claims/eligibility/types.js";
import { getPrivateKeyPem, getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { signDigestWithPolicy } from "../crypto/signing/signer.js";
import type { SignedDigest } from "../crypto/signing/signerTypes.js";
import { activeFreezeStatus } from "../drift/freezeEngine.js";
import { canonicalMetadataForHash, openLedger, type Ledger } from "../ledger/ledger.js";
import { ledgerSynchronousMode } from "../ledger/ledgerDurability.js";
import { runImmediateTransaction } from "../ledger/ledgerSessionTransactions.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { verifyReceipt } from "../receipts/receipt.js";
import { highSeveritySecretTypes } from "../release/releaseSecretScan.js";
import { verifyTrustConfigSignature } from "../trust/trustConfig.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { A4BlobError, a4ProjectsRoot, createProjectKey, putPrivate } from "./a4Blobs.js";
import { resolveLedgerEvent } from "./a4Evidence.js";
import { memberCandidates, principalPopulation } from "./a4Identity.js";
import {
  A4_ENVELOPE_KINDS, A4_STAGE_STATES, DEFAULT_A4_GATE_POLICY, a4GatePolicyV1Schema, a4MemberRowSchema, a4ProjectRowSchema, a4RevisionRowSchema,
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
/** The head's mutable state. Every body signs it as `headAfter`, so readers and writes never trust the unsigned head row. */
const HEAD_COLUMNS = ["stage", "step", "hold", "hold_reason", "revision_no", "deployed_release_id", "base_release_id"] as const;
type A4HeadState = Pick<A4ProjectRow, (typeof HEAD_COLUMNS)[number]>;
/** The state a new project's head row is inserted with. */
const NEW_HEAD: A4HeadState = { stage: "aspire", step: "asked", hold: 0, hold_reason: null, revision_no: 0, deployed_release_id: null, base_release_id: null };
const headStateOf = (row: A4HeadState): A4HeadState => Object.fromEntries(HEAD_COLUMNS.map((column) => [column, row[column]])) as A4HeadState;
/** Which head columns differ from the state the last signed body left. */
const headProblems = (head: A4ProjectRow, body: Record<string, unknown>): string[] => {
  const after = (body.headAfter ?? {}) as Record<string, unknown>;
  return HEAD_COLUMNS.filter((column) => head[column] !== after[column]).map((column) => `head column ${column} differs from the signed head`);
};

/** What a change records; the actor is the one `transition` was called with, never part of the built change. */
export interface A4ChangeSpec {
  readonly kind: A4TransitionKind;
  readonly stage?: A4StageState | null;
  readonly revisionNo?: number;
  /** Merged into the signed body; it may not reuse a field the store sets. */
  readonly payload: Record<string, unknown>;
  readonly sideRows?: readonly A4SideRow[];
  readonly head?: Partial<A4HeadState>;
}
export interface A4RequestKey {
  readonly principalKey: string;
  readonly clientRequestId: string;
  /**
   * sha256 over the method, the route and the project id as well as the body: one (principal, clientRequestId)
   * namespace spans every A4 route. The store also refuses a replay whose stored project differs (REQUEST_CONFLICT).
   */
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

const RESERVED_BODY_KEYS = new Set(["kind", "projectId", "seq", "stage", "revisionNo", "actorKey", "actorUsername", "ts", "prevDigest", "readinessSha256",
  "headAfter", "sideRows"]);
const COLUMN = /^[a-z][a-z0-9_]*$/;
/** The minted id shape (`randomId("a4p")`); it names a lock file and a blob directory, so nothing else is accepted. */
const PROJECT_ID = /^a4p_[0-9a-f]{32}$/;
const assertProjectId = (projectId: string): void => {
  if (!PROJECT_ID.test(projectId)) throw new A4StoreError(400, "INPUT_INVALID", "Not an A4 project ID.");
};
const sideRowDigest = (values: Readonly<Record<string, Cell>>): string => sha256Hex(canonicalize(values));
const keyOf = (row: A4SideRow): Record<string, Cell> => Object.fromEntries(SIDE_TABLE_KEYS[row.table].map((column) => [column, row.values[column] ?? null]));
type SideRowName = { table: string; key: Record<string, unknown>; sha256: string };
/** The side rows a transition body names. */
const namesIn = (body: Record<string, unknown>): SideRowName[] => (Array.isArray(body.sideRows) ? body.sideRows as SideRowName[] : []);
/** A transition body, or null when the stored bytes are not a JSON object: an integrity failure, never a parse error. */
const parseBody = (bodyJson: string): Record<string, unknown> | null => {
  try {
    const body: unknown = JSON.parse(bodyJson);
    return body !== null && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
};
const integrityFailed = (projectId: string, problems: readonly string[]): A4StoreError =>
  new A4StoreError(409, "A4_INTEGRITY_FAILED", `project ${projectId} failed verification`, problems);
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
  activeLocal: string[] | null; hostPrincipals: number | null; hostedRouter: boolean
} & ReturnType<typeof refreshVolatileFacts> {
  return { ...principalPopulation(workspace), hostedRouter: options.hostedRouter, ...refreshVolatileFacts(workspace, project) };
}

/** The in-force gate policy's digest: the latest GATE_POLICY_CHANGED payload, else the seq-0 CREATED's (design §4.4). */
export function gatePolicyDigestOf(chain: readonly A4ChainLink[]): string | null {
  const source = [...chain].sort((a, b) => b.seq - a.seq).find((link) => link.kind === "GATE_POLICY_CHANGED" || (link.kind === "CREATED" && link.seq === 0));
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
  type Link = A4ChainLink & { readonly row: A4TransitionRow };
  /** The project's transition rows in seq order; a row that does not parse is an integrity failure. */
  const readRows = (projectId: string): A4TransitionRow[] =>
    (db.prepare("SELECT * FROM a4_transitions WHERE project_id = ? ORDER BY seq").all(projectId) as unknown[]).map((raw) => {
      const parsed = a4TransitionRowSchema.safeParse(raw);
      if (!parsed.success) throw integrityFailed(projectId, [`transition ${String((raw as { seq?: unknown }).seq)} does not parse`]);
      return parsed.data;
    });

  /** The side row a name points at, as stored now; null when the name is malformed or no row has that key. */
  const storedSideRow = (ref: { table: string; key: Record<string, unknown> }): Record<string, Cell> | null => {
    if (!Object.hasOwn(SIDE_TABLE_KEYS, ref.table) || ref.key === null || typeof ref.key !== "object") return null;
    const columns = SIDE_TABLE_KEYS[ref.table as A4SideTable];
    const values = columns.map((column) => ref.key[column]);
    if (!values.every((value) => typeof value === "string" || typeof value === "number")) return null;
    return (db.prepare(`SELECT * FROM ${ref.table} WHERE ${columns.map((column) => `${column} = ?`).join(" AND ")}`)
      .get(...values) as Record<string, Cell> | undefined) ?? null;
  };
  /** The side row as stored now, minus its evidence id, hashed the way the body named it. */
  const storedSideRowDigest = (ref: { table: string; key: Record<string, unknown> }): string | null => {
    const row = storedSideRow(ref);
    if (row === null) return null;
    const { evidence_event_id: _evidenceEventId, ...values } = row;
    return sideRowDigest(values);
  };

  /** Why a row's bytes are not its digest, or its unsigned columns not what its body states. Hashes only; no key. */
  const bodyProblems = (row: A4TransitionRow, body: Record<string, unknown> | null): string[] => {
    if (sha256Hex(row.body_json) !== row.body_digest) return [`transition ${row.seq} body digest mismatch`];
    if (body === null) return [`transition ${row.seq} body is not a JSON object`];
    const columns = { projectId: row.project_id, seq: row.seq, kind: row.kind, stage: row.stage, revisionNo: row.revision_no, actorKey: row.actor_key,
      actorUsername: row.actor_username, ts: row.ts, prevDigest: row.prev_digest, readinessSha256: row.readiness_sha256 };
    return Object.entries(columns).filter(([field, value]) => body[field] !== value).map(([field]) => `transition ${row.seq} column ${field} differs from its body`);
  };

  /**
   * Why one transition is not what its signed audit row recorded (mirrors actionJournal's checkEvidence): the audit row
   * carries exactly these bytes, recomputes to its event hash, is signed by a monitor key of this workspace, names this
   * project and seq, and holds a signed receipt over the same body and event. The meta binding also means one audit row
   * can back only one transition.
   */
  const auditProblems = (row: A4TransitionRow, keys: string[]): string[] => {
    const event = ledger.getEventById(row.evidence_event_id);
    if (!event || event.event_type !== "audit" || event.payload_sha256 !== row.body_digest
      || [event.payload_inline, event.canonical_payload_inline].some((inline) => inline != null && inline !== row.body_json)) {
      return [`transition ${row.seq} audit row missing or carries other bytes`];
    }
    const recomputed = sha256Hex(`${event.prev_event_hash}${canonicalMetadataForHash({ id: event.id, ts: event.ts, sessionId: event.session_id,
      runtime: event.runtime, eventType: event.event_type, payloadPath: event.canonical_payload_path ?? event.payload_path,
      payloadInline: event.canonical_payload_inline ?? event.payload_inline, metaJson: event.meta_json })}${event.payload_sha256}`);
    if (recomputed !== event.event_hash || !verifyHexDigestAny(event.event_hash, event.writer_sig, keys)) {
      return [`transition ${row.seq} audit row signature does not verify`];
    }
    const problems: string[] = [];
    const meta = eventMeta(event);
    if (meta.auditType !== A4_AUDIT_TYPE || meta.projectId !== row.project_id || meta.seq !== row.seq) problems.push(`transition ${row.seq} audit row is for another transition`);
    const receipt = typeof meta.receipt === "string" ? verifyReceipt(meta.receipt, keys) : null;
    if (!receipt?.ok || receipt.payload?.body_sha256 !== row.body_digest || receipt.payload.event_hash !== event.event_hash) {
      problems.push(`transition ${row.seq} signed receipt does not bind it`);
    }
    return problems;
  };

  /**
   * Hash-links rows from seq 0: contiguous seqs, each body hashing to its digest, stating its own columns and naming the
   * previous digest. Ended at a row whose signed audit row verifies, this authenticates every body before it without a
   * per-row signature check.
   */
  const walk = (rows: readonly A4TransitionRow[], problems: string[]): Link[] => {
    let prev = "GENESIS";
    return rows.map((row, index) => {
      const body = parseBody(row.body_json);
      if (row.seq !== index || row.prev_digest !== prev) problems.push(`transition ${row.seq} does not link to ${index - 1}`);
      problems.push(...bodyProblems(row, body));
      prev = row.body_digest;
      return { seq: row.seq, kind: row.kind, revisionNo: row.revision_no, body: body ?? {}, row };
    });
  };

  /**
   * The chain readers use, read in one snapshot. A committed write leaves head = verified = the last row, so the chain
   * must end there, hash-link from seq 0 and end at a row whose signed audit row verifies, which authenticates every
   * body. Anything else is A4_INTEGRITY_FAILED, never a shorter chain or a skipped row. A tail cut back to an earlier
   * signed row together with the head is not visible here; the ledger's own hash chain still holds the cut audit rows.
   */
  const readChain = (projectId: string): Link[] => db.transaction((): Link[] => {
    const head = readHead(projectId);
    if (head === null) return [];
    const problems: string[] = [];
    const links = walk(readRows(projectId), problems);
    const last = links.at(-1);
    if (last === undefined || last.seq !== head.head_seq || last.row.body_digest !== head.head_digest
      || head.verified_seq !== head.head_seq || head.verified_digest !== head.head_digest) {
      problems.push("the chain does not end at the verified head");
    } else {
      problems.push(...auditProblems(last.row, getPublicKeyHistory(workspace, "monitor")), ...headProblems(head, last.body));
    }
    if (problems.length > 0) throw integrityFailed(projectId, problems);
    return links;
  })();

  /** sha256 of the project's key.pub as its verified CREATED transition records it. */
  const createdKeySha256 = (projectId: string): string => {
    const keySha256 = readChain(projectId)[0]?.body.projectPublicKeySha256;
    if (typeof keySha256 !== "string") throw integrityFailed(projectId, ["the CREATED record names no key fingerprint"]);
    return keySha256;
  };

  /**
   * Before every write, under the ledger write lock: the whole chain hash-links from seq 0, the verified anchor and
   * every row after it verify against their signed audit rows (so the unsigned `verified_seq` cannot be moved over a
   * forged tail, and no write builds on an edited prefix), every side row a body after the anchor names is stored as
   * named, the head equals the last row, and side tables hold no row the chain does not name.
   * ponytail: the hash walk is O(chain) sha256 under the write lock; design §7 rule 2 keeps only the signature checks
   * O(new rows). Add a signed checkpoint every N rows if long chains show in write latency.
   */
  const verifyIncremental = (projectId: string, head: A4ProjectRow): void => {
    const problems: string[] = [];
    const keys = getPublicKeyHistory(workspace, "monitor");
    const links = walk(readRows(projectId), problems);
    const anchor = head.verified_seq ?? -1;
    if (head.verified_seq !== null && links[head.verified_seq]?.row.body_digest !== head.verified_digest) problems.push(`verified row ${head.verified_seq} changed`);
    for (const link of links.slice(Math.max(anchor, 0))) {
      problems.push(...auditProblems(link.row, keys));
      if (link.seq <= anchor) continue;
      for (const ref of namesIn(link.body)) if (storedSideRowDigest(ref) !== ref.sha256) problems.push(`A4_SIDE_ROW_MISMATCH ${ref.table} ${JSON.stringify(ref.key)}`);
    }
    const last = links.at(-1);
    if (head.head_seq !== (last?.seq ?? -1) || head.head_digest !== last?.row.body_digest) problems.push("head does not equal the last transition");
    if (last !== undefined) problems.push(...headProblems(head, last.body));
    const named = new Map<string, number>();
    for (const link of links) for (const ref of namesIn(link.body)) named.set(ref.table, (named.get(ref.table) ?? 0) + 1);
    for (const table of Object.keys(SIDE_TABLE_KEYS)) {
      const { n } = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE project_id = ?`).get(projectId) as { n: number };
      if (n !== (named.get(table) ?? 0)) problems.push(`A4_SIDE_ROW_UNNAMED ${table}: ${n} rows, ${named.get(table) ?? 0} named`);
    }
    if (problems.length > 0) throw integrityFailed(projectId, problems);
  };

  /**
   * Every row of one side table that the verified chain names, as stored, in chain order. A named row that is missing,
   * changed or tied to another transition is A4_INTEGRITY_FAILED (dropping it could resurrect a removed member); a row
   * no transition names is never returned (the chain is the completeness root for readers too).
   */
  const namedSideRows = (projectId: string, table: A4SideTable): Record<string, Cell>[] => {
    const rows: Record<string, Cell>[] = [];
    const problems: string[] = [];
    for (const link of readChain(projectId)) {
      for (const ref of namesIn(link.body)) {
        if (ref.table !== table) continue;
        const row = storedSideRow(ref);
        const { evidence_event_id: evidenceEventId, ...values } = row ?? {};
        if (row === null || evidenceEventId !== link.row.evidence_event_id || sideRowDigest(values) !== ref.sha256) {
          problems.push(`A4_SIDE_ROW_MISMATCH ${table} ${JSON.stringify(ref.key)}`);
        } else {
          rows.push(row);
        }
      }
    }
    if (problems.length > 0) throw integrityFailed(projectId, problems);
    return rows;
  };

  /**
   * Inside the transaction, before any side row: a replay answers the stored response; a different body, or the same
   * request ID against another project (a create mints its id, so only non-create commits compare it), is 409.
   */
  const dedupeRequest = (request: A4RequestKey, projectId: string, create: boolean, response: Record<string, unknown> | null, ts: number): A4TransitionResult | null => {
    const existing = db.prepare("SELECT body_hash, project_id, response_json, redacted FROM a4_requests WHERE principal_key = ? AND client_request_id = ?")
      .get(request.principalKey, request.clientRequestId) as { body_hash: string; project_id: string | null; response_json: string; redacted: number } | undefined;
    if (existing) {
      if (existing.body_hash !== request.bodyHash || (!create && existing.project_id !== projectId)) {
        throw new A4StoreError(409, "REQUEST_CONFLICT", "That request ID already names a different A4 request.");
      }
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

  /** 423 before anything is written when no vault can sign the audit row (locked, and no AMC_VAULT_PASSPHRASE). */
  const requireSigningKey = (): void => {
    try {
      getPrivateKeyPem(workspace, "monitor");
    } catch (error) {
      if (/vault locked/i.test(error instanceof Error ? error.message : String(error))) throw new A4StoreError(423, "A4_VAULT_LOCKED", "Unlock the vault to record this.");
      throw error;
    }
  };

  const commit = (projectId: string, actor: A4Actor, build: Build, options: A4TransitionOptions, create: NewHead | null): A4TransitionResult => {
    assertProjectId(projectId);
    // The replay namespace is the actor's own: a request key naming anyone else would read or block their replays.
    if (options.request && options.request.principalKey !== actor.key) throw new A4StoreError(400, "INPUT_INVALID", "The request key names another principal.");
    requireSigningKey();
    return withControlFileLock({ root: a4ProjectsRoot(workspace), name: create ? "a4-requests" : `project-${projectId}`, operation: () => {
      for (let attempt = 0; ; attempt += 1) {
        const replay = options.request ? dedupeRequest(options.request, projectId, create !== null, null, 0) : null;
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
        if ((spec.kind === "CREATED") !== (create !== null)) throw new Error("CREATED is a project's first transition and only that");
        for (const key of Object.keys(spec.payload)) if (RESERVED_BODY_KEYS.has(key)) throw new Error(`A4 payload may not set ${key}`);
        if ((spec.kind === "CREATED" || spec.kind === "GATE_POLICY_CHANGED") && !a4GatePolicyV1Schema.safeParse(spec.payload.gatePolicy).success) {
          throw new A4StoreError(400, "INPUT_INVALID", "The gate policy is not an amc.a4-gate-policy/v1 document.");
        }
        const sideRows = spec.sideRows ?? [];
        // The store is the completeness root: a row filed under another project would break both projects' counts for good.
        for (const row of sideRows) if (row.values.project_id !== projectId) throw new Error(`A4 side row in ${row.table} names another project`);
        const stage = spec.stage !== undefined ? spec.stage : head0?.stage ?? "aspire";
        const revisionNo = spec.revisionNo ?? head0?.revision_no ?? 0;
        const readinessSha256 = options.readiness ? options.readiness(db, projectId) : null;
        const prevDigest = head0?.head_digest ?? "GENESIS";
        // head0 is checked inside the transaction to equal the head the last signed body left (verifyIncremental).
        const headAfter = headStateOf({ ...(head0 ?? NEW_HEAD), ...Object.fromEntries(Object.entries(spec.head ?? {}).filter(([, value]) => value !== undefined)) });
        const body = { ...spec.payload, kind: spec.kind, projectId, seq, stage, revisionNo, actorKey: actor.key, actorUsername: actor.username,
          ts, prevDigest, readinessSha256, headAfter, sideRows: sideRows.map((row) => ({ table: row.table, key: keyOf(row), sha256: sideRowDigest(row.values) })) };
        const bytes = canonicalize(body);
        const digest = sha256Hex(bytes);
        const envelope = A4_ENVELOPE_KINDS.includes(spec.kind) ? signEnvelope(digest) : null;
        const agentId = create?.agent_id ?? head0!.agent_id;
        try {
          return runImmediateTransaction(db, (): A4TransitionResult => {
            // (b) One transaction on rows read inside it.
            const replayed = options.request ? dedupeRequest(options.request, projectId, create !== null, { projectId, seq, kind: spec.kind, bodyDigest: digest }, ts) : null;
            if (replayed) return replayed;
            const head = readHead(projectId);
            if (canonicalize(head) !== canonicalize(head0)) throw new HeadMoved();
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
                  claimKind: "self_reported", actorKey: actor.key, prevDigest },
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
              .run(projectId, seq, spec.kind, stage, revisionNo, actor.key, actor.username, bytes, digest, prevDigest, readinessSha256,
                envelope ? JSON.stringify(envelope) : null, evidence.id, ts);
            for (const row of sideRows) {
              const columns = [...Object.keys(row.values), "evidence_event_id"];
              if (!columns.every((column) => COLUMN.test(column))) throw new Error(`invalid column in ${row.table}`);
              db.prepare(`INSERT INTO ${row.table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...Object.values(row.values), evidence.id);
              // A column the writer left to a default, or a value SQLite coerced, would make the signed name unverifiable.
              if (storedSideRowDigest({ table: row.table, key: keyOf(row) }) !== sideRowDigest(row.values)) throw new Error(`A4_SIDE_ROW_MISMATCH: ${row.table} must name every column`);
            }
            const patch = { ...headAfter, head_seq: seq, head_digest: digest, verified_seq: seq, verified_digest: digest, updated_ts: ts };
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
  };

  const membersOf = (projectId: string): A4Member[] => {
    const latest = new Map<string, A4Member | null>();
    for (const raw of namedSideRows(projectId, "a4_members")) {
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
    transition: (projectId: string, actor: A4Actor, build: Build, options: A4TransitionOptions = {}): A4TransitionResult => commit(projectId, actor, build, options, null),
    readRevision: (projectId: string, revisionNo: number) => {
      const row = namedSideRows(projectId, "a4_revisions").find((candidate) => candidate.revision_no === revisionNo);
      return row === undefined ? null : a4RevisionRowSchema.parse(row);
    },
    listProjects: (): A4ProjectRow[] => (db.prepare("SELECT * FROM a4_projects WHERE workspace_id = ? ORDER BY created_ts")
      .all(workspaceId) as unknown[]).map((row) => a4ProjectRowSchema.parse(row)),

    /**
     * Refused without a signed approval policy. CREATED carries the default gate policy, the derived single-user
     * self-approval facts and `projectPublicKeySha256`, the sha256 of the project's key.pub PEM; the creator becomes the
     * first owner. One active project per agent (partial unique index; checked first under the `a4-requests` lock so a
     * refusal leaves no key).
     */
    createProject(input: { actor: A4Principal; agentId: string; name: string; hostedRouter: boolean; request?: A4RequestKey }): A4TransitionResult {
      const policy = verifyApprovalPolicySignature(workspace);
      if (!policy.signatureExists && policy.reason === "approval policy missing") {
        throw new A4StoreError(409, "APPROVAL_POLICY_MISSING", "Run `amc policy approval init` before creating an A4 project.");
      }
      if (!policy.valid) throw new A4StoreError(409, "APPROVAL_POLICY_UNSIGNED", `the approval policy does not verify: ${policy.reason ?? "unknown"}`);
      if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(input.agentId)) throw new A4StoreError(400, "INPUT_INVALID", "Choose a valid agent ID.");
      if (input.name.trim().length === 0) throw new A4StoreError(400, "INPUT_INVALID", "Name the project.");
      const projectId = randomId("a4p");
      const population = principalPopulation(workspace);
      const selfApprovalAllowed = deriveSelfApprovalAllowed({ activeLocal: population.activeLocal, hostPrincipals: population.hostPrincipals,
        hostedRouter: input.hostedRouter, regulated: false, workspaceFloor: undefined, ratcheted: false, decidingPrincipal: input.actor });
      const gatePolicy: A4GatePolicyV1 = DEFAULT_A4_GATE_POLICY;
      let projectPublicKeySha256: string | null = null;
      return commit(projectId, input.actor, ({ seq, ts }) => {
        if (db.prepare("SELECT 1 FROM a4_projects WHERE workspace_id = ? AND agent_id = ? AND stage <> 'retired'").get(workspaceId, input.agentId)) {
          throw new A4StoreError(409, "A4_AGENT_HAS_ACTIVE_PROJECT", `agent ${input.agentId} already has an active A4 project; retire it first`);
        }
        try {
          projectPublicKeySha256 ??= createProjectKey(workspace, projectId);
        } catch (error) {
          if (error instanceof A4BlobError && error.code === "VAULT_LOCKED") throw new A4StoreError(423, "A4_VAULT_LOCKED", "Unlock the vault to create an A4 project.");
          throw error;
        }
        return {
          kind: "CREATED", stage: "aspire", revisionNo: 0,
          payload: { workspaceId, agentId: input.agentId, name: input.name.trim(), gatePolicy, gatePolicyDigest: sha256Hex(canonicalize(gatePolicy)), projectPublicKeySha256,
            selfApprovalAllowed, selfApprovalFacts: { activeUserCount: population.activeLocal?.length ?? null, hostPrincipals: population.hostPrincipals,
              hostedRouter: input.hostedRouter, ratcheted: false, regulated: false, selfApprovalAllowed } },
          sideRows: [memberRow(projectId, seq, ts, input.actor, "added",
            { principalKey: input.actor.key, authSource: input.actor.authSource, userId: input.actor.userId, username: input.actor.username }, ["owner"])]
        };
      }, { request: input.request }, { project_id: projectId, workspace_id: workspaceId, agent_id: input.agentId, name: input.name.trim(),
        created_by_key: input.actor.key });
    },

    /** A new accepted specification: revision N+1 with its content digest and the resource digests it depends on. */
    appendRevision(projectId: string, input: { actor: A4Actor; stage: A4Stage; spec: Record<string, unknown>; resourceDigests: A4ResourceDigests;
      operatingScope?: Record<string, unknown> | null; expectedHeadSeq: number; request?: A4RequestKey }): A4TransitionResult {
      const resourceDigests = a4ResourceDigestsSchema.parse(input.resourceDigests);
      return commit(projectId, input.actor, ({ head, ts }) => {
        const revisionNo = head!.revision_no + 1;
        const values = { project_id: projectId, revision_no: revisionNo, stage: input.stage, parent_revision_no: head!.revision_no === 0 ? null : head!.revision_no,
          spec_json: canonicalize(input.spec), spec_digest: sha256Hex(canonicalize(input.spec)), resource_digests_json: canonicalize(resourceDigests),
          resource_digests_sha256: sha256Hex(canonicalize(resourceDigests)), operating_scope_json: input.operatingScope ? canonicalize(input.operatingScope) : null,
          created_by_key: input.actor.key, ts };
        return { kind: "REVISION", stage: input.stage, revisionNo, payload: { specDigest: values.spec_digest,
          resourceDigestsSha256: values.resource_digests_sha256 }, sideRows: [{ table: "a4_revisions", values }], head: { revision_no: revisionNo } };
      }, { expectedHeadSeq: input.expectedHeadSeq, request: input.request }, null);
    },

    /**
     * A membership event; refused when it would leave the project without an owner. The member's identity is read, never
     * taken from the caller: an add names an ACTIVE users.yaml user or a live host session, a change or removal a
     * current member. Authorization is the router's (P1-57).
     */
    recordMember(projectId: string, input: { actor: A4Actor; event: "added" | "roles_changed" | "removed"; principalKey: string;
      roles: A4Member["roles"]; expectedHeadSeq: number; request?: A4RequestKey }): A4TransitionResult {
      return commit(projectId, input.actor, ({ seq, ts }) => {
        const members = membersOf(projectId);
        const member = input.event === "added" ? memberCandidates(workspace, false).candidates.find((candidate) => candidate.principalKey === input.principalKey)
          : members.find((current) => current.principalKey === input.principalKey);
        if (member === undefined) {
          throw input.event === "added" ? new A4StoreError(409, "A4_PRINCIPAL_UNKNOWN", "No ACTIVE user or live host session has that principal key.")
            : new A4StoreError(409, "A4_NOT_A_MEMBER", "That principal is not a member of this project.");
        }
        const after = members.filter((current) => current.principalKey !== member.principalKey);
        if (input.event !== "removed") after.push({ ...member, roles: input.roles });
        if (!after.some((current) => current.roles.includes("owner"))) throw new A4StoreError(409, "A4_LAST_OWNER", "A project keeps at least one owner.");
        return { kind: "MEMBER", payload: { event: input.event, principalKey: member.principalKey, roles: [...input.roles] },
          sideRows: [memberRow(projectId, seq, ts, input.actor, input.event, member, input.event === "removed" ? [] : input.roles)] };
      }, { expectedHeadSeq: input.expectedHeadSeq, request: input.request }, null);
    },

    /**
     * The body goes to the project's encrypted blob store, sealed to the key CREATED names (the blob write needs no
     * vault; the transition's audit row does); the row keeps only the salted hash and the ciphertext reference. The blob
     * is written inside the build, so a missing project, a vault that cannot sign or a request replay writes none.
     * ponytail: a blob whose transition then fails stays as an unreferenced file.
     */
    addComment(projectId: string, input: { actor: A4Actor; body: string; cardId: string; inReplyTo?: string | null; request?: A4RequestKey }): A4TransitionResult {
      if (input.body.trim().length === 0 || input.cardId.trim().length === 0) throw new A4StoreError(400, "INPUT_INVALID", "A comment needs text and a card.");
      const commentId = randomId("a4c");
      let blob: { bodySha256: string; blobRef: string } | undefined;
      return commit(projectId, input.actor, ({ head, ts }) => {
        blob ??= putPrivate(workspace, projectId, Buffer.from(input.body, "utf8"), createdKeySha256(projectId));
        return { kind: "COMMENT", payload: { commentId, cardId: input.cardId, bodySha256: blob.bodySha256, blobRef: blob.blobRef },
          sideRows: [{ table: "a4_comments", values: { comment_id: commentId, project_id: projectId, revision_no: head!.revision_no, stage: head!.stage,
            card_id: input.cardId, author_key: input.actor.key, body_sha256: blob.bodySha256, blob_ref: blob.blobRef, in_reply_to: input.inReplyTo ?? null, ts } }] };
      }, { request: input.request }, null);
    },

    /**
     * An EVIDENCE_REF transition. The lane is derived, never chosen: the writer names only the self-reported column. A
     * ledger_event ref is resolved before anything is signed: a missing row is 409 EVIDENCE_REF_DANGLING, a row whose
     * digests are not the ref's or whose signature or chain does not verify is 409 EVIDENCE_REF_UNVERIFIED, and the tier
     * is the row's `effectiveTrustTier`, never its declared tier.
     */
    addEvidenceRef(projectId: string, input: { actor: A4Actor; refKind: A4RefKind; refId: string; sha256: string; claimKind: ClaimKind;
      method: string | null; label: string; column: "recommendation" | "implementation"; expectedHeadSeq: number; request?: A4RequestKey }): A4TransitionResult {
      if (!/^[0-9a-f]{64}$/.test(input.sha256)) throw new A4StoreError(400, "INPUT_INVALID", "sha256 must be 64 lowercase hex characters.");
      let trustTier: string | null = null;
      if (input.refKind === "ledger_event") {
        const resolved = resolveLedgerEvent(ledger, input.refId, input.sha256, readerTrustFor(workspace), []);
        if (!resolved.found) throw new A4StoreError(409, "EVIDENCE_REF_DANGLING", `no ledger row ${input.refId}`);
        if (resolved.status !== "resolved" && resolved.status !== "payload_pruned") {
          throw new A4StoreError(409, "EVIDENCE_REF_UNVERIFIED", `ledger row ${input.refId} does not match that sha256 or does not verify`);
        }
        trustTier = resolved.tier;
      }
      const derived = laneForClaimKind(input.claimKind, trustTier, input.method, input.column);
      return commit(projectId, input.actor, ({ head, seq, ts }) => ({
        kind: "EVIDENCE_REF",
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
