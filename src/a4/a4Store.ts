/**
 * A4 Forge project store (P1-56; design §4.2–§4.3). One write path, copied from the action journal: under the
 * project's control-file lock, verify the whole chain and every side table (`verifyChain`), build the transition body
 * on the head it verified and sign any A4_RECORD envelope OUTSIDE the ledger transaction; then, in one `BEGIN
 * IMMEDIATE`, dedupe the request, check the head has not moved (else rebuild and re-sign once, then 409
 * A4_STALE_HEAD) and that its own row remains admitted (`verifyIncremental`; global authority reads), append the signed audit row,
 * insert the transition and the side rows its body names, and advance the head. Readers (`readHead`,
 * `listProjects`, `readChain`, `membersOf`, `readRevision`, `ratcheted`) use only a chain that verifies whole up to its
 * signed head.
 *
 * Every row this store writes is `meta.source: "a4-store"`, `trustTier: "SELF_REPORTED"`, `claimKind: "self_reported"`;
 * there is no producer parameter and no path to OBSERVED. Observed facts enter only by reference (src/a4/a4Evidence.ts).
 * Only this file may contain the literal `auditType: "A4_STATE"` (`npm run check:gates` scans literals per file and
 * `NON_MATURITY_AUDIT_MODULES` classifies this module alone). Audit readers use actual local purpose math
 * and provider delegation/receipt admission under operator trust: a local trail, not a portable verdict.
 */
import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import type Database from "better-sqlite3";
import { a4FloorFor, loadVerifiedApprovalPolicy } from "../approvals/approvalPolicyEngine.js";
import { eventMeta, readerTrustFor } from "../claims/evidenceProvenance.js";
import type { ClaimKind } from "../claims/eligibility/types.js";
import { getPrivateKeyPem } from "../crypto/keys.js";
import { signDigestWithPolicy } from "../crypto/signing/signer.js";
import type { SignedDigest } from "../crypto/signing/signerTypes.js";
import { openLedger, type Ledger } from "../ledger/ledger.js";
import { ledgerSynchronousMode } from "../ledger/ledgerDurability.js";
import { A4_STORE_BINARY, runImmediateTransaction } from "../ledger/ledgerSessionTransactions.js";
import { withControlFileLock } from "../lifecycle/controlFileLock.js";
import { assertOwnerMode } from "../mode/mode.js";
import { highSeveritySecretTypes } from "../release/releaseSecretScan.js";
import type { TrustContext } from "../trust/trustContext.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { workspaceIdFromDirectory } from "../workspaces/workspaceId.js";
import { a4AuditProblems } from "./a4AuditReader.js";
import { prepareA4Record, SIDE_TABLE_KEYS, NEW_HEAD, headProblems, type A4Actor, type Cell, type A4SideTable, type A4SideRow,
  type A4ChangeSpec, type A4HeadState, type A4RequestKey, type A4TransitionOptions, type A4TransitionResult, type Build, type NewHead } from "./a4TransitionRecords.js";
export type { A4Actor, A4ChangeSpec, A4RequestKey, A4TransitionOptions, A4TransitionResult } from "./a4TransitionRecords.js";
import { captureA4RecordSigner, assertA4HotWriters, createA4CurrentLatch, A4TransitionPublicationError, type A4TransitionAttempt, type A4TransitionProgress } from "./a4TransitionSigning.js";
import { A4BlobError, a4ProjectsRoot, createProjectKey, putPrivate } from "./a4Blobs.js";
import { a4MirrorDivergence, LEDGER_BACKEND_INCOMPLETE_MESSAGE, ledgerBackendGap, writeA4Mirror } from "./a4LedgerBackend.js";
import { ledgerRefClaim, resolveLedgerEvent } from "./a4Evidence.js";
import { type LedgerMirror, openLedgerMirror } from "../persistence/postgres/postgresLedgerMirror.js";
import { assertMember, liveRolesFor, memberCandidates, populationFacts, principalPopulation } from "./a4Identity.js";
import {
  A4_ENVELOPE_KINDS, defaultGatePolicyFor, a4EffectRowSchema, a4GatePolicyV1Schema, a4MemberRowSchema, a4ProjectRowSchema,
  a4RevisionRowSchema, a4TransitionRowSchema, deriveSelfApprovalAllowed, gatePolicyFloorViolations, gatePolicyOf, gatePolicyWeakenings,
  laneForClaimKind, ratchetedFromChain, type A4ChainLink, type A4GatePolicyV1,
  type A4Member, type A4Principal, type A4ProjectRow, type A4RefKind, type A4ResourceDigests, type A4Stage,
  type A4TransitionRow, a4ResourceDigestsSchema
} from "./a4Schema.js";

const A4_AUDIT_TYPE = "A4_STATE" as const;
/** The rows only this store writes in its `a4-<projectId>-<seq>` sessions (the ledger refuses any other writer there). */
export const A4_WITNESS = { sessions: `binary_path = '${A4_STORE_BINARY}'`,
  events: `json_extract(meta_json, '$.source') = 'a4-store' AND json_extract(meta_json, '$.auditType') = '${A4_AUDIT_TYPE}'` };
/**
 * Whether the ledger holds this store's session or audit row of transition `seq` (`a4-<projectId>-<seq>`), written with
 * the transition: sessions are append-only and audit rows hash-chained, so they witness a transition a4_transitions lost. */
