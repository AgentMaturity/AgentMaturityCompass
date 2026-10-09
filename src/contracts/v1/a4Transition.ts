import { z } from "zod";
import { nonEmpty, sha256HexSchema } from "./common.js";
import { A4_STAGE_STATES } from "./a4Project.js";

/**
 * The v1 transition kinds (design §4.2). The ledger column has no CHECK so a later kind needs no table rebuild; this
 * set is enforced at write and re-derived by the chain verifier. COMMENT records a comment's side row (P1-56).
 */
export const A4_TRANSITION_KINDS = [
  "CREATED", "STEP", "REVISION", "GATE_REQUESTED", "GATE_DECIDED", "GATE_CONSUMED", "EFFECT_GATE_OPENED", "EFFECT_STARTED",
  "EFFECT_FINISHED", "EFFECT_FAILED", "CHANGES_REQUESTED", "HOLD", "RESUME", "REOPEN", "MEMBER", "GATE_POLICY_CHANGED",
  "EVIDENCE_REF", "ACKNOWLEDGED", "RELEASE", "DEPLOYMENT", "VERIFICATION", "ROLLBACK", "TUNE", "RETIRE", "COMMENT"
] as const;
export type A4TransitionKind = (typeof A4_TRANSITION_KINDS)[number];

/** A side row a transition inserted, named in its body so the chain is the completeness root. */
export const a4SideRowRefSchema = z.strictObject({
  table: nonEmpty,
  key: z.record(z.string(), z.union([z.string(), z.number()])),
  sha256: sha256HexSchema
});
export type A4SideRowRef = z.infer<typeof a4SideRowRefSchema>;

/** `amc.a4-transition/v1`: one link of a project's chain; `bodyDigest = sha256(canonicalize(body))`. */
export const a4TransitionV1Schema = z.strictObject({
  schema: z.literal("amc.a4-transition/v1"),
  projectId: nonEmpty,
  seq: z.number().int().min(0),
  kind: z.enum(A4_TRANSITION_KINDS),
  stage: z.enum(A4_STAGE_STATES).nullable(),
  revisionNo: z.number().int().min(0),
  actorKey: nonEmpty,
  actorUsername: nonEmpty,
  body: z.record(z.string(), z.unknown()),
  bodyDigest: sha256HexSchema,
  prevDigest: z.union([sha256HexSchema, z.literal("GENESIS")]),
  readinessSha256: sha256HexSchema.nullable(),
  evidenceEventId: nonEmpty,
  ts: z.number().int()
});
export type A4TransitionV1 = z.infer<typeof a4TransitionV1Schema>;
