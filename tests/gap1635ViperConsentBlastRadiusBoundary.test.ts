import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { ToolHubService } from "../src/toolhub/toolhubServer.js";
import { openLedger } from "../src/ledger/ledger.js";
import { createWorkOrder } from "../src/workorders/workorderEngine.js";
import { decideApprovalForIntent } from "../src/approvals/approvalEngine.js";
import { validateToolBlastRadiusConsent } from "../src/toolhub/blastRadiusConsent.js";

const DOC = "docs/source-reviews/GAP-1635-viper-consent-blast-radius.md";
const SOURCE_URL = "https://github.com/FunnyWolf/Viper";
const IMPLEMENTATION_FILES = [
  "src/toolhub/blastRadiusConsent.ts",
  "src/toolhub/toolhubServer.ts",
  "src/toolhub/toolhubReceipts.ts"
];

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1635-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "gap-1635-test-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initActionPolicy(dir);
  initToolsConfig(dir);
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("GAP-1635 Viper consent blast-radius boundary", () => {
  test("documents the live source review and AMC/no-bloat relevance decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");
    expect(doc).toContain("GAP-1635");
    expect(doc).toContain(SOURCE_URL);
    expect(doc).toContain("Enforce");
    expect(doc).toContain("Shield");
    expect(doc).toContain("Vault");
    expect(doc).toContain("Consent and blast-radius prompts");
    expect(doc).toContain("No Viper integration");
    expect(doc).toContain("metadata-only");
  });

  test("creates a generic high-impact ToolHub consent prompt before execution", () => {
    const workspace = newWorkspace();
    const service = new ToolHubService(workspace);
    const workOrder = createWorkOrder({
      workspace,
      agentId: "default",
      title: "Run scoped build command",
      description: "Validate high-impact tool consent context",
      riskTier: "high",
      requestedMode: "EXECUTE",
      allowedActionClasses: ["WRITE_HIGH"]
    }).workOrder;

    const intent = service.createIntent({
      agentId: "default",
      workOrderId: workOrder.workOrderId,
      toolName: "process.spawn",
      args: {
        binary: "node",
        argv: ["-v"],
        cwd: "./workspace"
      },
      requestedMode: "EXECUTE"
    });

    expect(intent.blastRadiusConsent).toBeDefined();
    expect(intent.blastRadiusConsent?.source).toBe("toolhub");
    expect(intent.blastRadiusConsent?.highImpact).toBe(true);
    expect(intent.blastRadiusConsent?.consentPrompt).toContain("process.spawn");
    expect(intent.blastRadiusConsent?.consentPrompt).toContain("WRITE_HIGH");
    expect(intent.blastRadiusConsent?.impactSummary.resources).toContain("cwd:./workspace");
    expect(intent.blastRadiusConsent?.impactSummary.irreversibleEffects.length).toBeGreaterThan(0);
    expect(intent.blastRadiusConsent?.reviewerDecision.status).toBe("pending");
    expect(intent.blastRadiusConsent?.metadataOnlyAccepted).toBe(false);
    expect(intent.approvalRequired).toBe(true);
  });

  test("binds reviewer decision and executed scope into signed ToolHub action evidence", async () => {
    const workspace = newWorkspace();
    mkdirSync(join(workspace, "workspace"), { recursive: true });
    const service = new ToolHubService(workspace);
    const workOrder = createWorkOrder({
      workspace,
      agentId: "default",
      title: "Run scoped build command",
      description: "Validate execution blast-radius receipt",
      riskTier: "high",
      requestedMode: "EXECUTE",
      allowedActionClasses: ["WRITE_HIGH"]
    }).workOrder;
    const intent = service.createIntent({
      agentId: "default",
      workOrderId: workOrder.workOrderId,
      toolName: "process.spawn",
      args: {
        binary: "node",
        argv: ["-v"],
        cwd: "./workspace"
      },
      requestedMode: "EXECUTE"
    });
    expect(intent.approvalId).toBeTruthy();

    decideApprovalForIntent({
      workspace,
      approvalId: intent.approvalId!,
      decision: "APPROVED",
      mode: "EXECUTE",
      reason: "Reviewed command, cwd, and scope.",
      userId: "owner-a",
      username: "owner-a",
      userRoles: ["OWNER"]
    });
    decideApprovalForIntent({
      workspace,
      approvalId: intent.approvalId!,
      decision: "APPROVED",
      mode: "EXECUTE",
      reason: "Second reviewer accepts scoped command.",
      userId: "owner-b",
      username: "owner-b",
      userRoles: ["OWNER"]
    });

    const execution = await service.executeIntent({
      intentId: intent.intentId,
      approvalId: intent.approvalId
    });

    expect(execution.allowed).toBe(true);
    expect(execution.blastRadiusReceipt).toBe(execution.actionReceipt);
    expect(execution.blastRadiusConsent?.reviewerDecision.status).toBe("approved");
    expect(execution.blastRadiusConsent?.reviewerDecision.approvalRequestId).toBe(intent.approvalId);
    expect(execution.blastRadiusConsent?.executedScope?.toolName).toBe("process.spawn");
    expect(execution.blastRadiusConsent?.executedScope?.resources).toContain("cwd:./workspace");
    expect(execution.blastRadiusConsent?.executedScope?.command).toBe("node -v");

    const ledger = openLedger(workspace);
    try {
      const actions = ledger
        .getEventsBetween(0, Date.now())
        .filter((event) => event.event_type === "tool_action");
      expect(actions.length).toBeGreaterThan(0);
      const payload = JSON.parse(actions[0]!.payload_inline ?? "{}") as Record<string, any>;
      const meta = JSON.parse(actions[0]!.meta_json) as Record<string, any>;
      expect(payload.blastRadiusConsent.consentPrompt).toContain("process.spawn");
      expect(payload.blastRadiusConsent.reviewerDecision.status).toBe("approved");
      expect(payload.blastRadiusConsent.executedScope.resources).toContain("cwd:./workspace");
      expect(meta.blastRadiusConsentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(meta.blastRadiusConsent.source).toBe("toolhub");
    } finally {
      ledger.close();
    }
  });

  test("fails closed when high-impact consent evidence is metadata-only or lacks executed scope", () => {
    const invalid = validateToolBlastRadiusConsent({
      source: "toolhub",
      intentId: "intent_metadata_only",
      agentId: "default",
      toolName: "process.spawn",
      actionClass: "WRITE_HIGH",
      requestedMode: "EXECUTE",
      effectiveMode: "EXECUTE",
      highImpact: true,
      consentPrompt: "approved",
      impactSummary: {
        resources: [],
        accounts: [],
        externalSystems: [],
        irreversibleEffects: [],
        dataClasses: []
      },
      reviewerDecision: {
        status: "approved",
        decidedBy: "metadata"
      },
      executedScope: null,
      metadataOnlyAccepted: true
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.reasons).toEqual(
      expect.arrayContaining([
        "metadata-only consent evidence is not accepted",
        "impact resources missing",
        "irreversible effects missing for high-impact execution",
        "executed scope missing for high-impact execution"
      ])
    );
  });

  test("does not add a source-specific Viper adapter, runtime, or copied red-team subsystem", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toMatch(/FunnyWolf|viperrtp|metasploit|cobalt\s*strike|post-exploitation/i);
    expect(combined).not.toMatch(/\bviper\b/i);
  });
});
