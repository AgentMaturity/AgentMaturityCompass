/**
 * Deterministic admission (SH-INTEG-02): a pure decision over one observation and the verified policy. No model call,
 * no network, no clock. It answers `explicit_request` only when every check holds; everything else is `not_admitted`
 * with the first failing reason, so a caller can report why without reading the body.
 */
import type { SourceObservation } from "./sourceObservationSchema.js";
import { SOURCE_REPLY_MARKER } from "./sourceObservationSchema.js";
import type { SourcePolicy, SourcePolicySource } from "./sourcePolicySchema.js";

type NotAdmittedReason =
  | "policy_unverified" | "source_unknown" | "admission_off" | "repository_mismatch" | "body_unavailable" | "actor_not_human" | "sender_not_allowed" | "reply_marker" | "not_mentioned";

export type AdmissionDecision =
  | { kind: "explicit_request"; source: SourcePolicySource; sender: { id: number; login: string } }
  | { kind: "not_admitted"; reason: NotAdmittedReason };

export function admitSourceObservation(observation: SourceObservation, policy: SourcePolicy): AdmissionDecision {
  const refuse = (reason: NotAdmittedReason): AdmissionDecision => ({ kind: "not_admitted", reason });
  const source = policy.sources.sources.find((candidate) => candidate.id === observation.sourceId);
  if (!source) return refuse("source_unknown");
  if (source.admission !== "explicit") return refuse("admission_off");
  if (source.repository.id !== observation.repository.id) return refuse("repository_mismatch");
  if (observation.disposition !== "recorded" || observation.body === null) return refuse("body_unavailable");
  if (observation.actor.class !== "human") return refuse("actor_not_human");
  const sender = source.allowedSenders.find((allowed) => allowed.id === observation.actor.id && allowed.login.toLowerCase() === observation.actor.login.toLowerCase());
  if (!sender) return refuse("sender_not_allowed");
  if (observation.body.includes(SOURCE_REPLY_MARKER)) return refuse("reply_marker");
  if (!observation.mentions.includes(source.mention.slice(1).toLowerCase())) return refuse("not_mentioned");
  return { kind: "explicit_request", source, sender: { id: sender.id, login: sender.login } };
}
