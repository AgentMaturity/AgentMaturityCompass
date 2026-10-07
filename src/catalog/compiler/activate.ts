/**
 * Activating a signed control plan and loading it at runtime (P1-12). The active plan lives in a signed control
 * journal (`.amc/control-plan/heads/`, kind `compiled-control-plan`) whose host-local checkpoint and signer pin sit
 * outside the workspace, so deleting, truncating or rolling back the journal is an integrity failure, never "no
 * policy". Every read verifies the journal whole, then the plan inside the entry it read: digest recomputed from that
 * content and its CONTROL_PLAN signature, in the same read. An active plan is what makes a workspace a regulated
 * profile: one that does not verify refuses the session. Signatures checked against the workspace's own keys are a
 * local audit trail, not portable trust (P0-09).
 */
import { join, resolve } from "node:path";
import { consumeApprovedExecution, verifyApprovalForExecution } from "../../approvals/approvalEngine.js";
import { withControlFileLock } from "../../lifecycle/controlFileLock.js";
import { appendSignedControlJournal, readSignedControlJournal, type SignedControlJournalSnapshot } from "../../lifecycle/signedControlJournal.js";
import { assertOwnerMode } from "../../mode/mode.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { digestOf } from "../digest.js";
import { loadCatalog } from "../loader.js";
import { verifyCatalogLock } from "../lockfile.js";
import type { ControlRecord, EnforcementPoint } from "../types.js";
import { PARAMETERS } from "./runtimePolicy.js";
import { CONTROL_PLAN_REVIEW_TOOL, assertSignedPlan, planReviewIntent, planWeakenings } from "./sign.js";
import type { CompiledPlan, EffectiveRuntimePolicy, SignedPlan } from "./types.js";

const KIND = "compiled-control-plan" as const;
const root = (workspace: string): string => join(resolve(workspace), ".amc", "control-plan");
const hexOf = (digest: string): string => digest.replace(/^sha256:/, "");

/** What one activation records: the signed plan and the review decision that authorized it. */
interface Activation {
  schema: "amc.control-plan-activation/v1";
  plan: CompiledPlan;
  signature: SignedPlan["signature"];
  compiledAt: string;
  approvalRequestId: string;
}

/** A control the active plan puts in force, with its catalog binding and review state. */
export interface ActiveControl {
  readonly controlId: string;
  readonly controlVersion: string;
  /** The points the catalog binds the control to. */
  readonly points: readonly EnforcementPoint[];
  /** The points where the control contributes a compiled parameter; a point without one compiles to nothing. */
  readonly compiledPoints: readonly EnforcementPoint[];
  readonly review: ControlRecord["review"]["status"];
}

/** The verified active plan. Every field derives from the journal entry and catalog bytes verified in one read. */
export interface ActiveCompiledPolicy {
  readonly revision: number;
  /** Identity of the journal head this was loaded from; a session pins it. */
  readonly entrySha256: string;
  readonly planDigest: string;
  readonly lockDigest: string;
  readonly runtimePolicy: EffectiveRuntimePolicy;
  readonly controls: readonly ActiveControl[];
}

/** Structure, then the plan's own digest and CONTROL_PLAN signature, over the payload the journal just verified. */
function verifiedActivation(workspace: string, payload: unknown): Activation {
  const a = payload as Partial<Activation> | null;
  if (a?.schema !== "amc.control-plan-activation/v1" || !a.plan || !a.signature || typeof a.approvalRequestId !== "string") {
    throw new Error("not a version 1 control-plan activation");
  }
  assertSignedPlan(workspace, { plan: a.plan, signature: a.signature }, "control plan");
  if (a.plan.status !== "ready") throw new Error("the control plan is blocked; only a ready plan can be active");
  return a as Activation;
}

function readJournal(workspace: string, recover = false): SignedControlJournalSnapshot<Activation> {
  return readSignedControlJournal({ workspace, controlKind: KIND, journalDir: join(root(workspace), "heads"),
    parsePayload: (payload) => verifiedActivation(workspace, payload), recoverPendingPublication: recover });
}

/** Identity of the active journal head, or null when no plan was ever activated. Throws on any integrity failure. */
export function activeControlPlanHead(workspace: string): string | null {
  return readJournal(workspace).entrySha256;
}

