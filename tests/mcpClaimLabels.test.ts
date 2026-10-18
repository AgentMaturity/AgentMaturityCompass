import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { claimKindSchema, statusDimensionsSchema } from "../src/claims/eligibility/index.js";
import { getPrivateKeyPem, getPublicKeyHistory, signHexDigest } from "../src/crypto/keys.js";
import { sealedRunReportVerifies } from "../src/diagnostic/reportSeal.js";
import { getIndustryPackEntitlement } from "../src/domains/industryPackEntitlement.js";
import { getPackById } from "../src/domains/industryPacks.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { buildAgentConfig, scaffoldAgent } from "../src/fleet/registry.js";
import { computeIncidentHash, createIncidentStore, verifyIncidentSignature } from "../src/incidents/incidentStore.js";
import type { Incident } from "../src/incidents/incidentTypes.js";
import { openLedger } from "../src/ledger/ledger.js";
import { createAmcMcpServer, resetRateLimiter } from "../src/mcp/amcMcpServer.js";
import { CLAIM_KINDS_POINTER } from "../src/mcp/mcpClaimOutput.js";
import { getPublicMethodologyManifest } from "../src/methodology/publicMethodology.js";
import type { DiagnosticReport } from "../src/types.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { testIndustryPackLicence, type TestIndustryPackLicence } from "./helpers/industryPackLicence.js";

const DEFAULT_TOOL_NAMES = [
  "amc_list_agents", "amc_quickscore", "amc_get_guide", "amc_check_compliance",
  "amc_transparency_report", "amc_score_sector_pack", "amc_score_agent", "amc_list_evidence",
  "amc_query_diagnostic", "amc_get_recommendations", "amc_incident_clocks",
];
/** P1-44's industry pack tools, also listed by default; their claims are covered by tests/industryPackMcpClaims.test.ts. */
const INDUSTRY_PACK_TOOL_NAMES = ["amc_list_industry_packs", "amc_get_industry_pack", "amc_score_industry_pack", "amc_industry_station_summary"];
const AGENT_ID = "sdk-claim-agent";
const fieldsSchema = z.object({ claimKind: claimKindSchema, statusDimensions: statusDimensionsSchema, claimLabel: z.string() });
const LICENSE_ENV_KEYS = [
  "AMC_INDUSTRY_PACKS_LICENSE_KEY", "AMC_DOMAIN_PACKS_LICENSE_KEY",
  "AMC_INDUSTRY_PACKS_LICENSE_PUBLIC_KEY", "AMC_DOMAIN_PACKS_LICENSE_PUBLIC_KEY",
  "AMC_INDUSTRY_PACKS_LICENSE_PRIVATE_KEY", "AMC_DOMAIN_PACKS_LICENSE_PRIVATE_KEY",
  "AMC_INDUSTRY_PACKS_LICENSE_SECRET", "AMC_DOMAIN_PACKS_LICENSE_SECRET",
  "AMC_INDUSTRY_PACKS_LEGACY_KEY_SHA256_ALLOWLIST", "AMC_INDUSTRY_PACKS_ACTIVE", "AMC_DOMAIN_PACKS_ACTIVE",
] as const;
const roots: string[] = [];
const licences: TestIndustryPackLicence[] = [];
const connections: Array<{ client: Client; server: ReturnType<typeof createAmcMcpServer> }> = [];

beforeEach(() => {
  vi.stubEnv("AMC_A4_PREVIEW", undefined);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "p0-23-owned-sdk-fixture-passphrase");
  vi.stubEnv("AMC_VAULT_PASSPHRASE_FILE", undefined);
  for (const key of LICENSE_ENV_KEYS) vi.stubEnv(key, undefined);
  resetRateLimiter();
});

afterEach(async () => {
  const errors: unknown[] = [];
  for (const { client, server } of connections.splice(0)) {
    const closed = await Promise.allSettled([client.close(), server.close()]);
    for (const result of closed) if (result.status === "rejected") errors.push(result.reason);
  }
  for (const workspace of roots.splice(0)) {
    try {
      lockVault(workspace);
      rmSync(workspace, { recursive: true, force: true });
    } catch (error) {
      errors.push(error);
    }
  }
  for (const licence of licences.splice(0)) licence.cleanup();
  vi.unstubAllEnvs();
  resetRateLimiter();
  if (errors.length > 0) throw new AggregateError(errors, "MCP claim fixture cleanup failed");
});

function workspaceFixture(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-p0-23-mcp-claims-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, agentId: AGENT_ID, trustBoundaryMode: "isolated" });
  scaffoldAgent(workspace, buildAgentConfig({
    agentId: AGENT_ID, agentName: "Owned SDK claim fixture", role: "assistant", domain: "general",
    primaryTasks: ["fixture"], stakeholders: ["fixture-owner"], riskTier: "med", templateId: "openai",
    baseUrl: "http://127.0.0.1:1", routePrefix: "/fixture", auth: { type: "none" },
  }));
  return workspace;
}

