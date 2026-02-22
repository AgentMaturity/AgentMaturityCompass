import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  detectFrameworksForOnboarding,
  estimateTimeToL3,
  generateFirstWeekPlan,
  type FrameworkDetection
} from "../src/setup/setupWizard.js";

function createTempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), "amc-setup-wizard-test-"));
}

function cleanupWorkspace(workspace: string): void {
  rmSync(workspace, { recursive: true, force: true });
}

describe("setupWizard framework detection", () => {
  test("detects LangChain from package.json dependencies", () => {
    const workspace = createTempWorkspace();
    try {
      writeFileSync(
        join(workspace, "package.json"),
        JSON.stringify(
          {
            dependencies: {
              langchain: "^0.2.0"
            }
          },
          null,
          2
        )
      );

      const detections = detectFrameworksForOnboarding(workspace);
      expect(detections.map((d) => d.framework)).toContain("LangChain");
      expect(detections.find((d) => d.framework === "LangChain")?.adapterId).toBe("langchain-node");
    } finally {
      cleanupWorkspace(workspace);
    }
  });

  test("detects AutoGen and CrewAI from Python manifests", () => {
    const workspace = createTempWorkspace();
    try {
      writeFileSync(
        join(workspace, "requirements.txt"),
        ["pyautogen==0.4.0", "crewai==0.56.0"].join("\n")
      );

      const detections = detectFrameworksForOnboarding(workspace);
      expect(detections.map((d) => d.framework)).toEqual(["AutoGen", "CrewAI"]);
    } finally {
      cleanupWorkspace(workspace);
    }
  });
});

describe("setupWizard ETA and plan", () => {
  test("estimates less time to L3 for higher-readiness workspace", () => {
    const lowWorkspace = createTempWorkspace();
    const highWorkspace = createTempWorkspace();

    try {
      mkdirSync(join(highWorkspace, ".github", "workflows"), { recursive: true });
      writeFileSync(join(highWorkspace, ".github", "workflows", "ci.yaml"), "name: ci");
      mkdirSync(join(highWorkspace, "tests"), { recursive: true });
      writeFileSync(join(highWorkspace, "tests", "smoke.test.ts"), "test('ok', () => {});");
      mkdirSync(join(highWorkspace, ".amc"), { recursive: true });
      writeFileSync(join(highWorkspace, ".amc", "gateway.yaml"), "routes: []");

      const low = estimateTimeToL3({
        workspace: lowWorkspace,
        detectedFrameworks: [],
        configuredAdapterCount: 0
      });
      const high = estimateTimeToL3({
        workspace: highWorkspace,
        detectedFrameworks: [{ framework: "LangChain", adapterId: "langchain-node", evidence: ["package.json"] }],
        configuredAdapterCount: 1
      });

      expect(high.hours).toBeLessThan(low.hours);
      expect(high.readinessScore).toBeGreaterThan(low.readinessScore);
    } finally {
      cleanupWorkspace(lowWorkspace);
      cleanupWorkspace(highWorkspace);
    }
  });

  test("generates a 7-day first week plan with priority-specific focus", () => {
    const detections: FrameworkDetection[] = [
      { framework: "LangChain", adapterId: "langchain-node", evidence: ["package.json"] }
    ];
    const plan = generateFirstWeekPlan({
      detectedFrameworks: detections,
      priority: "compliance-readiness",
      etaToL3Hours: 6.4
    });
    expect(plan).toHaveLength(7);
    expect(plan[3]?.focus).toBe("Compliance mapping");
    expect(plan[3]?.command).toContain("compliance report");
  });

  test("includes framework-specific onboarding action on day 2", () => {
    const detections: FrameworkDetection[] = [
      { framework: "AutoGen", adapterId: "autogen-cli", evidence: ["requirements.txt"] }
    ];
    const plan = generateFirstWeekPlan({
      detectedFrameworks: detections,
      priority: "runtime-reliability",
      etaToL3Hours: 8
    });
    expect(plan[1]?.action.toLowerCase()).toContain("autogen");
  });
});

