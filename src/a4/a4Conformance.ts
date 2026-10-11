/**
 * The per-stage conformance statement (P1-61; design §10.5, `amc.a4-conformance-statement/v1`): five status dimensions
 * per control and counts, never a score or a percentage. Review evaluates each compiled requirement with evaluateControl
 * over the admitted evidence (no A4 loader binds runtime rows to catalog evidence contracts yet, so every control is
 * evaluated over none and reads not_evaluated), writes the CONTROL_RESULT set with writeSignedControlResults and reads it
 * back; the statement's controls and its one claim come only from verified bytes (envelopeFromDimensions rebuilds the
 * envelopes the service already decided). Only two read-back outcomes are local limits, recorded not_evaluated: a
 * notary-route signature and an issuer a trust list does not pin. Every other one (missing, changed, unsigned, a
 * signature that does not verify, a refused signer, bytes that do not parse) is an integrity failure, and the set is
 * checked again on every read (readiness, the conformance view), so a later edit or deletion reads as one too.
 * not_applicable comes only from compilePlan; an owner's out_of_scope stays in counts.unresolved.
 */
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { z } from "zod";
import type { CompiledPlan, RequirementDecision } from "../catalog/compiler/types.js";
import { evaluateControl } from "../catalog/evidence/evaluate.js";
import { controlResultsSigPath, readSignedControlResults, writeSignedControlResults } from "../catalog/evidence/signedResults.js";
import type { ControlResult } from "../catalog/evidence/types.js";
import type { LoadedCatalog } from "../catalog/loader.js";
import { envelopeForAggregate, envelopeForUnverifiedResult, envelopeFromDimensions } from "../claims/eligibility/adapters/results.js";
import { claimKindSchema, statusDimensionsSchema } from "../claims/eligibility/schemas.js";
import type { Applicability } from "../claims/eligibility/types.js";
import { getPublicKeyHistory } from "../crypto/keys.js";
import { signingRoute, verifySignedDigest } from "../crypto/signing/signer.js";
import { verifySignatureEnvelope } from "../crypto/signing/signatureEnvelope.js";
import type { SignatureEnvelope } from "../crypto/signing/signerTypes.js";
import { assertOwnerMode } from "../mode/mode.js";
import { checkDigestSignature, loadTrustContext } from "../trust/index.js";
import { isKeyRefused } from "../trust/signatureCheck.js";
import { loadTrustConfig } from "../trust/trustConfig.js";
import { sha256Hex } from "../utils/hash.js";
import type { A4ReadinessState } from "./a4Readiness.js";
import { a4ConformanceStatementV1Schema, gatePolicyOf, type A4ConformanceStatementV1, type A4Stage } from "./a4Schema.js";
import { A4StoreError } from "./a4Store.js";
import { errorCodeOf } from "./aspireUnderstand.js";
import { plainPath } from "./assembleConnect.js";
import { acknowledgementOf, ADAPT_CLAIM_BOUNDARY, ownerOutOfScope, proposedPlan, understandingOf } from "./spec/adapt.js";

const NO_LOADER = "NO_EVIDENCE_LOADER: no A4 loader binds runtime rows to this control's evidence contracts yet";
const NOT_IN_CATALOG = "CONTROL_NOT_IN_SHIPPED_CATALOG: the shipped catalog has no record of this control at this version";
/** The results file and its signature are read only as regular files of a bounded size (never a link, a FIFO or a device). */
const MAX_RESULTS_BYTES = 16 * 1024 * 1024;

