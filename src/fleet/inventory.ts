/**
 * Fleet inventory: one row per agent with the facts an operator asks for first: who owns it, what it runs on, when
 * AMC last saw it, whether hooks are in place, its daily budget, whether it is frozen and what it cost. Everything is
 * read from records AMC already keeps (agent configs, hook installs and session registrations, the ledger, the budgets
 * file, freeze incidents); nothing is written. Agents AMC has seen in the ledger or in a hook install but that nobody
 * registered are listed apart: an observed name is outside text and never becomes a registered agent on its own.
 */
import { activeFreezeStatus } from "../drift/freezeEngine.js";
import { qualifiedReleases, UNQUALIFIED_RELEASE_MARK } from "../adapters/hookProviders/releaseQualification.js";
import { budgetForAgent, loadBudgetsConfig } from "../budgets/budgets.js";
import { readBudgetEvents } from "../budgets/nativeBudgetUsage.js";
import { openLedger } from "../ledger/ledger.js";
import { foldUsageReport } from "../observability/usageReport.js";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";
import type { EvidenceEvent } from "../types.js";
import { FREEZE_SCOPE_NOTE } from "./fleetActions.js";
import { pathExists } from "../utils/fs.js";
import { getAgentPaths } from "./paths.js";
import { listAgents, loadAgentConfig, type AgentConfig } from "./registry.js";

const HOOK_PROVIDERS = ["claude-code", "codex", "gemini-cli", "pi", "dsh"] as const;
/** Registration fields that carry the version a runtime reported when its session registered with AMC. */
const VERSION_KEYS: Readonly<Record<string, string>> = { claudeCodeVersion: "claude-code", piVersion: "pi", dshVersion: "dsh" };
/** Ledger agent ids that name AMC itself or the whole workspace, not an agent. */
const NOT_AGENTS = new Set(["system", "workspace", "unknown", "any"]);
/** An observed id longer than this is shown cut short; it is outside text. */
const OBSERVED_ID_MAX = 128;
const COST_NOTE = "Cost is an estimate from the token counts AMC recorded and the model price list (or the cost the provider reported). "
  + "Calls to a model with no price are not known, never counted as zero. Only calls that went through AMC are counted.";

interface FleetInventoryRuntime { runtime: string; version: string | null; qualified: boolean | null }
interface FleetInventoryHook { provider: string; mode: string | null; state: string; controlVerified: boolean; releaseWarning: string | null }
export interface FleetInventoryCost {
  /** Estimated dollars for the priced calls; null when no call in the window could be priced. */
  estimatedUsd: number | null;
  calls: number;
  /** Calls whose cost is not known (no price for the model, or no usage reported). */
  unknownCalls: number;
}
export interface FleetInventoryRow {
  agentId: string;
  agentName: string | null;
  registered: boolean;
  owner: string | null;
  environment: string | null;
  riskTier: string | null;
  runtimes: FleetInventoryRuntime[];
  hooks: FleetInventoryHook[];
  lastSeenTs: number | null;
  /** null when no daily budget applies. `inherited` means it comes from the shared "default" entry. */
  budget: { maxCostUsdPerDay: number | null; maxLlmTokensPerDay: number; inherited: boolean } | null;
  /** null for agents that are not registered (AMC keeps freeze records only for registered agents) or when unreadable. */
  freeze: { active: boolean; incidentIds: string[] } | null;
  /** null when AMC's records could not be read. */
  cost: FleetInventoryCost | null;
  /** The fleet minimum this agent does not meet yet: an owner, a budget, verified control, a qualified runtime. */
  missing: string[];
}
export interface FleetInventory {
  generatedTs: number;
  costWindow: { since: number; until: number };
  summary: { registered: number; withoutOwner: number; unregistered: number; frozen: number; belowMinimum: number };
  agents: FleetInventoryRow[];
  /** Seen in the ledger or in a hook install, but not registered. */
  unregistered: FleetInventoryRow[];
  /** `cost` is null when any of the owner's agents has a cost AMC could not read: the total is then not known. */
  costByOwner: Array<{ owner: string | null; agents: number; cost: FleetInventoryCost | null }>;
  /** false when AMC's records could not be read: "last seen" is then not known rather than "never". */
  lastSeenKnown: boolean;
  costNote: string;
  /** Why cost could not be read, when it could not. */
  costProblem: string | null;
  freezeScope: string;
}

