/**
 * Fleet actions a person takes on purpose: freeze an agent now, name an agent's owner, register an agent AMC has only
 * observed, and the wording and window parser of `amc fleet trust-receipts`.
 */
import { userInfo } from "node:os";
import { createFreezeIncidentForAuthority, type FreezeIncident } from "../drift/freezeEngine.js";
import { assertOwnerMode, getMode } from "../mode/mode.js";
import { appendOpsAuditEvent } from "../ops/audit.js";
import { getProviderTemplateById } from "../providers/providerTemplates.js";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";
import type { ActionClass } from "../types.js";
import { agentConfigSchema, buildAgentConfig, listAgents, loadAgentConfig, saveAgentConfig, scaffoldAgent } from "./registry.js";

/** Shown wherever a freeze is offered or reported: what a freeze does and what it cannot do. */
export const FREEZE_SCOPE_NOTE =
  "A freeze stops only calls that are routed through AMC. An agent that calls a model or a tool directly, without AMC in the path, is not stopped. Read-only actions stay allowed.";
export const FLEET_AGENT_FROZEN = "FLEET_AGENT_FROZEN";
/** Every action class above READ_ONLY: what "freeze now" holds. */
const MANUAL_FREEZE_CLASSES: readonly ActionClass[] = ["WRITE_LOW", "WRITE_HIGH", "DEPLOY", "SECURITY", "FINANCIAL", "NETWORK_EXTERNAL", "DATA_EXPORT", "IDENTITY"];
const MANUAL_FREEZE_RULE_ID = "manual-freeze";
const REASON_MAX = 500;
const OWNER_MAX = 200;
/** What an agent id may be before AMC uses it in a file path: no separators, no dots, no spaces. */
const AGENT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const oneLine = (value: string, max: number): string => {
  const text = escapeTerminalControls(value).replace(/[\n\t]/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

/** `30s`, `45m`, `12h` and `30d` are seconds, minutes, hours and days. Anything else is refused. */
export function fleetWindowMs(raw: string): number {
  const match = /^(\d{1,6})([smhd])$/.exec(raw.trim());
  if (!match || Number(match[1]) <= 0) {
    throw new Error(`"${oneLine(raw, 40)}" is not a time window AMC understands. Write a whole number and a unit: 30s, 45m, 12h or 30d.`);
  }
  return Number(match[1]) * { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "s" | "m" | "h" | "d"];
}

/** The workspace's own agent, "default", lives at the top of .amc and always exists; named agents are folders under .amc/agents. */
function isKnownAgent(workspace: string, agentId: string): boolean {
  return agentId === "default" || listAgents(workspace).some((entry) => entry.id === agentId);
}

function checkedOwner(owner: string): string {
  const name = owner.trim();
  if (name === "" || name.length > OWNER_MAX || /[\u0000-\u001f\u007f-\u009f]/.test(name)) {
    throw new Error(`Give the owner as a name or team of up to ${OWNER_MAX} characters on one line, for example --owner "Priya Shah".`);
  }
  return name;
}

/** Sets the named owner of a registered agent. The agent's config is signed again. */
export function setAgentOwner(workspace: string, agentId: string, owner: string): { agentId: string; owner: string; configPath: string; sigPath: string } {
  assertOwnerMode(workspace, "agent add");
  const name = checkedOwner(owner);
  const existing = loadAgentConfig(workspace, agentId);
  const next = agentConfigSchema.parse({ ...existing, owner: name, updatedTs: Date.now() });
  return { agentId: existing.id, owner: name, ...saveAgentConfig(workspace, next) };
}

/**
 * Registers an agent AMC has already seen (in its records or a hook install) when a person asks for it by name. The
 * observed name is outside text: it must be a plain agent id before it is used in a file path.
 */
export async function addObservedAgent(workspace: string, agentId: string, owner?: string): Promise<{ agentId: string; configPath: string; owner: string | null }> {
  assertOwnerMode(workspace, "agent add");
  const wanted = agentId.trim();
  if (!AGENT_ID.test(wanted)) {
    throw new Error(`"${oneLine(wanted, 80)}" cannot be used as an agent id: use 1 to 64 lower-case letters, digits, "-" and "_", with no "/", "\\" or ".". `
      + "To add it under another id, run: amc agent add");
  }
  const name = owner === undefined ? null : checkedOwner(owner);
  if (isKnownAgent(workspace, wanted)) throw new Error(`Agent ${wanted} is already registered.`);
  const { buildFleetInventory } = await import("./inventory.js");
  const inventory = await buildFleetInventory(workspace);
  if (!inventory.unregistered.some((row) => row.agentId === wanted)) {
    throw new Error(`AMC has not seen an agent called ${wanted}, so there is nothing to add from its records. `
      + "See what AMC has seen with: amc fleet status --inventory. To add a new agent, run: amc agent add");
  }
  const template = getProviderTemplateById("custom");
  const base = buildAgentConfig({
    agentId: wanted, agentName: wanted, role: "assistant", domain: "general", primaryTasks: ["not described yet"],
    stakeholders: [name ?? "not named yet"], riskTier: "med", templateId: template.id,
    baseUrl: template.defaultBaseUrl || "https://example.com", routePrefix: template.routePrefix, auth: { type: "none" }
  });
  const created = scaffoldAgent(workspace, name === null ? base : agentConfigSchema.parse({ ...base, owner: name }));
  return { agentId: created.agentId, configPath: created.configPath, owner: name };
}

function terminalUser(): string {
  try { return `${userInfo().username} (at a terminal)`; } catch { return "an operator at a terminal"; }
}

/**
 * Freeze now: a signed freeze incident through the freeze engine, exactly as a drift freeze, holding every action class
 * above read-only until `amc freeze lift`, then a signed audit row naming who froze which agent and why. `frozenBy` is
 * the authenticated principal on the API; `guard` only adds a refusal (the API's authority recheck).
 */
export async function freezeAgentNow(
  input: { workspace: string; agentId: string; reason: string; frozenBy?: string; via?: "cli" | "studio" },
  guard: () => void = () => {}
): Promise<FreezeIncident & { auditEventId: string }> {
  const reason = oneLine(input.reason, REASON_MAX);
  const agentId = input.agentId.trim();
  // Lifting a freeze is owner-only, so placing one is too: an agent must not be able to halt the fleet.
  if (getMode(input.workspace) === "agent") throw new Error("Freezing an agent is blocked in agent mode. Switch to owner mode with: amc mode owner");
  if (reason === "") throw new Error("Say why you are freezing the agent, for example --reason \"Unexpected refunds\".");
  if (!AGENT_ID.test(agentId) || !isKnownAgent(input.workspace, agentId)) {
    throw new Error(`Agent ${oneLine(agentId, 80)} is not registered, so AMC has nothing to freeze. See the agents AMC knows with: amc fleet status --inventory`);
  }
  const frozenBy = input.frozenBy?.trim() ? oneLine(input.frozenBy, 200) : terminalUser();
  const incident = await createFreezeIncidentForAuthority({
    workspace: input.workspace, agentId, ruleId: MANUAL_FREEZE_RULE_ID,
    previousRunId: "none (frozen by a person)", currentRunId: "none (frozen by a person)",
    deltas: { overallDrop: 0, integrityDrop: 0, correlationDrop: 0, maxLayerDrop: 0 },
    actionClasses: [...MANUAL_FREEZE_CLASSES], reason: `Frozen by ${frozenBy}: ${reason}`,
    remediation: { concept: [], culture: [], capabilities: [], configuration: ["A person froze this agent by hand. Lift the freeze when the agent is cleared to act again."] }
  }, guard);
  try {
    const audit = appendOpsAuditEvent({ workspace: input.workspace, auditType: FLEET_AGENT_FROZEN, agentId, severity: "HIGH",
      payload: { incidentId: incident.incidentId, frozenBy, via: input.via ?? "cli", reason, actionClasses: incident.freeze.actionClasses } });
    return { ...incident, auditEventId: audit.eventId };
  } catch (error) {
    throw new Error(`Agent ${agentId} is frozen (incident ${incident.incidentId}), but AMC could not write the audit row that names who froze it: `
      + `${error instanceof Error ? error.message : String(error)}. The freeze stays in place.`);
  }
}

export const TIME_OVERLAP_NOTE =
  "Time-window overlap (a heuristic). For each declared delegation this counts how many of the first agent's recorded calls had any activity from the second agent within 60 seconds. "
  + "It compares times only: it checks no signatures and does not show that one call led to the other.";

/** One line per delegation for `amc fleet trust-receipts`: a count, never a verdict. */
export function describeTimeOverlap(chain: { fromAgentId: string; toAgentId: string; fromReceiptCount: number; matchedReceipts: number }): string {
  const from = oneLine(chain.fromAgentId, 128), to = oneLine(chain.toAgentId, 128);
  if (chain.fromReceiptCount === 0) return `${from} -> ${to}: no calls from ${from} in this window, so there is nothing to compare`;
  const share = ((chain.matchedReceipts / chain.fromReceiptCount) * 100).toFixed(1);
  return `${from} -> ${to}: ${chain.matchedReceipts} of ${chain.fromReceiptCount} calls had activity from ${to} within 60 seconds (${share}% time-window overlap)`;
}
