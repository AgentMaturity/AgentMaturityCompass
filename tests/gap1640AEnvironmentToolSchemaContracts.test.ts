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

const DOC = "docs/source-reviews/GAP-1640-aenvironment-tool-schema-contracts.md";
const REPO = "https://github.com/inclusionAI/AEnvironment";
const API = "https://api.github.com/repos/inclusionAI/AEnvironment";
const README = "https://raw.githubusercontent.com/inclusionAI/AEnvironment/main/README.md";
const CONTENTS = "https://api.github.com/repos/inclusionAI/AEnvironment/contents?ref=main";
const HOMEPAGE = "https://inclusionai.github.io/AEnvironment/";
const IMPLEMENTATION_FILES = [
  "src/toolhub/toolSchemaContracts.ts",
  "src/toolhub/toolhubValidators.ts",
  "src/toolhub/toolhubServer.ts"
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1640-tool-contracts-"));
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

function environmentDeployContract(ws: string) {
  return createSignedToolSchemaContract({
    workspace: ws,
    contractId: "tool-contract-environment-deploy-v1",
    toolName: "environment.deploy_instance",
    actionClass: "DEPLOY",
    inputSchema: {
      type: "object",
      required: ["environmentId", "ttlSeconds", "imageDigest", "networkPolicy"],
      additionalProperties: false,
      properties: {
        environmentId: { type: "string", required: true, pattern: "^[a-z0-9-]+@[0-9]+\\.[0-9]+\\.[0-9]+$" },
        ttlSeconds: { type: "number", required: true, min: 60, max: 3600 },
        imageDigest: { type: "string", required: true, pattern: "^sha256:[a-f0-9]{64}$" },
        networkPolicy: { type: "string", required: true, enum: ["deny-all", "egress-approved"] }
      }
    },
    outputSchema: {
      type: "object",
      required: ["instanceId", "leaseId", "sandboxProfile"],
      additionalProperties: false,
      properties: {
        instanceId: { type: "string", required: true, pattern: "^envinst_[a-f0-9]{12}$" },
        leaseId: { type: "string", required: true, pattern: "^lease_[a-f0-9]{12}$" },
        sandboxProfile: { type: "string", required: true, enum: ["locked", "limited-egress"] }
      }
    },
    sideEffectDeclaration: {
      resources: ["sandbox:ephemeral-instance", "container:image-digest"],
      externalSystems: ["container-registry.internal"],
      dataClasses: ["runtime-metadata"],
      irreversible: false,
      approvalRequired: true
    },
    failureModes: ["timeout", "sandbox_limit", "tool_schema_mismatch", "registry_unavailable"],
    sourceCitations: [
      {
        sourceId: "github-inclusionai-aenvironment",
        title: "inclusionAI/AEnvironment",
        url: REPO,
        retrievedAt: "2026-06-25T15:15:00.000Z"
      }
    ]
  });
}

function validInvocationInput() {
  return {
    environmentId: "mini-terminal@1.0.0",
    ttlSeconds: 900,
    imageDigest: `sha256:${"a".repeat(64)}`,
    networkPolicy: "deny-all"
  };
}

function validInvocationOutput() {
  return {
    instanceId: `envinst_${"b".repeat(12)}`,
    leaseId: `lease_${"c".repeat(12)}`,
    sandboxProfile: "locked"
  };
}

describe("GAP-1640 AEnvironment tool schema contract boundary", () => {
  it("documents live AEnvironment metadata and no-bloat schema-contract relevance", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1640");
    expect(doc).toContain("tool-schema-contracts");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(CONTENTS);
    expect(doc).toContain(HOMEPAGE);
    expect(doc).toContain("Apache-2.0");
    expect(doc).toContain("Everything as Environment");
    expect(doc).toContain("mcp");
    expect(doc).toContain("sandbox");
    expect(doc).toContain("Tool contract, validation result, side-effect declaration, and drift finding");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No AEnvironment adapter");
  });

  it("accepts a signed deploy-tool contract only when schema, side effects, approvals, and failure modes stay declared", () => {
    const ws = workspace();
    const contract = environmentDeployContract(ws);
    const receipt = validateToolSchemaContractInvocation({
      workspace: ws,
      contract,
      phase: "afterExecution",
      approvalReceiptId: "approval-aenvironment-deploy-1",
      input: validInvocationInput(),
      output: validInvocationOutput(),
      observedSideEffects: {
        resources: ["sandbox:ephemeral-instance", "container:image-digest"],
        externalSystems: ["container-registry.internal"],
        dataClasses: ["runtime-metadata"],
        irreversible: false
      },
      observedFailureMode: "timeout"
    });

    expect(receipt.allowed).toBe(true);
    expect(receipt.contractSignatureValid).toBe(true);
    expect(receipt.inputValidation.valid).toBe(true);
    expect(receipt.outputValidation.valid).toBe(true);
    expect(receipt.sideEffectValidation.valid).toBe(true);
    expect(receipt.failureModeValidation.valid).toBe(true);
    expect(receipt.failureModeValidation.warnings).toEqual([]);
    expect(receipt.driftFindings).toEqual([]);
    expect(receipt.surfaceBinding).toEqual(["Enforce", "Shield", "Vault", "Watch"]);
    expect(verifyToolSchemaContractReceipt({ workspace: ws, receipt })).toEqual({ valid: true, failClosedReasons: [] });
  });

  it("flags undeclared failure modes as drift even when schema and side effects are valid", () => {
    const ws = workspace();
    const contract = environmentDeployContract(ws);
    const receipt = validateToolSchemaContractInvocation({
      workspace: ws,
      contract,
      phase: "afterExecution",
      approvalReceiptId: "approval-aenvironment-deploy-1",
      input: validInvocationInput(),
      output: validInvocationOutput(),
      observedSideEffects: {
        resources: ["sandbox:ephemeral-instance", "container:image-digest"],
        externalSystems: ["container-registry.internal"],
        dataClasses: ["runtime-metadata"],
        irreversible: false
      },
      observedFailureMode: "sandbox_escape"
    });

    expect(receipt.allowed).toBe(false);
    expect(receipt.inputValidation.valid).toBe(true);
    expect(receipt.outputValidation.valid).toBe(true);
    expect(receipt.sideEffectValidation.valid).toBe(true);
    expect(receipt.failureModeValidation.valid).toBe(false);
    expect(receipt.failureModeValidation.errors).toContain("failure mode not declared: sandbox_escape");
    expect(receipt.driftFindings).toContain("failure_mode_drift");
    expect(verifyToolSchemaContractReceipt({ workspace: ws, receipt }).valid).toBe(true);
  });

  it("fails closed when AEnvironment metadata replaces a signed tool contract", () => {
    const ws = workspace();
    const receipt = validateToolSchemaContractInvocation({
      workspace: ws,
      contract: {
        schemaVersion: "2026-06-25",
        contractId: "metadata-only-aenvironment",
        toolName: "environment.deploy_instance",
        actionClass: "DEPLOY",
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
        sourceCitations: [{ sourceId: "github", title: "AEnvironment", url: REPO, retrievedAt: "2026-06-25T15:15:00.000Z" }],
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
    expect(receipt.failureModeValidation.valid).toBe(false);
    expect(receipt.driftFindings).toEqual(expect.arrayContaining([
      "contract_signature_invalid",
      "failure_modes_missing"
    ]));
  });

  it("does not add AEnvironment-specific identifiers to generic ToolHub implementation files", () => {
    const combined = IMPLEMENTATION_FILES.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(combined).not.toContain("inclusionAI");
    expect(combined).not.toContain("AEnvironment");
    expect(combined).not.toContain("aenvironment");
    expect(combined).not.toContain("aenvironment_tool_schema_contract");
  });
});