type RegisteredFacts = Pick<AgentConfig, "id"> & Partial<Pick<AgentConfig, "agentName" | "owner" | "environment" | "riskTier">>;
export interface InventoryFacts {
  now: number;
  costWindow: { since: number; until: number };
  registered: RegisteredFacts[];
  /** null when AMC's records could not be read. */
  events: ReadonlyArray<Pick<EvidenceEvent, "ts" | "runtime" | "meta_json">> | null;
  hooks: ReadonlyArray<FleetInventoryHook & { agentId: string | null }>;
  budgetFor: (agentId: string) => FleetInventoryRow["budget"];
  freezeFor: (agentId: string) => FleetInventoryRow["freeze"];
  /** null when cost could not be read at all. */
  costs: Map<string, FleetInventoryCost> | null;
  costProblem?: string | null;
}

/** Outside text on one line for a terminal or a spreadsheet: controls and bidi marks shown, never run; capped. */
export const oneLine = (value: string): string => escapeTerminalControls(value).replace(/[\n\t]/g, " ");
export function plainId(value: string): string {
  const text = oneLine(value);
  return text.length > OBSERVED_ID_MAX ? `${text.slice(0, OBSERVED_ID_MAX)}...` : text;
}

const releaseQualified = (runtime: string, version: string): boolean | null =>
  runtime === "claude-code" || runtime === "pi" ? qualifiedReleases(runtime).includes(version) : null;

type Seen = { lastSeenTs: number; runtimes: Set<string>; versions: Map<string, { version: string; ts: number }> };
function observed(events: NonNullable<InventoryFacts["events"]>): Map<string, Seen> {
  const seen = new Map<string, Seen>();
  for (const event of events) {
    let meta: Record<string, unknown>;
    try { meta = JSON.parse(event.meta_json) as Record<string, unknown>; } catch { continue; }
    if (meta === null || typeof meta !== "object" || typeof meta.agentId !== "string" || meta.agentId.trim() === "" || NOT_AGENTS.has(meta.agentId)) continue;
    // AMC's own actions about an agent (a freeze, a kill switch) are not the agent being seen.
    // ponytail: a short deny list; tag operator rows with a common source if more kinds appear.
    if (meta.source === "ops" || String(meta.auditType ?? "").startsWith("KILL_SWITCH")) continue;
    const row = seen.get(meta.agentId) ?? { lastSeenTs: 0, runtimes: new Set<string>(), versions: new Map() };
    row.lastSeenTs = Math.max(row.lastSeenTs, event.ts);
    if (event.runtime !== "unknown" && event.runtime !== "any") row.runtimes.add(event.runtime);
    const registration = meta.registration !== null && typeof meta.registration === "object" ? meta.registration as Record<string, unknown> : {};
    for (const [key, runtime] of Object.entries(VERSION_KEYS)) {
      const version = registration[key];
      if (typeof version === "string" && version !== "" && (row.versions.get(runtime)?.ts ?? -1) <= event.ts) row.versions.set(runtime, { version, ts: event.ts });
    }
    seen.set(meta.agentId, row);
  }
  return seen;
}

function missingFor(row: Omit<FleetInventoryRow, "missing">): string[] {
  if (!row.registered) return [];
  return [
    row.owner === null ? "an owner" : null,
    row.budget === null ? "a budget" : null,
    row.hooks.some((hook) => hook.controlVerified) ? null : "verified control",
    row.runtimes.some((entry) => entry.qualified === false) || row.hooks.some((hook) => hook.releaseWarning !== null) ? "a qualified runtime release" : null
  ].filter((item): item is string => item !== null);
}

