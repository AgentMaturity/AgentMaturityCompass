import { join, resolve } from "node:path";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";

export type OnboardingMode = "cli" | "studio";
export type OnboardingStatus = "not_started" | "in_progress" | "complete" | "failed";
export type OnboardingStepId = "detect" | "workspace" | "provider" | "score" | "studio";
export type OnboardingStepStatus = "pending" | "running" | "complete" | "skipped" | "failed";

export interface OnboardingStepState {
  id: OnboardingStepId;
  label: string;
  status: OnboardingStepStatus;
  summary: string | null;
  updatedAt: string | null;
}

export interface OnboardingState {
  schemaVersion: "2026-05-22";
  workspace: string;
  agentId: string;
  mode: OnboardingMode;
  status: OnboardingStatus;
  createdAt: string;
  updatedAt: string;
  provider: string | null;
  detectedFrameworks: string[];
  refs: {
    runId: string | null;
    reportJsonPath: string | null;
    reportMarkdownPath: string | null;
    lifecycleArtifactPath: string | null;
    episodeRecordPath: string | null;
    studioEvidenceUrl: string | null;
  };
  steps: OnboardingStepState[];
  error: string | null;
}

export interface OnboardingSetupDetail {
  schemaVersion: OnboardingState["schemaVersion"];
  agentId: string;
  mode: OnboardingMode;
  status: OnboardingStatus;
  createdAt: string;
  updatedAt: string;
  provider: string | null;
  detectedFrameworks: string[];
  refs: {
    runId: string | null;
    reportReady: boolean;
    lifecycleReady: boolean;
    episodeReady: boolean;
    studioEvidenceReady: boolean;
  };
  steps: OnboardingStepState[];
  errorPresent: boolean;
}

const STEP_LABELS: Record<OnboardingStepId, string> = {
  detect: "Detect project",
  workspace: "Create workspace",
  provider: "Choose provider or demo",
  score: "Run full score",
  studio: "Open Studio Evidence"
};

const STEP_ORDER: OnboardingStepId[] = ["detect", "workspace", "provider", "score", "studio"];

export function onboardingStatePath(workspace: string): string {
  return join(workspace, ".amc", "onboarding", "state.json");
}

export function createOnboardingState(params: {
  workspace: string;
  agentId?: string;
  mode?: OnboardingMode;
  status?: OnboardingStatus;
  provider?: string | null;
  detectedFrameworks?: string[];
}): OnboardingState {
  const now = new Date().toISOString();
  return {
    schemaVersion: "2026-05-22",
    workspace: resolve(params.workspace),
    agentId: params.agentId ?? "default",
    mode: params.mode ?? "cli",
    status: params.status ?? "not_started",
    createdAt: now,
    updatedAt: now,
    provider: params.provider ?? null,
    detectedFrameworks: params.detectedFrameworks ?? [],
    refs: {
      runId: null,
      reportJsonPath: null,
      reportMarkdownPath: null,
      lifecycleArtifactPath: null,
      episodeRecordPath: null,
      studioEvidenceUrl: null
    },
    steps: STEP_ORDER.map((id) => ({
      id,
      label: STEP_LABELS[id],
      status: "pending",
      summary: null,
      updatedAt: null
    })),
    error: null
  };
}

export function loadOnboardingState(workspace: string): OnboardingState | null {
  const file = onboardingStatePath(workspace);
  if (!pathExists(file)) {
    return null;
  }
  return JSON.parse(readUtf8(file)) as OnboardingState;
}

export function projectOnboardingSetupDetail(state: OnboardingState): OnboardingSetupDetail {
  return {
    schemaVersion: state.schemaVersion,
    agentId: state.agentId,
    mode: state.mode,
    status: state.status,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    provider: state.provider,
    detectedFrameworks: [...state.detectedFrameworks],
    refs: {
      runId: state.refs.runId,
      reportReady: Boolean(state.refs.reportJsonPath || state.refs.reportMarkdownPath),
      lifecycleReady: Boolean(state.refs.lifecycleArtifactPath),
      episodeReady: Boolean(state.refs.episodeRecordPath),
      studioEvidenceReady: Boolean(state.refs.studioEvidenceUrl),
    },
    steps: state.steps.map((step) => ({ ...step })),
    errorPresent: state.error !== null,
  };
}

export function saveOnboardingState(workspace: string, state: OnboardingState): OnboardingState {
  const next: OnboardingState = {
    ...state,
    workspace: resolve(workspace),
    updatedAt: new Date().toISOString()
  };
  ensureDir(join(workspace, ".amc", "onboarding"));
  writeFileAtomic(onboardingStatePath(workspace), JSON.stringify(next, null, 2), 0o600);
  return next;
}

export function setOnboardingStep(
  state: OnboardingState,
  stepId: OnboardingStepId,
  status: OnboardingStepStatus,
  summary?: string | null
): OnboardingState {
  const now = new Date().toISOString();
  return {
    ...state,
    status: status === "failed" ? "failed" : state.status === "complete" ? "complete" : "in_progress",
    updatedAt: now,
    steps: state.steps.map((step) =>
      step.id === stepId
        ? { ...step, status, summary: summary ?? step.summary, updatedAt: now }
        : step
    )
  };
}

export function completeOnboarding(state: OnboardingState, refs: Partial<OnboardingState["refs"]> = {}): OnboardingState {
  const now = new Date().toISOString();
  return {
    ...state,
    status: "complete",
    updatedAt: now,
    refs: { ...state.refs, ...refs },
    steps: state.steps.map((step) => ({
      ...step,
      status: step.status === "skipped" ? "skipped" : "complete",
      updatedAt: step.updatedAt ?? now
    })),
    error: null
  };
}

export function failOnboarding(state: OnboardingState, error: string): OnboardingState {
  const now = new Date().toISOString();
  return {
    ...state,
    status: "failed",
    updatedAt: now,
    error
  };
}
