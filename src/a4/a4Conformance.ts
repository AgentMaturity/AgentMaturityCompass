/**
 * The per-stage conformance statement (P1-61; design §10.5, `amc.a4-conformance-statement/v1`): five status dimensions
 * per control and counts, never a score or a percentage. Review evaluates each compiled requirement with evaluateControl
 * over the admitted evidence (no A4 loader binds runtime rows to catalog evidence contracts yet, so every control is
 * evaluated over none and reads not_evaluated), writes the CONTROL_RESULT set with writeSignedControlResults and reads it
 * back verified; the statement's controls and its one claim come only from those verified bytes (envelopeFromDimensions
 * rebuilds the envelopes the service already decided). A set that does not verify locally (a notary-route signature) is
 * not_evaluated. not_applicable comes only from compilePlan; an owner's out_of_scope stays in counts.unresolved.
 */
import { join, relative, sep } from "node:path";
import { z } from "zod";
import type { CompiledPlan, RequirementDecision } from "../catalog/compiler/types.js";
import { evaluateControl } from "../catalog/evidence/evaluate.js";
import { readSignedControlResults, writeSignedControlResults } from "../catalog/evidence/signedResults.js";
import type { ControlResult } from "../catalog/evidence/types.js";
import type { LoadedCatalog } from "../catalog/loader.js";
import { envelopeForAggregate, envelopeForUnverifiedResult, envelopeFromDimensions } from "../claims/eligibility/adapters/results.js";
import { claimKindSchema, statusDimensionsSchema } from "../claims/eligibility/schemas.js";
import type { Applicability } from "../claims/eligibility/types.js";
import { sha256Hex } from "../utils/hash.js";
import { a4ProjectsRoot } from "./a4Blobs.js";
import { a4ConformanceStatementV1Schema, type A4ConformanceStatementV1, type A4Stage } from "./a4Schema.js";
import { A4StoreError } from "./a4Store.js";
import { errorCodeOf } from "./aspireUnderstand.js";

const NO_LOADER = "NO_EVIDENCE_LOADER: no A4 loader binds runtime rows to this control's evidence contracts yet";
const NOT_VERIFIED = "CONTROL_RESULTS_NOT_VERIFIED_LOCALLY";

/** One control as Review recorded it from the verified results, with the catalog's own status of the record verbatim. */
const storedControlSchema = z.strictObject({
  controlId: z.string().min(1), version: z.string().min(1), support: z.string().min(1), reviewStatus: z.string().min(1),
  planApplicability: z.enum(["applicable", "not_applicable", "unresolved"]), dimensions: statusDimensionsSchema, claimKind: claimKindSchema,
  evidenceRefs: z.array(z.string().min(1)), notEvaluatedReason: z.string().min(1).nullable()
});
export type StoredControl = z.infer<typeof storedControlSchema>;
export interface StoredConformance {
  readonly planDigest: string;
  /** Workspace-relative path of the signed results file, and its sha256 (the file is named by it). */
  readonly resultsPath: string;
  readonly resultsSha256: string;
  readonly verified: boolean;
  /** A code when not verified. */
  readonly reason: string | null;
  readonly controls: readonly StoredControl[];
  readonly counts: A4ConformanceStatementV1["counts"];
}

/** The plan's decision in the claim vocabulary (evaluateControl's `plan.applicability`). */
function applicabilityOf(row: RequirementDecision): Applicability {
  if (row.applicability === "applicable") return { state: "applicable" };
  if (row.applicability === "not_applicable") return { state: "not_applicable", rationale: row.exclusion?.reason ?? "excluded by the compiled plan" };
  return { state: "unresolved", reason: row.missingFacts.length > 0 ? `missing facts: ${row.missingFacts.join(", ")}` : "unresolved in the compiled plan" };
}

/** Counts per control, disjoint: not_applicable and unresolved from the plan, else the result. Never a percentage. */
function countsOf(controls: readonly Pick<StoredControl, "planApplicability" | "dimensions">[]): A4ConformanceStatementV1["counts"] {
  const counts = { pass: 0, fail: 0, not_evaluated: 0, not_applicable: 0, unresolved: 0 };
  for (const control of controls) {
    const key = control.planApplicability === "applicable" ? control.dimensions.result : control.planApplicability;
    counts[key] += 1;
  }
  return counts;
}

/**
 * Review: every requirement of `plan` through evaluateControl, the set written signed (CONTROL_RESULT; refused under
 * `.amc/` and in agent mode) under the project's directory, named by its bytes' sha256, then read back once and verified.
 * A write that fails refuses Review (409 with the code); a read-back that does not verify locally records not_evaluated.
 */