export function a4WitnessExists(db: Database.Database, projectId: string, seq: number): boolean {
  const sessionId = `a4-${projectId}-${seq}`;
  return db.prepare(`SELECT 1 FROM sessions WHERE session_id = ? AND ${A4_WITNESS.sessions}
    UNION ALL SELECT 1 FROM evidence_events WHERE session_id = ? AND ${A4_WITNESS.events} LIMIT 1`).get(sessionId, sessionId) !== undefined;
}
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

export { collectLiveFacts, readOnlyNow, refreshVolatileFacts } from "./a4LiveFacts.js";

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
  return createStore(workspace, ledger, undefined, openLedgerMirror(workspace));
}

/** The store's readers and verifiers over a ledger opened elsewhere (read-only for `verifyA4Chain`); never for writes. */
export const readA4Store = (ledger: Ledger, trust?: TrustContext): A4Store => createStore(ledger.workspace, ledger, trust);

function createStore(workspace: string, ledger: Ledger, trust?: TrustContext, mirror: LedgerMirror | null = null) {
  const db = ledger.db;
  /** Recorded on each project only: the ledger is the workspace's own, so no query filters on this path-derived id. */
  const workspaceId = workspaceIdFromDirectory(workspace);
  // P2-36: on a Postgres-pinned workspace (`openA4Store` only) every commit writes through to Postgres before SQLite commits.
  const mirrorWrite = (projectId: string): void => writeA4Mirror(mirror, db, projectId, (...args) => new A4StoreError(...args));

  /** The unsigned head row as stored; only `verified` and the write path, which verifies it, read it. */
  const readHeadRow = (projectId: string): A4ProjectRow | null => {
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

  /** A side row this write just inserted, as stored, minus its evidence id, hashed the way the body names it. */
  const storedSideRowDigest = (row: A4SideRow): string | null => {
    const columns = SIDE_TABLE_KEYS[row.table];
    const stored = db.prepare(`SELECT * FROM ${row.table} WHERE ${columns.map((column) => `${column} = ?`).join(" AND ")}`)
      .get(...columns.map((column) => row.values[column] ?? null)) as Record<string, Cell> | undefined;
    if (stored === undefined) return null;
    const { evidence_event_id: _evidenceEventId, ...values } = stored;
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

  /** Actual audit bytes and purpose/delegation/receipt admission within the caller's SQL transaction. */
  const auditProblems = (row: A4TransitionRow): string[] => a4AuditProblems(ledger, row, trust);

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
   * body. Anything else is A4_INTEGRITY_FAILED, never a shorter chain or a skipped row: a tail cut back to an earlier
   * signed row together with the head fails on the next transition's ledger session, and transitions or a seq-0
   * session without a head row fail rather than read as an empty project.
   */
  const verified = (projectId: string): { head: A4ProjectRow | null; links: Link[] } => db.transaction(() => {
    const head = readHeadRow(projectId);
    if (head === null) {
      if (db.prepare("SELECT 1 FROM a4_transitions WHERE project_id = ? LIMIT 1").get(projectId) !== undefined || a4WitnessExists(db, projectId, 0)) {
        throw integrityFailed(projectId, ["transitions exist without a head"]);
      }
      return { head: null, links: [] };
    }
    const problems: string[] = [];
    if (a4WitnessExists(db, projectId, head.head_seq + 1)) problems.push("chain truncated: a later A4 audit session exists");
    const links = walk(readRows(projectId), problems);
    const last = links.at(-1);
    if (last === undefined || last.seq !== head.head_seq || last.row.body_digest !== head.head_digest
      || head.verified_seq !== head.head_seq || head.verified_digest !== head.head_digest) {
      problems.push("the chain does not end at the verified head");
    } else {
      problems.push(...auditProblems(last.row), ...headProblems(head, last.body));
    }
    if (problems.length > 0) throw integrityFailed(projectId, problems);
    return { head, links };
  })();
  const readChain = (projectId: string): Link[] => verified(projectId).links;

  /** sha256 of the project's key.pub as its verified CREATED transition records it. */
  const createdKeySha256 = (projectId: string): string => {
    const keySha256 = readChain(projectId)[0]?.body.projectPublicKeySha256;
    if (typeof keySha256 !== "string") throw integrityFailed(projectId, ["the CREATED record names no key fingerprint"]);
    return keySha256;
  };

  /**
   * One side table against the verified chain, in one indexed scan of the project's rows: the rows the chain names, as
   * stored, in chain order; each name whose row is missing, changed or tied to another transition; and each stored key
   * no transition names. Compared as key sets, never as counts.
   */
  const matchSideTable = (projectId: string, links: readonly Link[], table: A4SideTable): { rows: Record<string, Cell>[]; mismatched: string[]; unnamed: string[] } => {
    const columns = SIDE_TABLE_KEYS[table];
    const keyText = (key: Readonly<Record<string, unknown>>): string => JSON.stringify(columns.map((column) => key[column] ?? null));
    const stored = new Map((db.prepare(`SELECT * FROM ${table} WHERE project_id = ?`).all(projectId) as Record<string, Cell>[]).map((row) => [keyText(row), row]));
    const rows: Record<string, Cell>[] = [];
    const mismatched: string[] = [];
    for (const link of links) {
      for (const ref of namesIn(link.body)) {
        if (ref.table !== table) continue;
        const key = keyText(ref.key ?? {});
        const row = stored.get(key);
        stored.delete(key);
        const { evidence_event_id: evidenceEventId, ...values } = row ?? {};
        if (row === undefined || evidenceEventId !== link.row.evidence_event_id || sideRowDigest(values) !== ref.sha256) {
          mismatched.push(`A4_SIDE_ROW_MISMATCH ${table} ${key}`);
        } else {
          rows.push(row);
        }
      }
    }
    return { rows, mismatched, unnamed: [...stored.keys()].map((key) => `A4_SIDE_ROW_UNNAMED ${table} ${key}`) };
  };

  /**
   * The full check before every write, under the project's control-file lock (which serialises the project's writers)
   * but outside the ledger transaction: the chain verifies whole up to its head (`verified`), and every side table holds
   * exactly the rows the chain names, as named. Returns the head it verified.
   * ponytail: O(chain) sha256 and side-row scans per write, though never under the ledger write lock; add a signed
   * checkpoint every N rows if long chains show in write latency.
   */
  const verifyChain = (projectId: string): A4ProjectRow | null => db.transaction(() => {
    const { head, links } = verified(projectId);
    const problems = (Object.keys(SIDE_TABLE_KEYS) as A4SideTable[]).flatMap((table) => {
      const { mismatched, unnamed } = matchSideTable(projectId, links, table);
      return [...mismatched, ...unnamed];
    });
    if (problems.length > 0) throw integrityFailed(projectId, problems);
    return head;
  })();

  /**
   * Inside the write transaction, only this unchanged head transition is re-read, not the project chain. Authority
   * admission can scan global SQL even for unbound receipts; bound row admission also reads all three global streams.
   * `verifyChain` verified this head before the transaction and the caller has seen it unmoved. It must still hash to
   * the verified digest, state its columns, carry an admitted audit row and sign this head, with no later A4 session.
   */
  const verifyIncremental = (projectId: string, head: A4ProjectRow): void => {
    const problems: string[] = [];
    const parsed = a4TransitionRowSchema.safeParse(db.prepare("SELECT * FROM a4_transitions WHERE project_id = ? AND seq = ?").get(projectId, head.head_seq));
    if (!parsed.success || parsed.data.body_digest !== head.head_digest || head.verified_seq !== head.head_seq || head.verified_digest !== head.head_digest) {
      problems.push("head does not equal the last verified transition");
    } else {
      const body = parseBody(parsed.data.body_json);
      problems.push(...bodyProblems(parsed.data, body), ...auditProblems(parsed.data), ...headProblems(head, body ?? {}));
    }
    if (a4WitnessExists(db, projectId, head.head_seq + 1)) problems.push("chain truncated: a later A4 audit session exists");
    if (problems.length > 0) throw integrityFailed(projectId, problems);
  };

  /**
   * Every row of one side table that the verified chain names, as stored, in chain order. A named row that is missing,
   * changed or tied to another transition is A4_INTEGRITY_FAILED (dropping it could resurrect a removed member); a row
   * no transition names is never returned (the chain is the completeness root for readers too).
   */
  const namedSideRows = (projectId: string, table: A4SideTable): Record<string, Cell>[] => {
    const { rows, mismatched } = matchSideTable(projectId, readChain(projectId), table);
    if (mismatched.length > 0) throw integrityFailed(projectId, mismatched);
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
      for (const purpose of ["ledger-row", "receipt", "artifact-seal"] as const) getPrivateKeyPem(workspace, purpose); // P1-08: the audit row, its receipt and the A4 record
    } catch (error) {
      if (/vault locked/i.test(error instanceof Error ? error.message : String(error))) throw new A4StoreError(423, "A4_VAULT_LOCKED", "Unlock the vault to record this.");
      throw error;
    }
  };

  /** 403 unless `actor` holds live workspace roles and is a current project owner (design §5.2; defence in depth beside the router). */
  const assertOwner = (projectId: string, actor: A4Actor): void => {
    const parsed = /^(LOCAL_USER|WORKSPACE_ROUTER):(.+)$/.exec(actor.key);
    const roles = parsed ? liveRolesFor(workspace, { authSource: parsed[1] as A4Principal["authSource"], userId: parsed[2]! }) : [];
    try {
      if (roles.length === 0) throw new Error("no live roles");
      assertMember(membersOf(projectId), { ...actor, roles }, ["owner"]);
    } catch {
      throw new A4StoreError(403, "A4_NOT_A_MEMBER", "Only a current project owner can do this.");
    }
  };

  /** GATE_POLICY_CHANGED: never below the D-16 defaults or the signed `a4` floor; loosening the policy in force needs owner mode and an owner. */
  const assertGatePolicyChange = (projectId: string, actor: A4Actor, next: A4GatePolicyV1): void => {
    const prev = gatePolicyOf(readChain(projectId));
    const { policy, reason } = loadVerifiedApprovalPolicy(workspace);
    if (policy === null) throw new A4StoreError(409, "APPROVAL_POLICY_UNSIGNED", `the approval policy does not verify, so its a4 floor is unread: ${reason ?? "unknown"}`);
    const below = gatePolicyFloorViolations(next, a4FloorFor(policy), prev);
    if (below.length > 0) throw new A4StoreError(409, "GATE_POLICY_BELOW_FLOOR", below.join("; "), below);
    if (gatePolicyWeakenings(prev, next).length > 0) {
      assertOwnerMode(workspace, "a4 gate-policy");
      assertOwner(projectId, actor);
    }
  };

  const validateTransition = (projectId: string, actor: A4Actor, options: A4TransitionOptions): void => {
    assertProjectId(projectId); if (ledgerBackendGap(workspace, db).length > 0) throw new A4StoreError(503, "LEDGER_BACKEND_INCOMPLETE", LEDGER_BACKEND_INCOMPLETE_MESSAGE);
    if (options.request && options.request.principalKey !== actor.key) throw new A4StoreError(400, "INPUT_INVALID", "The request key names another principal.");
  };
  const prepareTransition = (projectId: string, actor: A4Actor, build: Build, options: A4TransitionOptions, create: NewHead | null,
    sign: ((digest: string) => SignedDigest) | null) => {
    const replay = options.request ? dedupeRequest(options.request, projectId, create !== null, null, 0) : null;
    if (replay) return { replayed: true as const, replay };
    // A write to an existing project verifies the whole chain and every side table first, under the project lock but
    // outside the ledger transaction (design §7 rule 2); the transaction then checks that this head has not moved.
    const head0 = create === null ? verifyChain(projectId) : readHeadRow(projectId);
    if (create === null && head0 === null) throw new A4StoreError(404, "A4_PROJECT_NOT_FOUND", `no A4 project ${projectId}`);
    if (create !== null && head0 !== null) throw new A4StoreError(409, "A4_PROJECT_EXISTS", projectId);
    if (options.expectedHeadSeq !== undefined && head0?.head_seq !== options.expectedHeadSeq) {
      throw new A4StoreError(409, "A4_STALE_HEAD", "The project moved; reload and retry.", { headSeq: head0?.head_seq ?? null });
    }
    // (a) Build and sign outside the ledger transaction: a notary round trip must never hold the ledger write lock.
    // One commit may record several transitions (GATE_CONSUMED + EFFECT_STARTED), each its own chained, signed row.
    const ts = Date.now();
    const seq0 = head0 === null ? 0 : head0.head_seq + 1;
    // Signed on every transition, so any write made while two or more principals were active ratchets self-approval (§5.3).
    const population = populationFacts(workspace);
    const specs = [build({ head: head0, seq: seq0, ts })].flat();
    const readinessSha256 = options.readiness ? options.readiness(db, projectId) : null;
    let prevDigest = head0?.head_digest ?? "GENESIS";
    let headState: A4HeadState = head0 ?? NEW_HEAD;
    const entries = specs.map((spec, index) => {
      const made = prepareA4Record(spec, index, { projectId, actor, create, seq0, ts, headState, previousDigest: prevDigest,
        readinessSha256, population }, assertGatePolicyChange, rows => rows.map(row => ({ table: row.table, key: keyOf(row), sha256: sideRowDigest(row.values) })));
      headState = made.headAfter;
      const entry = { ...made, envelope: A4_ENVELOPE_KINDS.includes(spec.kind) && sign !== null ? sign(made.digest) : null };
      prevDigest = made.digest; return entry;
    });
    const last = entries.at(-1);
    if (last === undefined) throw new Error("a commit records at least one transition");
    const agentId = create?.agent_id ?? head0!.agent_id;
    return { replayed: false as const, projectId, actor, options, create, head0, ts, readinessSha256, entries, last, agentId };
  };
  const finalizeTransition = (prepared: Exclude<ReturnType<typeof prepareTransition>, { replayed: true }>, current?: () => void): A4TransitionResult => {
    const { projectId, actor, options, create, head0, ts, readinessSha256, entries, last, agentId } = prepared;
    return runImmediateTransaction(db, (): A4TransitionResult => {
      // (b) One transaction on rows read inside it.
      const replayed = options.request
        ? dedupeRequest(options.request, projectId, create !== null, { ...options.response, projectId, seq: last.seq, kind: last.spec.kind, bodyDigest: last.digest }, ts) : null;
      if (replayed) return replayed;
      const head = readHeadRow(projectId);
      if (canonicalize(head) !== canonicalize(head0)) throw new HeadMoved();
      if (head) verifyIncremental(projectId, head);
      if (options.readiness && options.readiness(db, projectId) !== readinessSha256) throw new HeadMoved();
      current?.();
      let evidence: { id: string } | undefined;
      for (const entry of entries) {
        current?.();
        const { spec, seq, stage, revisionNo } = entry;
        const sessionId = `a4-${projectId}-${seq}`;
        ledger.startSession({ sessionId, runtime: "unknown", binaryPath: A4_STORE_BINARY, binarySha256: A4_STORE_BINARY });
        try {
          current?.();
          evidence = ledger.appendEvidenceWithReceipt({
            sessionId, runtime: "unknown", eventType: "audit", payload: entry.bytes, inline: true,
            // Key order is load-bearing for the row hash; these are human statements recorded by AMC, never observations.
            meta: { source: "a4-store", trustTier: "SELF_REPORTED", auditType: "A4_STATE", a4Kind: spec.kind, projectId, seq, revisionNo, stage,
              claimKind: "self_reported", actorKey: actor.key, prevDigest: entry.prevDigest },
            receipt: { kind: "guard_check", agentId, providerId: A4_STORE_BINARY, model: null, bodySha256: entry.digest }
          });
        } finally {
          ledger.sealSession(sessionId);
        }
        current?.();
        if (create && seq === 0) {
          db.prepare(`INSERT INTO a4_projects (project_id, workspace_id, agent_id, name, stage, step, hold, hold_reason, revision_no, head_seq,
                    head_digest, created_by_key, created_ts, updated_ts) VALUES (?, ?, ?, ?, 'aspire', 'asked', 0, NULL, 0, 0, ?, ?, ?, ?)`)
            .run(create.project_id, create.workspace_id, create.agent_id, create.name, entry.digest, create.created_by_key, ts, ts);
        }
        db.prepare(`INSERT INTO a4_transitions (project_id, seq, kind, stage, revision_no, actor_key, actor_username, body_json, body_digest,
                  prev_digest, readiness_sha256, envelope_json, evidence_event_id, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(projectId, seq, spec.kind, stage, revisionNo, actor.key, actor.username, entry.bytes, entry.digest, entry.prevDigest, readinessSha256,
            entry.envelope ? JSON.stringify(entry.envelope) : null, evidence.id, ts);
        for (const row of entry.sideRows) {
          current?.();
          const columns = [...Object.keys(row.values), "evidence_event_id"];
          if (!columns.every((column) => COLUMN.test(column))) throw new Error(`invalid column in ${row.table}`);
          db.prepare(`INSERT INTO ${row.table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(...Object.values(row.values), evidence.id);
          // A column the writer left to a default, or a value SQLite coerced, would make the signed name unverifiable.
          if (storedSideRowDigest(row) !== sideRowDigest(row.values)) throw new Error(`A4_SIDE_ROW_MISMATCH: ${row.table} must name every column`);
        }
        // The liveness index beside EFFECT_STARTED (design §6.5): the sweeper reads its owner; the chain stays the state.
        current?.();
        const start = spec.startEffect;
        if (start) db.prepare(`INSERT INTO a4_effects (effect_id, project_id, gate_id, execution_id, approval_request_id, owner_pid, owner_host, started_ts,
                heartbeat_ts, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running')`).run(start.effectId, projectId, start.gateId, start.executionId, start.approvalRequestId, process.pid, hostname(), ts, ts);
        if (spec.settleEffect) db.prepare("UPDATE a4_effects SET state = ? WHERE effect_id = ? AND project_id = ?").run(spec.settleEffect.state, spec.settleEffect.effectId, projectId);
      }
      current?.();
      const patch = { ...last.headAfter, head_seq: last.seq, head_digest: last.digest, verified_seq: last.seq, verified_digest: last.digest, updated_ts: ts };
      db.prepare(`UPDATE a4_projects SET ${Object.keys(patch).map((column) => `${column} = @${column}`).join(", ")} WHERE project_id = @project_id`)
        .run({ ...patch, project_id: projectId });
      current?.();
      db.prepare("DELETE FROM a4_requests WHERE ts < ?").run(ts - A4_REQUEST_WINDOW_MS);
      current?.();
      mirrorWrite(projectId); // last: Postgres commits first, so a mirror that cannot commit rolls this transaction back
      return { replay: false, projectId, seq: last.seq, kind: last.spec.kind, bodyDigest: last.digest, evidenceEventId: evidence!.id, envelope: last.envelope };
    });
  };
  const commitFailure = (error: unknown, attempt: number, create: NewHead | null): void => {
    if (error instanceof HeadMoved) {
      if (attempt === 0) return;
      throw new A4StoreError(409, "A4_STALE_HEAD", "The project moved twice while this change was signed; reload and retry.");
    }
    if (create && /UNIQUE constraint failed: a4_projects\.agent_id/.test(String(error))) {
      throw new A4StoreError(409, "A4_AGENT_HAS_ACTIVE_PROJECT", `agent ${create.agent_id} already has an active A4 project; retire it first`);
    }
    throw error;
  };
  const commit = (projectId: string, actor: A4Actor, build: Build, options: A4TransitionOptions, create: NewHead | null): A4TransitionResult => {
    validateTransition(projectId, actor, options); requireSigningKey();
    return withControlFileLock({ root: a4ProjectsRoot(workspace), name: create ? "a4-requests" : `project-${projectId}`, operation: () => {
      for (let attempt = 0; ; attempt += 1) {
        const prepared = prepareTransition(projectId, actor, build, options, create, signEnvelope);
        if (prepared.replayed) return prepared.replay;
        try { return finalizeTransition(prepared); } catch (error) { commitFailure(error, attempt, create); }
      }
    } });
  };
  const commitAsync = async (projectId: string, actor: A4Actor, build: Build, supplied: A4TransitionOptions,
    beforeSign: () => void): Promise<A4TransitionAttempt> => {
    const progress: A4TransitionProgress = { signCalls: 0, signatures: 0, lockAttempts: 0, lockEntered: 0, lockReturned: 0, nativeEntered: 0, nativeReturned: 0 };
    let completed: A4TransitionResult | null = null;
    const observedCurrent = createA4CurrentLatch();
    try {
      actor = { ...actor };
      const options = { ...supplied, request: supplied.request === undefined ? undefined : structuredClone(supplied.request),
        response: supplied.response === undefined ? undefined : structuredClone(supplied.response) };
      validateTransition(projectId, actor, options);
      const authority = captureA4RecordSigner(workspace);
      const actorCurrent = () => observedCurrent(() => { authority.assertCurrent(); beforeSign(); authority.assertCurrent(); });
      actorCurrent(); assertA4HotWriters(workspace);
      const locked = <T>(operation: () => T): T => {
        progress.lockAttempts++;
        const result = withControlFileLock({ root: a4ProjectsRoot(workspace), name: `project-${projectId}`, operation: () => {
          progress.lockEntered++; return operation();
        } });
        progress.lockReturned++; return result;
      };
      const replayCurrent = (result: A4TransitionResult) => {
        const next = options.request ? dedupeRequest(options.request, projectId, false, null, 0) : null;
        if (next === null || canonicalize(next) !== canonicalize(result)) throw new A4StoreError(409, "A4_STALE_HEAD", "The replayed request changed.");
      };
      for (let attempt = 0; ; attempt += 1) {
        const prepared = locked(() => { actorCurrent(); return prepareTransition(projectId, actor, ctx => structuredClone(build(ctx)), options, null, null); });
        if (prepared.replayed) {
          completed = structuredClone(prepared.replay);
          const result = completed;
          return Object.freeze({ result: structuredClone(result), assertCurrent() {
            try { observedCurrent(() => { authority.assertCurrent(); actorCurrent(); authority.assertCurrent(); replayCurrent(result); }); } catch (cause) { throw new A4TransitionPublicationError(progress, cause, result); }
          } });
        }
        const signatures: Array<() => void> = [];
        const current = () => observedCurrent(() => {
          authority.assertCurrent();
          for (const check of signatures) check();
          for (const entry of prepared.entries) if (A4_ENVELOPE_KINDS.includes(entry.spec.kind) && entry.envelope === null)
            throw new A4StoreError(409, "A4_SIGNING_UNAVAILABLE", "An actual A4 record signature is missing.");
        });
        const inputs = () => {
          authority.assertCurrent(); for (const check of signatures) check();
          actorCurrent();
          if (canonicalize(readHeadRow(projectId)) !== canonicalize(prepared.head0)) throw new HeadMoved();
          if (options.readiness && options.readiness(db, projectId) !== prepared.readinessSha256) throw new HeadMoved();
          authority.assertCurrent(); for (const check of signatures) check();
        };
        try {
          for (const entry of prepared.entries) if (A4_ENVELOPE_KINDS.includes(entry.spec.kind)) {
            inputs();
            progress.signCalls++;
            const signed = await authority.sign(entry.digest, inputs);
            progress.signatures++; entry.envelope = signed.signed; signatures.push(signed.assertCurrent); inputs();
          }
          const result = locked(() => {
            inputs(); current(); verifyChain(projectId);
            progress.nativeEntered++;
            const committed = finalizeTransition(prepared, current);
            progress.nativeReturned++; return committed;
          });
          completed = structuredClone(result);
          const assertOwn = () => observedCurrent(() => {
            current(); actorCurrent(); current();
            if (result.replay) { replayCurrent(result); return; }
            const head = verifyChain(projectId), last = prepared.last;
            if (head?.head_seq !== last.seq || head.head_digest !== last.digest || head.verified_seq !== last.seq || head.verified_digest !== last.digest)
              throw new A4StoreError(409, "A4_STALE_HEAD", "The committed A4 head changed.");
            for (const entry of prepared.entries) {
              const row = a4TransitionRowSchema.parse(db.prepare("SELECT * FROM a4_transitions WHERE project_id = ? AND seq = ?").get(projectId, entry.seq));
              if (row.kind !== entry.spec.kind || row.stage !== entry.stage || row.revision_no !== entry.revisionNo || row.actor_key !== actor.key
                || row.actor_username !== actor.username || row.body_json !== entry.bytes || row.body_digest !== entry.digest || row.prev_digest !== entry.prevDigest
                || row.readiness_sha256 !== prepared.readinessSha256 || row.envelope_json !== (entry.envelope ? JSON.stringify(entry.envelope) : null) || row.ts !== prepared.ts
                || ledger.getEventById(row.evidence_event_id)?.payload_sha256 !== entry.digest
                || (entry.seq === last.seq && row.evidence_event_id !== result.evidenceEventId))
                throw new A4StoreError(409, "A4_STALE_HEAD", "The committed A4 transition changed.");
            }
          });
          assertOwn();
          return Object.freeze({ result: structuredClone(result), assertCurrent() {
            try { assertOwn(); } catch (cause) { throw new A4TransitionPublicationError(progress, cause, result); }
          } });
        } catch (error) { commitFailure(error, attempt, null); }
      }
    } catch (cause) { throw new A4TransitionPublicationError(progress, cause, completed); }
  };

  /** The current members: the latest event per principal of the chain-named member rows. */
  const membersFrom = (rows: readonly Record<string, Cell>[]): A4Member[] => {
    const latest = new Map<string, A4Member | null>();
    for (const raw of rows) {
      const row = a4MemberRowSchema.parse(raw);
      latest.set(row.principal_key, row.event === "removed" ? null : {
        principalKey: row.principal_key, authSource: row.auth_source as A4Member["authSource"], userId: row.user_id, username: row.username,
        roles: JSON.parse(row.roles_json) as A4Member["roles"]
      });
    }
    return [...latest.values()].filter((member): member is A4Member => member !== null);
  };
  const membersOf = (projectId: string): A4Member[] => membersFrom(namedSideRows(projectId, "a4_members"));

  const memberRow = (projectId: string, seq: number, ts: number, actor: A4Actor, event: "added" | "roles_changed" | "removed",
    member: Pick<A4Member, "principalKey" | "authSource" | "userId" | "username">, roles: readonly string[]): A4SideRow => ({
    table: "a4_members",
    values: { project_id: projectId, seq, event, principal_key: member.principalKey, auth_source: member.authSource, user_id: member.userId,
      username: member.username, roles_json: JSON.stringify(roles), actor_key: actor.key, ts }
  });

  return {
    workspace,
    ledger,
    /** The head row, only once the chain verifies up to it (its digest and signed headAfter); else A4_INTEGRITY_FAILED. */
    readHead: (projectId: string): A4ProjectRow | null => verified(projectId).head,
    readChain,
    membersOf,
    assertOwner,
    verifyChain,
    /** Verified chain, chain-named side rows and members in one snapshot; a4_effects rows ride along unverified (liveness only, never state). */
    snapshot: (projectId: string) => db.transaction(() => {
      const { head, links } = verified(projectId);
      if (head === null) throw new A4StoreError(404, "A4_PROJECT_NOT_FOUND", `no A4 project ${projectId}`);
      const rows = Object.fromEntries((Object.keys(SIDE_TABLE_KEYS) as A4SideTable[]).map((table) => {
        const { rows: named, mismatched } = matchSideTable(projectId, links, table);
        if (mismatched.length > 0) throw integrityFailed(projectId, mismatched);
        return [table, named];
      })) as Record<A4SideTable, Record<string, Cell>[]>;
      const effects = (db.prepare("SELECT * FROM a4_effects WHERE project_id = ?").all(projectId) as unknown[]).map((row) => a4EffectRowSchema.parse(row));
      const diverged = a4MirrorDivergence(mirror, db, projectId);
      if (diverged.length > 0) throw integrityFailed(projectId, diverged);
      return { head, links: links as A4ChainLink[], rows, members: membersFrom(rows.a4_members), effects };
    })(),
    /** Running effects across projects, for the liveness sweeper. */
    runningEffects: () => (db.prepare("SELECT * FROM a4_effects WHERE state = 'running'").all() as unknown[]).map((row) => a4EffectRowSchema.parse(row)),
    /** The executor's 5 s heartbeat; only a running row moves. */
    heartbeatEffect: (effectId: string): unknown => db.prepare("UPDATE a4_effects SET heartbeat_ts = ? WHERE effect_id = ? AND state = 'running'").run(Date.now(), effectId),
    verifyIncremental,
    transition: (projectId: string, actor: A4Actor, build: Build, options: A4TransitionOptions = {}): A4TransitionResult => commit(projectId, actor, build, options, null),
    transitionAsync: (projectId: string, actor: A4Actor, build: Build, options: A4TransitionOptions, beforeSign: () => void) => commitAsync(projectId, actor, build, options, beforeSign),
    readRevision: (projectId: string, revisionNo: number) => {
      const row = namedSideRows(projectId, "a4_revisions").find((candidate) => candidate.revision_no === revisionNo);
      return row === undefined ? null : a4RevisionRowSchema.parse(row);
    },
    /** Every project's verified head, in one snapshot; one that does not verify fails the list with A4_INTEGRITY_FAILED. */
    listProjects: (): A4ProjectRow[] => db.transaction(() => (db.prepare("SELECT project_id FROM a4_projects ORDER BY created_ts")
      .all() as Array<{ project_id: string }>).map((row) => verified(row.project_id).head!))(),

    /**
     * Refused without a signed approval policy. CREATED carries the default gate policy, the derived single-user
     * self-approval facts and `projectPublicKeySha256`, the sha256 of the project's key.pub PEM; the creator becomes the
     * first owner. One active project per agent (partial unique index; checked first under the `a4-requests` lock so a
     * refusal leaves no key).
     */
    createProject(input: { actor: A4Principal; agentId: string; name: string; hostedRouter: boolean; request?: A4RequestKey;
      profile?: { expertise: string; archetype: string | null } }): A4TransitionResult {
      // A VIEWER, APPROVER or AUDITOR would otherwise become the owner of a project it may not build (live roles, not the caller's).
      if (!liveRolesFor(workspace, input.actor).some((role) => role === "OPERATOR" || role === "OWNER")) {
        throw new A4StoreError(403, "PRINCIPAL_ROLE_INSUFFICIENT", "Creating an A4 project needs a live OPERATOR or OWNER role.");
      }
      const signed = loadVerifiedApprovalPolicy(workspace);
      if (signed.verdict === "missing") throw new A4StoreError(409, "APPROVAL_POLICY_MISSING", "Run `amc policy approval init` before creating an A4 project.");
      if (signed.policy === null) throw new A4StoreError(409, "APPROVAL_POLICY_UNSIGNED", `the approval policy does not verify: ${signed.reason ?? "unknown"}`);
      if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(input.agentId)) throw new A4StoreError(400, "INPUT_INVALID", "Choose a valid agent ID.");
      if (input.name.trim().length === 0) throw new A4StoreError(400, "INPUT_INVALID", "Name the project.");
      const projectId = randomId("a4p");
      const population = principalPopulation(workspace);
      const selfApprovalAllowed = deriveSelfApprovalAllowed({ activeLocal: population.activeLocal, hostPrincipals: population.hostPrincipals,
        hostedRouter: input.hostedRouter, regulated: false, workspaceFloor: undefined, ratcheted: false, decidingPrincipal: input.actor });
      const gatePolicy = defaultGatePolicyFor(a4FloorFor(signed.policy));
      let projectPublicKeySha256: string | null = null;
      return commit(projectId, input.actor, ({ seq, ts }) => {
        if (db.prepare("SELECT 1 FROM a4_projects WHERE agent_id = ? AND stage <> 'retired'").get(input.agentId)) {
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
          payload: { ...input.profile, workspaceId, agentId: input.agentId, name: input.name.trim(), gatePolicy, gatePolicyDigest: sha256Hex(canonicalize(gatePolicy)), projectPublicKeySha256,
            selfApprovalAllowed, selfApprovalFacts: { activeUserCount: population.activeLocal?.length ?? null, hostPrincipals: population.hostPrincipals,
              hostedRouter: input.hostedRouter, ratcheted: false, regulated: false, selfApprovalAllowed } },
          sideRows: [memberRow(projectId, seq, ts, input.actor, "added",
            { principalKey: input.actor.key, authSource: input.actor.authSource, userId: input.actor.userId, username: input.actor.username }, ["owner"])]
        };
      }, { request: input.request, response: { agentId: input.agentId } }, { project_id: projectId, workspace_id: workspaceId, agent_id: input.agentId, name: input.name.trim(),
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
     * taken from the caller: an add names an ACTIVE users.yaml user or a live host session (503 A4_IDENTITY_UNVERIFIED
     * when it is not found and either source could not be read), a change or removal a current member. Only a current
     * project owner on live roles may change membership (403), in owner mode; the router checks the route class too.
     */
    recordMember(projectId: string, input: { actor: A4Actor; event: "added" | "roles_changed" | "removed"; principalKey: string;
      roles: A4Member["roles"]; expectedHeadSeq: number; request?: A4RequestKey }): A4TransitionResult {
      assertOwnerMode(workspace, "a4 members");
      return commit(projectId, input.actor, ({ seq, ts }) => {
        assertOwner(projectId, input.actor);
        const members = membersOf(projectId);
        const { candidates, limited } = input.event === "added" ? memberCandidates(workspace, false) : { candidates: members, limited: false };
        const member = candidates.find((candidate) => candidate.principalKey === input.principalKey);
        if (member === undefined) {
          // An unreadable identity source is not an empty one: "unknown principal" only when every source was read.
          if (limited) throw new A4StoreError(503, "A4_IDENTITY_UNVERIFIED", "users.yaml or the session records could not be read");
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
     * ledger_event ref is resolved under the project lock, before anything is signed: a missing row is 409
     * EVIDENCE_REF_DANGLING, a row whose digests are not the ref's or whose signature or chain does not verify is 409
     * EVIDENCE_REF_UNVERIFIED, a row whose signed meta names another agent (or none) is 409 EVIDENCE_REF_FOREIGN_AGENT,
     * and the tier is the row's `effectiveTrustTier`, never its declared tier.
     */
    addEvidenceRef(projectId: string, input: { actor: A4Actor; refKind: A4RefKind; refId: string; sha256: string; claimKind: ClaimKind;
      method: string | null; label: string; column: "recommendation" | "implementation"; expectedHeadSeq: number; request?: A4RequestKey;
      /** Signed beside the ref, e.g. a hypothesis verdict (a human statement, self_reported); never a store field. */
      note?: Record<string, unknown> }): A4TransitionResult {
      if (!/^[0-9a-f]{64}$/.test(input.sha256)) throw new A4StoreError(400, "INPUT_INVALID", "sha256 must be 64 lowercase hex characters.");
      return commit(projectId, input.actor, ({ head, seq, ts }) => {
        let claim = { claimKind: input.claimKind, method: input.method, trustTier: null as string | null };
        if (input.refKind === "ledger_event") {
          const resolved = resolveLedgerEvent(ledger, input.refId, input.sha256, readerTrustFor(workspace), []);
          if (!resolved.found) throw new A4StoreError(409, "EVIDENCE_REF_DANGLING", `no ledger row ${input.refId}`);
          if (resolved.status !== "resolved" && resolved.status !== "payload_pruned") throw new A4StoreError(409, "EVIDENCE_REF_UNVERIFIED", `ledger row ${input.refId} does not match that sha256 or does not verify`);
          // The row's signed meta must name this project's agent: another agent's OBSERVED rows never fill this project's lanes.
          const meta = eventMeta(ledger.getEventById(input.refId)!);
          if ((meta.agentId ?? meta.agent_id) !== head!.agent_id) {
            throw new A4StoreError(409, "EVIDENCE_REF_FOREIGN_AGENT", `ledger row ${input.refId} is not a row of agent ${head!.agent_id}`);
          }
          claim = ledgerRefClaim(ledger.getEventById(input.refId)!, input.claimKind, input.method, resolved.tier);
        }
        const derived = laneForClaimKind(claim.claimKind, claim.trustTier, claim.method, input.column);
        return { kind: "EVIDENCE_REF", payload: { ...input.note, refKind: input.refKind, refId: input.refId, sha256: input.sha256, lane: derived.lane, claimKind: derived.claimKind },
          sideRows: [{ table: "a4_evidence_refs", values: { project_id: projectId, seq, revision_no: head!.revision_no, stage: head!.stage, lane: derived.lane,
            ref_kind: input.refKind, ref_id: input.refId, sha256: input.sha256, claim_kind: derived.claimKind, trust_tier: claim.trustTier, method: claim.method,
            label: input.label, actor_key: input.actor.key, ts } }] };
      }, { expectedHeadSeq: input.expectedHeadSeq, request: input.request }, null);
    },

    /** Whether the chain ratchets single-user self-approval off (design §5.3). */
    ratcheted: (projectId: string): boolean => ratchetedFromChain(readChain(projectId)),
    close: (): void => { mirror?.close(); ledger.close(); }
  };
}
