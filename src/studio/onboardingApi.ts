import { resolveAgentId } from "../fleet/paths.js";
import { projectOnboardingActivation } from "../setup/onboardingActivation.js";
import {
  createOnboardingState,
  loadOnboardingState,
  projectOnboardingSetupDetail,
  type OnboardingSetupDetail,
  type OnboardingStatus,
} from "../setup/onboardingState.js";
import { execCliCommand } from "./cliBridge.js";

export interface StudioOnboardingApiResult {
  status: number;
  body: Record<string, unknown>;
}

function setupDetailForAgent(input: {
  workspace: string;
  agentId: string;
  fallbackStatus?: OnboardingStatus;
}): OnboardingSetupDetail {
  let stored = null;
  try {
    stored = loadOnboardingState(input.workspace);
  } catch {
    // Legacy setup detail is non-authoritative and cannot break activation inspection.
  }
  const state = stored?.agentId === input.agentId
    ? stored
    : createOnboardingState({
        workspace: input.workspace,
        agentId: input.agentId,
        mode: "studio",
        status: input.fallbackStatus,
      });
  return projectOnboardingSetupDetail(state);
}

export function onboardingStatusForApi(input: {
  workspace: string;
  requestedAgentId: string | null;
  authAgentId: string | null;
  isAdmin: boolean;
}): StudioOnboardingApiResult {
  let agentId: string;
  try {
    agentId = resolveAgentId(
      input.workspace,
      input.requestedAgentId ?? input.authAgentId ?? "default",
    );
  } catch {
    return { status: 400, body: { error: "invalid agentId" } };
  }
  if (!input.isAdmin && input.authAgentId && input.authAgentId !== agentId) {
    return { status: 403, body: { error: "scope does not include this agent" } };
  }
  return {
    status: 200,
    body: {
      state: setupDetailForAgent({ workspace: input.workspace, agentId }),
      activation: projectOnboardingActivation({ workspace: input.workspace, agentId }),
    },
  };
}

export async function onboardingRunForApi(input: {
  workspace: string;
  authAgentId: string | null;
}): Promise<StudioOnboardingApiResult> {
  const result = await execCliCommand(input.workspace, {
    command: "amc",
    format: "json",
    timeout: 120_000,
  });
  const agentId = resolveAgentId(input.workspace, input.authAgentId ?? undefined);
  return {
    status: result.ok ? 200 : 422,
    body: {
      result,
      state: setupDetailForAgent({
        workspace: input.workspace,
        agentId,
        fallbackStatus: result.ok ? "complete" : "failed",
      }),
      activation: projectOnboardingActivation({ workspace: input.workspace, agentId }),
    },
  };
}