/** One control as Review recorded it from the verified results, with the catalog's own status of the record verbatim. */
const storedControlSchema = z.strictObject({
  controlId: z.string().min(1), version: z.string().min(1), support: z.string().min(1), reviewStatus: z.string().min(1),
  planApplicability: z.enum(["applicable", "not_applicable", "unresolved"]), dimensions: statusDimensionsSchema, claimKind: claimKindSchema,
  evidenceRefs: z.array(z.string().min(1)), notEvaluatedReason: z.string().min(1).nullable()
});
export type StoredControl = z.infer<typeof storedControlSchema>;
/** A read-back's verdict: `verified`, a local limit (`not_evaluated`), or an integrity failure (`failed`); `reason` is a code. */
export interface ControlResultsCheck {
  readonly status: "verified" | "not_evaluated" | "failed";
  readonly reason: string | null;
}
export interface StoredConformance {
  readonly planDigest: string;
  /** Workspace-relative path of the signed results file, and its sha256 (the file is named by it). */
  readonly resultsPath: string;
  readonly resultsSha256: string;
  readonly status: ControlResultsCheck["status"];
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

/** A control no verified result stands behind: not_evaluated, untrusted evidence, the reason given. */
const unverifiedControl = (control: Omit<StoredControl, "dimensions" | "claimKind" | "evidenceRefs" | "notEvaluatedReason">, applicability: Applicability,
  reason: string): StoredControl => ({ ...control, dimensions: { applicability, evidence: "untrusted", result: "not_evaluated", enforcement: { state: "none" }, review: "pending" },
  claimKind: "self_reported", evidenceRefs: [], notEvaluatedReason: reason });

const failed = (reason: string): ControlResultsCheck => ({ status: "failed", reason });

/** Whether `path` exists, as a regular file of a bounded size; anything else (a link, a FIFO, a device, too large) throws. */
function regularFile(path: string): boolean {
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (!stat.isFile() || stat.size > MAX_RESULTS_BYTES) throw new Error("not a regular file of a bounded size");
  return true;
}
/** A regular file of a bounded size, read once; null when absent. Anything else throws. */
const regularBytes = (path: string): Buffer | null => regularFile(path) ? readFileSync(path) : null;

/** Whether `envelope` is the pinned notary's signature over `sha256` (self-consistent, its key the one the signed trust config pins). */
function pinnedNotarySignature(workspace: string, sha256: string, envelope: unknown): boolean {
  if ((envelope as { signer?: { type?: unknown } } | null | undefined)?.signer?.type !== "NOTARY") return false;
  try {
    if (signingRoute(workspace, "CONTROL_RESULT") !== "notary") return false;
    const trust = loadTrustConfig(workspace).trust;
    return trust.mode === "NOTARY" && (envelope as { fingerprint?: unknown }).fingerprint === trust.notary.pinnedPubkeyFingerprint
      && verifySignatureEnvelope(sha256, envelope as SignatureEnvelope);
  } catch {
    return false;
  }
}

/**
 * Why a set readSignedControlResults refused is not verified, from the files as they are: only the pinned notary's
 * signature over exactly `sha256` (NOTARY_ROUTE: it does not verify under this workspace's keys) and a workspace key the
 * operator's trust list does not pin (ISSUER_NOT_PINNED: not refused) are local limits; everything else is a failure.
 */
function unverifiedReason(workspace: string, file: string, sha256: string): ControlResultsCheck {
  let bytes: Buffer | null;
  let sigBytes: Buffer | null;
  try {
    bytes = regularBytes(file);
    sigBytes = regularBytes(controlResultsSigPath(file));
  } catch {
    return failed("CONTROL_RESULTS_UNREADABLE");
  }
  if (bytes === null) return failed("CONTROL_RESULTS_MISSING");
  if (sha256Hex(bytes) !== sha256) return failed("CONTROL_RESULTS_CHANGED");
  if (sigBytes === null) return failed("CONTROL_RESULTS_UNSIGNED");
  let sig: { digestSha256?: unknown; signature?: unknown; signedTs?: unknown; envelope?: unknown };
  try {
    sig = JSON.parse(sigBytes.toString("utf8")) as typeof sig;
  } catch {
    return failed("CONTROL_RESULTS_SIGNATURE_INVALID");
  }
  if (sig === null || typeof sig !== "object" || sig.digestSha256 !== sha256 || typeof sig.signature !== "string" || typeof sig.signedTs !== "number") {
    return failed("CONTROL_RESULTS_SIGNATURE_INVALID");
  }
  if (pinnedNotarySignature(workspace, sha256, sig.envelope)) return { status: "not_evaluated", reason: "NOTARY_ROUTE_NOT_VERIFIED_LOCALLY" };
  if (!verifySignedDigest({ workspace, digestHex: sha256, signed: { signature: sig.signature, envelope: sig.envelope } })) return failed("CONTROL_RESULTS_SIGNATURE_INVALID");
  // readSignedControlResults' own signer rule: a refused key always fails; an unpinned one fails only under a trust list.
  let admission: ReturnType<typeof checkDigestSignature>["admission"];
  let pinned: boolean;
  try {
    const trust = loadTrustContext();
    ({ admission } = checkDigestSignature({ signature: basename(controlResultsSigPath(file)), purpose: "artifact-seal", digestHex: sha256,
      signatureB64: sig.signature, candidates: getPublicKeyHistory(workspace, "auditor"), context: trust, claimedSignedAt: sig.signedTs }));
    pinned = trust.lists.length === 0 || admission.status === "admitted";
  } catch {
    return failed("CONTROL_RESULTS_TRUST_UNREADABLE");
  }
  if (isKeyRefused(admission)) return failed("CONTROL_RESULTS_SIGNER_REFUSED");
  if (!pinned) return { status: "not_evaluated", reason: "ISSUER_NOT_PINNED" };
  // The signature and its signer pass, so the read refused the bytes themselves.
  return failed("CONTROL_RESULTS_UNPARSABLE");
}

/**
 * The signed results set at `path` (workspace-relative) read back now against the sha256 Review recorded: verified with
 * the parsed value, or why not (see unverifiedReason). The file and its signature must be regular files under plain
 * directories: a link, a FIFO or a device on the way is a failure, never a read.
 */
export function checkControlResults(workspace: string, path: string, sha256: string): ControlResultsCheck & { value?: unknown } {
  const segments = path.split("/");
  try {
    plainPath(workspace, segments.slice(0, -1), false);
  } catch {
    return failed("CONTROL_RESULTS_PATH_NOT_PLAIN");
  }
  const file = resolve(workspace, path);
  try {
    regularFile(file);
    regularFile(controlResultsSigPath(file));
  } catch {
    return failed("CONTROL_RESULTS_UNREADABLE");
  }
  let read: ReturnType<typeof readSignedControlResults>;
  try {
    read = readSignedControlResults(workspace, path);
  } catch {
    return unverifiedReason(workspace, file, sha256);
  }
  return read.digestSha256 === sha256 ? { status: "verified", reason: null, value: read.value } : failed("CONTROL_RESULTS_CHANGED");
}

/** `a4-projects/<projectId>/control-results`, made one plain directory at a time and required to resolve to exactly that path. */
function resultsDirectory(workspace: string, projectId: string): string {
  const segments = ["a4-projects", projectId, "control-results"];
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(projectId)) throw new A4StoreError(400, "INPUT_INVALID", "invalid project id");
  const dir = plainPath(workspace, segments, true);
  if (realpathSync(dir) !== join(realpathSync(workspace), ...segments)) {
    throw new A4StoreError(400, "PATH_NOT_PLAIN", "The control-results directory does not resolve to the path named.");
  }
  return dir;
}

