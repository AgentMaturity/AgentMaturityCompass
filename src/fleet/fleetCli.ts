/** What `amc fleet status --inventory|--freeze`, `amc fleet tag --owner`, `amc fleet trust-receipts` and `amc agent add --from-observed` print. */
import chalk from "chalk";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";
import { FREEZE_SCOPE_NOTE, TIME_OVERLAP_NOTE, addObservedAgent, describeTimeOverlap, fleetWindowMs, freezeAgentNow, setAgentOwner } from "./fleetActions.js";
import { buildFleetInventory } from "./inventory.js";
import { fleetInventoryCsv, renderFleetInventoryText } from "./inventoryRender.js";
import { listDelegationEdges, verifyCrossAgentReceipts } from "./trustComposition.js";

export interface FleetStatusOptions { json?: boolean; inventory?: boolean; csv?: boolean; window: string; freeze?: string; reason?: string }

/** Handles the inventory and freeze options of `amc fleet status`; false means the plain status runs. */
export async function fleetStatusExtras(workspace: string, opts: FleetStatusOptions): Promise<boolean> {
  if (opts.freeze !== undefined) {
    if (!opts.reason?.trim()) throw new Error('Say why you are freezing the agent: add --reason "<why>".');
    const incident = await freezeAgentNow({ workspace, agentId: opts.freeze, reason: opts.reason, via: "cli" });
    const lift = `amc freeze lift --agent ${incident.agentId} --incident ${incident.incidentId} --reason "<why it is safe again>"`;
    if (opts.json) {
      console.log(JSON.stringify({ frozen: true, agentId: incident.agentId, incidentId: incident.incidentId, actionClasses: incident.freeze.actionClasses,
        auditEventId: incident.auditEventId, scope: FREEZE_SCOPE_NOTE, lift }, null, 2));
      return true;
    }
    console.log(chalk.yellow(`Agent ${incident.agentId} is frozen. Every action above read-only that goes through AMC is refused until a person lifts the freeze.`));
    console.log(FREEZE_SCOPE_NOTE);
    console.log(`A signed audit row records who froze it and why (${incident.auditEventId}).`);
    console.log(`When the agent is cleared to act again, a person lifts it at a terminal:\n  ${lift}`);
    return true;
  }
  if (!opts.inventory && !opts.csv) return false;
  const inventory = await buildFleetInventory(workspace, { costWindowMs: fleetWindowMs(opts.window) });
  if (opts.csv) process.stdout.write(fleetInventoryCsv(inventory));
  else console.log(opts.json ? JSON.stringify(inventory, null, 2) : renderFleetInventoryText(inventory));
  return true;
}

/** `amc fleet tag --owner`: sets the owner when one is given. */
export function fleetTagOwner(workspace: string, agentId: string, opts: { env?: string; owner?: string }): void {
  if (opts.env === undefined && opts.owner === undefined) throw new Error('Give --env <dev|staging|production>, --owner "<name>", or both.');
  if (opts.owner === undefined) return;
  const owned = setAgentOwner(workspace, agentId, opts.owner);
  console.log(chalk.green(`Agent ${owned.agentId} is now owned by ${escapeTerminalControls(owned.owner)}`));
  console.log(`Config: ${owned.configPath}`);
  console.log(`Signature: ${owned.sigPath}`);
}

export function fleetTrustReceipts(workspace: string, window: string, now = Date.now()): void {
  const windowMs = fleetWindowMs(window);
  const edges = listDelegationEdges(workspace);
  if (edges.length === 0) {
    console.log("No delegations are declared, so there is nothing to compare. Declare one with: amc fleet trust-add-edge");
    return;
  }
  console.log(TIME_OVERLAP_NOTE);
  for (const chain of verifyCrossAgentReceipts(workspace, edges, now - windowMs, now)) {
    console.log(describeTimeOverlap(chain));
    for (const gap of chain.gaps.slice(0, 5)) console.log(`    ${chalk.dim(escapeTerminalControls(gap))}`);
  }
}

export async function agentAddFromObserved(workspace: string, agentId: string, owner?: string): Promise<void> {
  const added = await addObservedAgent(workspace, agentId, owner);
  console.log(chalk.green(`Agent added: ${added.agentId}`));
  console.log(`Config: ${added.configPath}`);
  console.log(added.owner ? `Owner: ${escapeTerminalControls(added.owner)}` : `No owner yet. Name one: amc fleet tag ${added.agentId} --owner "<name>"`);
  console.log("AMC filled in placeholders for its role, tasks and provider. Edit them when you know them.");
}
