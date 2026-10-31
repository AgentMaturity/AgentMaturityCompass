import { addDuration } from "../../../../src/incidents/regulatoryClocks.js";
import { ceaSchema, invalidInput, outcome, sameBinding, type OracleOutcome } from "./protocol.js";

/** Draft arithmetic uses the native pure duration helper; no CEA clock, deadline rule or report integration is supplied. */
export function runCeaDrill(input: unknown): OracleOutcome {
  const parsed = ceaSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const data = parsed.data;
  const observations: Record<string, unknown> = { pendingDependency: "P3-09", registeredClockExercised: false,
    separateOrderApplicability: "unresolved", scope: "synthetic_fixture_parameter" };
  if (data.packet !== null && !sameBinding(data.context, data.packet.binding)) return outcome("deny", "binding_mismatch", observations);
  if (data.capacityMw === null) return outcome("not_evaluated", "capacity_unresolved", observations);
  const start = Date.parse(data.incident.startedAt); const now = Date.parse(data.at);
  const due = addDuration(start, { amount: data.incident.kind === "sabotage" ? 24 : 6, unit: "hours" });
  const packet = data.packet;
  const complete = packet !== null && packet.incidentId === data.incident.incidentId
    && [packet.fields.asset, packet.fields.summary, packet.fields.contact, packet.fields.scope].every(value => typeof value === "string" && value.trim().length > 0);
  let result: "pass" | "fail" = "pass"; let reasonCode = "draft_packet_on_time";
  if (!complete) { result = "fail"; reasonCode = "draft_packet_incomplete"; }
  else if (start > now || Date.parse(packet!.createdAt) < start || Date.parse(packet!.createdAt) > now) { result = "fail"; reasonCode = "draft_packet_order_invalid"; }
  else if (Date.parse(packet!.createdAt) > due) { result = "fail"; reasonCode = "draft_packet_late"; }
  observations.draftPacket = { result, reasonCode, deadlineAt: new Date(due).toISOString(), incidentStartedAt: data.incident.startedAt,
    createdAt: packet?.createdAt ?? null, scope: "synthetic_fixture_parameter", requiredFields: ["asset", "summary", "contact", "scope"] };
  return outcome("not_evaluated", "dependency_unavailable", observations);
}