async function connectClient(workspace: string): Promise<Client> {
  const server = createAmcMcpServer(workspace);
  const client = new Client({ name: "p0-23-claim-fixture", version: "1.0.0" });
  connections.push({ client, server });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

async function callTool(client: Client, input: Parameters<Client["callTool"]>[0]): Promise<CallToolResult> {
  return CallToolResultSchema.parse(await client.callTool(input));
}

function storedRun(workspace: string, version = "1.1.1", sealed = true): DiagnosticReport {
  const now = Date.now();
  const report: DiagnosticReport = {
    agentId: AGENT_ID,
    runId: "stored-sdk-run",
    ts: now,
    windowStartTs: now - 60_000,
    windowEndTs: now,
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.92,
    trustLabel: "HIGH TRUST",
    targetProfileId: null,
    layerScores: [{ layerName: "Resilience", avgFinalLevel: 4, confidenceWeightedFinalLevel: 4 }],
    questionScores: [],
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 1,
    evidenceTrustCoverage: { observed: 1, attested: 0, selfReported: 0 },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    methodology: { ...getPublicMethodologyManifest(), amcVersion: version },
    runSealSig: "",
    reportJsonSha256: "",
  };
  report.reportJsonSha256 = sha256Hex(canonicalize(report));
  report.runSealSig = sealed ? signHexDigest(report.reportJsonSha256, getPrivateKeyPem(workspace, "auditor")) : "unsigned";
  const file = join(getAgentPaths(workspace, report.agentId).runsDir, `${report.runId}.json`);
  writeFileSync(file, JSON.stringify(report), "utf8");
  const stored = JSON.parse(readFileSync(file, "utf8")) as DiagnosticReport;
  expect(sealedRunReportVerifies(workspace, stored as unknown as Record<string, unknown>)).toBe(sealed);
  const ledger = openLedger(workspace);
  try {
    ledger.insertRun({ run_id: stored.runId, ts: stored.ts, window_start_ts: stored.windowStartTs,
      window_end_ts: stored.windowEndTs, target_profile_id: stored.agentId, status: stored.status,
      report_json_sha256: stored.reportJsonSha256, run_seal_sig: stored.runSealSig });
  } finally {
    ledger.close();
  }
  return stored;
}

/** A licence signed by a key pinned in a temp AMC home trust list (P1-51), the only key a licence gate accepts. */
function signedEntitlement(workspace: string): void {
  const licence = testIndustryPackLicence();
  licences.push(licence);
  for (const [key, value] of Object.entries(licence.env)) vi.stubEnv(key, value);
  expect(getIndustryPackEntitlement(workspace).active).toBe(true);
}

function evidenceRows(workspace: string): { manual: string; synthetic: string } {
  const ledger = openLedger(workspace);
  try {
    ledger.startSession({ sessionId: "sdk-fixture-events", runtime: "unknown",
      binaryPath: "owned-manual-fixture", binarySha256: sha256Hex("owned manual fixture") });
    const append = (synthetic: boolean) => ledger.appendEvidence({
      sessionId: "sdk-fixture-events", runtime: "unknown", eventType: "audit", inline: true,
      payload: "Owned test fixture; no agent behavior was observed.",
      meta: { source: "manual", trustTier: "SELF_REPORTED", ...(synthetic ? { claimKind: "synthetic_example" } : {}) },
    });
    return { manual: append(false), synthetic: append(true) };
  } finally {
    ledger.close();
  }
}

function claimResult(result: CallToolResult) {
  expect(result.isError).not.toBe(true);
  expect(result.content).toHaveLength(2);
  const first = result.content[0];
  const label = result.content[1];
  if (first.type !== "text" || label.type !== "text") throw new Error("MCP result needs result and claim text blocks");
  expect(result.structuredContent).toBeDefined();
  const structured = result.structuredContent!;
  const kind = claimKindSchema.parse(structured.claimKind);
  const dimensions = statusDimensionsSchema.parse(structured.statusDimensions);
  expect(typeof structured.claimLabel).toBe("string");
  expect(label.text).toBe(`${structured.claimLabel}\n${CLAIM_KINDS_POINTER}`);
  expect(first.text + label.text).not.toMatch(/certified/i);
  return { text: first.text, structured, kind, dimensions };
}

function allFiveAnswers() {
  const pack = getPackById("clinical-trials")!;
  return { packId: pack.id, responses: Object.fromEntries(pack.questions.map((question) => [question.id, 5])) };
}

function incidentFixture(workspace: string): string {
  const ledger = openLedger(workspace);
  try {
    const store = createIncidentStore(ledger.db);
    store.initTables();
    const now = Date.now();
    const base: Omit<Incident, "incident_hash" | "signature"> = {
      incidentId: "p0-23-owned-incident", agentId: AGENT_ID, severity: "WARN", state: "OPEN",
      title: "Owned MCP clock fixture", description: "A manual fixture with no submitted notices or claimed applicability.",
      triggerType: "MANUAL", triggerId: "p0-23-manual-trigger", rootCauseClaimIds: [], affectedQuestionIds: [],
      causalEdges: [], timelineEventIds: [], createdTs: now, updatedTs: now, resolvedTs: null, postmortemRef: null,
      prev_incident_hash: store.getLastIncidentHash(AGENT_ID),
    };
    const incident_hash = computeIncidentHash(base);
    const incident: Incident = { ...base, incident_hash,
      signature: signHexDigest(sha256Hex(canonicalize({ ...base, incident_hash })), getPrivateKeyPem(workspace, "monitor")) };
    expect(verifyIncidentSignature(workspace, incident, getPublicKeyHistory(workspace, "monitor"))).toBe(true);
    store.insertIncident(incident);
    return incident.incidentId;
  } finally {
    ledger.close();
  }
}

describe("AMC MCP claim labels through the SDK", () => {
  test("discovers the exact 15 default tools with A4 preview disabled", async () => {
    const client = await connectClient(workspaceFixture());
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([...DEFAULT_TOOL_NAMES, ...INDUSTRY_PACK_TOOL_NAMES].sort());
    expect(tools.some((tool) => tool.name.startsWith("amc_a4_"))).toBe(false);
  });

  test("a sealed 1.1.1 transparency JSON result keeps the same legacy claim in its MCP wrapper", async () => {
    const workspace = workspaceFixture();
    storedRun(workspace);
    const client = await connectClient(workspace);
    const result = await callTool(client, {
      name: "amc_transparency_report",
      arguments: { agentId: AGENT_ID, workspace, format: "json" },
    });
    expect(result.isError).not.toBe(true);
    expect(result.content).toHaveLength(2);
    const first = result.content[0];
    const label = result.content[1];
    if (first.type !== "text" || label.type !== "text") throw new Error("MCP transparency result needs JSON and claim text blocks");
    const payload = fieldsSchema.parse(JSON.parse(first.text));
    expect(payload.claimKind).toBe("self_reported");
    expect(payload.statusDimensions.result).toBe("not_evaluated");
    expect(payload.claimLabel).toContain("Claim: Legacy (1.x), self-reported");
    expect(first.text).not.toMatch(/certified/i);
    expect(result.structuredContent).toBeDefined();
    const structured = result.structuredContent!;
    claimKindSchema.parse(structured.claimKind);
    statusDimensionsSchema.parse(structured.statusDimensions);
    expect(label.text).toBe(`${structured.claimLabel}\n${CLAIM_KINDS_POINTER}`);
    expect(structured).toMatchObject({
      claimKind: payload.claimKind,
      statusDimensions: payload.statusDimensions,
      claimLabel: payload.claimLabel,
    });
  });

  test.each(DEFAULT_TOOL_NAMES.slice(0, 10))("%s returns actual canonical claim fields", async (name) => {
    const workspace = workspaceFixture();
    storedRun(workspace, "1.2.0");
    const eventIds = evidenceRows(workspace);
    signedEntitlement(workspace);
    const client = await connectClient(workspace);
    const arguments_ = name === "amc_score_sector_pack" ? allFiveAnswers()
      : { workspace, ...(["amc_list_agents", "amc_list_evidence"].includes(name) ? {} : { agentId: AGENT_ID }),
        ...(name === "amc_transparency_report" ? { format: "json" } : {}) };
    const { text, structured, kind, dimensions } = claimResult(await callTool(client, { name, arguments: arguments_ }));
    const unbound = ["amc_list_agents", "amc_list_evidence", "amc_check_compliance", "amc_score_sector_pack"].includes(name);
    expect(kind).toBe(unbound ? "self_reported" : "observed");
    expect(dimensions.result).toBe(unbound ? "not_evaluated" : "pass");
    if (name === "amc_score_sector_pack") {
      expect(text).toContain("self-reported; not a certification");
      expect(dimensions.applicability.state).toBe("unresolved");
    }
    if (name === "amc_check_compliance") expect(dimensions.applicability.state).toBe("unresolved");
    if (name === "amc_transparency_report") {
      const payload = fieldsSchema.parse(JSON.parse(text));
      expect(structured).toMatchObject({ claimKind: payload.claimKind, statusDimensions: payload.statusDimensions, claimLabel: payload.claimLabel });
    }
    if (name === "amc_list_agents") {
      const agents = z.array(fieldsSchema.extend({ agentId: z.string() })).parse(structured.agents);
      expect(agents).toHaveLength(1);
      expect(agents[0]).toMatchObject({ agentId: AGENT_ID, claimKind: "observed", statusDimensions: { result: "pass" } });
      statusDimensionsSchema.parse(agents[0].statusDimensions);
      expect(agents[0].claimLabel).toContain("Claim: Observed");
    }
    if (name === "amc_list_evidence") {
      expect(structured.events).toEqual(expect.arrayContaining([
        { id: eventIds.manual, eventType: "audit", claimKind: "self_reported" },
        { id: eventIds.synthetic, eventType: "audit", claimKind: "synthetic_example" },
      ]));
      expect(text).toContain("claim: Self-reported");
      expect(text).toContain("claim: Synthetic example (not evidence)");
    }
    if (name === "amc_query_diagnostic") expect(text).toContain("Run ID: stored-sdk-run");
  });

  test.each([true, false])("a current transparency run with checked seal %s preserves its own claim", async (sealed) => {
    const workspace = workspaceFixture();
    storedRun(workspace, "1.2.0", sealed);
    const client = await connectClient(workspace);
    const { text, structured, kind, dimensions } = claimResult(await callTool(client, {
      name: "amc_transparency_report", arguments: { agentId: AGENT_ID, workspace, format: "json" },
    }));
    expect(kind).toBe(sealed ? "observed" : "self_reported");
    expect(dimensions.result).toBe(sealed ? "pass" : "not_evaluated");
    if (!sealed) expect(dimensions.evidence).toBe("untrusted");
    const payload = fieldsSchema.parse(JSON.parse(text));
    expect(structured).toMatchObject({ claimKind: payload.claimKind, statusDimensions: payload.statusDimensions, claimLabel: payload.claimLabel });
    expect(structured.claimLabel).not.toContain("Legacy (1.x)");
  });

  test.each(["__proto__", "constructor", "toString", "hasOwnProperty"])("paid fixture refuses inherited pack ID %s", async (packId) => {
    const workspace = workspaceFixture();
    signedEntitlement(workspace);
    const client = await connectClient(workspace);
    const result = await callTool(client, { name: "amc_score_sector_pack", arguments: { packId, responses: {} } });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toContainEqual(expect.objectContaining({ type: "text", text: expect.stringContaining("Unknown sector pack") }));
  });

  test("an unpaid pack request remains an access refusal without an invented result", async () => {
    const workspace = workspaceFixture();
    expect(getIndustryPackEntitlement(workspace).active).toBe(false);
    const client = await connectClient(workspace);
    const result = await callTool(client, { name: "amc_score_sector_pack", arguments: allFiveAnswers() });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toContainEqual(expect.objectContaining({ type: "text", text: expect.stringMatching(/locked|requires active/i) }));
  });

  test.each(["amc_list_evidence", "amc_query_diagnostic"])("%s keeps an empty workspace result not evaluated", async (name) => {
    const workspace = workspaceFixture();
    const client = await connectClient(workspace);
    const { text, structured, kind, dimensions } = claimResult(await callTool(client, { name, arguments: { workspace, agentId: AGENT_ID } }));
    expect(kind).toBe("self_reported");
    expect(dimensions.result).toBe("not_evaluated");
    if (name === "amc_list_evidence") {
      expect(structured.events).toEqual([]);
      expect(text).toContain("No events in window");
    } else {
      expect(text).toContain("No diagnostic runs found");
    }
  });

  test("a missing agent response is an error, not successful claim coverage", async () => {
    const workspace = workspaceFixture();
    const client = await connectClient(workspace);
    const result = await callTool(client, { name: "amc_quickscore", arguments: { workspace, agentId: "missing-agent" } });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toContainEqual(expect.objectContaining({ type: "text", text: expect.stringMatching(/not found/i) }));
  });

  test("the incident-clock extension returns a regulated not-evaluated claim separately", async () => {
    const workspace = workspaceFixture();
    const incidentId = incidentFixture(workspace);
    const client = await connectClient(workspace);
    const { text, structured, kind, dimensions } = claimResult(await callTool(client, {
      name: "amc_incident_clocks", arguments: { workspace, incidentId, station: "health" },
    }));
    expect(kind).toBe("self_reported");
    expect(dimensions.result).toBe("not_evaluated");
    expect(dimensions.applicability.state).toBe("unresolved");
    expect(structured.incidentId).toBe(incidentId);
    expect(structured.station).toBe("health");
    expect(Array.isArray(structured.clocks)).toBe(true);
    expect(structured.events).toEqual([]);
    expect(text).toContain("AMC does not decide applicability");
    expect(text).toContain("it does not file notices");
  });
});