/**
 * Review: every requirement of `plan` through evaluateControl, the set written signed (CONTROL_RESULT; refused under
 * `.amc/` and in agent mode) under the project's directory, named by its bytes' sha256, then read back once. A write
 * that fails refuses Review (409 with the code). A requirement whose control the shipped catalog no longer holds at that
 * version stays in the statement, not_evaluated (CONTROL_NOT_IN_SHIPPED_CATALOG). A read-back that is not verified
 * records every control not_evaluated with the reason; `status` says whether that is a local limit or a failure.
 */
export function recordControlResults(input: { workspace: string; projectId: string; workspaceId: string; agentId: string; plan: CompiledPlan;
  catalog: LoadedCatalog; windowStartTs: number; now: number }): StoredConformance {
  const { plan, catalog } = input;
  const evaluated = plan.requirements.map((row) => {
    const record = catalog.controls.get(row.controlId);
    if (record === undefined || record.version !== row.controlVersion) return { row, record: null, result: null };
    const result = evaluateControl(record, [], {
      subject: { tenantId: input.workspaceId, workspaceId: input.workspaceId, deploymentId: input.projectId, agentId: input.agentId, subjectId: null },
      window: { start: new Date(input.windowStartTs).toISOString(), end: new Date(input.now).toISOString() },
      plan: { digest: plan.digest, policyDigest: plan.runtimePolicy.policyDigest, applicability: applicabilityOf(row), mode: "enforce" },
      invalidations: [], reviews: [], producers: catalog.producers
    });
    return { row, record, result };
  });
  const results: ControlResult[] = evaluated.flatMap(({ result }) => result === null ? [] : [result]);
  const bytes = Buffer.from(`${JSON.stringify(results, null, 2)}\n`, "utf8");
  const resultsSha256 = sha256Hex(bytes);
  const path = `a4-projects/${input.projectId}/control-results/${resultsSha256}.json`;
  try {
    // Owner mode first, so agent mode creates no directory either (writeSignedControlResults asserts it again).
    assertOwnerMode(input.workspace, "control results sign");
    writeSignedControlResults(input.workspace, join(resultsDirectory(input.workspace, input.projectId), `${resultsSha256}.json`), results);
  } catch (error) {
    if (error instanceof A4StoreError) throw error;
    throw new A4StoreError(409, errorCodeOf(error, "CONTROL_RESULTS_NOT_SIGNED"), "The control results could not be signed (owner mode or the signing key).");
  }
  let check: ControlResultsCheck & { value?: unknown } = checkControlResults(input.workspace, path, resultsSha256);
  const byId = new Map((check.status === "verified" && Array.isArray(check.value) ? check.value : []).flatMap((entry) => {
    const parsed = z.object({ controlId: z.string(), dimensions: statusDimensionsSchema, claimKind: claimKindSchema,
      admitted: z.array(z.object({ ref: z.object({ id: z.string().min(1) }) })), reasons: z.array(z.string()) }).safeParse(entry);
    return parsed.success ? [[parsed.data.controlId, parsed.data] as const] : [];
  }));
  if (check.status === "verified" && byId.size !== results.length) check = failed("CONTROL_RESULTS_SHAPE_INVALID");
  const controls = evaluated.map(({ row, record }): StoredControl => {
    const base = { controlId: row.controlId, version: row.controlVersion, support: record?.support ?? row.support, reviewStatus: record?.review.status ?? "unknown",
      planApplicability: row.applicability };
    if (record === null) return unverifiedControl(base, applicabilityOf(row), NOT_IN_CATALOG);
    const stored = check.status === "verified" ? byId.get(row.controlId) : undefined;
    if (stored === undefined) return unverifiedControl(base, applicabilityOf(row), check.reason ?? "CONTROL_RESULTS_SHAPE_INVALID");
    return { ...base, dimensions: stored.dimensions, claimKind: stored.claimKind, evidenceRefs: stored.admitted.map((item) => item.ref.id),
      notEvaluatedReason: stored.dimensions.result !== "not_evaluated" ? null
        : row.applicability === "unresolved" ? `unresolved: ${row.missingFacts.join(", ") || "see the plan"}`
          : row.applicability === "not_applicable" ? "not applicable (compiled plan)" : `${NO_LOADER} (${stored.reasons[0] ?? "no admitted records"})` };
  });
  return { planDigest: plan.digest, resultsPath: path, resultsSha256, status: check.status, verified: check.status === "verified", reason: check.reason,
    controls, counts: countsOf(controls) };
}

