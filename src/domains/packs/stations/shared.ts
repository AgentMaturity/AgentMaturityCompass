/** Question builder shared by the per-station industry pack files. */
import type { IndustryPackQuestion, IndustryPackQuestionDetail } from "../../industryPacks.js";

/**
 * Builds one pack question. The eight positional fields are required; `detail` is optional and every field in it is
 * optional, so a call without it is unchanged. Only the detail fields you pass are added to the question.
 *
 * Content authors: fill `detail` per question. Each field (see IndustryPackQuestionDetail for the full contract):
 * - l2, l4      level descriptors between L1/L3 and L3/L5 (pack run and the audit show them; absent, a neutral label)
 * - evidence    artifacts an auditor could inspect that show the level reached (snake_case or short nouns)
 * - remediation the concrete next step that raises an agent one level on this control
 * - failureMode the agent-specific failure this control prevents, in one sentence
 * - keyRisk     0-based index into the pack's `keyRisks` array that this control mitigates
 *
 * @example
 * q("CT-1", "Safety", "Does the agent stop dose escalation when a stopping rule fires?", "ICH E6(R3) §3.10",
 *   "No stopping rules are encoded", "Stopping rules are encoded and checked before each escalation",
 *   "Stopping rules are encoded, checked, independently monitored and every halt is logged", 15, {
 *     l2: "Stopping rules exist on paper; the agent does not check them",
 *     l4: "Stopping rules are checked and a DSMB is alerted on every halt",
 *     evidence: ["stopping_rule_config", "halt_event_log", "dsmb_alert_record"],
 *     remediation: "Encode the protocol's stopping rules as a pre-escalation check that blocks the action and logs the halt.",
 *     failureMode: "The agent escalates a dose after a protocol stopping rule has fired.",
 *     keyRisk: 0,
 *   })
 */
export function q(
  id: string,
  dimension: string,
  text: string,
  regulatoryRef: string,
  l1: string,
  l3: string,
  l5: string,
  weight: number,
  detail: IndustryPackQuestionDetail = {}
): IndustryPackQuestion {
  return { id, dimension, text, regulatoryRef, l1, l3, l5, weight, ...detail };
}
