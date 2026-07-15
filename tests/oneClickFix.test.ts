import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { chooseGuardrailsTarget, CI_WORKFLOW_PATH, ciWorkflowContent, runOneClickFix } from "../src/guide/oneClickFix.js";

function createWorkspace(): string {
  return mkdtempSync(join(tmpdir(), "amc-one-click-fix-"));
}

function cleanup(workspace: string): void {
  rmSync(workspace, { recursive: true, force: true });
}

const FIXED_NOW = 1_800_000_000_000;

describe("one-click fix engine", () => {
  test("dry run plans guardrails for a fresh agent without touching the disk", () => {
    const workspace = createWorkspace();
    try {
      writeFileSync(join(workspace, "AGENTS.md"), "# My agent\n\nDo good work.\n");

      const result = runOneClickFix({ workspace, apply: false, now: FIXED_NOW });

      expect(result.schemaVersion).toBe("amc.fix.v1");
      expect(result.framework).toBe("claudecode");
      expect(result.instructionSources).toContain("AGENTS.md");
      expect(result.score.level).toBe("L0");
      // Fresh agent, target L3 (default): all five rapid questions are gaps.
      expect(result.gaps).toHaveLength(5);
      expect(result.gaps[0]?.why.length).toBeGreaterThan(0);
      expect(result.gaps[0]?.how.length).toBeGreaterThan(0);
      expect(result.guardrailsTarget).toBe("AGENTS.md");
      expect(result.applied).toBe(false);
      expect(result.changes[0]).toMatchObject({ path: "AGENTS.md", action: "planned" });
      expect(result.receiptPath).toBeNull();
      // Nothing written: original file untouched, no receipt directory.
      expect(readFileSync(join(workspace, "AGENTS.md"), "utf8")).not.toContain("AMC-GUARDRAILS-START");
      expect(existsSync(join(workspace, ".amc"))).toBe(false);
    } finally {
      cleanup(workspace);
    }
  });

  test("apply appends marked guardrails, preserves content, and seals a receipt", () => {
    const workspace = createWorkspace();
    try {
      writeFileSync(join(workspace, "AGENTS.md"), "# My agent\n\nDo good work.\n");

      const result = runOneClickFix({ workspace, apply: true, now: FIXED_NOW });

      expect(result.applied).toBe(true);
      expect(result.changes[0]?.action).toBe("appended");
      const content = readFileSync(join(workspace, "AGENTS.md"), "utf8");
      expect(content).toContain("# My agent");
      expect(content).toContain("<!-- AMC-GUARDRAILS-START -->");
      expect(content).toContain("<!-- AMC-GUARDRAILS-END -->");
      expect(content).toContain("Non-Negotiable Rules");

      expect(result.receiptPath).toBe(join(".amc", "fix", `receipt-${FIXED_NOW}.json`));
      const receipt = JSON.parse(readFileSync(join(workspace, result.receiptPath!), "utf8"));
      expect(receipt.schemaVersion).toBe("amc.fix.v1");
      expect(receipt.ts).toBe(FIXED_NOW);
      expect(receipt.guardrailsTarget).toBe("AGENTS.md");
      expect(receipt.gapQuestionIds).toHaveLength(5);
      expect(receipt.guardrailsSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(receipt.receiptHash).toBe(result.receiptHash);
    } finally {
      cleanup(workspace);
    }
  });

  test("re-applying replaces the marked section instead of duplicating it", () => {
    const workspace = createWorkspace();
    try {
      writeFileSync(join(workspace, "AGENTS.md"), "# My agent\n");

      runOneClickFix({ workspace, apply: true, now: FIXED_NOW });
      const second = runOneClickFix({ workspace, apply: true, now: FIXED_NOW + 1 });

      expect(second.changes[0]?.action).toBe("updated");
      const content = readFileSync(join(workspace, "AGENTS.md"), "utf8");
      expect(content.match(/AMC-GUARDRAILS-START/g)).toHaveLength(1);
      expect(content.match(/AMC-GUARDRAILS-END/g)).toHaveLength(1);
    } finally {
      cleanup(workspace);
    }
  });

  test("creates AGENTS.md when no known agent config exists", () => {
    const workspace = createWorkspace();
    try {
      const result = runOneClickFix({ workspace, apply: true, now: FIXED_NOW });

      expect(result.instructionSources).toHaveLength(0);
      expect(result.guardrailsTarget).toBe("AGENTS.md");
      expect(result.changes[0]?.action).toBe("created");
      expect(readFileSync(join(workspace, "AGENTS.md"), "utf8")).toContain("AMC-GUARDRAILS-START");
    } finally {
      cleanup(workspace);
    }
  });

  test("an agent already at target has no gaps and writes nothing", () => {
    const workspace = createWorkspace();
    try {
      const answers = { "AMC-1.1": 5, "AMC-2.1": 5, "AMC-3.1.1": 5, "AMC-4.1": 5, "AMC-5.1": 5 };
      const result = runOneClickFix({ workspace, apply: true, answers, now: FIXED_NOW });

      expect(result.gaps).toHaveLength(0);
      expect(result.applied).toBe(false);
      expect(result.receiptPath).toBeNull();
      expect(existsSync(join(workspace, "AGENTS.md"))).toBe(false);
      expect(result.summary).toContain("nothing to fix");
    } finally {
      cleanup(workspace);
    }
  });

  test("--ci adds a trust-gate workflow using the canonical installer, create-only", () => {
    const workspace = createWorkspace();
    try {
      const first = runOneClickFix({ workspace, apply: true, ci: true, now: FIXED_NOW });
      const workflowChange = first.changes.find((c) => c.path === CI_WORKFLOW_PATH);
      expect(workflowChange?.action).toBe("created");
      const workflow = readFileSync(join(workspace, CI_WORKFLOW_PATH), "utf8");
      expect(workflow).toContain("curl -fsSL https://agentmaturity.co/install.sh | sh");
      expect(workflow).toContain("amc quickscore --auto --json");
      expect(workflow).not.toMatch(/\bnpx\s+(?:agent-maturity-compass|amc)\b/);
      expect(workflow).not.toMatch(/\bnpm\s+(?:i|install)\s+-g\s+agent-maturity-compass\b/);
      expect(ciWorkflowContent(3)).toContain("Gate target: L3");

      // Create-only: a second run must not rewrite the workflow.
      const second = runOneClickFix({ workspace, apply: true, ci: true, now: FIXED_NOW + 1 });
      expect(second.changes.find((c) => c.path === CI_WORKFLOW_PATH)).toBeUndefined();
    } finally {
      cleanup(workspace);
    }
  });

  test("honors an explicit --file override and detected config priority", () => {
    const workspace = createWorkspace();
    try {
      mkdirSync(join(workspace, ".cursor"), { recursive: true });
      writeFileSync(join(workspace, ".cursorrules"), "rules\n");
      expect(chooseGuardrailsTarget(workspace)).toBe(".cursorrules");
      expect(chooseGuardrailsTarget(workspace, "docs/RULES.md")).toBe("docs/RULES.md");

      const result = runOneClickFix({ workspace, apply: true, filePath: "docs/RULES.md", now: FIXED_NOW });
      expect(result.guardrailsTarget).toBe("docs/RULES.md");
      expect(result.changes[0]?.action).toBe("created");
      expect(readFileSync(join(workspace, "docs", "RULES.md"), "utf8")).toContain("AMC-GUARDRAILS-START");
    } finally {
      cleanup(workspace);
    }
  });
});
