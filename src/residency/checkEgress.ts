import { resolve } from "node:path";
import { loadActiveCompiledPolicy, type ActiveCompiledPolicy } from "../catalog/compiler/activate.js";
import { emitGuardEvent, getWorkspaceScope } from "../enforce/evidenceEmitter.js";
import { sha256Hex } from "../utils/hash.js";
import { loadDestinationRegistrySnapshot, loadPinnedResidencyProfile } from "./destinationRegistry.js";
import { EGRESS_CHANNELS, type CheckEgressInput, type DestinationRecordV1, type DestinationRegistryV1, type EgressChannel,
  type EgressDecision, type ResidencyControlResult, type ResidencyRuleV1 } from "./types.js";

type Blocked = Extract<EgressDecision, { verdict: "blocked" }>;
type Accepted = Exclude<EgressDecision, Blocked>;
export class EgressBlocked extends Error {
  readonly decision: Blocked;
  readonly controlResult: ResidencyControlResult;
  constructor(decision: Blocked, controlResult: ResidencyControlResult) {
    super(`Residency egress blocked: ${decision.reason}${decision.detail ? ` (${decision.detail})` : ""}; `
      + `destination=${decision.destinationId ?? "unregistered"}; rules=${decision.ruleIds.slice(0, 8).join(",") || "none"}`);
    this.name = "EgressBlocked";
    this.decision = Object.freeze({ ...decision, ruleIds: Object.freeze([...decision.ruleIds]) });
    this.controlResult = Object.freeze({ ...controlResult, controlIds: Object.freeze([...controlResult.controlIds]) });
  }
}
function block(input: CheckEgressInput, reason: Blocked["reason"], detail: string, rules: readonly ResidencyRuleV1[] = [], destinationId?: string): never {
  const decision: Blocked = { verdict: "blocked", reason, detail, ruleIds: rules.map(rule => rule.ruleId), ...(destinationId ? { destinationId } : {}) };
  const controlResult: ResidencyControlResult = { status: "not_evaluated", controlIds: [...new Set(rules.map(rule => rule.controlId))], reason };
  let routeHash: string | null = null;
  try { const url = new URL(input.url); routeHash = sha256Hex(`${url.protocol}//${url.host}${url.pathname}`); } catch { /* no raw URL or error is emitted */ }
  try {
    emitGuardEvent({ workspace: input.workspace, agentId: input.agentId ?? "system", moduleCode: "RESIDENCY", decision: "deny",
      severity: "high", reason: `RESIDENCY_ROUTE_BLOCKED:${reason}:${detail}`, meta: { auditType: "RESIDENCY_ROUTE_BLOCKED",
        channel: input.channel, destinationId: destinationId ?? null, routeHash, ruleIds: decision.ruleIds, controlResult,
        purposeDeclared: typeof input.purpose === "string" && input.purpose.length > 0 } });
  } catch { /* Audit storage failure never permits the egress or replaces its typed denial. */ }
  throw new EgressBlocked(decision, controlResult);
}
interface Context {
  readonly active: ActiveCompiledPolicy | null;
  readonly registry: DestinationRegistryV1 | null;
  readonly facts: { readonly dataClasses: readonly string[] | null; readonly jurisdictions: readonly string[] | null; readonly storageUrl: string } | null;
}
function context(input: CheckEgressInput, cwdFallback: boolean): Context {
  let active: ActiveCompiledPolicy | null;
  try { active = loadActiveCompiledPolicy(input.workspace); } catch { return block(input, "registry_unverifiable", "active_policy_unverifiable"); }
  const snapshot = loadDestinationRegistrySnapshot(input.workspace);
  if (cwdFallback && (active || snapshot.state !== "missing")) return block(input, "registry_unverifiable", "workspace_scope_required");
  if (snapshot.state === "invalid") return block(input, "registry_unverifiable", snapshot.reason);
  if (snapshot.state === "missing") {
    if (active) return block(input, "registry_unverifiable", "registry_missing");
    return { active, registry: null, facts: null };
  }
  const registry = snapshot.registry;
  if (active && !registry.rules.length) return block(input, "registry_unverifiable", "rules_missing");
  let facts: Context["facts"] = null;
  if (active) {
    try { facts = loadPinnedResidencyProfile(input.workspace, registry, active.profileSha256); }
    catch { return block(input, "registry_unverifiable", "profile_unverifiable", registry.rules); }
  }
  return { active, registry, facts };
}
function destinationUrl(input: CheckEgressInput): URL {
  try {
    const url = new URL(input.url), authority = /^https?:\/\/([^/?#]*)/i.exec(input.url)?.[1];
    if (input.url.length > 4096 || authority === undefined || !["http:", "https:"].includes(url.protocol)
      || url.username || url.password || authority.includes("@") || input.url.includes("#") || /\\/.test(input.url)
      || /%(?:2e|2f|5c)/i.test(url.pathname)) throw new Error();
    return url;
  } catch { return block(input, "destination_unregistered", "invalid_destination_url"); }
}
const pathMatches = (path: string, prefix: string): boolean => prefix === "/" || path === prefix
  || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
const hostMatches = (host: string, pattern: string): boolean => pattern.startsWith("*.")
  ? host !== pattern.slice(2) && host.endsWith(`.${pattern.slice(2)}`) : host === pattern;
const matches = (destination: DestinationRecordV1, channel: EgressChannel, url: URL): boolean => destination.channels.includes(channel)
  && destination.match.hosts.some(pattern => hostMatches(url.hostname.toLowerCase(), pattern))
  && (!destination.match.pathPrefixes || destination.match.pathPrefixes.some(prefix => pathMatches(url.pathname, prefix)));
function known(values: readonly string[] | null | undefined): readonly string[] | null {
  return Array.isArray(values) && values.length > 0 && values.length <= 128
    && values.every(value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) ? values : null;
}
function evaluate(input: CheckEgressInput, state: Context): Accepted {
  const url = destinationUrl(input);
  if (!EGRESS_CHANNELS.includes(input.channel)) return block(input, "registry_unverifiable", "invalid_channel");
  if (!state.registry) return Object.freeze({ verdict: "no_rule", destinationId: null });
  // A resource can add protected classes, never narrow the pinned session declaration.
  const profileClasses = known(state.facts?.dataClasses), resourceClasses = known(input.dataClasses);
  const dataClasses = input.dataClasses === undefined ? profileClasses : profileClasses === null || resourceClasses === null
    ? null : [...new Set([...profileClasses, ...resourceClasses])];
  const jurisdictions = known(state.facts?.jurisdictions);
  const applicable = state.registry.rules.filter(rule => (dataClasses === null || rule.appliesTo.dataClasses.some(value => dataClasses.includes(value)))
    && (jurisdictions === null || rule.appliesTo.jurisdictions.some(value => jurisdictions.includes(value))));
  const destinations = state.registry.destinations.filter(destination => matches(destination, input.channel, url));
  if (destinations.length > 1) return block(input, "destination_unregistered", "destination_match_ambiguous", applicable);
  const destination = destinations[0];
  if (!applicable.length) return Object.freeze({ verdict: "no_rule", destinationId: destination?.destinationId ?? null });
  if (!destination) return block(input, "destination_unregistered", "destination_unregistered", applicable);
  if (!destination.region) return block(input, "region_unknown", "region_unknown", applicable, destination.destinationId);
  if (applicable.some(rule => !rule.allowedJurisdictions.includes(destination.region!.jurisdiction)
    && !(rule.acceptsTransferBasis && destination.transferBasis !== null))) {
    return block(input, "region_not_allowed", "region_not_allowed", applicable, destination.destinationId);
  }
  return Object.freeze({ verdict: "allowed", destinationId: destination.destinationId, region: destination.region.code,
    ruleIds: Object.freeze(applicable.map(rule => rule.ruleId)) });
}
/** Rules are conjunctive; unknown facts never select a permissive subset. Decisions are local routing facts, not legal approval. */
export function checkEgress(input: CheckEgressInput): Accepted {
  if (typeof input.workspace !== "string" || !input.workspace.trim()) return block(input, "registry_unverifiable", "workspace_scope_required");
  const call = { ...input, workspace: resolve(input.workspace) };
  return evaluate(call, context(call, false));
}
/** Preflight only. A 3xx response is returned without following, never reported as an undispatched residency denial. */
export async function residencyFetch(workspace: string | undefined, channel: EgressChannel, url: string, init: RequestInit = {}): Promise<Response> {
  if (workspace !== undefined && (typeof workspace !== "string" || !workspace.trim())) return block({ workspace, channel, url }, "registry_unverifiable", "workspace_scope_required");
  const scoped = workspace ?? getWorkspaceScope();
  const input: CheckEgressInput = { workspace: resolve(scoped ?? process.cwd()), channel, url };
  evaluate(input, context(input, scoped === undefined));
  return fetch(url, { ...init, redirect: init.redirect === "error" ? "error" : "manual", signal: init.signal ?? AbortSignal.timeout(30_000) });
}
/** Refuses regulated session admission unless the pinned profile's declared storage destination passes every applicable rule. */
export function assertStorageAdmission(workspace: string): Accepted {
  if (typeof workspace !== "string" || !workspace.trim()) return block({ workspace, channel: "storage", url: "" }, "registry_unverifiable", "workspace_scope_required");
  const input: CheckEgressInput = { workspace: resolve(workspace), channel: "storage", url: "" };
  const state = context(input, false);
  if (!state.registry) return Object.freeze({ verdict: "no_rule", destinationId: null });
  const storageUrl = state.facts?.storageUrl ?? state.registry.profile?.storageUrl;
  if (!storageUrl) return block(input, "registry_unverifiable", "storage_destination_missing", state.registry.rules);
  return evaluate({ ...input, url: storageUrl }, state);
}
