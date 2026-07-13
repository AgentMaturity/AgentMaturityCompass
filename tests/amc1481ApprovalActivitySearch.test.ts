import { createServer } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { sha256Hex } from "../src/utils/hash.js";
import {
  createApprovalRequestRecord,
  type ApprovalRequestRecord
} from "../src/approvals/approvalChainStore.js";
import {
  parseApprovalActivityQuery,
  searchApprovalActivity
} from "../src/approvals/approvalActivity.js";
import { registerApprovalCliCommands } from "../src/approvals/approvalCliCommands.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import type { ActionClass, ExecutionMode } from "../src/types.js";

const roots: string[] = [];

function newWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-1481-approval-activity-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "amc-1481-test-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initActionPolicy(workspace);
  initToolsConfig(workspace);
  initBudgets(workspace, "default");
  return workspace;
}

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

function signArtifact(workspace: string, path: string): void {
  const digest = sha256Hex(readFileSync(path));
  writeFileSync(`${path}.sig`, JSON.stringify({
    digestSha256: digest,
    signature: signHexDigest(digest, getPrivateKeyPem(workspace, "auditor")),
    signedTs: Date.now(),
    signer: "auditor"
  }, null, 2), "utf8");
}

function createRequest(params: {
  workspace: string;
  createdTs: number;
  actionClass: ActionClass;
  riskTier: "low" | "medium" | "high" | "critical";
  effectiveMode: ExecutionMode;
  status?: ApprovalRequestRecord["status"];
}): { id: string; path: string } {
  const created = createApprovalRequestRecord({
    workspace: params.workspace,
    agentId: "default",
    intentId: `intent-${params.createdTs}`,
    toolName: `private.tool.${params.createdTs}`,
    actionClass: params.actionClass,
    requestedMode: params.effectiveMode,
    effectiveMode: params.effectiveMode,
    riskTier: params.riskTier,
    requiredApprovals: 1,
    requireDistinctUsers: true,
    rolesAllowed: ["OWNER"],
    ttlMinutes: 60,
    boundHashes: {
      intentHash: "1".repeat(64),
      workOrderHash: null,
      policyHash: "2".repeat(64),
      toolsHash: "3".repeat(64),
      budgetsHash: "4".repeat(64),
      leaseConstraintsHash: "5".repeat(64)
    }
  });
  const request = JSON.parse(readFileSync(created.path, "utf8")) as ApprovalRequestRecord;
  request.createdTs = params.createdTs;
  request.expiresTs = Date.now() + 86_400_000;
  request.status = params.status ?? "PENDING";
  writeFileSync(created.path, JSON.stringify(request, null, 2), "utf8");
  signArtifact(params.workspace, created.path);
  return { id: created.request.approvalRequestId, path: created.path };
}

function contentSnapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (path: string): void => {
    for (const name of readdirSync(path)) {
      const child = join(path, name);
      const stat = statSync(child);
      if (stat.isDirectory()) {
        visit(child);
      } else if (stat.isFile()) {
        out[relative(root, child)] = sha256Hex(readFileSync(child));
      }
    }
  };
  visit(root);
  return out;
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

