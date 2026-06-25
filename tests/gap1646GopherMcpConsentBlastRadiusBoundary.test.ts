import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  buildToolBlastRadiusConsent,
  buildToolExecutedScope,
  hashToolBlastRadiusConsent,
  validateToolBlastRadiusConsent,
  withToolBlastRadiusDecision,
} from "../src/toolhub/blastRadiusConsent.js";

const DOC = "docs/source-reviews/GAP-1646-gopher-mcp-consent-blast-radius.md";
const SOURCE_URL = "https://github.com/GopherSecurity/gopher-mcp";
const API = "https://api.github.com/repos/GopherSecurity/gopher-mcp";
const RAW_README = "https://raw.githubusercontent.com/GopherSecurity/gopher-mcp/main/README.md";
const CONTENTS = "https://api.github.com/repos/GopherSecurity/gopher-mcp/contents?ref=main";
const HOMEPAGE = "https://gopher.security";

const IMPLEMENTATION_FILES = [
  "src/toolhub/blastRadiusConsent.ts",
  "src/toolhub/toolhubServer.ts",
  "src/toolhub/toolhubReceipts.ts",
];

describe("GAP-1646 Gopher MCP consent blast-radius boundary", () => {
  test("documents live Gopher MCP metadata and no-bloat ToolHub relevance", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1646");
    expect(doc).toContain(SOURCE_URL);
    expect(doc).toContain(API);
    expect(doc).toContain(RAW_README);
    expect(doc).toContain(CONTENTS);
    expect(doc).toContain(HOMEPAGE);
    expect(doc).toContain("GopherSecurity/gopher-mcp");
    expect(doc).toContain("default_branch `main`");
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("C++");
    expect(doc).toContain("Model Context Protocol");
    expect(doc).toContain("JSON-RPC");
    expect(doc).toContain("mcp-server");
    expect(doc).toContain("mcp-client");
    expect(doc).toContain("consent prompt");
    expect(doc).toContain("summarized impact");
    expect(doc).toContain("reviewer decision");
    expect(doc).toContain("executed scope");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Gopher MCP adapter");
  });

  test("builds and validates generic consent prompt, impact summary, reviewer decision, and executed scope", () => {
    const args = {
      url: "https://mcp.example.internal/tools/register",
      method: "POST",
      cwd: "./workspace",
      env: {
        MCP_SERVER_TOKEN: "redacted",
      },
    };
    const pending = buildToolBlastRadiusConsent({
      intentId: "intent-gap-1646",
      agentId: "agent-gap-1646",
      toolName: "http.fetch",
      actionClass: "NETWORK_EXTERNAL",
      args,
      requestedMode: "EXECUTE",
      effectiveMode: "EXECUTE",
      approvalRequired: true,
    });

    expect(pending.highImpact).toBe(true);
    expect(pending.consentPrompt).toContain("http.fetch");
    expect(pending.consentPrompt).toContain("NETWORK_EXTERNAL");
    expect(pending.impactSummary.resources).toContain("cwd:./workspace");
    expect(pending.impactSummary.externalSystems).toContain("mcp.example.internal");
    expect(pending.impactSummary.accounts).toContain("env:MCP_SERVER_TOKEN");
    expect(pending.impactSummary.irreversibleEffects).toContain(
      "Can transmit request metadata or payloads to an external system.",
    );
    expect(pending.reviewerDecision.status).toBe("pending");
    expect(validateToolBlastRadiusConsent(pending)).toMatchObject({
      ok: false,
      reasons: expect.arrayContaining(["approved reviewer decision missing for high-impact execution"]),
    });

    const approved = withToolBlastRadiusDecision(
      pending,
      {
        status: "approved",
        approvalRequestId: "apprreq_gap_1646",
        decidedBy: "owner",
        reason: "Reviewed MCP external host, env scope, and executed POST scope.",
      },
      buildToolExecutedScope({
        toolName: "http.fetch",
        actionClass: "NETWORK_EXTERNAL",
        args,
        effectiveMode: "EXECUTE",
        workOrderId: "wo_gap_1646",
      }),
    );

    expect(validateToolBlastRadiusConsent(approved)).toEqual({ ok: true, reasons: [] });
    expect(approved.executedScope?.externalSystems).toContain("mcp.example.internal");
    expect(approved.executedScope?.httpMethod).toBe("POST");
    expect(approved.executedScope?.simulated).toBe(false);
    expect(hashToolBlastRadiusConsent(approved)).toMatch(/^[a-f0-9]{64}$/);
  });

  test("fails closed when Gopher MCP metadata replaces ToolHub consent evidence", () => {
    const invalid = validateToolBlastRadiusConsent({
      source: "toolhub",
      intentId: "metadata-only-gopher-mcp",
      agentId: "agent-gap-1646",
      toolName: "GopherSecurity/gopher-mcp",
      actionClass: "NETWORK_EXTERNAL",
      requestedMode: "EXECUTE",
      effectiveMode: "EXECUTE",
      highImpact: true,
      consentPrompt: "Model Context Protocol SDK has security topics.",
      impactSummary: {
        resources: [],
        accounts: [],
        externalSystems: [],
        irreversibleEffects: [],
        dataClasses: [],
      },
      reviewerDecision: {
        status: "approved",
        decidedBy: "metadata",
      },
      executedScope: null,
      metadataOnlyAccepted: true,
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.reasons).toEqual(expect.arrayContaining([
      "metadata-only consent evidence is not accepted",
      "impact resources missing",
      "irreversible effects missing for high-impact execution",
      "executed scope missing for high-impact execution",
    ]));
  });

  test("keeps Gopher MCP identifiers out of generic ToolHub implementation modules", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("GopherSecurity/gopher-mcp");
    expect(combined).not.toContain("gopher-mcp");
    expect(combined).not.toContain("https://gopher.security");
  });
});
