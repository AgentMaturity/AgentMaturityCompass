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

const DOC = "docs/source-reviews/GAP-1637-outlines-tool-schema-contracts.md";
const REPO = "https://github.com/dottxt-ai/outlines";
const API = "https://api.github.com/repos/dottxt-ai/outlines";
const README = "https://raw.githubusercontent.com/dottxt-ai/outlines/main/README.md";
const CONTENTS = "https://api.github.com/repos/dottxt-ai/outlines/contents?ref=main";
const HOMEPAGE = "https://dottxt-ai.github.io/outlines/";
const IMPLEMENTATION_FILES = [
  "src/toolhub/toolSchemaContracts.ts",
  "src/toolhub/toolhubValidators.ts",
  "src/toolhub/toolhubServer.ts"
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1637-tool-contracts-"));
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

function supportTicketContract(ws: string) {
  return createSignedToolSchemaContract({
    workspace: ws,
    contractId: "tool-contract-support-ticket-v1",
    toolName: "http.fetch",
    actionClass: "NETWORK_EXTERNAL",
    inputSchema: {
      type: "object",
      required: ["url", "method", "bodyHash"],
      additionalProperties: false,
      properties: {
        url: { type: "string", required: true, pattern: "^https://api\\.example\\.com/" },
        method: { type: "string", required: true, enum: ["POST"] },
        bodyHash: { type: "string", required: true, pattern: "^[a-f0-9]{64}$" }
      }
    },
    outputSchema: {
      type: "object",
      required: ["status", "responseHash"],
      additionalProperties: false,
      properties: {
        status: { type: "number", required: true, min: 200, max: 299 },
        responseHash: { type: "string", required: true, pattern: "^[a-f0-9]{64}$" }
      }
    },
    sideEffectDeclaration: {
      resources: ["ticket:external-support"],
      externalSystems: ["api.example.com"],
      dataClasses: ["support-ticket"],
      irreversible: false,
      approvalRequired: true
    },
    failureModes: ["schema_mismatch", "unexpected_external_system", "missing_approval"],
    sourceCitations: [
      {
        sourceId: "github-dottxt-ai-outlines",
        title: "dottxt-ai/outlines",
        url: REPO,
        retrievedAt: "2026-06-25T15:05:00.000Z"
      }
    ]
  });
}

describe("GAP-1637 Outlines tool schema contract boundary", () => {
  it("documents live Outlines metadata and no-bloat schema-contract relevance", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1637");
    expect(doc).toContain("tool-schema-contracts");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(CONTENTS);
    expect(doc).toContain(HOMEPAGE);
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("Structured Outputs");
    expect(doc).toContain("structured-generation");
    expect(doc).toContain("cfg");
    expect(doc).toContain("regex");
    expect(doc).toContain("json");
    expect(doc).toContain("Tool contract, validation result, side-effect declaration, and drift finding");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Outlines adapter");
  });

  it("builds a signed generic tool contract receipt for valid input, output, and declared side effects", () => {
    const ws = workspace();
    const contract = supportTicketContract(ws);
    expect(contract.contractDigestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(contract.contractSignature).toMatch(/^[A-Za-z0-9+/=]+$/);

    const receipt = validateToolSchemaContractInvocation({
      workspace: ws,
      contract,
      phase: "beforeExecution",
      approvalReceiptId: "approval-tool-contract-1",
      input: {
        url: "https://api.example.com/tickets",
        method: "POST",
        bodyHash: "a".repeat(64)
      },
      output: {
        status: 201,
        responseHash: "b".repeat(64)
      },
      observedSideEffects: {
        resources: ["ticket:external-support"],
        externalSystems: ["api.example.com"],
        dataClasses: ["support-ticket"],
        irreversible: false
      }
    });

    expect(receipt.allowed).toBe(true);
    expect(receipt.blockBeforeExecution).toBe(false);
    expect(receipt.contractSignatureValid).toBe(true);
    expect(receipt.inputValidation.valid).toBe(true);
    expect(receipt.outputValidation.valid).toBe(true);
    expect(receipt.sideEffectValidation.valid).toBe(true);
    expect(receipt.driftFindings).toEqual([]);
    expect(receipt.surfaceBinding).toEqual(["Enforce", "Shield", "Vault", "Watch"]);
    expect(receipt.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyToolSchemaContractReceipt({ workspace: ws, receipt })).toEqual({ valid: true, failClosedReasons: [] });
  });

  it("blocks unsafe calls before execution when schema or side effects drift from the signed contract", () => {
    const ws = workspace();
    const contract = supportTicketContract(ws);

    const receipt = validateToolSchemaContractInvocation({
      workspace: ws,
      contract,
      phase: "beforeExecution",
      input: {
        url: "https://evil.example.net/tickets",
        method: "GET",
        bodyHash: "not-a-hash",
        surprise: "unexpected"
      },
      observedSideEffects: {
        resources: ["ticket:external-support"],
        externalSystems: ["evil.example.net"],
        dataClasses: ["support-ticket", "customer-pii"],
        irreversible: true
      }
    });

    expect(receipt.allowed).toBe(false);
    expect(receipt.blockBeforeExecution).toBe(true);
    expect(receipt.inputValidation.valid).toBe(false);
    expect(receipt.sideEffectValidation.valid).toBe(false);
    expect(receipt.driftFindings).toEqual(expect.arrayContaining([
      "input_schema_violation",
      "side_effect_drift",
      "approval_required"
    ]));
    expect(receipt.inputValidation.errors.join("\n")).toContain("url: does not match pattern");
    expect(receipt.sideEffectValidation.errors.join("\n")).toContain("external system not declared: evil.example.net");
    expect(verifyToolSchemaContractReceipt({ workspace: ws, receipt }).valid).toBe(true);
  });

  it("fails closed when Outlines metadata replaces a signed tool contract", () => {
    const ws = workspace();
    const receipt = validateToolSchemaContractInvocation({
      workspace: ws,
      contract: {
        schemaVersion: "2026-06-25",
        contractId: "metadata-only-outlines",
        toolName: "http.fetch",
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
        sourceCitations: [{ sourceId: "github", title: "Outlines", url: REPO, retrievedAt: "2026-06-25T15:05:00.000Z" }],
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

    const tampered = verifyToolSchemaContractReceipt({
      workspace: ws,
      receipt: {
        ...receipt,
        metadataOnlyAccepted: true,
        receiptHash: "0".repeat(64)
      }
    });
    expect(tampered.valid).toBe(false);
    expect(tampered.failClosedReasons).toEqual(expect.arrayContaining([
      "tool-schema-contract:metadata-only:not-accepted",
      "tool-schema-contract:receipt-hash:mismatch",
      "tool-schema-contract:signature:invalid"
    ]));
  });

  it("does not add Outlines-specific identifiers to generic ToolHub implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("dottxt-ai");
    expect(combined).not.toContain("Outlines");
    expect(combined).not.toContain("structured-generation");
    expect(combined).not.toContain("outlines_tool_schema_contract");
  });
});
