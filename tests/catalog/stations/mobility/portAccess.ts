import { portSchema, sameBinding, unique, type LocalOutcome } from "./protocol.js";

interface PortOutcome extends LocalOutcome {
  openedRequests: string[];
  decisions: Array<{ requestId: string; result: "allow" | "deny" | "not_evaluated"; reasonCode: string; level: 1 | 2 | 3 | null; revision: number }>;
  currentLevel: 1 | 2 | 3 | null;
}
/** Local event replay; the current level/revision is derived before each access decision. */
export function runPortAccess(value: unknown): PortOutcome {
  const outcome: PortOutcome = { result: "not_evaluated", reasonCode: "invalid_input", claimKind: "synthetic_example", openedRequests: [], decisions: [], currentLevel: null };
  const parsed = portSchema.safeParse(value);
  if (!parsed.success) return outcome;
  const input = parsed.data;
  const now = Date.parse(input.at);
  const requests = input.events.filter(event => event.kind === "access_request");
  if (!unique(input.events.map(event => event.eventId)) || !unique(requests.map(request => request.requestId))) return outcome;
  if (input.initialSecurity === null) {
    outcome.reasonCode = "current_level_unavailable";
    outcome.decisions = requests.map(request => ({ requestId: request.requestId, result: "not_evaluated", reasonCode: "current_level_unavailable", level: null, revision: 0 }));
    return outcome;
  }
  const security = input.initialSecurity;
  if (!sameBinding(input.context, security.binding) || security.facilityId !== input.facilityId || Date.parse(security.changedAt) > now) return outcome;
  let previous = Date.parse(security.changedAt);
  // Validate the whole captured event stream before allowing any simulated gate effect.
  for (const event of input.events) {
    const at = Date.parse(event.at);
    if (!sameBinding(input.context, event.binding) || event.facilityId !== input.facilityId || at < previous || at > now) return outcome;
    if (event.kind === "access_request" && event.authorization !== null
      && (!sameBinding(input.context, event.authorization.binding) || event.authorization.facilityId !== input.facilityId || event.authorization.principalId !== event.principalId)) return outcome;
    previous = at;
  }
  let currentLevel = security.level;
  let revision = 1;
  let changedAt = Date.parse(security.changedAt);
  for (const event of input.events) {
    if (event.kind === "level_change") { currentLevel = event.level; revision += 1; changedAt = Date.parse(event.at); continue; }
    let result: "allow" | "deny" | "not_evaluated" = "allow";
    let reasonCode = "current_level_authorized";
    const authorization = event.authorization;
    const check = event.check;
    if (authorization === null || check === null) { result = "not_evaluated"; reasonCode = "authorization_unavailable"; }
    else if (authorization.maxLevel < currentLevel) { result = "deny"; reasonCode = "authorization_level_too_low"; }
    else if (check.level !== currentLevel || check.revision !== revision || Date.parse(check.checkedAt) < changedAt) { result = "deny"; reasonCode = "security_level_changed"; }
    else if (Date.parse(authorization.issuedAt) > Date.parse(event.at) || Date.parse(event.at) >= Date.parse(authorization.expiresAt)
      || Date.parse(authorization.expiresAt) <= Date.parse(authorization.issuedAt) || Date.parse(check.checkedAt) > Date.parse(event.at)
      || Date.parse(check.checkedAt) < Date.parse(authorization.issuedAt)) { result = "deny"; reasonCode = "authorization_time_invalid"; }
    outcome.decisions.push({ requestId: event.requestId, result, reasonCode, level: currentLevel, revision });
    if (result === "allow") outcome.openedRequests.push(event.requestId);
  }
  outcome.currentLevel = currentLevel;
  const refusal = outcome.decisions.find(row => row.result === "deny") ?? outcome.decisions.find(row => row.result === "not_evaluated");
  if (refusal) { outcome.result = refusal.result; outcome.reasonCode = refusal.reasonCode; }
  else if (outcome.decisions.length > 0) { outcome.result = "allow"; outcome.reasonCode = "current_level_authorized"; }
  else outcome.reasonCode = "access_request_unavailable";
  return outcome;
}
