/** The fleet inventory as terminal text and as CSV. Every id, name and owner is outside text: escaped before it is shown. */
import { oneLine, plainId, type FleetInventory, type FleetInventoryCost, type FleetInventoryRow } from "./inventory.js";

const when = (ts: number | null): string => ts === null ? "never" : `${new Date(ts).toISOString().replace("T", " ").slice(0, 16)} UTC`;
const usd = (value: number): string => `$${value.toFixed(2)}`;
const days = (inventory: FleetInventory): string => {
  const span = Math.round((inventory.costWindow.until - inventory.costWindow.since) / 3_600_000);
  return span % 24 === 0 ? `${span / 24} day${span === 24 ? "" : "s"}` : `${span} hour${span === 1 ? "" : "s"}`;
};

/** "about $1.20 (estimate)", with the calls whose cost is not known named; "not known" when nothing could be priced. */
export function costWords(cost: Pick<FleetInventoryCost, "estimatedUsd" | "calls" | "unknownCalls"> | null): string {
  if (cost === null) return "not known";
  if (cost.calls === 0) return "no calls recorded";
  if (cost.estimatedUsd === null) return `not known (${cost.calls} call${cost.calls === 1 ? "" : "s"} with no price)`;
  const unknown = cost.unknownCalls > 0 ? `, plus ${cost.unknownCalls} call${cost.unknownCalls === 1 ? "" : "s"} not known` : "";
  return `about ${usd(cost.estimatedUsd)} (estimate${unknown})`;
}
const runtimeWords = (row: FleetInventoryRow): string => row.runtimes.length === 0 ? "not known"
  : row.runtimes.map((entry) => `${plainId(entry.runtime)}${entry.version ? ` ${plainId(entry.version)}` : ""}${entry.qualified === false ? " (not a release AMC has qualified)" : ""}`).join("; ");
const hookWords = (row: FleetInventoryRow): string => row.hooks.length === 0 ? "none"
  : row.hooks.map((hook) => `${hook.provider}: ${hook.state}${hook.mode ? `, ${hook.mode} mode` : ""}${hook.controlVerified ? ", control verified" : ""}`).join("; ");
const budgetWords = (row: FleetInventoryRow): string => row.budget === null ? "none"
  : `${row.budget.maxCostUsdPerDay === null ? "no dollar limit" : `${usd(row.budget.maxCostUsdPerDay)} a day`}, ${row.budget.maxLlmTokensPerDay.toLocaleString("en-US")} tokens a day${row.budget.inherited ? " (shared default)" : ""}`;
const freezeWords = (row: FleetInventoryRow): string => row.freeze === null ? "not known" : row.freeze.active ? "frozen" : "no";

const CSV_COLUMNS: ReadonlyArray<readonly [string, (row: FleetInventoryRow) => string]> = [
  ["agent_id", (row) => row.agentId], ["name", (row) => row.agentName ?? ""], ["registered", (row) => row.registered ? "yes" : "no"],
  ["owner", (row) => row.owner ?? ""], ["environment", (row) => row.environment ?? ""], ["risk_tier", (row) => row.riskTier ?? ""],
  ["runtime_and_version", (row) => row.runtimes.length === 0 ? "" : runtimeWords(row)],
  ["last_seen_utc", (row) => row.lastSeenTs === null ? "" : new Date(row.lastSeenTs).toISOString()],
  ["hooks", (row) => row.hooks.length === 0 ? "" : hookWords(row)],
  ["budget_usd_per_day", (row) => row.budget?.maxCostUsdPerDay == null ? "" : String(row.budget.maxCostUsdPerDay)],
  ["budget_tokens_per_day", (row) => row.budget === null ? "" : String(row.budget.maxLlmTokensPerDay)],
  ["frozen", (row) => row.freeze === null ? "" : row.freeze.active ? "yes" : "no"],
  ["estimated_cost_usd", (row) => row.cost?.calls === 0 ? "no calls" : row.cost?.estimatedUsd == null ? "not known" : row.cost.estimatedUsd.toFixed(4)],
  ["calls", (row) => row.cost === null ? "" : String(row.cost.calls)],
  ["calls_cost_not_known", (row) => row.cost === null ? "" : String(row.cost.unknownCalls)],
  ["missing_from_fleet_minimum", (row) => row.missing.join("; ")]
];

/** A cell a spreadsheet would run as a formula gets a leading apostrophe; quotes, commas and line breaks are quoted. */
export function csvCell(value: string): string {
  const safe = /^\s*[=+\-@]|^[\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function fleetInventoryCsv(inventory: FleetInventory): string {
  const rows = [...inventory.agents, ...inventory.unregistered];
  return [CSV_COLUMNS.map(([name]) => name).join(","), ...rows.map((row) => CSV_COLUMNS.map(([, read]) => csvCell(oneLine(read(row)))).join(","))].join("\r\n") + "\r\n";
}

function agentLines(row: FleetInventoryRow): string[] {
  const id = plainId(row.agentId);
  return [
    `${id}${row.agentName && row.agentName !== row.agentId ? ` (${plainId(row.agentName)})` : ""}`,
    `  Owner:       ${row.owner ? plainId(row.owner) : `none. Name one: amc fleet tag ${id} --owner "<name>"`}`,
    `  Runs on:     ${runtimeWords(row)}`,
    `  Last seen:   ${when(row.lastSeenTs)}`,
    `  Hooks:       ${hookWords(row)}`,
    `  Budget:      ${budgetWords(row)}`,
    `  Frozen:      ${freezeWords(row)}`,
    `  Cost:        ${costWords(row.cost)}`,
    ...(row.missing.length > 0 ? [`  Still needs: ${row.missing.join(", ")}`] : [])
  ];
}

export function renderFleetInventoryText(inventory: FleetInventory): string {
  const { summary } = inventory;
  const lines = [
    `Fleet inventory: ${summary.registered} registered agent${summary.registered === 1 ? "" : "s"}, ${summary.withoutOwner} without an owner, ${summary.frozen} frozen, ${summary.unregistered} seen but not registered.`,
    `Cost covers the last ${days(inventory)}.`, ""
  ];
  for (const row of inventory.agents) lines.push(...agentLines(row));
  if (inventory.agents.length === 0) lines.push("No registered agents yet. Add one: amc agent add");
  if (inventory.unregistered.length > 0) {
    lines.push("", "Seen by AMC but not registered (names as AMC recorded them):");
    for (const row of inventory.unregistered) lines.push(`  ${plainId(row.agentId)}  last seen ${when(row.lastSeenTs)}  runs on ${runtimeWords(row)}`);
    lines.push(`  To add one on purpose: amc agent add --from-observed <id> --owner "<name>"`);
  }
  if (inventory.agents.length > 0) {
    lines.push("", "Cost by owner:");
    for (const total of inventory.costByOwner) lines.push(`  ${total.owner ? plainId(total.owner) : "(no owner)"}: ${costWords(total)} across ${total.agents} agent${total.agents === 1 ? "" : "s"}`);
  }
  lines.push("", inventory.costNote);
  if (inventory.costProblem) lines.push(plainId(inventory.costProblem));
  if (summary.belowMinimum > 0) lines.push(`${summary.belowMinimum} agent${summary.belowMinimum === 1 ? " does" : "s do"} not meet the fleet minimum yet (an owner, a budget, verified control, a qualified runtime release).`);
  return lines.join("\n");
}