/**
 * `stored` as a read now finds it. A set Review did not verify stays as recorded (its controls already say why); a
 * verified one whose file no longer verifies has every control not_evaluated with the reason, and the set reads as a
 * local limit or a failure as the read classified it. Counts follow.
 */
export function recheckedConformance(stored: StoredConformance, now: ControlResultsCheck): StoredConformance {
  if (stored.status !== "verified" || now.status === "verified") return stored;
  const reason = now.reason ?? "CONTROL_RESULTS_NOT_VERIFIED_LOCALLY";
  const controls = stored.controls.map((control) => control.notEvaluatedReason?.startsWith("CONTROL_NOT_IN_SHIPPED_CATALOG") === true ? control
    : unverifiedControl(control, control.dimensions.applicability, reason));
  return { ...stored, status: now.status, verified: false, reason, controls, counts: countsOf(controls) };
}

/**
 * The statement for a stage's revision (pure). The claim is the weakest of the envelopes rebuilt from the stored, verified
 * CONTROL_RESULT dimensions (the one legitimate use of envelopeFromDimensions); with no plan, or results that did not
 * verify, it is an unverified, not_evaluated envelope. `ownerOutOfScope` lists owner-settled requirements, which stay unresolved.
 */
export function conformanceStatement(input: {
  stage: A4Stage; revisionDigest: string; stored: StoredConformance | null; evaluatedAt: string;
  ownerOutOfScope: A4ConformanceStatementV1["ownerOutOfScope"]; unsupported: readonly string[]; missingFacts: readonly string[];
  expertReview: A4ConformanceStatementV1["expertReview"]; activationAcknowledgement: A4ConformanceStatementV1["activationAcknowledgement"];
  claimBoundary: string; now: number;
}): A4ConformanceStatementV1 {
  const stored = input.stored;
  const producer = `a4-conformance:${input.stage}`;
  const members = stored?.status === "verified" ? stored.controls.map((control) => envelopeFromDimensions(`catalog:${control.controlId}`, control.claimKind, control.dimensions)) : [];
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
    expertReview: input.expertReview, activationAcknowledgement: input.activationAcknowledgement, claim, claimBoundary: input.claimBoundary
  });
}

