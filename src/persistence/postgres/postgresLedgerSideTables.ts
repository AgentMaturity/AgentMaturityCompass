/**
 * The ledger side tables the Postgres mirror carries beside the session chain (P2-36): A4's `a4_*` tables and the action
 * journal's `action_*` tables. Each spec names the table's columns exactly as the SQLite ledger holds them (a test
 * compares them with the ledger schema), its SQLite key, and the scope it belongs to: an A4 project (`project_id`) or an
 * action execution (`execution_id`). Writers mirror one scope per transaction (src/persistence/postgres/postgresLedgerMirror.ts).
 *
 * Two kinds of column take no part in parity: liveness (`heartbeat_ts`, written every few seconds outside any
 * transition) and the whole of `a4_requests` (idempotency bookkeeping the store prunes across projects). Both are still
 * copied with every mirrored write; they are never evidence of state.
 */
type SideColumnType = "text" | "int";

export interface LedgerSideTable {
  readonly name: string;
  readonly columns: Readonly<Record<string, SideColumnType>>;
  /** The SQLite primary key; Postgres keys on `(chain_id, ...key)`. */
  readonly key: readonly string[];
  readonly scope: "a4" | "action";
  readonly scopeColumn: "project_id" | "execution_id";
  /** Columns left out of parity digests. */
  readonly liveness?: readonly string[];
  /** False for bookkeeping copied but never compared. */
  readonly parity: boolean;
  /** A head or index row its writer rewrites; every other side table is append-only. */
  readonly mutable?: boolean;
}

const t = (...names: string[]): Record<string, SideColumnType> => Object.fromEntries(names.map((name) => [name, "text" as const]));
const i = (...names: string[]): Record<string, SideColumnType> => Object.fromEntries(names.map((name) => [name, "int" as const]));
const a4 = (name: string, columns: Record<string, SideColumnType>, key: string[], extra: Partial<LedgerSideTable> = {}): LedgerSideTable =>
  ({ name, columns, key, scope: "a4", scopeColumn: "project_id", parity: true, ...extra });

export const LEDGER_SIDE_TABLES: readonly LedgerSideTable[] = [
  a4("a4_projects", { ...t("project_id", "workspace_id", "agent_id", "name", "stage", "step"), ...i("hold"), ...t("hold_reason"),
    ...i("revision_no", "head_seq"), ...t("head_digest", "deployed_release_id", "base_release_id"), ...i("verified_seq"), ...t("verified_digest", "created_by_key"),
    ...i("created_ts", "updated_ts") }, ["project_id"], { mutable: true }),
  a4("a4_transitions", { ...t("project_id"), ...i("seq"), ...t("kind", "stage"), ...i("revision_no"), ...t("actor_key", "actor_username", "body_json",
    "body_digest", "prev_digest", "readiness_sha256", "envelope_json", "evidence_event_id"), ...i("ts") }, ["project_id", "seq"]),
  a4("a4_revisions", { ...t("project_id"), ...i("revision_no"), ...t("stage"), ...i("parent_revision_no"), ...t("spec_json", "spec_digest",
    "resource_digests_json", "resource_digests_sha256", "operating_scope_json", "created_by_key", "evidence_event_id"), ...i("ts") }, ["project_id", "revision_no"]),
  a4("a4_gates", { ...t("gate_id", "project_id"), ...i("revision_no"), ...t("stage", "gate", "request_json", "binding_digest", "intent_json", "readiness_sha256",
    "bound_items_json", "gate_policy_digest", "requested_by_key", "excluded_keys_json"), ...i("expires_ts"), ...t("envelope_json", "evidence_event_id"),
    ...i("ts") }, ["gate_id"]),
  a4("a4_decisions", { ...t("decision_id", "gate_id", "project_id", "decision_json", "request_digest", "approver_key", "auth_source", "admission",
    "identity_check", "identity_provenance_json"), ...i("self_approved"), ...t("self_approval_facts_json", "evaluated_items_json", "envelope_json",
    "evidence_event_id"), ...i("ts") }, ["decision_id"]),
  a4("a4_members", { ...t("project_id"), ...i("seq"), ...t("event", "principal_key", "auth_source", "user_id", "username", "roles_json", "actor_key",
    "evidence_event_id"), ...i("ts") }, ["project_id", "seq"]),
  a4("a4_comments", { ...t("comment_id", "project_id"), ...i("revision_no"), ...t("stage", "card_id", "author_key", "body_sha256", "blob_ref", "in_reply_to",
    "evidence_event_id"), ...i("ts") }, ["comment_id"]),
  a4("a4_evidence_refs", { ...t("project_id"), ...i("seq", "revision_no"), ...t("stage", "lane", "ref_kind", "ref_id", "sha256", "claim_kind", "trust_tier",
    "method", "label", "actor_key", "evidence_event_id"), ...i("ts") }, ["project_id", "seq"]),
  a4("a4_releases", { ...t("release_id", "project_id"), ...i("revision_no"), ...t("package_digest", "package_path", "signature_path", "transparency_entry_id",
    "previous_release_id", "base_release_id", "target", "surfaces_json", "envelope_json", "actor_key", "evidence_event_id"), ...i("ts") }, ["release_id"]),
  a4("a4_deployments", { ...t("deployment_id", "release_id", "project_id", "kind", "environment", "target", "receipt_json", "receipt_sha256",
    "recorded_status", "amc_check_status", "amc_check_json", "recorded_by_key", "envelope_json", "evidence_event_id"), ...i("ts") }, ["deployment_id"]),
  a4("a4_requests", { ...t("principal_key", "client_request_id", "body_hash", "project_id", "response_json"), ...i("redacted", "ts") },
    ["principal_key", "client_request_id"], { parity: false, mutable: true }),
  a4("a4_effects", { ...t("effect_id", "project_id", "gate_id", "execution_id", "approval_request_id"), ...i("owner_pid"), ...t("owner_host"),
    ...i("started_ts", "heartbeat_ts"), ...t("state") }, ["effect_id"], { liveness: ["heartbeat_ts"], mutable: true }),
  { name: "action_executions", columns: { ...t("execution_id", "workspace_id", "agent_id", "tool_name", "action_class", "state", "effect"),
    ...i("evidence_complete"), ...t("authorization_digest", "intent_json", "idempotency_key", "parent_execution_id", "session_id", "call_id"),
    ...i("owner_pid"), ...t("owner_host"), ...i("heartbeat_ts", "created_ts", "updated_ts"), ...t("last_receipt_digest") },
    key: ["execution_id"], scope: "action", scopeColumn: "execution_id", liveness: ["heartbeat_ts"], parity: true, mutable: true },
  { name: "action_transitions", columns: { ...t("execution_id"), ...i("seq"), ...t("receipt_json", "receipt_digest", "evidence_event_id") },
    key: ["execution_id", "seq"], scope: "action", scopeColumn: "execution_id", parity: true }
];
