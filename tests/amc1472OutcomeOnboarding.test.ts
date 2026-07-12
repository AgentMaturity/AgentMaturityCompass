import { spawnSync } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { initAdaptersConfig, setAgentAdapterProfile, adaptersConfigPath } from "../src/adapters/adapterConfigStore.js";
import { ingestObservedAepHookEvent } from "../src/bridge/hookIngress.js";
import { hashBinaryOrPath, openLedger } from "../src/ledger/ledger.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import {
  projectOnboardingActivation,
  renderOnboardingActivationText,
} from "../src/setup/onboardingActivation.js";
import { generateFullOpenApiSpec } from "../src/studio/openapi.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { createOnboardingState, saveOnboardingState } from "../src/setup/onboardingState.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
let sequence = 0;

function newWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-1472-onboarding-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "amc-1472-test-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

function appendReceiptEvent(input: {
  workspace: string;
  agentId: string;
  eventType: "llm_request" | "tool_action" | "audit";
  meta: Record<string, unknown>;
  receiptKind: "llm_request" | "tool_action" | "guard_check";
  payload?: Record<string, unknown>;
}): { eventId: string; payloadPath: string | null } {
  sequence += 1;
  const ledger = openLedger(input.workspace);
  const sessionId = `amc-1472-session-${sequence}`;
  ledger.startSession({
    sessionId,
    runtime: input.eventType === "llm_request" ? "gateway" : "unknown",
    binaryPath: "amc-1472-test",
    binarySha256: hashBinaryOrPath("amc-1472-test", "1"),
  });
  const body = JSON.stringify(input.payload ?? { secret: "must-never-leave-evidence" });
  const bodySha256 = sha256Hex(body);
  const appended = ledger.appendEvidenceWithReceipt({
    sessionId,
    runtime: input.eventType === "llm_request" ? "gateway" : "unknown",
    eventType: input.eventType,
    payload: body,
    payloadExt: "json",
    meta: {
      trustTier: "OBSERVED",
      agentId: input.agentId,
      bodySha256,
      ...input.meta,
    },
    receipt: {
      kind: input.receiptKind,
      agentId: input.agentId,
      providerId: input.eventType === "llm_request" ? "openai" : "toolhub",
      model: null,
      bodySha256,
    },
  });
  ledger.sealSession(sessionId);
  const row = ledger.getEventById(appended.id);
  ledger.close();
  return { eventId: appended.id, payloadPath: row?.payload_path ?? null };
}

function appendMetadataOnlyRequest(
  workspace: string,
  agentId: string,
  trustTier: "OBSERVED" | "SELF_REPORTED" = "OBSERVED",
): string {
  sequence += 1;
  const ledger = openLedger(workspace);
  const sessionId = `amc-1472-metadata-${sequence}`;
  ledger.startSession({
    sessionId,
    runtime: "gateway",
    binaryPath: "amc-1472-test",
    binarySha256: hashBinaryOrPath("amc-1472-test", "1"),
  });
  const eventId = ledger.appendEvidence({
    sessionId,
    runtime: "gateway",
    eventType: "llm_request",
    payload: JSON.stringify({ metadataOnly: true }),
    payloadExt: "json",
    meta: { trustTier, agentId },
  });
  ledger.sealSession(sessionId);
  ledger.close();
  return eventId;
}

function appendHookRequest(workspace: string, agentId: string, actionId: string): string {
  sequence += 1;
  const now = Date.now() + sequence;
  return ingestObservedAepHookEvent({
    workspace,
    authenticatedAgentId: agentId,
    now,
    rawBody: Buffer.from(JSON.stringify({
      aep_version: "0.1",
      id: `amc-1472-source-${sequence}`,
      type: "action.requested",
      time: new Date(now).toISOString(),
      hook: "PreToolUse",
      agent: { slug: agentId, surface: "claude-code" },
      action: { type: "tool_call", id: actionId },
      tool: { type: "native", name: "Read", original_name: "Read" },
    }), "utf8"),
  }).eventId;
}

function appendHookDecision(workspace: string, agentId: string, actionId: string): string {
  const providerResponse = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: "verified test decision",
    },
  };
  return appendReceiptEvent({
    workspace,
    agentId,
    eventType: "audit",
    receiptKind: "guard_check",
    meta: {
      controlSchemaVersion: 1,
      provider: "claude-code",
      actionId,
      decision: "allow",
      rawPayloadStored: false,
      providerResponse,
      providerResponseSha256: sha256Hex(JSON.stringify(providerResponse)),
    },
  }).eventId;
}

function appendToolAction(workspace: string, agentId: string): string {
  return appendReceiptEvent({
    workspace,
    agentId,
    eventType: "tool_action",
    receiptKind: "tool_action",
    meta: {
      requestedMode: "EXECUTE",
      effectiveMode: "SIMULATE",
      actionClass: "WRITE_HIGH",
      approvalId: null,
    },
  }).eventId;
}

