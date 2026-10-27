import type Database from "better-sqlite3";
import type { SignedDigest } from "../crypto/signing/signerTypes.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { A4_STAGE_STATES, a4GatePolicyV1Schema, type A4Principal, type A4ProjectRow, type A4TransitionKind } from "./a4Schema.js";
import { A4StoreError } from "./a4Store.js";

type A4StageState = (typeof A4_STAGE_STATES)[number];
export type A4Actor = Pick<A4Principal, "key" | "username">;
export type Cell = string | number | null;
/** The append-only tables a transition may insert into, with their key columns. */
export const SIDE_TABLE_KEYS = {
  a4_revisions: ["project_id", "revision_no"], a4_gates: ["gate_id"], a4_decisions: ["decision_id"], a4_members: ["project_id", "seq"],
  a4_comments: ["comment_id"], a4_evidence_refs: ["project_id", "seq"], a4_releases: ["release_id"], a4_deployments: ["deployment_id"]
} as const;
export type A4SideTable = keyof typeof SIDE_TABLE_KEYS;
/** Every column except `evidence_event_id`, which the store fills from the transition's audit row. */
export interface A4SideRow { readonly table: A4SideTable; readonly values: Readonly<Record<string, Cell>> }
/** The head's mutable state. Every body signs it as `headAfter`, so readers and writes never trust the unsigned head row. */
const HEAD_COLUMNS = ["stage", "step", "hold", "hold_reason", "revision_no", "deployed_release_id", "base_release_id"] as const;
export type A4HeadState = Pick<A4ProjectRow, (typeof HEAD_COLUMNS)[number]>;
/** The state a new project's head row is inserted with. */
export const NEW_HEAD: A4HeadState = { stage: "aspire", step: "asked", hold: 0, hold_reason: null, revision_no: 0, deployed_release_id: null, base_release_id: null };
const headStateOf = (row: A4HeadState): A4HeadState => Object.fromEntries(HEAD_COLUMNS.map((column) => [column, row[column]])) as A4HeadState;
/** Which head columns differ from the state the last signed body left. */
export const headProblems = (head: A4ProjectRow, body: Record<string, unknown>): string[] => {
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
  /** EFFECT_STARTED: the a4_effects liveness row inserted beside it (this process is its owner). */
  readonly startEffect?: { readonly effectId: string; readonly gateId: string; readonly executionId: string; readonly approvalRequestId: string | null };
  /** EFFECT_FINISHED / EFFECT_FAILED: the liveness row's state set in the same transaction. */
  readonly settleEffect?: { readonly effectId: string; readonly state: "finished" | "failed" };
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
  /** What the caller answers beside the transition (an attempt id, a minted agent id), stored so a replay answers it too. */
  readonly response?: Readonly<Record<string, unknown>>;
}
export type A4TransitionResult =
  | { readonly replay: false; readonly projectId: string; readonly seq: number; readonly kind: A4TransitionKind; readonly bodyDigest: string;
      readonly evidenceEventId: string; readonly envelope: SignedDigest | null }
  | { readonly replay: true; readonly response: Record<string, unknown> };
/** One change, or several recorded in one transaction (each its own chained row, in order); `seq` is the first one's. */
export type Build = (ctx: { head: A4ProjectRow | null; seq: number; ts: number }) => A4ChangeSpec | readonly A4ChangeSpec[];
export type NewHead = Pick<A4ProjectRow, "project_id" | "workspace_id" | "agent_id" | "name" | "created_by_key">;

const RESERVED_BODY_KEYS = new Set(["kind", "projectId", "seq", "stage", "revisionNo", "actorKey", "actorUsername", "ts", "prevDigest", "readinessSha256",
  "headAfter", "sideRows", "population"]);

interface RecordContext {
  projectId: string; actor: A4Actor; create: NewHead | null; seq0: number; ts: number;
  headState: A4HeadState; previousDigest: string; readinessSha256: string | null;
  population: unknown;
}
/** Shared actual record recipe. Its result is data, never a supplied signature or publication acknowledgment. */
export function prepareA4Record(spec: A4ChangeSpec, index: number, ctx: RecordContext,
  gatePolicy: (projectId: string, actor: A4Actor, policy: ReturnType<typeof a4GatePolicyV1Schema.parse>) => void,
  names: (rows: readonly A4SideRow[]) => Array<{ table: string; key: Record<string, Cell>; sha256: string }>) {
  const { projectId, actor, create, ts, readinessSha256, population } = ctx;
  if ((spec.kind === "CREATED") !== (create !== null && index === 0)) throw new Error("CREATED is a project's first transition and only that");
  for (const key of Object.keys(spec.payload)) if (RESERVED_BODY_KEYS.has(key)) throw new Error(`A4 payload may not set ${key}`);
  if ((spec.kind === "CREATED" || spec.kind === "GATE_POLICY_CHANGED") && !a4GatePolicyV1Schema.safeParse(spec.payload.gatePolicy).success) {
    throw new A4StoreError(400, "INPUT_INVALID", "The gate policy is not an amc.a4-gate-policy/v1 document.");
  }
  if (spec.kind === "GATE_POLICY_CHANGED") gatePolicy(projectId, actor, a4GatePolicyV1Schema.parse(spec.payload.gatePolicy));
  const sideRows = spec.sideRows ?? [];
  for (const row of sideRows) if (row.values.project_id !== projectId) throw new Error(`A4 side row in ${row.table} names another project`);
  const seq = ctx.seq0 + index;
  const stage = spec.stage !== undefined ? spec.stage : ctx.headState.stage;
  const revisionNo = spec.revisionNo ?? ctx.headState.revision_no;
  const headAfter = headStateOf({ ...ctx.headState, ...Object.fromEntries(Object.entries(spec.head ?? {}).filter(([, value]) => value !== undefined)) });
  const prevDigest = ctx.previousDigest;
  const body = { ...spec.payload, kind: spec.kind, projectId, seq, stage, revisionNo, actorKey: actor.key, actorUsername: actor.username,
    ts, prevDigest, readinessSha256, population, headAfter, sideRows: names(sideRows) };
  const bytes = canonicalize(body);
  const digest = sha256Hex(bytes);
  return { spec, sideRows, seq, stage, revisionNo, prevDigest, bytes, digest, headAfter };
}