/** Pure assembly of the inventory from facts already read; the caller decides where the facts come from. */
export function assembleFleetInventory(facts: InventoryFacts): FleetInventory {
  const seen = observed(facts.events ?? []);
  const registeredIds = new Set(facts.registered.map((agent) => agent.id));
  const row = (agentId: string, config: RegisteredFacts | null): FleetInventoryRow => {
    const found = seen.get(agentId);
    const hooks = facts.hooks.filter((hook) => hook.agentId === agentId).map(({ agentId: _id, ...hook }) => hook);
    const runtimes: FleetInventoryRuntime[] = [];
    const add = (runtime: string, version: string | null): void => {
      if (runtimes.some((entry) => entry.runtime === runtime)) return;
      runtimes.push({ runtime, version, qualified: version === null ? null : releaseQualified(runtime, version) });
    };
    for (const hook of hooks) add(hook.provider, found?.versions.get(hook.provider)?.version ?? null);
    for (const [runtime, value] of found?.versions ?? []) add(runtime, value.version);
    for (const runtime of found?.runtimes ?? []) add(runtime, null);
    const base = {
      agentId, agentName: config?.agentName ?? null, registered: config !== null,
      owner: config?.owner?.trim() ? config.owner.trim() : null,
      environment: config?.environment ?? null, riskTier: config?.riskTier ?? null, runtimes, hooks,
      lastSeenTs: found ? found.lastSeenTs : null,
      budget: config ? facts.budgetFor(agentId) : null,
      freeze: config ? facts.freezeFor(agentId) : null,
      cost: facts.costs === null ? null : facts.costs.get(agentId) ?? { estimatedUsd: null, calls: 0, unknownCalls: 0 }
    };
    return { ...base, missing: missingFor(base) };
  };
  const agents = facts.registered.map((config) => row(config.id, config));
  const unregisteredIds = new Set<string>([...seen.keys()].filter((id) => !registeredIds.has(id)));
  for (const hook of facts.hooks) if (hook.agentId && !registeredIds.has(hook.agentId)) unregisteredIds.add(hook.agentId);
  const unregistered = [...unregisteredIds].sort((a, b) => a.localeCompare(b)).map((id) => row(id, null));
  const byOwner = new Map<string | null, FleetInventory["costByOwner"][number]>();
  for (const agent of agents) {
    const previous = byOwner.get(agent.owner) ?? { owner: agent.owner, agents: 0, cost: { estimatedUsd: null, calls: 0, unknownCalls: 0 } };
    const sum = previous.cost, add = agent.cost;
    byOwner.set(agent.owner, { owner: agent.owner, agents: previous.agents + 1, cost: sum === null || add === null ? null : {
      calls: sum.calls + add.calls, unknownCalls: sum.unknownCalls + add.unknownCalls,
      estimatedUsd: add.estimatedUsd === null ? sum.estimatedUsd : (sum.estimatedUsd ?? 0) + add.estimatedUsd } });
  }
  return {
    generatedTs: facts.now, costWindow: facts.costWindow,
    summary: { registered: agents.length, withoutOwner: agents.filter((agent) => agent.owner === null).length, unregistered: unregistered.length,
      frozen: agents.filter((agent) => agent.freeze?.active === true).length, belowMinimum: agents.filter((agent) => agent.missing.length > 0).length },
    agents, unregistered, lastSeenKnown: facts.events !== null,
    costByOwner: [...byOwner.values()].sort((a, b) => (a.owner === null ? 1 : b.owner === null ? -1 : a.owner.localeCompare(b.owner))),
    costNote: COST_NOTE, costProblem: facts.costProblem ?? null, freezeScope: FREEZE_SCOPE_NOTE
  };
}

/** Per-agent cost from verified native rows: the same fold `amc usage --by agent` uses. */
function costsByAgent(rows: EvidenceEvent[], since: number, until: number): Map<string, FleetInventoryCost> {
  const report = foldUsageReport(rows, { since, until, by: "agent" }, "signed-rows (unanchored)");
  return new Map(report.buckets.map((bucket) => [bucket.key, {
    estimatedUsd: bucket.cost.attributedSubtotalUsd, calls: bucket.requests, unknownCalls: bucket.cost.unknownRequests + bucket.cost.partialRequests
  }]));
}

