import { sha256Hex } from "../../../../src/utils/hash.js";
import { changeSchema, completeText, sameBinding, type LocalOutcome } from "./protocol.js";

interface ChangeOutcome extends LocalOutcome { mergeReleases: string[]; changeDigest: string | null }
/** No Git write: records only whether captured synthetic change bytes may leave this local gate. */
export function runChangeGate(value: unknown): ChangeOutcome {
  const outcome: ChangeOutcome = { result: "not_evaluated", reasonCode: "invalid_input", claimKind: "synthetic_example", mergeReleases: [], changeDigest: null };
  const stop = (result: LocalOutcome["result"], reasonCode: string): ChangeOutcome => ({ ...outcome, result, reasonCode });
  const parsed = changeSchema.safeParse(value);
  if (!parsed.success) return outcome;
  const input = parsed.data;
  const { change, analysis, approval } = input;
  outcome.changeDigest = "sha256:" + sha256Hex(Buffer.from(change.bytesUtf8, "utf8"));
  if (!sameBinding(input.context, change.binding) || input.proposerId !== input.context.agentId) return stop("fail", "change_binding_mismatch");
  if (change.classification === "unknown") return stop("not_evaluated", "change_classification_unavailable");
  if (analysis === null) return stop("fail", "analysis_required");
  if (approval === null) return stop("fail", "approval_required");
  if (!sameBinding(input.context, analysis.binding) || !sameBinding(input.context, approval.binding)
    || analysis.changeId !== change.changeId || approval.changeId !== change.changeId) return stop("fail", "change_record_binding_mismatch");
  if (analysis.changeDigest !== outcome.changeDigest || approval.changeDigest !== outcome.changeDigest) return stop("fail", "change_digest_mismatch");
  if (!completeText(change.bytesUtf8, analysis.impactSummary, analysis.validationRecordId)) return stop("fail", "analysis_incomplete");
  if (approval.approverId === input.proposerId || approval.approverId === input.context.agentId) return stop("fail", "approval_identity_not_separate");
  if (approval.decision !== "approve") return stop("fail", "approval_rejected");
  const created = Date.parse(change.createdAt), analyzed = Date.parse(analysis.createdAt), approved = Date.parse(approval.approvedAt), expires = Date.parse(approval.expiresAt), now = Date.parse(input.at);
  if (now >= expires) return stop("fail", "approval_expired");
  if (created > analyzed || analyzed > approved || approved > now || expires <= approved) return stop("fail", "change_record_time_invalid");
  outcome.mergeReleases.push(outcome.changeDigest);
  return stop("pass", "change_records_bound");
}
