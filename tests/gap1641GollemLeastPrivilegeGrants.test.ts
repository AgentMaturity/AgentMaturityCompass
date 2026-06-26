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

const DOC = "docs/source-reviews/GAP-1641-gollem-least-privilege-grants.md";
const BACKLOG_REPO = "https://github.com/m-mizutani/gollem";
const CANONICAL_REPO = "https://github.com/gollem-dev/gollem";
const SOURCE_API = "https://api.github.com/repos/m-mizutani/gollem";
const CANONICAL_API = "https://api.github.com/repos/gollem-dev/gollem";
const SOURCE_README = "https://raw.githubusercontent.com/gollem-dev/gollem/main/README.md";
const MCP_DOC = "https://raw.githubusercontent.com/gollem-dev/gollem/main/docs/mcp.md";
const TOOLS_DOC = "https://raw.githubusercontent.com/gollem-dev/gollem/main/docs/tools.md";
const MIDDLEWARE_DOC = "https://raw.githubusercontent.com/gollem-dev/gollem/main/docs/middleware.md";
const IMPLEMENTATION_FILES = [
  "src/toolhub/leastPrivilegeGrants.ts",
  "src/toolhub/toolSchemaContracts.ts",
  "src/toolhub/toolhubServer.ts"
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1641-gollem-grants-"));
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

function gollemGrantRequest() {
  return {
    grantId: "grant-gollem-mcp-calendar-1",
    agentId: "agent-scheduler",
    runId: "run-scheduler-1",
    taskId: "task-check-calendar-conflict",
    toolName: "mcp.calendar.lookup",
    actionClass: "NETWORK_EXTERNAL" as const,
    requestedAt: "2026-06-25T16:45:00.000Z",
    requestedDurationMs: 10 * 60 * 1000,
    requestedScope: {
      scopes: ["calendar:read", "calendar:write", "network:egress"],
      resources: ["calendar:primary", "calendar:shared"],
      externalSystems: ["calendar-mcp.example", "general-web"],
      dataClasses: ["calendar-metadata", "meeting-notes"]
    },
    sourceCitations: [
      {
        sourceId: "github-gollem",
        title: "gollem-dev/gollem",
        url: CANONICAL_REPO,
        retrievedAt: "2026-06-25T16:45:00.000Z"
      }
    ]
  };
}

function approvedGrant(ws: string) {
  return createSignedLeastPrivilegeToolGrant({
    workspace: ws,
    request: gollemGrantRequest(),
    approvedScope: {
      scopes: ["calendar:read"],
      resources: ["calendar:primary", "calendar:shared"],
      externalSystems: ["calendar-mcp.example"],
      dataClasses: ["calendar-metadata"]
    },
    approvalReceiptId: "approval-gollem-calendar-1",
    policyId: "tool-policy-prod-2026-06-25",
    approvedBy: "tool-policy-reviewer",
    expiresAt: "2026-06-25T16:55:00.000Z"
  });
}

describe("GAP-1641 Gollem least-privilege grant boundary", () => {
  it("documents live Gollem metadata, redirect/canonical source handling, and no-bloat relevance", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1641");
    expect(doc).toContain("tool-least-privilege");
    expect(doc).toContain(BACKLOG_REPO);
    expect(doc).toContain(CANONICAL_REPO);
    expect(doc).toContain(SOURCE_API);
    expect(doc).toContain(CANONICAL_API);
    expect(doc).toContain(SOURCE_README);
    expect(doc).toContain(MCP_DOC);
    expect(doc).toContain(TOOLS_DOC);
    expect(doc).toContain(MIDDLEWARE_DOC);
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("Tools by MCP");
    expect(doc).toContain("ToolMiddleware");
    expect(doc).toContain("NewStdio");
    expect(doc).toContain("NewStreamableHTTP");
    expect(doc).toContain("Grant request, approved scope, expiry, used permissions, and unused permission report");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Gollem adapter");
  });

  it("reuses the signed least-privilege grant receipt for Gollem-style MCP toolsets without new product code", () => {
    const ws = workspace();
    const grant = approvedGrant(ws);
    const receipt = evaluateLeastPrivilegeToolGrantUsage({
      workspace: ws,
      grant,
      phase: "beforeExecution",
      now: "2026-06-25T16:50:00.000Z",
      usedScope: {
        scopes: ["calendar:read"],
        resources: ["calendar:primary"],
        externalSystems: ["calendar-mcp.example"],
        dataClasses: ["calendar-metadata"]
      }
    });

    expect(receipt.allowed).toBe(true);
    expect(receipt.blockBeforeExecution).toBe(false);
    expect(receipt.signatureValid).toBe(true);
    expect(receipt.unusedPermissionReport.resources).toEqual(["calendar:shared"]);
    expect(receipt.surfaceBinding).toEqual(["Enforce", "Shield", "Vault", "Watch"]);
    expect(verifyLeastPrivilegeToolGrantReceipt({ workspace: ws, receipt })).toEqual({ valid: true, failClosedReasons: [] });
  });

  it("blocks Gollem-style tool execution when used permissions exceed the signed approved scope", () => {
    const ws = workspace();
    const receipt = evaluateLeastPrivilegeToolGrantUsage({
      workspace: ws,
      grant: approvedGrant(ws),
      phase: "beforeExecution",
      now: "2026-06-25T16:50:00.000Z",
      usedScope: {
        scopes: ["calendar:read", "calendar:write"],
        resources: ["calendar:primary", "calendar:shared"],
        externalSystems: ["calendar-mcp.example", "general-web"],
        dataClasses: ["calendar-metadata", "meeting-notes"]
      }
    });

    expect(receipt.allowed).toBe(false);
    expect(receipt.blockBeforeExecution).toBe(true);
    expect(receipt.reasons).toEqual(expect.arrayContaining([
      "least-privilege-grant:scope:not-approved:calendar:write",
      "least-privilege-grant:external-system:not-approved:general-web",
      "least-privilege-grant:data-class:not-approved:meeting-notes"
    ]));
    expect(receipt.driftFindings).toContain("grant_scope_exceeded");
    expect(verifyLeastPrivilegeToolGrantReceipt({ workspace: ws, receipt })).toEqual({ valid: true, failClosedReasons: [] });
  });

  it("fails closed when Gollem repository metadata replaces signed grant evidence", () => {
    const ws = workspace();
    const grant = approvedGrant(ws);
    const receipt = evaluateLeastPrivilegeToolGrantUsage({
      workspace: ws,
      grant: {
        ...grant,
        grantSignature: "gollem-metadata-only",
        metadataOnlyAccepted: true as false
      },
      phase: "beforeExecution",
      now: "2026-06-25T16:50:00.000Z",
      usedScope: {
        scopes: ["calendar:read"],
        resources: ["calendar:primary"],
        externalSystems: ["calendar-mcp.example"],
        dataClasses: ["calendar-metadata"]
      }
    });

    expect(receipt.allowed).toBe(false);
    expect(receipt.reasons).toEqual(expect.arrayContaining([
      "least-privilege-grant:metadata-only:not-accepted",
      "least-privilege-grant:signature:invalid"
    ]));
    expect(verifyLeastPrivilegeToolGrantReceipt({ workspace: ws, receipt }).valid).toBe(false);
  });

  it("keeps Gollem source identifiers out of generic ToolHub implementation files", () => {
    for (const file of IMPLEMENTATION_FILES) {
      if (!existsSync(file)) continue;
      const contents = readFileSync(file, "utf8");
      expect(contents).not.toMatch(/m-mizutani/i);
      expect(contents).not.toMatch(/gollem-dev/i);
      expect(contents).not.toMatch(/gollem/i);
    }
  });
});