/**
 * The active compiled policy, or null when no plan was ever activated. Throws when the journal, the plan's signature
 * or digest, or the shipped catalog against the plan's lockfile does not verify: the caller refuses the session.
 */
export function loadActiveCompiledPolicy(workspace: string): ActiveCompiledPolicy | null {
  const journal = readJournal(workspace);
  if (journal.integrity === "uninitialized" || !journal.payload) return null;
  const { plan } = journal.payload;
  const catalog = loadCatalog();
  const lock = verifyCatalogLock(plan.lock, catalog);
  if (!lock.ok) {
    const first = lock.mismatches[0];
    throw new Error(`the shipped catalog differs from the active plan's lockfile (${first?.path}: expected ${first?.expected}, found ${first?.actual}); recompile and reactivate`);
  }
  const controls = plan.requirements.filter((r) => r.applicability !== "not_applicable").map((r): ActiveControl => {
    const record = catalog.controls.get(r.controlId);
    if (!record || record.version !== r.controlVersion) throw new Error(`control ${r.controlId}@${r.controlVersion} is not in the shipped catalog`);
    const compiledPoints = [...new Set(record.binding.parameters.flatMap((p) => PARAMETERS.find((spec) => spec.pattern.test(p.name))?.point ?? []))];
    return { controlId: r.controlId, controlVersion: r.controlVersion, points: record.binding.points, compiledPoints, review: record.review.status };
  });
  return { revision: journal.revision, entrySha256: journal.entrySha256 ?? "", planDigest: plan.digest,
    lockDigest: digestOf(plan.lock), runtimePolicy: plan.runtimePolicy, controls };
}

export interface ActivateInput {
  workspace: string;
  signed: Pick<SignedPlan, "plan" | "signature" | "compiledAt">;
  /** The approved plan review (`amc catalog compile --request-review`) and the agent id it was filed under. */
  approvalRequestId: string;
  reviewAgentId: string;
  allowWeakening?: boolean;
}

/**
 * Makes a signed, ready plan the workspace's active compiled policy. Owner mode only. Mirrors signing's gates against
 * the active plan (every weakening refused unless `allowWeakening`), requires the shipped catalog to match the plan's
 * lockfile, and requires the plan review approved for exactly this plan; the approval is consumed.
 */
export function activateControlPlan(input: ActivateInput): { revision: number; weakenings: string[] } {
  const workspace = resolve(input.workspace);
  assertOwnerMode(workspace, "catalog compile");
  const next: Activation = { schema: "amc.control-plan-activation/v1", plan: input.signed.plan, signature: input.signed.signature,
    compiledAt: input.signed.compiledAt, approvalRequestId: input.approvalRequestId };
  verifiedActivation(workspace, next);
  const lock = verifyCatalogLock(next.plan.lock, loadCatalog());
  if (!lock.ok) throw new Error("the shipped catalog differs from the plan's lockfile; recompile against this catalog");
  return withControlFileLock({ root: root(workspace), name: "activation", operation: () => {
    const previous = readJournal(workspace, true);
    const found = planWeakenings(previous.payload?.plan ?? null, next.plan);
    if (found.length > 0 && input.allowWeakening !== true) {
      throw new Error(`activating this plan weakens ${found.join("; ")}; pass --allow-weakening after review`);
    }
    const intent = planReviewIntent(next.plan);
    const review = verifyApprovalForExecution({ workspace, approvalId: input.approvalRequestId, expectedAgentId: input.reviewAgentId,
      expectedIntentId: intent.intentId, expectedIntentHash: sha256Hex(canonicalize(intent.intentPayload)),
      expectedToolName: CONTROL_PLAN_REVIEW_TOOL, expectedActionClass: intent.actionClass });
    if (!review.ok) throw new Error(`plan review ${input.approvalRequestId} does not authorize this plan: ${review.error ?? "not approved"}`);
    const spent = consumeApprovedExecution({ workspace, approvalId: input.approvalRequestId, expectedAgentId: input.reviewAgentId,
      executionId: `activate-${hexOf(next.plan.digest).slice(0, 32)}` });
    if (!spent.consumed) throw new Error(`plan review ${input.approvalRequestId} was already used`);
    const committed = appendSignedControlJournal({ workspace, controlKind: KIND, journalDir: join(root(workspace), "heads"), previous, payload: next });
    return { revision: committed.revision, weakenings: found };
  } });
}