/** Reads the facts from the workspace and assembles the inventory. Reads only; nothing is written. */
export async function buildFleetInventory(workspace: string, options: { now?: number; costWindowMs?: number } = {}): Promise<FleetInventory> {
  const now = options.now ?? Date.now();
  const costWindow = { since: now - (options.costWindowMs ?? 30 * 86_400_000), until: now };
  const load = (id: string): RegisteredFacts => { try { return loadAgentConfig(workspace, id); } catch { return { id }; } };
  const registered: RegisteredFacts[] = listAgents(workspace).map((entry) => load(entry.id));
  // The workspace's own agent ("default", at the top of .amc) is listed when it has a config; when it only shows up in
  // AMC's records it is added below, never offered as an unregistered agent.
  if (!registered.some((agent) => agent.id === "default") && pathExists(getAgentPaths(workspace, "default").agentConfig)) registered.unshift(load("default"));
  // ponytail: two full ledger reads (last seen here, verified spend in readBudgetEvents). Add a per-agent SQL
  // aggregate when a ledger grows big enough for this page to feel slow.
  let events: EvidenceEvent[] | null = null;
  let costs: Map<string, FleetInventoryCost> | null = null;
  let costProblem: string | null = null;
  try {
    const ledger = openLedger(workspace, { readonly: true });
    try {
      events = ledger.getAllEvents();
      try { costs = costsByAgent(readBudgetEvents(workspace, ledger), costWindow.since, costWindow.until); } catch (error) {
        costProblem = `Cost is not known: AMC's records of model calls did not check out (${error instanceof Error ? error.message : String(error)}).`;
      }
    } finally { ledger.close(); }
  } catch (error) {
    costs = null;
    costProblem = `Cost and last seen are not known: AMC could not read its records (${error instanceof Error ? error.message : String(error)}).`;
  }
  const hooks: Array<FleetInventoryHook & { agentId: string | null }> = [];
  const { getHookIntegrationStatus } = await import("../adapters/hookIntegration.js");
  for (const provider of HOOK_PROVIDERS) {
    try {
      const status = getHookIntegrationStatus({ workspace, provider, readonly: true });
      if (status.state === "not-installed") continue;
      const claim = status.governance?.claim ?? null;
      hooks.push({ agentId: status.agentId, provider, mode: status.mode, state: status.state,
        controlVerified: status.state === "installed" && (claim === "enforced_at_claude_code_pretooluse" || claim === "enforced_at_pi_tool_call"),
        releaseWarning: status.issues.find((issue) => issue.includes(UNQUALIFIED_RELEASE_MARK)) ?? null });
    } catch { /* an unreadable hook install is reported by `amc connect hooks status`; the inventory leaves it out */ }
  }
  let budgets: ReturnType<typeof loadBudgetsConfig> | null = null;
  try { budgets = loadBudgetsConfig(workspace); } catch { budgets = null; }
  if (!registered.some((agent) => agent.id === "default")
    && (hooks.some((hook) => hook.agentId === "default") || (events ?? []).some((event) => event.meta_json.includes('"agentId":"default"')))) registered.unshift({ id: "default" });
  return assembleFleetInventory({
    now, costWindow, registered, events, hooks, costs, costProblem,
    budgetFor: (agentId) => {
      const budget = budgets ? budgetForAgent(budgets, agentId) : null;
      return budget && budgets ? { maxCostUsdPerDay: budget.daily.maxCostUsd ?? null, maxLlmTokensPerDay: budget.daily.maxLlmTokens,
        inherited: !Object.hasOwn(budgets.budgets.perAgent, agentId) } : null;
    },
    freezeFor: (agentId) => {
      try {
        const status = activeFreezeStatus(workspace, agentId);
        return { active: status.active, incidentIds: status.incidentIds };
      } catch { return null; }
    }
  });
}