export function recordControlResults(input: { workspace: string; projectId: string; workspaceId: string; agentId: string; plan: CompiledPlan;
  catalog: LoadedCatalog; windowStartTs: number; now: number }): StoredConformance {
  const { plan, catalog } = input;
  const evaluated = plan.requirements.flatMap((row) => {
    const record = catalog.controls.get(row.controlId);
    if (record === undefined || record.version !== row.controlVersion) return [];
    const result = evaluateControl(record, [], {
      subject: { tenantId: input.workspaceId, workspaceId: input.workspaceId, deploymentId: input.projectId, agentId: input.agentId, subjectId: null },
      window: { start: new Date(input.windowStartTs).toISOString(), end: new Date(input.now).toISOString() },
      plan: { digest: plan.digest, policyDigest: plan.runtimePolicy.policyDigest, applicability: applicabilityOf(row), mode: "enforce" },
      invalidations: [], reviews: [], producers: catalog.producers
    });
    return [{ row, record, result }];
  });
  const results: ControlResult[] = evaluated.map(({ result }) => result);
  const bytes = Buffer.from(`${JSON.stringify(results, null, 2)}\n`, "utf8");
  const resultsSha256 = sha256Hex(bytes);
  const path = relative(input.workspace, join(a4ProjectsRoot(input.workspace), input.projectId, "control-results", `${resultsSha256}.json`)).split(sep).join("/");
  try {
    writeSignedControlResults(input.workspace, path, results);
  } catch (error) {
    throw new A4StoreError(409, errorCodeOf(error, "CONTROL_RESULTS_NOT_SIGNED"), "The control results could not be signed (owner mode or the signing key).");
  }
  let read: unknown = null;
  let reason: string | null = null;
  try {
    const verified = readSignedControlResults(input.workspace, path);
    reason = verified.digestSha256 === resultsSha256 ? null : NOT_VERIFIED;
    read = verified.value;
  } catch {
    reason = NOT_VERIFIED;
  }
  const byId = new Map((Array.isArray(read) ? read : []).flatMap((entry) => {
    const parsed = z.object({ controlId: z.string(), dimensions: statusDimensionsSchema, claimKind: claimKindSchema,
      admitted: z.array(z.object({ ref: z.object({ id: z.string().min(1) }) })), reasons: z.array(z.string()) }).safeParse(entry);
    return parsed.success ? [[parsed.data.controlId, parsed.data] as const] : [];
  }));
  if (reason === null && byId.size !== results.length) reason = "CONTROL_RESULTS_SHAPE_INVALID";
  const controls = evaluated.map(({ row, record }): StoredControl => {
    const stored = reason === null ? byId.get(row.controlId) : undefined;
    const dimensions = stored?.dimensions ?? { applicability: applicabilityOf(row), evidence: "untrusted", result: "not_evaluated", enforcement: { state: "none" }, review: "pending" };
    return { controlId: row.controlId, version: row.controlVersion, support: record.support, reviewStatus: record.review.status, planApplicability: row.applicability,
      dimensions, claimKind: stored?.claimKind ?? "self_reported", evidenceRefs: stored?.admitted.map((item) => item.ref.id) ?? [],
      notEvaluatedReason: dimensions.result !== "not_evaluated" ? null : stored === undefined ? reason ?? NOT_VERIFIED
        : row.applicability === "unresolved" ? `unresolved: ${row.missingFacts.join(", ") || "see the plan"}`
          : row.applicability === "not_applicable" ? "not applicable (compiled plan)" : `${NO_LOADER} (${stored.reasons[0] ?? "no admitted records"})` };
  });
  return { planDigest: plan.digest, resultsPath: path, resultsSha256, verified: reason === null, reason, controls, counts: countsOf(controls) };
}

/**
 * The statement for a stage's revision (pure). The claim is the weakest of the envelopes rebuilt from the stored, verified
 * CONTROL_RESULT dimensions (the one legitimate use of envelopeFromDimensions); with no plan, or results that did not
 * verify, it is an unverified, not_evaluated envelope. `ownerOutOfScope` lists owner-settled requirements, which stay unresolved.
 */
export function conformanceStatement(input: {
  stage: A4Stage; revisionDigest: string; stored: StoredConformance | null; evaluatedAt: string;
  ownerOutOfScope: A4ConformanceStatementV1["ownerOutOfScope"]; unsupported: readonly string[]; missingFacts: readonly string[];
  expertReview: A4ConformanceStatementV1["expertReview"]; claimBoundary: string; now: number;
}): A4ConformanceStatementV1 {
  const stored = input.stored;
  const producer = `a4-conformance:${input.stage}`;
  const members = stored?.verified === true ? stored.controls.map((control) => envelopeFromDimensions(`catalog:${control.controlId}`, control.claimKind, control.dimensions)) : [];
  const claim = members.length > 0 ? envelopeForAggregate(producer, members, input.now)
    : envelopeForUnverifiedResult({ producer, recordCount: 0, regulated: true, signatureValid: stored === null ? null : false, now: input.now });
  return a4ConformanceStatementV1Schema.parse({
    schema: "amc.a4-conformance-statement/v1", stage: input.stage, revisionDigest: input.revisionDigest,
    planDigest: stored === null ? null : stored.planDigest.replace(/^sha256:/, ""), evaluatedAt: input.evaluatedAt,
    controls: (stored?.controls ?? []).map((control) => ({ controlId: control.controlId, version: control.version, support: control.support,
      reviewStatus: control.reviewStatus, ...control.dimensions, claimKind: control.claimKind, evidenceRefs: control.evidenceRefs,
      ...(control.notEvaluatedReason === null ? {} : { notEvaluatedReason: control.notEvaluatedReason }) })),
    counts: stored?.counts ?? { pass: 0, fail: 0, not_evaluated: 0, not_applicable: 0, unresolved: 0 },
    ownerOutOfScope: input.ownerOutOfScope, unsupported: [...input.unsupported], missingFacts: [...input.missingFacts],
    expertReview: input.expertReview, claim, claimBoundary: input.claimBoundary
  });
}
