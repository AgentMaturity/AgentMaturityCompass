import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSignedLeastPrivilegeToolGrant,
  evaluateLeastPrivilegeToolGrantUsage,
  verifyLeastPrivilegeToolGrantReceipt
} from "../src/toolhub/leastPrivilegeGrants.js";
import { initWorkspace } from "../src/workspace.js";

const DOC = "docs/source-reviews/GAP-1639-mcp-universe-least-privilege-grants.md";
const SOURCE_REPO = "https://github.com/SalesforceAIResearch/MCP-Universe";
const SOURCE_API = "https://api.github.com/repos/SalesforceAIResearch/MCP-Universe";
const SOURCE_README = "https://raw.githubusercontent.com/SalesforceAIResearch/MCP-Universe/main/README.md";
const SOURCE_CONTENTS = "https://api.github.com/repos/SalesforceAIResearch/MCP-Universe/contents?ref=main";
const SOURCE_HOMEPAGE = "https://mcp-universe.github.io/";
const IMPLEMENTATION_FILES = [
  "src/toolhub/leastPrivilegeGrants.ts",
  "src/toolhub/toolSchemaContracts.ts",
  "src/toolhub/toolhubServer.ts"
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1639-least-privilege-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function grantRequest() {
  return {
    grantId: "grant-mcp-research-weather-1",
    agentId: "agent-research-basic",
    runId: "run-research-basic-1",
    taskId: "task-compare-weather-api-docs",
    toolName: "mcp.research.fetch",
    actionClass: "NETWORK_EXTERNAL" as const,
    requestedAt: "2026-06-25T16:05:00.000Z",
    requestedDurationMs: 15 * 60 * 1000,
    requestedScope: {
      scopes: ["web:read", "files:write", "network:egress"],
      resources: ["docs:weather-api", "workspace:research-notes"],
      externalSystems: ["developer.weather.example", "general-web"],
      dataClasses: ["public-docs", "workspace-notes"]
    },
    sourceCitations: [
      {
        sourceId: "github-mcp-universe",
        title: "SalesforceAIResearch/MCP-Universe",
        url: SOURCE_REPO,
        retrievedAt: "2026-06-25T16:05:00.000Z"
      }
    ]
  };
}

describe("GAP-1639 MCP-Universe least-privilege grant boundary", () => {
  it("documents live MCP-Universe metadata, relevance, fail-closed evidence, and no-bloat boundaries", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1639");
    expect(doc).toContain("tool-least-privilege");
    expect(doc).toContain(SOURCE_REPO);
    expect(doc).toContain(SOURCE_API);
    expect(doc).toContain(SOURCE_README);
    expect(doc).toContain(SOURCE_CONTENTS);
    expect(doc).toContain(SOURCE_HOMEPAGE);
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("MCP-Universe");
    expect(doc).toContain("real-world MCP server interactions");
    expect(doc).toContain("large, unfamiliar tool spaces");
    expect(doc).toContain("Grant request, approved scope, expiry, used permissions, and unused permission report");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No MCP-Universe adapter");
  });

  it("approves signed per-task grants only for the approved scope and reports unused permissions", () => {
    const ws = workspace();
    const grant = createSignedLeastPrivilegeToolGrant({
      workspace: ws,
      request: grantRequest(),
      approvedScope: {
        scopes: ["web:read"],
        resources: ["docs:weather-api", "workspace:research-notes"],
        externalSystems: ["developer.weather.example"],
        dataClasses: ["public-docs"]
      },
      approvalReceiptId: "approval-least-privilege-1",
      policyId: "tool-policy-prod-2026-06-25",
      approvedBy: "security-reviewer",
      expiresAt: "2026-06-25T16:20:00.000Z"
    });

    const receipt = evaluateLeastPrivilegeToolGrantUsage({
      workspace: ws,
      grant,
      phase: "beforeExecution",
      now: "2026-06-25T16:10:00.000Z",
      usedScope: {
        scopes: ["web:read"],
        resources: ["docs:weather-api"],
        externalSystems: ["developer.weather.example"],
        dataClasses: ["public-docs"]
      }
    });

    expect(receipt.allowed).toBe(true);
    expect(receipt.blockBeforeExecution).toBe(false);
    expect(receipt.signatureValid).toBe(true);
    expect(receipt.expired).toBe(false);
    expect(receipt.reasons).toEqual(["least-privilege-grant:approved"]);
    expect(receipt.unusedPermissionReport).toEqual({
      scopes: [],
      resources: ["workspace:research-notes"],
      externalSystems: [],
      dataClasses: []
    });
    expect(receipt.surfaceBinding).toEqual(["Enforce", "Shield", "Vault", "Watch"]);
    expect(verifyLeastPrivilegeToolGrantReceipt({ workspace: ws, receipt })).toEqual({ valid: true, failClosedReasons: [] });
  });

  it("blocks before execution when a call exceeds approved scope or the grant has expired", () => {
    const ws = workspace();
    const grant = createSignedLeastPrivilegeToolGrant({
      workspace: ws,
      request: grantRequest(),
      approvedScope: {
        scopes: ["web:read"],
        resources: ["docs:weather-api"],
        externalSystems: ["developer.weather.example"],
        dataClasses: ["public-docs"]
      },
      approvalReceiptId: "approval-least-privilege-1",
      policyId: "tool-policy-prod-2026-06-25",
      approvedBy: "security-reviewer",
      expiresAt: "2026-06-25T16:20:00.000Z"
    });

    const receipt = evaluateLeastPrivilegeToolGrantUsage({
      workspace: ws,
      grant,
      phase: "beforeExecution",
      now: "2026-06-25T16:25:00.000Z",
      usedScope: {
        scopes: ["web:read", "files:write"],
        resources: ["docs:weather-api", "workspace:research-notes"],
        externalSystems: ["developer.weather.example", "general-web"],
        dataClasses: ["public-docs", "workspace-notes"]
      }
    });

    expect(receipt.allowed).toBe(false);
    expect(receipt.blockBeforeExecution).toBe(true);
    expect(receipt.expired).toBe(true);
    expect(receipt.reasons).toEqual(expect.arrayContaining([
      "least-privilege-grant:expired",
      "least-privilege-grant:scope:not-approved:files:write",
      "least-privilege-grant:resource:not-approved:workspace:research-notes",
      "least-privilege-grant:external-system:not-approved:general-web",
      "least-privilege-grant:data-class:not-approved:workspace-notes"
    ]));
    expect(receipt.driftFindings).toEqual(expect.arrayContaining(["grant_expired", "grant_scope_exceeded"]));
    expect(verifyLeastPrivilegeToolGrantReceipt({ workspace: ws, receipt })).toEqual({ valid: true, failClosedReasons: [] });
  });

  it("fails closed when metadata-only MCP-Universe evidence replaces a signed grant and unused report", () => {
    const ws = workspace();
    const grant = createSignedLeastPrivilegeToolGrant({
      workspace: ws,
      request: grantRequest(),
      approvedScope: {
        scopes: ["web:read"],
        resources: ["docs:weather-api"],
        externalSystems: ["developer.weather.example"],
        dataClasses: ["public-docs"]
      },
      approvalReceiptId: "approval-least-privilege-1",
      policyId: "tool-policy-prod-2026-06-25",
      approvedBy: "security-reviewer",
      expiresAt: "2026-06-25T16:20:00.000Z"
    });

    const receipt = evaluateLeastPrivilegeToolGrantUsage({
      workspace: ws,
      grant: {
        ...grant,
        grantSignature: "metadata-only",
        metadataOnlyAccepted: true as false
      },
      phase: "beforeExecution",
      now: "2026-06-25T16:10:00.000Z",
      usedScope: {
        scopes: ["web:read"],
        resources: ["docs:weather-api"],
        externalSystems: ["developer.weather.example"],
        dataClasses: ["public-docs"]
      }
    });

    const tamperedReceipt = {
      ...receipt,
      unusedPermissionReport: null as typeof receipt.unusedPermissionReport
    };

    expect(receipt.allowed).toBe(false);
    expect(receipt.reasons).toContain("least-privilege-grant:signature:invalid");
    expect(verifyLeastPrivilegeToolGrantReceipt({ workspace: ws, receipt: tamperedReceipt })).toEqual({
      valid: false,
      failClosedReasons: expect.arrayContaining([
        "least-privilege-grant:metadata-only:not-accepted",
        "least-privilege-grant:signature:invalid",
        "least-privilege-grant:unused-permission-report:missing",
        "least-privilege-grant:receipt-hash:mismatch"
      ])
    });
  });

  it("keeps the generic least-privilege implementation free of MCP-Universe source-specific code", () => {
    for (const file of IMPLEMENTATION_FILES) {
      if (!existsSync(file)) continue;
      const contents = readFileSync(file, "utf8");
      expect(contents).not.toMatch(/SalesforceAIResearch/i);
      expect(contents).not.toMatch(/MCP-Universe/i);
      expect(contents).not.toMatch(/mcpuniverse/i);
      expect(contents).not.toMatch(/mcp_universe/i);
    }
  });
});
