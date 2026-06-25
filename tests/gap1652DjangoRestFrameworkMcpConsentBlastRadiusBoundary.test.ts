import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  buildToolBlastRadiusConsent,
  buildToolExecutedScope,
  hashToolBlastRadiusConsent,
  validateToolBlastRadiusConsent,
  withToolBlastRadiusDecision,
} from "../src/toolhub/blastRadiusConsent.js";

const DOC = "docs/source-reviews/GAP-1652-django-rest-framework-mcp-consent-blast-radius.md";
const SOURCE_URL = "https://github.com/zacharypodbela/django-rest-framework-mcp";
const API = "https://api.github.com/repos/zacharypodbela/django-rest-framework-mcp";
const RAW_README = "https://raw.githubusercontent.com/zacharypodbela/django-rest-framework-mcp/main/README.md";
const CONTENTS = "https://api.github.com/repos/zacharypodbela/django-rest-framework-mcp/contents?ref=main";

const IMPLEMENTATION_FILES = [
  "src/toolhub/blastRadiusConsent.ts",
  "src/toolhub/toolhubServer.ts",
  "src/toolhub/toolhubReceipts.ts",
];

describe("GAP-1652 Django REST Framework MCP consent blast-radius boundary", () => {
  test("documents live Django REST Framework MCP metadata and no-bloat ToolHub relevance", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1652");
    expect(doc).toContain(SOURCE_URL);
    expect(doc).toContain(API);
    expect(doc).toContain(RAW_README);
    expect(doc).toContain(CONTENTS);
    expect(doc).toContain("zacharypodbela/django-rest-framework-mcp");
    expect(doc).toContain("default_branch `main`");
    expect(doc).toContain("BSD-3-Clause");
    expect(doc).toContain("Python");
    expect(doc).toContain("Django REST Framework");
    expect(doc).toContain("Model Context Protocol");
    expect(doc).toContain("authentication");
    expect(doc).toContain("permissions");
    expect(doc).toContain("OpenAPI");
    expect(doc).toContain("consent prompt");
    expect(doc).toContain("summarized impact");
    expect(doc).toContain("reviewer decision");
    expect(doc).toContain("executed scope");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Django REST Framework MCP adapter");
  });

  test("builds and validates generic consent evidence for API-backed MCP data export", () => {
    const args = {
      url: "https://api.example.internal/users/export",
      method: "POST",
      cwd: "./workspace",
      env: {
        DJANGO_API_TOKEN: "redacted",
      },
    };
    const pending = buildToolBlastRadiusConsent({
      intentId: "intent-gap-1652",
      agentId: "agent-gap-1652",
      toolName: "http.fetch",
      actionClass: "DATA_EXPORT",
      args,
      requestedMode: "EXECUTE",
      effectiveMode: "EXECUTE",
      approvalRequired: true,
    });

    expect(pending.highImpact).toBe(true);
    expect(pending.consentPrompt).toContain("http.fetch");
    expect(pending.consentPrompt).toContain("DATA_EXPORT");
    expect(pending.impactSummary.resources).toContain("cwd:./workspace");
    expect(pending.impactSummary.externalSystems).toContain("api.example.internal");
    expect(pending.impactSummary.accounts).toContain("env:DJANGO_API_TOKEN");
    expect(pending.impactSummary.irreversibleEffects).toContain(
      "Can move data outside the governed workspace boundary.",
    );
    expect(validateToolBlastRadiusConsent(pending)).toMatchObject({
      ok: false,
      reasons: expect.arrayContaining(["approved reviewer decision missing for high-impact execution"]),
    });

    const approved = withToolBlastRadiusDecision(
      pending,
      {
        status: "approved",
        approvalRequestId: "apprreq_gap_1652",
        decidedBy: "owner",
        reason: "Reviewed Django API target, token scope, and exported data boundary.",
      },
      buildToolExecutedScope({
        toolName: "http.fetch",
        actionClass: "DATA_EXPORT",
        args,
        effectiveMode: "EXECUTE",
        workOrderId: "wo_gap_1652",
      }),
    );

    expect(validateToolBlastRadiusConsent(approved)).toEqual({ ok: true, reasons: [] });
    expect(approved.executedScope?.externalSystems).toContain("api.example.internal");
    expect(approved.executedScope?.httpMethod).toBe("POST");
    expect(approved.executedScope?.simulated).toBe(false);
    expect(hashToolBlastRadiusConsent(approved)).toMatch(/^[a-f0-9]{64}$/);
  });

  test("fails closed when Django REST Framework MCP metadata replaces ToolHub consent evidence", () => {
    const invalid = validateToolBlastRadiusConsent({
      source: "toolhub",
      intentId: "metadata-only-drf-mcp",
      agentId: "agent-gap-1652",
      toolName: "zacharypodbela/django-rest-framework-mcp",
      actionClass: "DATA_EXPORT",
      requestedMode: "EXECUTE",
      effectiveMode: "EXECUTE",
      highImpact: true,
      consentPrompt: "Django REST Framework MCP supports authentication and permissions.",
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

  test("keeps Django REST Framework MCP identifiers out of generic ToolHub implementation modules", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("zacharypodbela/django-rest-framework-mcp");
    expect(combined).not.toContain("django-rest-framework-mcp");
    expect(combined).not.toContain("Django REST Framework MCP");
  });
});
