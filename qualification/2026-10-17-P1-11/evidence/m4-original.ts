import type { TrustTier } from "../../types.js";
import type { BindingField } from "../types.js";
import type { EvaluableControl, EvaluatedContract, EvaluationContext, EvidenceItem, RejectionReason } from "./types.js";

export type Admission = { admitted: true; trustTier: TrustTier } | { admitted: false; reason: RejectionReason; detail: string };

/** Ids presented so far in one evaluation, and the control, subject and window key they were presented under. */
export interface UseLedger { key: string; seen: Map<string, string> }

const DAY_MS = 86_400_000;
const reject = (reason: RejectionReason, detail: string): Admission => ({ admitted: false, reason, detail });

/** The control, subject and window an item is used for. Two uses of one id under different keys are a replay. */
export function useKey(record: Pick<EvaluableControl, "id">, ctx: Pick<EvaluationContext, "subject" | "window">): string {
  const s = ctx.subject;
  return [record.id, s.tenantId, s.workspaceId, s.deploymentId, s.agentId, s.subjectId, ctx.window.start, ctx.window.end]
    .map((part) => part ?? "-").join("|");
}

/** The value a binding field must carry here: null when the context does not know it, undefined when nothing constrains it. */
function expected(field: BindingField, record: EvaluableControl, contract: EvaluatedContract, ctx: EvaluationContext): string | null | undefined {
  switch (field) {
    case "controlId": return record.id;
    case "controlVersion": return record.version;
    case "policyDigest": return ctx.plan?.policyDigest ?? null;
    case "producerId": return contract.producer;
    case "tenantId": case "workspaceId": case "deploymentId": case "agentId": case "subjectId": return ctx.subject[field];
    default: return undefined; // principalId, sessionId, resourceId: presence only
  }
}

function bindingRejection(item: EvidenceItem, contract: EvaluatedContract, record: EvaluableControl, ctx: EvaluationContext): Admission | null {
  const { binding } = item;
  // An item that names a tenant names this one, or it is another tenant's evidence (an unknown tenant included).
  if (binding.tenantId !== undefined && binding.tenantId !== ctx.subject.tenantId) {
    return reject("cross_tenant", `tenant ${binding.tenantId} is not this evaluation's tenant`);
  }
  // P0-17: a workspace system-session row binds an agent-scoped contract only as a violation (that can only fail it).
  const systemViolation = binding.sessionId === "system" && item.verdict === "violates";
  if (binding.sessionId === "system" && contract.bindingFields.includes("agentId") && !systemViolation) {
    return reject("binding_mismatch", "a system-session record binds only workspace-scoped contracts");
  }
  const missing = contract.bindingFields.find((field) => binding[field] === undefined && !(systemViolation && field === "agentId"));
  if (missing) return reject("binding_missing", `the record carries no ${missing}`);
  for (const [field, value] of Object.entries(binding) as Array<[BindingField, string]>) {
    const want = expected(field, record, contract, ctx);
    if (field === "tenantId" || want === undefined) continue;
    if (want === null ? contract.bindingFields.includes(field) : value !== want) {
      return reject("binding_mismatch", `${field} ${value} is not ${want ?? "known in this evaluation"}`);
    }
  }
  return null;
}

function replayDetail(item: EvidenceItem, uses: UseLedger, ctx: EvaluationContext): string | null {
  if (item.attributes.foreignReceipt === true) return "its receipt commits to another record or workspace";
  const receiptId = item.attributes.receiptId;
  const ids = [`${item.ref.kind}:${item.ref.id}`, ...(typeof receiptId === "string" ? [`receipt:${receiptId}`] : [])];
  for (const id of ids) {
    if (uses.seen.has(id)) return `${id} was already presented in this evaluation`;
    const prior = ctx.priorUses?.find((use) => use.id === id && use.key !== uses.key);
    if (prior) return `${id} was already used for ${prior.key}`;
  }
  for (const id of ids) uses.seen.set(id, uses.key);
  return null;
}

/**
 * Admits or rejects one item against one contract, in the order of docs/catalog/CONTROL_RECORD.md: producer, provenance,
 * binding, window and freshness, replay, invalidation. The trust tier is the one the loader derived from provenance
 * (P0-18), capped by the producer's maxClaimKind; a tier the record states about itself is never read here.
 */
export function admitEvidence(item: EvidenceItem, contract: EvaluatedContract, record: EvaluableControl,
  ctx: EvaluationContext, uses: UseLedger): Admission {
  const producer = ctx.producers.find((row) => row.id === item.producerId);
  if (!producer || producer.status !== "available" || item.producerId !== contract.producer) {
    return reject("producer_not_admitted", `producer ${item.producerId} is not an available producer of contract ${contract.id}`);
  }
  const { provenance } = item;
  if (!provenance.verified) return reject("producer_unverified", provenance.detail);
  if (provenance.producerId !== item.producerId || provenance.trustTier === null) {
    return reject("producer_unverified", `the record proves ${provenance.producerId ?? "no AMC producer"}, not ${item.producerId}`);
  }
  const binding = bindingRejection(item, contract, record, ctx);
  if (binding) return binding;
  const recorded = Date.parse(item.recordedAt);
  const end = Date.parse(ctx.window.end);
  if (!(recorded >= Date.parse(ctx.window.start) && recorded <= end)) {
    return reject("outside_window", `recorded ${item.recordedAt}, outside ${ctx.window.start} to ${ctx.window.end}`);
  }
  if (end - recorded > contract.freshness.maxAgeDays * DAY_MS) {
    return reject("stale", `recorded ${item.recordedAt}, more than ${contract.freshness.maxAgeDays} days before the window end`);
  }
  const replay = replayDetail(item, uses, ctx);
  if (replay) return reject("replayed", replay);
  const invalidation = ctx.invalidations.find((row) => record.invalidatedBy.includes(row.trigger) && Date.parse(row.at) > recorded);
  if (invalidation) return reject("invalidated", `${invalidation.trigger} changed at ${invalidation.at} (${invalidation.ref}) after this record`);
  const observed = provenance.trustTier === "OBSERVED" || provenance.trustTier === "OBSERVED_HARDENED";
  return { admitted: true, trustTier: observed && producer.maxClaimKind !== "observed" ? "SELF_REPORTED" : provenance.trustTier };
}
