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

/**
 * P2-23: the stage trail is the caller's word (controls, actor and note are typed in, the file is unsigned), so every
 * result says self_reported. Governed state is `amc lifecycle transition` (src/lifecycle/governanceLifecycle.ts).
 */
const SELF_REPORTED = { claimKind: "self_reported" } as const;

export function lifecycleStatusCli(params: LifecycleStatusCliInput) {
  return { ...lifecycleStatus(params.workspace, params.agentId), ...SELF_REPORTED };
}

export function lifecycleAdvanceCli(params: LifecycleAdvanceCliInput): AdvanceLifecycleResult & typeof SELF_REPORTED {
  const toStage = parseLifecycleStage(params.to);
  const resolvedActorRole =
    params.actorRole && params.actorRole.trim().length > 0
      ? parseLifecycleRole(params.actorRole)
      : lifecycleResponsibilityMatrix[toStage].accountable;

  return { ...advanceLifecycleStage({
    workspace: params.workspace,
    agentId: params.agentId,
    toStage,
    actor: params.actor?.trim() || "owner-cli",
    actorRole: resolvedActorRole,
    controlsSatisfied: params.controls ?? [],
    note: params.note
  }), ...SELF_REPORTED };
}
