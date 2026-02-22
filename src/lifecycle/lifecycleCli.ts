import {
  advanceLifecycleStage,
  lifecycleResponsibilityMatrix,
  lifecycleStatus,
  parseLifecycleRole,
  parseLifecycleStage,
  type AdvanceLifecycleResult
} from "./lifecycle.js";

export interface LifecycleStatusCliInput {
  workspace: string;
  agentId?: string;
}

export interface LifecycleAdvanceCliInput {
  workspace: string;
  agentId?: string;
  to: string;
  actor?: string;
  actorRole?: string;
  controls?: string[];
  note?: string;
}

export function parseControlsCsv(value?: string): string[] {
  if (!value || value.trim().length === 0) {
    return [];
  }
  return value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

export function lifecycleStatusCli(params: LifecycleStatusCliInput) {
  return lifecycleStatus(params.workspace, params.agentId);
}

export function lifecycleAdvanceCli(params: LifecycleAdvanceCliInput): AdvanceLifecycleResult {
  const toStage = parseLifecycleStage(params.to);
  const resolvedActorRole =
    params.actorRole && params.actorRole.trim().length > 0
      ? parseLifecycleRole(params.actorRole)
      : lifecycleResponsibilityMatrix[toStage].accountable;

  return advanceLifecycleStage({
    workspace: params.workspace,
    agentId: params.agentId,
    toStage,
    actor: params.actor?.trim() || "owner-cli",
    actorRole: resolvedActorRole,
    controlsSatisfied: params.controls ?? [],
    note: params.note
  });
}
