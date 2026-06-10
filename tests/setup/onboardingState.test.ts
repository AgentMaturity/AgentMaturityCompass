import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  completeOnboarding,
  createOnboardingState,
  loadOnboardingState,
  onboardingStatePath,
  saveOnboardingState,
  setOnboardingStep
} from "../../src/setup/onboardingState.js";

describe("onboarding state", () => {
  test("persists resumable setup progress and completion refs", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-onboarding-state-"));
    try {
      let state = createOnboardingState({
        workspace,
        agentId: "default",
        mode: "cli",
        status: "in_progress",
        provider: "demo",
        detectedFrameworks: ["generic-cli"]
      });
      state = setOnboardingStep(state, "detect", "complete", "Detected generic CLI.");
      state = setOnboardingStep(state, "score", "running", "Full score running.");
      saveOnboardingState(workspace, state);

      expect(existsSync(onboardingStatePath(workspace))).toBe(true);
      const loaded = loadOnboardingState(workspace);
      expect(loaded?.status).toBe("in_progress");
      expect(loaded?.steps.find((step) => step.id === "detect")?.status).toBe("complete");

      const completed = completeOnboarding(loaded!, {
        runId: "run-1",
        reportJsonPath: "/tmp/report.json",
        reportMarkdownPath: "/tmp/report.md",
        lifecycleArtifactPath: "/tmp/lifecycle.json",
        episodeRecordPath: "/tmp/episode.json",
        studioEvidenceUrl: null
      });
      saveOnboardingState(workspace, completed);

      const reloaded = loadOnboardingState(workspace);
      expect(reloaded?.status).toBe("complete");
      expect(reloaded?.refs.runId).toBe("run-1");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