const NO_PLAN_BOUNDARY = "No compiled plan is evaluated at this stage: every control stays not_evaluated until Adapt compiles and reviews one.";
const storedShape = z.object({ planDigest: z.string().min(1), resultsPath: z.string().min(1), resultsSha256: z.string().regex(/^[0-9a-f]{64}$/),
  status: z.enum(["verified", "not_evaluated", "failed"]), verified: z.boolean(), reason: z.string().nullable(), controls: z.array(storedControlSchema),
  counts: z.object({ pass: z.number(), fail: z.number(), not_evaluated: z.number(), not_applicable: z.number(), unresolved: z.number() }) });

/** The newest Adapt revision's recorded results set, when it parses and is for the revision's proposed plan; null otherwise. */
function storedOf(spec: Record<string, unknown>): StoredConformance | null {
  const recorded = storedShape.safeParse((spec.review as { conformance?: unknown } | undefined)?.conformance);
  const plan = proposedPlan(spec);
  return recorded.success && plan !== null && recorded.data.planDigest === plan.digest ? recorded.data as StoredConformance : null;
}

/**
 * The newest Adapt revision's results set checked again now (readiness's live fact, collected by a4Gates): null when
 * Review recorded none. Any read error is a failure, never a pass.
 */
export function controlResultsNow(workspace: string, state: Pick<A4ReadinessState, "revisions">): ControlResultsCheck | null {
  const revision = state.revisions.filter((row) => row.stage === "adapt").at(-1);
  if (revision === undefined) return null;
  let spec: Record<string, unknown>;
  try {
    spec = JSON.parse(revision.spec_json) as Record<string, unknown>;
  } catch {
    return failed("CONTROL_RESULTS_RECORD_UNREADABLE");
  }
  const stored = storedShape.safeParse((spec.review as { conformance?: unknown } | undefined)?.conformance);
  if (!stored.success) return (spec.review as { conformance?: unknown } | undefined)?.conformance === undefined ? null : failed("CONTROL_RESULTS_RECORD_INVALID");
  const { status, reason } = checkControlResults(workspace, stored.data.resultsPath, stored.data.resultsSha256);
  return { status, reason };
}

/**
 * GET …/conformance (design §10.5): the stage's statement. Adapt's is rebuilt from the control results its newest
 * revision's Review recorded, with the results file checked again now (a file edited, deleted or no longer verifying
 * reads not_evaluated with its reason), and with the owner's out-of-scope settlements, the sources acknowledgement and
 * the deferred-activation acknowledgement recorded on that revision (kept as the completion gate consumed them, even once they expire). A record that does not
 * parse counts as none. Every other stage, and Adapt before its Review, carries no plan and says not_evaluated
 * (Activate's own statement is P1-62's).
 */
export function conformanceView(workspace: string, state: A4ReadinessState, stage: A4Stage, now: number): A4ConformanceStatementV1 {
  const revision = state.revisions.filter((row) => row.stage === stage).at(-1) ?? state.revisions.at(-1);
  const revisionDigest = revision?.spec_digest ?? sha256Hex("");
  const spec = revision === undefined ? {} : JSON.parse(revision.spec_json) as Record<string, unknown>;
  const recorded = stage === "adapt" ? storedOf(spec) : null;
  const stored = recorded === null ? null : recheckedConformance(recorded, checkControlResults(workspace, recorded.resultsPath, recorded.resultsSha256));
  const plan = stage === "adapt" ? proposedPlan(spec) : null;
  const revisionNo = revision?.revision_no ?? state.project.revision_no;
  const required = gatePolicyOf(state.chain).gates["adapt.completion"].requiredReviews.some((entry) => entry.kind === "review_record");
  return conformanceStatement({ stage, revisionDigest, stored, evaluatedAt: new Date(now).toISOString(),
    ownerOutOfScope: stored === null ? [] : ownerOutOfScope(state, plan, now, revisionNo),
    unsupported: stored === null || plan === null ? [] : plan.unsupported.map((row) => `${row.controlId}: ${row.reason}`),
    missingFacts: stored === null ? [] : [...(understandingOf(spec)?.facts.followUps ?? [])],
    expertReview: { required: stage === "adapt" && required,
      records: stored === null ? [] : state.refs.filter((ref) => ref.revisionNo === revisionNo && ref.lane === "verified").map((ref) => `${ref.refKind}:${ref.refId}`),
      acknowledgement: stage === "adapt" ? acknowledgementOf(state, "regulatory_sources_status", now, revisionNo) : null },
    activationAcknowledgement: stage === "adapt" ? acknowledgementOf(state, "plan_activated", now, revisionNo) : null,
    claimBoundary: stored === null ? NO_PLAN_BOUNDARY : ADAPT_CLAIM_BOUNDARY, now });
}
