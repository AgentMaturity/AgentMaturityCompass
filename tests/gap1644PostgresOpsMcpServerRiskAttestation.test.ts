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

const DOC = "docs/source-reviews/GAP-1644-postgresql-ops-mcp-server-risk-attestation.md";
const SOURCE_REPO = "https://github.com/call518/MCP-PostgreSQL-Ops";
const SOURCE_API = "https://api.github.com/repos/call518/MCP-PostgreSQL-Ops";
const SOURCE_README = "https://raw.githubusercontent.com/call518/MCP-PostgreSQL-Ops/main/README.md";
const SOURCE_CONTENTS = "https://api.github.com/repos/call518/MCP-PostgreSQL-Ops/contents?ref=main";
const SOURCE_HOMEPAGE = "https://deepwiki.com/call518/MCP-PostgreSQL-Ops";
const IMPLEMENTATION_FILES = [
  "src/mcp/mcpServerRiskAttestation.ts",
  "src/toolhub/toolSchemaContracts.ts",
  "src/toolhub/toolhubServer.ts",
  "src/passport/passportSchema.ts"
];

const roots: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-gap1644-mcp-attestation-"));
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

function signedPostgresOpsAttestation(ws: string) {
  return createSignedMcpServerRiskAttestation({
    workspace: ws,
    attestationId: "mcp-attest-postgres-ops-prod-1",
    serverManifest: {
      serverId: "postgres-ops-mcp",
      serverName: "PostgreSQL operations MCP",
      serverVersion: "1.4.0",
      transports: ["streamable-http", "stdio"],
      packageRef: "mcp-server-postgresql-ops@1.4.0",
      capabilities: [
        {
          capabilityId: "postgres.performance.read",
          title: "Read PostgreSQL performance diagnostics",
          riskTier: "high",
          scopes: ["postgres:read:performance"],
          resources: ["postgres:cluster"],
          externalSystems: ["postgres-primary"],
          dataClasses: ["database-metadata", "query-statistics"],
          sideEffects: ["read_only"]
        },
        {
          capabilityId: "postgres.bloat.read",
          title: "Read PostgreSQL table bloat diagnostics",
          riskTier: "high",
          scopes: ["postgres:read:bloat"],
          resources: ["postgres:cluster"],
          externalSystems: ["postgres-primary"],
          dataClasses: ["database-metadata"],
          sideEffects: ["read_only"]
        }
      ],
      dataAccess: ["database-metadata", "query-statistics"],
      networkReach: ["postgres-primary"],
      sourceCitations: [
        {
          sourceId: "github-postgresql-ops-mcp",
          title: "call518/MCP-PostgreSQL-Ops",
          url: SOURCE_REPO,
          retrievedAt: "2026-06-25T17:10:00.000Z"
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
      isolation: "container",
      networkPolicy: "allowlisted",
      allowedHosts: ["postgres-primary"],
      filesystemPolicy: "none",
      secretsPolicy: "vault-brokered"
    },
    lastScan: {
      scanId: "scan-postgres-ops-2026-06-25",
      scanner: "amc-mcp-scan",
      scannedAt: "2026-06-25T17:00:00.000Z",
      result: "pass",
      findings: [
        {
          findingId: "finding-low-docs",
          severity: "low",
          status: "mitigated",
          title: "Documentation-only startup note"
        }
      ]
    }
  });
}

describe("GAP-1644 PostgreSQL Ops MCP server risk attestation", () => {
  it("documents live PostgreSQL Ops source metadata, relevance, and no-bloat boundaries", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");

    expect(doc).toContain("GAP-1644");
    expect(doc).toContain("tool-mcp-risk-attestation");
    expect(doc).toContain(SOURCE_REPO);
    expect(doc).toContain(SOURCE_API);
    expect(doc).toContain(SOURCE_README);
    expect(doc).toContain(SOURCE_CONTENTS);
    expect(doc).toContain(SOURCE_HOMEPAGE);
    expect(doc).toContain("MIT");
    expect(doc).toContain("30+ tools");
    expect(doc).toContain("read-only operations");
    expect(doc).toContain("performance analysis");
    expect(doc).toContain("bloat detection");
    expect(doc).toContain("Server manifest, capability list, signer, sandbox policy, and last scan");
    expect(doc).toContain("metadata-only");
    expect(doc).toContain("No MCP-PostgreSQL-Ops adapter");
  });

  it("accepts signed MCP server attestations with manifest, capabilities, signer, sandbox policy, last scan, and score signals", () => {
    const ws = workspace();
    const attestation = signedPostgresOpsAttestation(ws);
    const receipt = evaluateMcpServerRiskAttestation({
      workspace: ws,
      attestation,
      phase: "beforeExecution",
      now: "2026-06-25T17:05:00.000Z",
      maxScanAgeDays: 7,
      observedInvocation: {
        transport: "streamable-http",
        capabilityId: "postgres.bloat.read",
        scopes: ["postgres:read:bloat"],
        resources: ["postgres:cluster"],
        externalSystems: ["postgres-primary"],
        dataClasses: ["database-metadata"],
        sandboxed: true,
        networkPolicy: "allowlisted",
        host: "postgres-primary"
      }
    });

    expect(receipt.allowed).toBe(true);
    expect(receipt.blockBeforeExecution).toBe(false);
    expect(receipt.signatureValid).toBe(true);
    expect(receipt.requiredEvidence).toEqual([
      "server_manifest",
      "capability_list",
      "signer_identity",
      "sandbox_policy",
      "last_scan"
    ]);
    expect(receipt.riskScoreImpact).toEqual({
      baseRiskScore: 70,
      riskTier: "high",
      scorePenalty: 4,
      scoreSignals: [
        "mcp-server-risk:high",
        "mcp-server-attestation:valid",
        "mcp-server-sandbox:container",
        "mcp-server-scan:pass"
      ]
    });
    expect(verifyMcpServerRiskAttestationReceipt({ workspace: ws, receipt })).toEqual({ valid: true, failClosedReasons: [] });
  });

  it("blocks before execution when capability, scope, sandbox, host, network, or scan freshness drifts from the signed attestation", () => {
    const ws = workspace();
    const receipt = evaluateMcpServerRiskAttestation({
      workspace: ws,
      attestation: signedPostgresOpsAttestation(ws),
      phase: "beforeExecution",
      now: "2026-07-10T17:05:00.000Z",
      maxScanAgeDays: 7,
      observedInvocation: {
        transport: "streamable-http",
        capabilityId: "postgres.ddl.write",
        scopes: ["postgres:write:ddl"],
        resources: ["postgres:cluster", "postgres:schema"],
        externalSystems: ["postgres-primary", "analytics-replica"],
        dataClasses: ["database-metadata", "customer-records"],
        sandboxed: false,
        networkPolicy: "open",
        host: "analytics-replica"
      }
    });

    expect(receipt.allowed).toBe(false);
    expect(receipt.blockBeforeExecution).toBe(true);
    expect(receipt.reasons).toEqual(expect.arrayContaining([
      "mcp-server-attestation:scan:stale",
      "mcp-server-attestation:capability:not-declared:postgres.ddl.write",
      "mcp-server-attestation:scope:not-declared:postgres:write:ddl",
      "mcp-server-attestation:resource:not-declared:postgres:schema",
      "mcp-server-attestation:external-system:not-declared:analytics-replica",
      "mcp-server-attestation:data-class:not-declared:customer-records",
      "mcp-server-attestation:sandbox:required",
      "mcp-server-attestation:network-policy:open",
      "mcp-server-attestation:host:not-allowlisted:analytics-replica"
    ]));
    expect(receipt.driftFindings).toEqual(expect.arrayContaining([
      "mcp_server_scan_stale",
      "mcp_server_capability_drift",
      "mcp_server_sandbox_drift"
    ]));
    expect(receipt.riskScoreImpact.scorePenalty).toBeGreaterThan(4);
    expect(verifyMcpServerRiskAttestationReceipt({ workspace: ws, receipt })).toEqual({ valid: true, failClosedReasons: [] });
  });

  it("fails closed when PostgreSQL Ops metadata replaces signed attestation evidence", () => {
    const ws = workspace();
    const attestation = signedPostgresOpsAttestation(ws);
    const receipt = evaluateMcpServerRiskAttestation({
      workspace: ws,
      attestation: {
        ...attestation,
        attestationSignature: "metadata-only",
        metadataOnlyAccepted: true as false,
        lastScan: null
      },
      phase: "beforeExecution",
      now: "2026-06-25T17:05:00.000Z",
      observedInvocation: {
        transport: "streamable-http",
        capabilityId: "postgres.bloat.read",
        scopes: ["postgres:read:bloat"],
        resources: ["postgres:cluster"],
        externalSystems: ["postgres-primary"],
        dataClasses: ["database-metadata"],
        sandboxed: true,
        networkPolicy: "allowlisted",
        host: "postgres-primary"
      }
    });

    const tamperedReceipt = {
      ...receipt,
      requiredEvidence: [] as typeof receipt.requiredEvidence
    };

    expect(receipt.allowed).toBe(false);
    expect(receipt.reasons).toEqual(expect.arrayContaining([
      "mcp-server-attestation:metadata-only:not-accepted",
      "mcp-server-attestation:signature:invalid",
      "mcp-server-attestation:last-scan:missing"
    ]));
    expect(verifyMcpServerRiskAttestationReceipt({ workspace: ws, receipt: tamperedReceipt })).toEqual({
      valid: false,
      failClosedReasons: expect.arrayContaining([
        "mcp-server-attestation:metadata-only:not-accepted",
        "mcp-server-attestation:signature:invalid",
        "mcp-server-attestation:required-evidence:missing",
        "mcp-server-attestation:last-scan:missing",
        "mcp-server-attestation:receipt-hash:mismatch"
      ])
    });
  });

  it("keeps PostgreSQL Ops source identifiers out of generic MCP attestation implementation files", () => {
    for (const file of IMPLEMENTATION_FILES) {
      if (!existsSync(file)) continue;
      const contents = readFileSync(file, "utf8");
      expect(contents).not.toMatch(/call518/i);
      expect(contents).not.toMatch(/MCP-PostgreSQL-Ops/i);
      expect(contents).not.toMatch(/postgresql-ops/i);
    }
  });
});
