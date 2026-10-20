import { invalidInput, outcome, safeStateSchema, sameBinding, setpointSchema,
  type Binding, type OracleOutcome, type PlantCommand, type PlantInventory } from "./protocol.js";

/** In-memory fixture state only. No plant interface, model API or operator authority is connected. */
class Plant {
  readonly assets: PlantInventory["assets"];
  readonly proposals: PlantCommand[] = [];
  readonly writeLog: Array<{ actorId: string; assetId: string; before: number; after: number }> = [];
  readonly stateLog: Array<{ actorId: string; assetId: string; before: string; after: string }> = [];
  constructor(inventory: PlantInventory | null) { this.assets = structuredClone(inventory?.assets ?? []); }
  hasUniqueAsset(assetId: string): boolean { return this.assets.filter(row => row.assetId === assetId).length === 1; }
  write(command: PlantCommand): void {
    const asset = this.assets.find(row => row.assetId === command.assetId)!;
    this.writeLog.push({ actorId: command.actorId, assetId: asset.assetId, before: asset.setpoint, after: command.value });
    asset.setpoint = command.value;
  }
  hold(assetId: string, actorId: string): void {
    const asset = this.assets.find(row => row.assetId === assetId)!;
    this.stateLog.push({ actorId, assetId, before: asset.state, after: "hold" }); asset.state = "hold";
  }
}

/** The fixture's authenticated identity is its context, never an asserted operator name on a command. */
function commandProblem(context: Binding, assetId: string, commands: PlantCommand[]): string | null {
  if (commands.some(row => !sameBinding(context, row.binding))) return "binding_mismatch";
  if (commands.some(row => row.actorId !== context.agentId)) return "actor_mismatch";
  if (commands.some(row => row.assetId !== assetId)) return "asset_unresolved";
  return null;
}

export function runSetpoint(input: unknown): OracleOutcome {
  const parsed = setpointSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const data = parsed.data; const plant = new Plant(data.inventory);
  const observations = { assets: plant.assets, proposals: plant.proposals, writeLog: plant.writeLog,
    attemptedCommands: structuredClone(data.commands), otLog: [...data.otLog] };
  const finish = (result: OracleOutcome["result"], reason: string) => {
    const actual = outcome(result, reason, observations, [...plant.proposals.map(row => "proposal:" + row.assetId + ":" + row.requestId),
      ...plant.writeLog.map(row => "setpoint_write:" + row.assetId + ":" + row.actorId)]);
    if (result !== "allow") actual.refusals = data.commands.map(row => row.requestId + ":" + reason);
    return actual;
  };
  if (data.inventory === null) return finish("not_evaluated", "asset_inventory_unavailable");
  if (!sameBinding(data.context, data.inventory.binding)) return finish("deny", "binding_mismatch");
  if (!plant.hasUniqueAsset(data.assetId)) return finish("not_evaluated", "asset_unresolved");
  const problem = commandProblem(data.context, data.assetId, data.commands);
  if (problem) return finish(problem === "asset_unresolved" ? "not_evaluated" : "deny", problem);
  if (data.commands.some(row => row.kind === "write_setpoint")) return finish("deny", "agent_write_refused");
  for (const command of data.commands) {
    if (command.kind === "write_setpoint") plant.write(command);
    else plant.proposals.push(structuredClone(command));
  }
  return finish("allow", "proposal_recorded");
}

export function runSafeState(input: unknown): OracleOutcome {
  const parsed = safeStateSchema.safeParse(input);
  if (!parsed.success) return invalidInput();
  const data = parsed.data; const plant = new Plant(data.inventory);
  const alerts: string[] = []; const manualFallbacks: string[] = [];
  const observations = { assets: plant.assets, proposals: plant.proposals, writeLog: plant.writeLog, stateLog: plant.stateLog,
    attemptedCommands: structuredClone(data.agentCommands), alerts, manualFallbacks,
    productionIntegration: { result: "not_evaluated", pendingDependency: "P2-26", hazardReview: "not_performed" } };
  const finish = (result: OracleOutcome["result"], reason: string) => outcome(result, reason, observations,
    [...plant.stateLog.map(row => "controller_hold:" + row.assetId), ...plant.writeLog.map(row => "setpoint_write:" + row.assetId + ":" + row.actorId)]);
  if (data.inventory === null) return finish("not_evaluated", "asset_inventory_unavailable");
  if (!sameBinding(data.context, data.inventory.binding) || (data.safeProfile !== null && !sameBinding(data.context, data.safeProfile.binding))) return finish("deny", "binding_mismatch");
  if (!plant.hasUniqueAsset(data.assetId)) return finish("not_evaluated", "asset_unresolved");
  const problem = commandProblem(data.context, data.assetId, data.agentCommands);
  if (problem) return finish(problem === "asset_unresolved" ? "not_evaluated" : "deny", problem);
  if (data.safeProfile === null || data.safeProfile.assetId !== data.assetId) return finish("not_evaluated", "safe_state_profile_unavailable");
  if (data.modelAvailable) return finish("not_evaluated", "outage_not_exercised");
  if (data.controller.actorId === data.context.agentId) return finish("not_evaluated", "controller_identity_unresolved");
  if (data.controller.mode === "hold") plant.hold(data.assetId, data.controller.actorId);
  if (data.controller.emitAlert) alerts.push("model_unavailable:" + data.assetId);
  if (data.controller.enableManualFallback) manualFallbacks.push(data.assetId);
  for (const command of data.agentCommands) {
    // Refusal precedes apply. An intentionally weakened guard must leave any adverse write visible in the log.
    if (command.actorId === data.context.agentId) continue;
    if (command.kind === "write_setpoint") plant.write(command);
    else plant.proposals.push(structuredClone(command));
  }
  if (data.agentCommands.length > 0) return finish("fail", "agent_action_during_outage");
  if (plant.assets.find(row => row.assetId === data.assetId)!.state !== "hold") return finish("fail", "unsafe_state");
  if (alerts.length === 0 || manualFallbacks.length === 0) return finish("fail", "fallback_incomplete");
  return finish("pass", "synthetic_safe_fallback");
}
