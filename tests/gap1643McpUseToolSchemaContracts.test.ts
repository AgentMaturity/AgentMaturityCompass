import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSignedToolSchemaContract,
  validateToolSchemaContractInvocation,
  verifyToolSchemaContractReceipt
} from "../src/toolhub/toolSchemaContracts.js";
import { initWorkspace } from "../src/workspace.js";

const DOC = "docs/source-reviews/GAP-1643-mcp-use-tool-schema-contracts.md";
const ARCHIVED_REPO = "https://github.com/mcp-use/mcp-use-ts";
const ARCHIVED_API = "https://api.github.com/repos/mcp-use/mcp-use-ts";
const ARCHIVED_README = "https://raw.githubusercontent.com/mcp-use/mcp-use-ts/main/README.md";
const ARCHIVED_CONTENTS = "https://api.github.com/repos/mcp-use/mcp-use-ts/contents?ref=main";
const CANONICAL_REPO = "https://github.com/mcp-use/mcp-use";
const CANONICAL_API = "https://api.github.com/repos/mcp-use/mcp-use";
const CANONICAL_README = "https://raw.githubusercontent.com/mcp-use/mcp-use/main/README.md";
const CANONICAL_CONTENTS = "https://api.github.com/repos/mcp-use/mcp-use/contents?ref=main";
const IMPLEMENTATION_FILES = [
  "src/toolhub/toolSchemaContracts.ts",
  "src/toolhub/toolhubValidators.ts",
  "src/toolhub/toolhubServer.ts"
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1643-tool-contracts-"));
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

function mcpWeatherContract(ws: string) {
  return createSignedToolSchemaContract({
    workspace: ws,
    contractId: "tool-contract-mcp-weather-v1",
    toolName: "mcp.weather.get_weather",
    actionClass: "NETWORK_EXTERNAL",
    inputSchema: {
      type: "object",
      required: ["serverUrl", "toolName", "argumentsHash"],
      additionalProperties: false,
      properties: {
        serverUrl: { type: "string", required: true, pattern: "^https://weather-mcp\\.example\\.com/mcp$" },
        toolName: { type: "string", required: true, enum: ["get_weather"] },
        argumentsHash: { type: "string", required: true, pattern: "^[a-f0-9]{64}$" }
      }
    },
    outputSchema: {
      type: "object",
      required: ["status", "contentHash"],
      additionalProperties: false,
      properties: {
        status: { type: "number", required: true, min: 200, max: 299 },
        contentHash: { type: "string", required: true, pattern: "^[a-f0-9]{64}$" }
      }
    },
    sideEffectDeclaration: {
      resources: ["mcp:weather-tool"],
      externalSystems: ["weather-mcp.example.com"],
      dataClasses: ["location-weather"],
      irreversible: false,
      approvalRequired: true
    },
    failureModes: ["server_unreachable", "tool_schema_mismatch", "scope_denied"],
    mcpServerRiskPosture: {
      serverId: "weather-mcp",
      serverVersion: "1.0.0",
      riskTier: "high",
      approvedTransports: ["streamable-http"],
      leastPrivilegeScopes: ["weather:read"],
      sandboxRequired: true,
      networkPolicy: "allowlisted"
    },
    sourceCitations: [
      {
        sourceId: "github-mcp-use-ts",
        title: "mcp-use/mcp-use-ts",
        url: ARCHIVED_REPO,
        retrievedAt: "2026-06-25T15:25:00.000Z"
      }
    ]
  });
}

function validInput() {
  return {
    serverUrl: "https://weather-mcp.example.com/mcp",
    toolName: "get_weather",
    argumentsHash: "a".repeat(64)
  };
}

function validOutput() {
  return {
    status: 200,
    contentHash: "b".repeat(64)
  };
}

describe("GAP-1643 mcp-use tool schema contract boundary", () => {
  it("documents archived mcp-use-ts metadata, canonical monorepo metadata, and no-bloat relevance", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1643");
    expect(doc).toContain("tool-schema-contracts");
    expect(doc).toContain(ARCHIVED_REPO);
    expect(doc).toContain(ARCHIVED_API);
    expect(doc).toContain(ARCHIVED_README);
    expect(doc).toContain(ARCHIVED_CONTENTS);
    expect(doc).toContain(CANONICAL_REPO);
    expect(doc).toContain(CANONICAL_API);
    expect(doc).toContain(CANONICAL_README);
    expect(doc).toContain(CANONICAL_CONTENTS);
    expect(doc).toContain("Repository moved to monorepo");
    expect(doc).toContain("archived");
    expect(doc).toContain("MIT");
    expect(doc).toContain("MCP Apps");
    expect(doc).toContain("mcp-inspector");
    expect(doc).toContain("mcp-server");
    expect(doc).toContain("mcp-client");
    expect(doc).toContain("Tool contract, validation result, side-effect declaration, and drift finding");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No mcp-use adapter");
  });

  it("accepts a signed MCP contract only when server risk posture stays within approved transport, scope, sandbox, and network bounds", () => {
    const ws = workspace();
    const contract = mcpWeatherContract(ws);
    const receipt = validateToolSchemaContractInvocation({
      workspace: ws,
      contract,
      phase: "afterExecution",
      approvalReceiptId: "approval-mcp-weather-1",
      input: validInput(),
      output: validOutput(),
      observedSideEffects: {
        resources: ["mcp:weather-tool"],
        externalSystems: ["weather-mcp.example.com"],
        dataClasses: ["location-weather"],
        irreversible: false
      },
      observedFailureMode: "server_unreachable",
      observedMcpServerRiskPosture: {
        serverId: "weather-mcp",
        serverVersion: "1.0.0",
        transport: "streamable-http",
        scopes: ["weather:read"],
        sandboxed: true,
        networkPolicy: "allowlisted"
      }
    });

    expect(receipt.allowed).toBe(true);
    expect(receipt.mcpServerRiskValidation.valid).toBe(true);
    expect(receipt.mcpServerRiskValidation.warnings).toEqual([]);
    expect(receipt.driftFindings).toEqual([]);
    expect(verifyToolSchemaContractReceipt({ workspace: ws, receipt })).toEqual({ valid: true, failClosedReasons: [] });
  });

  it("blocks MCP calls when server identity, transport, scopes, sandbox, or network posture drift from the signed contract", () => {
    const ws = workspace();
    const contract = mcpWeatherContract(ws);
    const receipt = validateToolSchemaContractInvocation({
      workspace: ws,
      contract,
      phase: "beforeExecution",
      approvalReceiptId: "approval-mcp-weather-1",
      input: validInput(),
      observedSideEffects: {
        resources: ["mcp:weather-tool"],
        externalSystems: ["weather-mcp.example.com"],
        dataClasses: ["location-weather"],
        irreversible: false
      },
      observedFailureMode: "scope_denied",
      observedMcpServerRiskPosture: {
        serverId: "weather-mcp-impersonator",
        serverVersion: "2.0.0",
        transport: "stdio",
        scopes: ["weather:read", "files:write"],
        sandboxed: false,
        networkPolicy: "open"
      }
    });

    expect(receipt.allowed).toBe(false);
    expect(receipt.blockBeforeExecution).toBe(true);
    expect(receipt.inputValidation.valid).toBe(true);
    expect(receipt.sideEffectValidation.valid).toBe(true);
    expect(receipt.failureModeValidation.valid).toBe(true);
    expect(receipt.mcpServerRiskValidation.valid).toBe(false);
    expect(receipt.mcpServerRiskValidation.errors).toEqual(expect.arrayContaining([
      "server id mismatch: weather-mcp-impersonator",
      "server version mismatch: 2.0.0",
      "transport not approved: stdio",
      "scope not least-privilege approved: files:write",
      "sandbox required but not observed",
      "network policy drift: open"
    ]));
    expect(receipt.driftFindings).toContain("mcp_server_risk_drift");
    expect(verifyToolSchemaContractReceipt({ workspace: ws, receipt }).valid).toBe(true);
  });

  it("fails closed when mcp-use metadata replaces a signed tool contract", () => {
    const ws = workspace();
    const receipt = validateToolSchemaContractInvocation({
      workspace: ws,
      contract: {
        schemaVersion: "2026-06-25",
        contractId: "metadata-only-mcp-use",
        toolName: "mcp.weather.get_weather",
        actionClass: "NETWORK_EXTERNAL",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        sideEffectDeclaration: {
          resources: [],
          externalSystems: [],
          dataClasses: [],
          irreversible: false,
          approvalRequired: false
        },
        failureModes: [],
        sourceCitations: [{ sourceId: "github", title: "mcp-use", url: ARCHIVED_REPO, retrievedAt: "2026-06-25T15:25:00.000Z" }],
        contractDigestSha256: "0".repeat(64),
        contractSignature: "",
        signer: "auditor",
        signedTs: 0
      },
      phase: "beforeExecution",
      input: {},
      observedSideEffects: {
        resources: [],
        externalSystems: [],
        dataClasses: [],
        irreversible: false
      }
    });

    expect(receipt.allowed).toBe(false);
    expect(receipt.contractSignatureValid).toBe(false);
    expect(receipt.metadataOnlyAccepted).toBe(false);
    expect(receipt.driftFindings).toContain("contract_signature_invalid");
  });

  it("does not add mcp-use-specific identifiers to generic ToolHub implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("mcp-use");
    expect(combined).not.toContain("mcp_use");
    expect(combined).not.toContain("MCP Apps");
    expect(combined).not.toContain("mcp_use_tool_schema_contract");
  });
});