describe("AMC-1481 fail-closed approval activity search", () => {
  test("filters privacy-safe signed activity deterministically without writing", () => {
    const workspace = newWorkspace();
    const oldest = createRequest({
      workspace,
      createdTs: 1_700_000_000_000,
      actionClass: "DEPLOY",
      riskTier: "high",
      effectiveMode: "EXECUTE"
    });
    createRequest({
      workspace,
      createdTs: 1_700_000_100_000,
      actionClass: "READ_ONLY",
      riskTier: "low",
      effectiveMode: "SIMULATE",
      status: "CANCELLED"
    });
    const newest = createRequest({
      workspace,
      createdTs: 1_700_000_200_000,
      actionClass: "DEPLOY",
      riskTier: "high",
      effectiveMode: "EXECUTE"
    });
    const before = contentSnapshot(join(workspace, ".amc"));

    const filters = parseApprovalActivityQuery({
      status: "pending",
      actionClass: "deploy",
      riskTier: "HIGH",
      effectiveMode: "execute",
      createdAfter: "1700000000000",
      createdBefore: "2023-11-16T00:00:00.000Z",
      order: "newest",
      limit: "1"
    });
    const result = searchApprovalActivity({ workspace, agentId: "default", filters });

    expect(result).toEqual(expect.objectContaining({
      schemaVersion: "2026-07-13",
      agentId: "default",
      integrity: expect.objectContaining({ valid: true, scannedRequests: 3, trustedRequests: 3 }),
      totalMatched: 2,
      returned: 1,
      truncated: true,
      derivedView: true,
      recorded: false,
      proofEligible: false
    }));
    expect(result.requests.map((row) => row.approvalRequestId)).toEqual([newest.id]);
    expect(result.requests[0]?.contextIntegrity.valid).toBe(false);
    expect(result.filters).toEqual(expect.objectContaining({
      status: "PENDING",
      actionClass: "DEPLOY",
      riskTier: "high",
      effectiveMode: "EXECUTE",
      createdAfterTs: 1_700_000_000_000,
      order: "newest",
      limit: 1
    }));
    expect(JSON.stringify(result)).not.toMatch(/private\.tool|intent-|"(?:toolName|intentId|workOrderId|boundHashes|username|reason)":/i);
    expect(contentSnapshot(join(workspace, ".amc"))).toEqual(before);

    const byStableId = searchApprovalActivity({
      workspace,
      agentId: "default",
      filters: parseApprovalActivityQuery({ query: oldest.id.slice(-12).toUpperCase(), order: "oldest" })
    });
    expect(byStableId.requests.map((row) => row.approvalRequestId)).toEqual([oldest.id]);
  });

  test("rejects invalid filters before scanning", () => {
    expect(() => parseApprovalActivityQuery({ actionClass: "DELETE_EVERYTHING" })).toThrow(/action class/i);
    expect(() => parseApprovalActivityQuery({ riskTier: "medium-high" })).toThrow(/risk tier/i);
    expect(() => parseApprovalActivityQuery({ effectiveMode: "LIVE" })).toThrow(/mode/i);
    expect(() => parseApprovalActivityQuery({ status: "MAYBE" })).toThrow(/status/i);
    expect(() => parseApprovalActivityQuery({ createdAfter: "tomorrow-ish" })).toThrow(/timestamp/i);
    expect(() => parseApprovalActivityQuery({ createdAfter: "200", createdBefore: "100" })).toThrow(/time range/i);
    expect(() => parseApprovalActivityQuery({ limit: "0" })).toThrow(/limit/i);
    expect(() => parseApprovalActivityQuery({ limit: "201" })).toThrow(/limit/i);
    expect(() => parseApprovalActivityQuery({ query: "x".repeat(129) })).toThrow(/query/i);
  });

  test.each([
    {
      label: "invalid request signature",
      mutate: (workspace: string, request: { path: string }) => {
        writeFileSync(request.path, `${readFileSync(request.path, "utf8")}\n`, "utf8");
      },
      reason: "REQUEST_INTEGRITY_INVALID"
    },
    {
      label: "signed malformed request",
      mutate: (workspace: string, request: { path: string }) => {
        writeFileSync(request.path, "{not-json", "utf8");
        signArtifact(workspace, request.path);
      },
      reason: "REQUEST_ARTIFACT_UNPARSEABLE"
    },
    {
      label: "signed request filename mismatch",
      mutate: (workspace: string, request: { path: string }) => {
        const body = JSON.parse(readFileSync(request.path, "utf8")) as ApprovalRequestRecord;
        body.approvalRequestId = "apprreq_misbound";
        writeFileSync(request.path, JSON.stringify(body, null, 2), "utf8");
        signArtifact(workspace, request.path);
      },
      reason: "REQUEST_BINDING_INVALID"
    },
    {
      label: "signed request agent mismatch",
      mutate: (workspace: string, request: { path: string }) => {
        const body = JSON.parse(readFileSync(request.path, "utf8")) as ApprovalRequestRecord;
        body.agentId = "other-agent";
        writeFileSync(request.path, JSON.stringify(body, null, 2), "utf8");
        signArtifact(workspace, request.path);
      },
      reason: "REQUEST_AGENT_INVALID"
    }
  ])("fails closed for $label", ({ mutate, reason }) => {
    const workspace = newWorkspace();
    const request = createRequest({
      workspace,
      createdTs: 1_700_000_000_000,
      actionClass: "WRITE_HIGH",
      riskTier: "medium",
      effectiveMode: "EXECUTE"
    });
    mutate(workspace, request);

    const result = searchApprovalActivity({
      workspace,
      agentId: "default",
      filters: parseApprovalActivityQuery({ status: "PENDING" })
    });
    expect(result.integrity).toEqual(expect.objectContaining({ valid: false }));
    expect(result.integrity.reasonCodes).toContain(reason);
    expect(result.requests).toEqual([]);
    expect(result.totalMatched).toBe(0);
    expect(JSON.stringify(result)).not.toContain(request.path);
  });

  test("fails closed for orphan decision, consumption, and detached signature artifacts", () => {
    const workspace = newWorkspace();
    const request = createRequest({
      workspace,
      createdTs: 1_700_000_000_000,
      actionClass: "SECURITY",
      riskTier: "critical",
      effectiveMode: "EXECUTE"
    });
    const root = join(getAgentPaths(workspace, "default").rootDir, "approvals");
    const decisionPath = join(root, "decisions", "decision-orphan.json");
    writeFileSync(decisionPath, JSON.stringify({
      v: 1,
      approvalDecisionId: "decision-orphan",
      approvalRequestId: "apprreq_unknown",
      agentId: "default",
      userId: "user-1",
      username: "private-reviewer",
      roles: ["OWNER"],
      decision: "DENY",
      reason: "private decision reason",
      decisionTs: 1_700_000_100_000
    }, null, 2), "utf8");
    signArtifact(workspace, decisionPath);
    const consumedPath = join(root, "consumed", "apprreq_unknown.json");
    writeFileSync(consumedPath, JSON.stringify({
      v: 1,
      approvalRequestId: "apprreq_unknown",
      agentId: "default",
      consumedTs: 1_700_000_200_000,
      executionId: "private-execution",
      reason: "private consumption reason"
    }, null, 2), "utf8");
    signArtifact(workspace, consumedPath);
    writeFileSync(join(root, "requests", "apprreq_missing.json.sig"), readFileSync(`${request.path}.sig`));

    const result = searchApprovalActivity({
      workspace,
      agentId: "default",
      filters: parseApprovalActivityQuery({})
    });
    expect(result.integrity.valid).toBe(false);
    expect(result.integrity.reasonCodes).toEqual(expect.arrayContaining([
      "REQUEST_ARTIFACT_MISSING",
      "DECISION_REQUEST_UNKNOWN",
      "CONSUMPTION_REQUEST_UNKNOWN"
    ]));
    expect(result.requests).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/private-reviewer|private decision|private-execution|private consumption/);
  });

  test("fails closed for malformed or misbound decision and consumption artifacts", () => {
    const workspace = newWorkspace();
    createRequest({
      workspace,
      createdTs: 1_700_000_000_000,
      actionClass: "WRITE_HIGH",
      riskTier: "high",
      effectiveMode: "EXECUTE"
    });
    const consumedTarget = createRequest({
      workspace,
      createdTs: 1_700_000_100_000,
      actionClass: "DEPLOY",
      riskTier: "critical",
      effectiveMode: "EXECUTE"
    });
    const misboundTarget = createRequest({
      workspace,
      createdTs: 1_700_000_200_000,
      actionClass: "SECURITY",
      riskTier: "critical",
      effectiveMode: "EXECUTE"
    });
    const root = join(getAgentPaths(workspace, "default").rootDir, "approvals");
    const malformedDecision = join(root, "decisions", "apprdec_malformed.json");
    writeFileSync(malformedDecision, "{not-json", "utf8");
    signArtifact(workspace, malformedDecision);
    const unsignedDecision = join(root, "decisions", "apprdec_unsigned.json");
    writeFileSync(unsignedDecision, JSON.stringify({}), "utf8");
    const malformedConsumption = join(root, "consumed", `${consumedTarget.id}.json`);
    writeFileSync(malformedConsumption, "{not-json", "utf8");
    signArtifact(workspace, malformedConsumption);
    const misboundConsumption = join(root, "consumed", `${misboundTarget.id}.json`);
    writeFileSync(misboundConsumption, JSON.stringify({
      v: 1,
      approvalRequestId: consumedTarget.id,
      agentId: "default",
      consumedTs: 1_700_000_300_000,
      executionId: null,
      reason: "private reason"
    }, null, 2), "utf8");
    signArtifact(workspace, misboundConsumption);

    const result = searchApprovalActivity({
      workspace,
      agentId: "default",
      filters: parseApprovalActivityQuery({})
    });
    expect(result.integrity.reasonCodes).toEqual(expect.arrayContaining([
      "DECISION_ARTIFACT_UNPARSEABLE",
      "DECISION_INTEGRITY_INVALID",
      "CONSUMPTION_ARTIFACT_UNPARSEABLE",
      "CONSUMPTION_BINDING_INVALID"
    ]));
    expect(result.requests).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("private reason");
  });

  test("returns the same fail-closed projection and exit class from CLI", async () => {
    const workspace = newWorkspace();
    const request = createRequest({
      workspace,
      createdTs: 1_700_000_000_000,
      actionClass: "DEPLOY",
      riskTier: "high",
      effectiveMode: "EXECUTE"
    });
    writeFileSync(request.path, `${readFileSync(request.path, "utf8")}\n`, "utf8");
    const previousCwd = process.cwd();
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value?: unknown) => logs.push(String(value ?? "")));
    try {
      process.chdir(workspace);
      const program = new Command();
      program.exitOverride();
      registerApprovalCliCommands(program);
      await program.parseAsync(["node", "amc", "approvals", "list", "--agent", "default", "--json"]);
    } finally {
      process.chdir(previousCwd);
    }
    expect(process.exitCode).toBe(2);
    expect(JSON.parse(logs.join("\n"))).toEqual(expect.objectContaining({
      integrity: expect.objectContaining({ valid: false, reasonCodes: ["REQUEST_INTEGRITY_INVALID"] }),
      requests: []
    }));
  });

  test("keeps CLI and authenticated API on the shared projection", async () => {
    const workspace = newWorkspace();
    const request = createRequest({
      workspace,
      createdTs: 1_700_000_000_000,
      actionClass: "DEPLOY",
      riskTier: "high",
      effectiveMode: "EXECUTE"
    });
    const expected = searchApprovalActivity({
      workspace,
      agentId: "default",
      filters: parseApprovalActivityQuery({ actionClass: "DEPLOY", limit: "5" })
    });
    const token = "amc-1481-studio-token";
    const studio = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port: await freePort(),
      token
    });
    try {
      const response = await fetch(`${studio.url}/approvals/requests?agentId=default&actionClass=deploy&limit=5`, {
        headers: { "x-amc-admin-token": token }
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(expected);
      const invalid = await fetch(`${studio.url}/approvals/requests?agentId=default&limit=0`, {
        headers: { "x-amc-admin-token": token }
      });
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toEqual(expect.objectContaining({ error: expect.stringMatching(/limit/i) }));
    } finally {
      await studio.close();
    }

    const previousCwd = process.cwd();
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value?: unknown) => logs.push(String(value ?? "")));
    try {
      process.chdir(workspace);
      const program = new Command();
      program.exitOverride();
      registerApprovalCliCommands(program);
      await program.parseAsync([
        "node",
        "amc",
        "approvals",
        "list",
        "--agent",
        "default",
        "--action-class",
        "deploy",
        "--limit",
        "5",
        "--json"
      ]);
    } finally {
      process.chdir(previousCwd);
    }
    expect(JSON.parse(logs.join("\n"))).toEqual(expected);
    expect(logs.join("\n")).toContain(request.id);
  });

  test("renders bounded Studio controls and documents the privacy boundary without a new guide", () => {
    const app = readFileSync(resolve("src/console/assets/app.js"), "utf8");
    expect(app).toContain("approvalActivityQuery");
    expect(app).toContain("approvalActionClass");
    expect(app).toContain("approvalRiskTier");
    expect(app).toContain("approvalEffectiveMode");
    expect(app).toContain("approvalCreatedAfter");
    expect(app).toContain("approvalCreatedBefore");
    expect(app).toContain("approvalActivityIntegrity");
    expect(app).toMatch(/row\.status === "PENDING"[\s\S]*requestIntegrity[\s\S]*chainIntegrity/);

    const cliDocs = readFileSync(resolve("website/docs/cli.html"), "utf8");
    const approvalsDocs = readFileSync(resolve("docs/APPROVALS.md"), "utf8");
    const apiDocs = readFileSync(resolve("docs/API_SURFACES.md"), "utf8");
    expect(cliDocs).toContain("--action-class");
    expect(cliDocs).toContain("--created-after");
    expect(approvalsDocs).toContain("derivedView");
    expect(approvalsDocs).toMatch(/does not search[\s\S]*tool name/i);
    expect(apiDocs).toContain("GET /approvals/requests");
    expect(apiDocs).toContain("proofEligible");

    const competitive = readFileSync(resolve("docs/internal/agent-control-agentapprove-competitive-response.md"), "utf8");
    expect(competitive).toMatch(/\| 19 \|[^\n]*Implemented \(AMC-1481\)/);
    expect(readdirSync(resolve("website/docs")).filter((entry) => entry.toLowerCase().includes("amc-1481"))).toHaveLength(0);
  });
});