function ledgerEventCount(workspace: string): number {
  const ledger = openLedger(workspace);
  const count = ledger.getAllEvents().length;
  ledger.close();
  return count;
}

async function freePort(): Promise<number> {
  const server = createServer((_req, res) => res.end("ok"));
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test server address");
  const port = address.port;
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  return port;
}

async function getJson(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const request = httpRequest(url, {
      method: "GET",
      headers,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => resolvePromise({
        status: response.statusCode ?? 0,
        body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown,
      }));
    });
    request.on("error", rejectPromise);
    request.end();
  });
}

afterEach(() => {
  process.exitCode = undefined;
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("AMC-1472 outcome-based onboarding", () => {
  test("keeps configuration readiness distinct from verified runtime completion", () => {
    const workspace = newWorkspace();
    const empty = projectOnboardingActivation({ workspace, agentId: "default" });
    expect(empty).toEqual(expect.objectContaining({
      schemaVersion: "2026-07-11",
      agentId: "default",
      status: "NOT_STARTED",
      progress: { completed: 0, total: 4, percent: 0 },
    }));
    expect(empty.milestones.map((row) => row.id)).toEqual([
      "connected_agent",
      "observed_action",
      "control_decision",
      "signed_proof",
    ]);
    expect(empty.milestones.every((row) => row.status === "WAITING")).toBe(true);

    initAdaptersConfig(workspace);
    setAgentAdapterProfile(workspace, "default", {
      preferredAdapter: "generic-cli",
      preferredProviderRoute: "/openai",
      preferredModel: "gpt-test",
      runMode: "SUPERVISE",
      leaseScopes: ["gateway:llm"],
      routeAllowlist: ["/openai"],
      modelAllowlist: ["*"],
    });
    const before = ledgerEventCount(workspace);
    const ready = projectOnboardingActivation({ workspace, agentId: "default" });
    expect(ledgerEventCount(workspace)).toBe(before);
    expect(ready.status).toBe("IN_PROGRESS");
    expect(ready.progress.completed).toBe(0);
    expect(ready.milestones[0]).toEqual(expect.objectContaining({ status: "READY", evidence: null }));
    expect(ready.claimBoundary).toMatch(/configuration.*cannot complete/i);
  });

  test("uses a verified gateway request for connection and first observed action only", () => {
    const workspace = newWorkspace();
    const { eventId } = appendReceiptEvent({
      workspace,
      agentId: "gateway-agent",
      eventType: "llm_request",
      receiptKind: "llm_request",
      meta: { request_id: "req-private-1472", providerId: "openai" },
    });
    const activation = projectOnboardingActivation({ workspace, agentId: "gateway-agent" });
    expect(activation.status).toBe("IN_PROGRESS");
    expect(activation.progress.completed).toBe(2);
    expect(activation.milestones[0]).toEqual(expect.objectContaining({ status: "COMPLETE" }));
    expect(activation.milestones[1]).toEqual(expect.objectContaining({
      status: "COMPLETE",
      evidence: expect.objectContaining({ eventId, source: "gateway", eventType: "llm_request" }),
    }));
    expect(activation.milestones[2].status).toBe("WAITING");
    expect(activation.milestones[3].status).toBe("WAITING");
    expect(JSON.stringify(activation)).not.toMatch(/req-private|must-never|prompt|toolName|lease|secret/i);
  });

  test("completes the journey from one verified hook request and bound control decision", () => {
    const workspace = newWorkspace();
    const agentId = "hook-agent";
    const actionId = "action_amc_1472";
    appendHookRequest(workspace, agentId, actionId);
    const decisionEventId = appendHookDecision(workspace, agentId, actionId);

    const activation = projectOnboardingActivation({ workspace, agentId });
    expect(activation.status).toBe("COMPLETE");
    expect(activation.progress).toEqual({ completed: 4, total: 4, percent: 100 });
    expect(activation.milestones[2]).toEqual(expect.objectContaining({
      status: "COMPLETE",
      evidence: expect.objectContaining({ eventId: decisionEventId, source: "hook_control" }),
    }));
    expect(activation.milestones[3].evidence).toEqual(activation.milestones[2].evidence);
    expect(activation.milestones[3].evidence?.studioPath).toMatch(/^\/console\/evidence\?agent=hook-agent&receipt=/);
  });

  test("treats a verified ToolHub effective-mode action as action, decision, and proof", () => {
    const workspace = newWorkspace();
    const eventId = appendToolAction(workspace, "toolhub-agent");
    const activation = projectOnboardingActivation({ workspace, agentId: "toolhub-agent" });
    expect(activation.status).toBe("COMPLETE");
    expect(activation.progress.completed).toBe(4);
    expect(activation.milestones[1].evidence).toEqual(expect.objectContaining({ eventId, source: "toolhub" }));
    expect(activation.milestones[2].evidence).toEqual(expect.objectContaining({ eventId, source: "toolhub" }));
  });

  test("isolates agents and fails closed on metadata-only evidence", () => {
    const workspace = newWorkspace();
    appendToolAction(workspace, "agent-b");
    const isolated = projectOnboardingActivation({ workspace, agentId: "agent-a" });
    expect(isolated.progress.completed).toBe(0);
    expect(JSON.stringify(isolated)).not.toContain("agent-b");

    appendMetadataOnlyRequest(workspace, "agent-b", "SELF_REPORTED");
    const malformedOtherAgent = projectOnboardingActivation({ workspace, agentId: "agent-a" });
    expect(malformedOtherAgent.integrity.valid).toBe(true);
    expect(malformedOtherAgent.progress.completed).toBe(0);

    appendMetadataOnlyRequest(workspace, "agent-a");
    const blocked = projectOnboardingActivation({ workspace, agentId: "agent-a" });
    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.integrity.valid).toBe(false);
    expect(blocked.integrity.reasonCodes).toContain("EVIDENCE_RECEIPT_INVALID");
    expect(blocked.progress.completed).toBe(0);
  });

  test("fails closed on ledger payload tamper and invalid signed adapter state", () => {
    const workspace = newWorkspace();
    const appended = appendReceiptEvent({
      workspace,
      agentId: "tamper-agent",
      eventType: "llm_request",
      receiptKind: "llm_request",
      meta: { request_id: "tamper-request" },
    });
    expect(appended.payloadPath).toBeTruthy();
    writeFileSync(join(workspace, appended.payloadPath!), "tampered", "utf8");
    const tamperedEvidence = projectOnboardingActivation({ workspace, agentId: "tamper-agent" });
    expect(tamperedEvidence.status).toBe("BLOCKED");
    expect(tamperedEvidence.integrity.reasonCodes).toContain("EVIDENCE_CHAIN_INVALID");

    const configWorkspace = newWorkspace();
    initAdaptersConfig(configWorkspace);
    writeFileSync(adaptersConfigPath(configWorkspace), "version: tampered\n", "utf8");
    const tamperedConfig = projectOnboardingActivation({ workspace: configWorkspace, agentId: "default" });
    expect(tamperedConfig.status).toBe("BLOCKED");
    expect(tamperedConfig.integrity.reasonCodes).toContain("ADAPTER_CONFIG_INVALID");

    const corruptWorkspace = mkdtempSync(join(tmpdir(), "amc-1472-corrupt-ledger-"));
    roots.push(corruptWorkspace);
    mkdirSync(join(corruptWorkspace, ".amc"), { recursive: true });
    writeFileSync(join(corruptWorkspace, ".amc", "evidence.sqlite"), "not-a-sqlite-database", "utf8");
    const corruptLedger = projectOnboardingActivation({ workspace: corruptWorkspace, agentId: "default" });
    expect(corruptLedger.status).toBe("BLOCKED");
    expect(corruptLedger.integrity.reasonCodes).toContain("EVIDENCE_CHAIN_INVALID");
  });

  test("renders one bounded next action without exposing evidence payloads", () => {
    const workspace = newWorkspace();
    appendReceiptEvent({
      workspace,
      agentId: "text-agent",
      eventType: "llm_request",
      receiptKind: "llm_request",
      meta: { request_id: "private-request-id" },
    });
    const activation = projectOnboardingActivation({ workspace, agentId: "text-agent" });
    const text = renderOnboardingActivationText(activation);
    expect(text).toContain("Activation 2/4");
    expect(text).toContain("First control decision");
    expect(text).toContain("Next:");
    expect(text).not.toMatch(/private-request-id|must-never-leave-evidence|secret/i);
  });

  test("exposes the same projection through a pure CLI status path", () => {
    const workspace = newWorkspace();
    appendToolAction(workspace, "cli-agent");
    const before = ledgerEventCount(workspace);
    const result = spawnSync(process.execPath, [
      resolve(process.cwd(), "dist", "cli.js"),
      "connect",
      "--status",
      "--agent",
      "cli-agent",
      "--json",
    ], {
      cwd: workspace,
      encoding: "utf8",
      env: { ...process.env, AMC_VAULT_PASSPHRASE: "amc-1472-test-passphrase", NO_COLOR: "1" },
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual(projectOnboardingActivation({ workspace, agentId: "cli-agent" }));
    expect(ledgerEventCount(workspace)).toBe(before);
    expect(result.stdout).not.toMatch(/AMC_LEASE|leaseToken|must-never|secret/i);
  });

  test("serves Studio parity and keeps setup state separate from activation", async () => {
    const workspace = newWorkspace();
    appendToolAction(workspace, "default");
    saveOnboardingState(workspace, createOnboardingState({
      workspace,
      agentId: "other-agent",
      mode: "studio",
      status: "complete",
    }));
    const token = "amc-1472-studio-token";
    const studio = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port: await freePort(),
      token,
    });
    try {
      const response = await getJson(`${studio.url}/onboarding/status`, { "x-amc-admin-token": token });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        state: expect.objectContaining({ agentId: "default", status: "not_started", steps: expect.any(Array) }),
        activation: projectOnboardingActivation({ workspace, agentId: "default" }),
      });
      const responseBody = response.body as any;
      expect(responseBody.state).not.toHaveProperty("workspace");
      expect(responseBody.state.refs).toEqual(expect.objectContaining({
        runId: null,
        reportReady: false,
        lifecycleReady: false,
        episodeReady: false,
        studioEvidenceReady: false,
      }));
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(workspace);
      expect(serialized).not.toMatch(/must-never|toolName|rawPayload|leaseToken|secret/i);

      const lease = issueLeaseForCli({
        workspace,
        agentId: "default",
        ttl: "5m",
        scopes: "gateway:llm",
        routes: "/openai",
        models: "*",
        rpm: 10,
        tpm: 1000,
      }).token;
      const own = await getJson(`${studio.url}/onboarding/status?agentId=default`, { "x-amc-lease": lease });
      expect(own.status).toBe(200);
      const crossAgent = await getJson(`${studio.url}/onboarding/status?agentId=other-agent`, { "x-amc-lease": lease });
      expect(crossAgent.status).toBe(403);
      const invalidAgent = await getJson(`${studio.url}/onboarding/status?agentId=%21%21%21`, { "x-amc-admin-token": token });
      expect(invalidAgent.status).toBe(400);
    } finally {
      await studio.close();
    }
  });

  test("publishes Studio UI, OpenAPI, docs, and no-bloat boundaries", () => {
    const generated = generateFullOpenApiSpec() as any;
    const published = YAML.parse(readFileSync("website/openapi.yaml", "utf8")) as any;
    for (const spec of [generated, published]) {
      expect(spec.paths["/onboarding/status"].get.responses["200"]).toBeDefined();
      expect(spec.components.schemas.OnboardingActivation.properties.progress).toBeDefined();
      expect(spec.components.schemas.OnboardingActivationMilestone.properties.status.enum).toEqual([
        "WAITING",
        "READY",
        "COMPLETE",
        "BLOCKED",
      ]);
      expect(spec.components.schemas.OnboardingSetupDetail.properties).not.toHaveProperty("workspace");
      expect(spec.components.schemas.OnboardingStatusResponse.properties.state.$ref)
        .toBe("#/components/schemas/OnboardingSetupDetail");
    }
    const studioSource = readFileSync("src/console/assets/app.js", "utf8");
    expect(studioSource).toContain("Activation path");
    expect(studioSource).toContain("activation?.milestones");
    expect(studioSource).toContain("refresh activation");
    expect(studioSource).toContain("1,163 CLI paths");
    const worker = readFileSync("src/console/assets/sw.js", "utf8");
    expect(worker).toContain('const CACHE_NAME = "amc-console-v6"');
    expect(worker).toContain('if (!url.pathname.includes("/assets/"))');
    expect(worker.indexOf("fetch(req)")).toBeLessThan(worker.lastIndexOf("caches.match(req)"));
    expect(readFileSync("src/console/pages/home.html", "utf8")).toContain("?v=20260711a");
    for (const page of readdirSync("src/console/pages").filter((name) => name.endsWith(".html"))) {
      const html = readFileSync(join("src/console/pages", page), "utf8");
      expect(html, page).not.toContain("20260710b");
      if (html.includes("./assets/styles.css?v=")) expect(html, page).toContain("?v=20260711a");
      if (html.includes("./assets/app.js?v=")) expect(html, page).toContain("?v=20260711a");
    }

    const docs = readFileSync("docs/GETTING_STARTED.md", "utf8");
    const homepage = readFileSync("website/index.html", "utf8");
    const review = readFileSync("docs/source-reviews/AMC-1472-outcome-based-onboarding.md", "utf8");
    const competitive = readFileSync("docs/internal/agent-control-agentapprove-competitive-response.md", "utf8");
    expect(docs).toContain("amc connect --status --agent");
    expect(homepage).toContain("amc connect --status");
    expect(homepage).toContain("READY setup is not COMPLETE");
    expect(review).toMatch(/No onboarding event store|metadata-only.*fail/i);
    expect(competitive).toContain("Shipped in AMC-1472");
  });
});
