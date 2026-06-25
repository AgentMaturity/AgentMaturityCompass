import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSignedMcpServerRiskAttestation,
  evaluateMcpServerRiskAttestation,
  verifyMcpServerRiskAttestationReceipt
} from "../src/mcp/mcpServerRiskAttestation.js";
import { initWorkspace } from "../src/workspace.js";

const DOC = "docs/source-reviews/GAP-1676-guidance-mcp-server-risk-attestation.md";
const REPO = "https://github.com/guidance-ai/guidance";
const API = "https://api.github.com/repos/guidance-ai/guidance";
const README = "https://raw.githubusercontent.com/guidance-ai/guidance/main/README.md";
const CONTENTS = "https://api.github.com/repos/guidance-ai/guidance/contents?ref=main";
const IMPLEMENTATION_FILES = [
  "src/mcp/mcpServerRiskAttestation.ts",
  "src/toolhub/toolSchemaContracts.ts",
  "src/toolhub/toolhubServer.ts",
  "src/passport/passportSchema.ts"
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1676-guidance-attestation-"));
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

function guidanceMetadataAttestation(ws: string) {
  return createSignedMcpServerRiskAttestation({
    workspace: ws,
    attestationId: "mcp-attest-guidance-metadata-boundary-1",
    serverManifest: {
      serverId: "generic-guidance-tool-runner",
      serverName: "Generic constrained-generation tool runner",
      serverVersion: "1.0.0",
      transports: ["stdio"],
      packageRef: "internal/generic-tool-runner@1.0.0",
      capabilities: [
        {
          capabilityId: "constrained-generation.tool.read",
          title: "Read constrained-generation tool context",
          riskTier: "med",
          scopes: ["tool:read"],
          resources: ["workspace:prompt-policy"],
          externalSystems: [],
          dataClasses: ["prompt-policy"],
          sideEffects: ["read_only"]
        }
      ],
      dataAccess: ["prompt-policy"],
      networkReach: [],
      sourceCitations: [
        {
          sourceId: "github-guidance",
          title: "guidance-ai/guidance",
          url: REPO,
          retrievedAt: "2026-06-25T17:55:00.000Z"
        }
      ]
    },
    signerIdentity: {
      signerId: "security-reviewer",
      organization: "amc-fixture-org",
      keyRef: "auditor"
    },
    sandboxPolicy: {
      sandboxRequired: true,
      isolation: "process",
      networkPolicy: "none",
      allowedHosts: [],
      filesystemPolicy: "read-only",
      secretsPolicy: "none"
    },
    lastScan: {
      scanId: "scan-guidance-boundary-2026-06-25",
      scanner: "amc-mcp-scan",
      scannedAt: "2026-06-25T17:50:00.000Z",
      result: "pass",
      findings: []
    }
  });
}

describe("GAP-1676 Guidance MCP server risk attestation boundary", () => {
  it("documents Guidance source metadata, misclassification, and no-bloat skip decision", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1676");
    expect(doc).toContain("tool-mcp-risk-attestation");
    expect(doc).toContain(REPO);
    expect(doc).toContain(API);
    expect(doc).toContain(README);
    expect(doc).toContain(CONTENTS);
    expect(doc).toContain("MIT");
    expect(doc).toContain("constrained generation");
    expect(doc).toContain("tool use");
    expect(doc).toContain("not an MCP server");
    expect(doc).toContain("Done - skipped");
    expect(doc).toContain("Server manifest, capability list, signer, sandbox policy, and last scan");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No Guidance adapter");
  });

  it("fails closed when Guidance metadata is treated as MCP server attestation proof", () => {
    const ws = workspace();
    const attestation = guidanceMetadataAttestation(ws);
    const receipt = evaluateMcpServerRiskAttestation({
      workspace: ws,
      attestation: {
        ...attestation,
        attestationSignature: "guidance-metadata-only",
        metadataOnlyAccepted: true as false
      },
      phase: "beforeExecution",
      now: "2026-06-25T17:55:00.000Z",
      observedInvocation: {
        transport: "stdio",
        capabilityId: "constrained-generation.tool.read",
        scopes: ["tool:read"],
        resources: ["workspace:prompt-policy"],
        externalSystems: [],
        dataClasses: ["prompt-policy"],
        sandboxed: true,
        networkPolicy: "none",
        host: ""
      }
    });

    expect(receipt.allowed).toBe(false);
    expect(receipt.reasons).toEqual(expect.arrayContaining([
      "mcp-server-attestation:metadata-only:not-accepted",
      "mcp-server-attestation:signature:invalid"
    ]));
    expect(receipt.riskScoreImpact.scoreSignals).toContain("mcp-server-risk:med");
    expect(verifyMcpServerRiskAttestationReceipt({ workspace: ws, receipt }).valid).toBe(false);
  });

  it("continues to allow a valid generic attestation without adding Guidance-specific product code", () => {
    const ws = workspace();
    const receipt = evaluateMcpServerRiskAttestation({
      workspace: ws,
      attestation: guidanceMetadataAttestation(ws),
      phase: "beforeExecution",
      now: "2026-06-25T17:55:00.000Z",
      observedInvocation: {
        transport: "stdio",
        capabilityId: "constrained-generation.tool.read",
        scopes: ["tool:read"],
        resources: ["workspace:prompt-policy"],
        externalSystems: [],
        dataClasses: ["prompt-policy"],
        sandboxed: true,
        networkPolicy: "none",
        host: ""
      }
    });

    expect(receipt.allowed).toBe(true);
    expect(receipt.requiredEvidence).toEqual([
      "server_manifest",
      "capability_list",
      "signer_identity",
      "sandbox_policy",
      "last_scan"
    ]);
    expect(verifyMcpServerRiskAttestationReceipt({ workspace: ws, receipt })).toEqual({ valid: true, failClosedReasons: [] });
  });

  it("keeps Guidance source identifiers out of generic MCP attestation implementation files", () => {
    for (const file of IMPLEMENTATION_FILES) {
      if (!existsSync(file)) continue;
      const contents = readFileSync(file, "utf8");
      expect(contents).not.toMatch(/guidance-ai/i);
      expect(contents).not.toMatch(/guidance language/i);
      expect(contents).not.toMatch(/Guidance adapter/i);
    }
  });
});
