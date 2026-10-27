import { join } from "node:path";
import { approvalRequestBindingDigest, approvalRequestSchema } from "../approvals/approvalChainStore.js";
import { approvalRuleForAction } from "../approvals/approvalPolicyEngine.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import { A4_BOUND_ITEMS, gateStatus, isRegulated, readinessMoved, type A4ReadinessState } from "./a4Readiness.js";
import { a4GatePolicyV1Schema, gatePolicyFloorViolations, type A4Stage } from "./a4Schema.js";
import { assertAllowed, DAY_MS, engineRiskTier, evaluateFor, evaluateForAsyncRecord, fail, fileSha, governed, governedAsync,
  intentOf, livePrincipal, randomId, type A4Call } from "./a4Gates.js";
import type { A4Store, A4TransitionResult } from "./a4Store.js";
import type { A4TransitionAttempt } from "./a4TransitionSigning.js";
import type { A4ChangeSpec } from "./a4TransitionRecords.js";

type GateRequest = A4Call & { stage: A4Stage; gate: "direction" | "completion" | "policy"; proposedGatePolicy?: unknown; expectedHeadSeq: number };
/** One actual gate recipe, shared by the explicit retained sync API and the maintained async callers. */
function requestPlan(store: A4Store, projectId: string, input: GateRequest, evaluate: typeof evaluateFor, checkTime?: () => number) {
  const principal = livePrincipal(store, input);
  const now = Date.now();
  const gateId = randomId("a4gate");
  const proposal = input.gate === "policy" ? a4GatePolicyV1Schema.safeParse(input.proposedGatePolicy) : null;
  if (proposal && !proposal.success) throw fail(400, "INPUT_INVALID", "proposedGatePolicy is not an amc.a4-gate-policy/v1 document.");
  if (input.gate !== "policy" && input.proposedGatePolicy !== undefined) throw fail(400, "INPUT_INVALID", "Only a policy gate carries a proposed policy.");
  return { principal, plan: (ts: number, load: (now: number) => A4ReadinessState) => {
    const checkedAt = checkTime?.() ?? now;
    const state = load(checkedAt);
    const project = state.project;
    const stage = input.gate === "policy" ? project.stage : input.stage;
    if (stage === "retired") throw fail(409, "A4_RETIRED", "The project is retired.");
    const { readiness, query } = evaluate(store, state, principal, input, stage, checkedAt);
    assertAllowed(readiness, input.gate === "policy" ? "changeGatePolicy" : "requestGate");
    // A policy gate binds the stage's items too, so it waits on the same blockers and self-settling items as any gate,
    // all but the floor item: a policy gate is how a project left below a newly signed floor is brought back within it.
    if (input.gate === "policy") assertAllowed(readiness, "requestGate", ["gate.policy_floor"]);
    const revision = state.revisions.find((row) => row.revision_no === project.revision_no && row.stage === stage) ?? null;
    if (input.gate !== "policy" && (project.stage !== stage || project.step !== (input.gate === "direction" ? "proposed" : "reviewed") || revision === null)) {
      throw fail(409, "A4_STEP_ORDER", `a ${input.gate} gate opens at step ${input.gate === "direction" ? "proposed" : "reviewed"} of the current stage`);
    }
    const prior = state.gates.filter((row) => row.gate === input.gate && row.stage === stage && row.revision_no === project.revision_no)
      .map((row) => gateStatus(state, row, query.policy, checkedAt));
    // One whose bound readiness moved is refused at decide and complete (assertIntentUnchanged) and readiness reads it STALE: replaceable.
    const open = prior.find((gate) => (gate.status === "PENDING" || gate.status === "QUORUM_MET") && !readinessMoved(readiness.items, gate));
    if (open) throw fail(409, "A4_GATE_OPEN", `gate ${open.row.gate_id} is already open`, { gateId: open.row.gate_id });
    // DENY is terminal for the revision (design §6.4 step 7): a new gate needs a new revision.
    if (input.gate !== "policy" && prior.some((gate) => gate.status === "DENIED")) throw fail(409, "A4_GATE_DENIED", "This revision's gate was denied; propose a new revision.");
    const proposed = proposal?.success ? proposal.data : null;
    if (proposed) {
      const below = gatePolicyFloorViolations(proposed, query.floor, query.gatePolicy);
      if (below.length > 0) throw fail(409, "GATE_POLICY_BELOW_FLOOR", below.join("; "), below);
    }
    const rule = query.gatePolicy.gates[input.gate === "policy" ? "policy" : `${stage}.${input.gate}` as `${A4Stage}.${"direction" | "completion"}`];
    const policyRule = approvalRuleForAction(query.policy, rule.actionClass);
    const regulated = isRegulated(state, query.floor);
    const rolesAllowed = rule.rolesAllowed ? policyRule.rolesAllowed.filter((role) => rule.rolesAllowed!.includes(role)) : policyRule.rolesAllowed;
    if (rolesAllowed.length === 0) throw fail(409, "A4_NOT_READY", "The gate policy leaves no role that may approve.", { reasonCodes: ["GATE_POLICY_BELOW_FLOOR"] });
    const boundItemIds = A4_BOUND_ITEMS[stage];
    const intent = intentOf(state, { stage, gate: input.gate, revisionNo: project.revision_no, requesterKey: principal.key,
      specDigest: proposed ? sha256Hex(canonicalize(proposed)) : revision!.spec_digest, boundItemIds }, readiness);
    const amc = (name: string): string => fileSha(join(store.workspace, ".amc", name)) ?? sha256Hex(`missing-${name}`);
    const request = approvalRequestSchema.parse({
      v: 1, approvalRequestId: gateId, agentId: project.agent_id, intentId: `a4-${projectId}-${stage}-${input.gate}-r${project.revision_no}`,
      toolName: `a4.${stage}.${input.gate}`, actionClass: rule.actionClass, requestedMode: "EXECUTE", effectiveMode: "EXECUTE",
      riskTier: engineRiskTier(state),
      createdTs: now, expiresTs: now + Math.min(rule.ttlDays, query.floor.maxTtlDays ?? 90) * DAY_MS, status: "PENDING",
      requiredApprovals: Math.max(policyRule.requiredApprovals, rule.minApprovals ?? 0, 1),
      requireDistinctUsers: policyRule.requireDistinctUsers || rule.requireDistinctUsers === true || regulated || input.gate === "policy", rolesAllowed,
      boundHashes: { intentHash: sha256Hex(canonicalize(intent)), policyHash: amc("approval-policy.yaml"), toolsHash: amc("tools.yaml"),
        budgetsHash: amc("budgets.yaml"), leaseConstraintsHash: sha256Hex(canonicalize({})) },
      authorizationIntent: intent
    });
    const bindingDigest = approvalRequestBindingDigest(request);
    return { readiness, specs: {
      kind: "GATE_REQUESTED", stage, revisionNo: project.revision_no,
      payload: { gateId, gate: input.gate, bindingDigest, intentHash: request.boundHashes.intentHash, readinessBindingDigest: intent.readinessBindingDigest,
        // A regulated quorum that can only be LOCAL_USER keys is labelled on the gate from the start (design §5.2).
        degraded: readiness.items.some((entry) => entry.id === "sod.self_provisioned" && entry.status === "WAITING") ? ["SOD_DEGRADED_SELF_PROVISIONED"] : [],
        ...(proposed ? { proposedGatePolicy: proposed } : {}) },
      sideRows: [{ table: "a4_gates", values: { gate_id: gateId, project_id: projectId, revision_no: project.revision_no, stage, gate: input.gate,
        request_json: canonicalize(request), binding_digest: bindingDigest, intent_json: canonicalize(intent), readiness_sha256: intent.readinessBindingDigest,
        bound_items_json: JSON.stringify(boundItemIds), gate_policy_digest: intent.gatePolicyDigest, requested_by_key: principal.key,
        excluded_keys_json: JSON.stringify(intent.excludedKeys), expires_ts: request.expiresTs, envelope_json: null, ts } }]
    } satisfies A4ChangeSpec };
  } };
}
/** Original fixed-time synchronous contract. No promise or new actor is introduced on this path. */
export function requestGate(store: A4Store, projectId: string, input: GateRequest): A4TransitionResult {
  const actual = requestPlan(store, projectId, input, evaluateFor);
  return governed(store, projectId, actual.principal, input, actual.plan);
}
export async function requestGateAsync(store: A4Store, projectId: string, input: GateRequest, beforePublish: () => void): Promise<A4TransitionAttempt> {
  input = structuredClone(input);
  const actual = requestPlan(store, projectId, input, evaluateForAsyncRecord, Date.now);
  beforePublish();
  return governedAsync(store, projectId, actual.principal, input, actual.plan, beforePublish);
}
