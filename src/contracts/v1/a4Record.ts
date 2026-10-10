import { z } from "zod";
import { nonEmpty } from "./common.js";

/**
 * The tables an A4 export carries, in load order. `a4_requests` (idempotency) and `a4_effects` (liveness) are
 * bookkeeping that no transition names, so they are never exported.
 */
export const A4_RECORD_TABLES = [
  "a4_projects", "a4_transitions", "a4_revisions", "a4_gates", "a4_decisions", "a4_members", "a4_comments", "a4_evidence_refs",
  "a4_releases", "a4_deployments"
] as const;

/** One stored row: its columns exactly as the ledger holds them (text, integer or null). Never re-serialized. */
const storedRowSchema = z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), z.union([z.string(), z.number(), z.null()]));
const rows = z.array(storedRowSchema);
/** A public key and the key-history envelope beside it; both identify a signer only, never vouch for one. */
const keySchema = z.strictObject({ publicKeyPem: nonEmpty, history: z.record(z.string(), z.unknown()).nullable() });

/**
 * `amc.a4-record/v1`: one A4 project as stored, for a verifier without SQLite (spec/ACCEPTANCE_RULES.md "A4 project
 * record"). Every digest recomputes from these bytes: `body_json`, `spec_json`, `request_json` and the other JSON
 * columns are the exact canonical text the ledger stored. `evidence.events` holds each transition's audit row and each
 * row a `ledger_event` ref names, as stored (columns, not the evidence-event export, whose hash cannot be recomputed).
 */
export const a4RecordV1Schema = z.strictObject({
  schema: z.literal("amc.a4-record/v1"),
  projectId: z.string().regex(/^a4p_[0-9a-f]{32}$/),
  containsSyntheticExamples: z.boolean(),
  tables: z.strictObject({
    a4_projects: rows, a4_transitions: rows, a4_revisions: rows, a4_gates: rows, a4_decisions: rows, a4_members: rows,
    a4_comments: rows, a4_evidence_refs: rows, a4_releases: rows, a4_deployments: rows
  }),
  evidence: z.strictObject({ events: rows, sessions: rows }),
  publicKeys: z.strictObject({ monitor: keySchema, auditor: keySchema })
});
export type A4RecordV1 = z.infer<typeof a4RecordV1Schema>;
