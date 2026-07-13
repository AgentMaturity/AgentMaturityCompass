import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { Readable } from "node:stream";
import { Command } from "commander";
import { afterEach, describe, expect, test, vi } from "vitest";
import { installHookIntegration } from "../src/adapters/hookIntegration.js";
import { registerHookIntegrationCommands } from "../src/adapters/hookIntegrationCli.js";
import { handleWatchRoute } from "../src/api/watchRouter.js";
import { ingestObservedAepHookEvent, type ObservedAepActionEvent } from "../src/bridge/hookIngress.js";
import { integrationsStatusCli } from "../src/integrations/integrationsCli.js";
import { hashBinaryOrPath, openLedger } from "../src/ledger/ledger.js";
import { sha256Hex } from "../src/utils/hash.js";
import { inspectHookHealth } from "../src/watch/hookHealthDiagnostics.js";
import { lockVault, vaultStatus } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";

const roots: string[] = [];
const originalCwd = process.cwd();
const originalVaultPassphrase = process.env.AMC_VAULT_PASSPHRASE;
let sequence = 0;

function newWorkspace(prefix = "amc-1480-hook-health-"): string {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

function event(input: {
  agentId: string;
  provider: "claude-code" | "gemini-cli";
  actionId: string;
  type: "action.requested" | "action.completed" | "action.failed";
  now: number;
  secret?: string;
}): ObservedAepActionEvent {
  sequence += 1;
  const status = input.type === "action.completed"
    ? "success" as const
    : input.type === "action.failed"
      ? "failure" as const
      : undefined;
  return {
    aep_version: "0.1",
    id: `source-${sequence}`,
    type: input.type,
    time: new Date(input.now).toISOString(),
    hook: input.type === "action.requested" ? "PreToolUse" : "PostToolUse",
    agent: { slug: input.agentId, surface: input.provider },
    action: {
      type: "tool_call",
      id: input.actionId,
      ...(status ? { status } : {}),
      ...(input.secret ? { input: { password: input.secret }, output: input.secret } : {}),
      ...(input.type === "action.failed" ? { error: { code: "PROVIDER_FAILURE", message: input.secret ?? "failed" } } : {}),
    },
    tool: { type: "native", name: "Read", original_name: "Read" },
  };
}

function ingest(workspace: string, input: ReturnType<typeof event>): string {
  return ingestObservedAepHookEvent({
    workspace,
    authenticatedAgentId: input.agent.slug,
    rawBody: Buffer.from(JSON.stringify(input), "utf8"),
    now: new Date(input.time).getTime(),
  }).eventId;
}

function install(workspace: string, provider: "claude-code" | "gemini-cli", agentId: string, ttl = "7d") {
  return installHookIntegration({ workspace, provider, agentId, ttl });
}

function appendMalformedMatchingHookEvent(workspace: string, agentId: string, provider: "claude-code" | "gemini-cli"): void {
  sequence += 1;
  const ledger = openLedger(workspace);
  const sessionId = `malformed-hook-session-${sequence}`;
  const payload = "{}";
  ledger.startSession({
    sessionId,
    runtime: "any",
    binaryPath: "amc-1480-test",
    binarySha256: hashBinaryOrPath("amc-1480-test", "1"),
  });
  ledger.appendEvidenceWithReceipt({
    id: `malformed-hook-event-${sequence}`,
    sessionId,
    runtime: "any",
    eventType: "tool_action",
    payload,
    payloadExt: "json",
    meta: {
      trustTier: "OBSERVED",
      agentId,
      provider,
      sourceProtocol: "aep",
      rawPayloadStored: false,
    },
    receipt: {
      kind: "tool_action",
      agentId,
      providerId: `aep:${agentId}`,
      model: null,
      bodySha256: sha256Hex(payload),
    },
  });
  ledger.sealSession(sessionId);
  ledger.close();
}

function workspaceSnapshot(workspace: string): Record<string, string> {
  const output: Record<string, string> = {};
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        walk(path);
      } else if (stat.isFile()) {
        output[relative(workspace, path)] = createHash("sha256").update(readFileSync(path)).digest("hex");
      }
    }
  };
  walk(workspace);
  return output;
}

async function callWatchRoute(
  workspace: string,
  path: string,
  method = "GET",
): Promise<{ status: number; body: unknown }> {
  const req = Readable.from([]) as unknown as IncomingMessage;
  req.method = method;
  req.url = path;
  let status = 0;
  let body = "";
  const res = {
    writeHead(code: number): void { status = code; },
    end(chunk?: string): void { body = chunk ?? ""; },
    setHeader(): void {},
  } as unknown as ServerResponse;
  const pathname = new URL(path, "http://localhost").pathname;
  expect(await handleWatchRoute(pathname, method, req, res, workspace)).toBe(true);
  return { status, body: JSON.parse(body) as unknown };
}

async function runHealthCli(workspace: string, provider: "claude-code" | "gemini-cli") {
  process.chdir(workspace);
  process.exitCode = undefined;
  const lines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => lines.push(args.map(String).join(" ")));
  const program = new Command();
  program.exitOverride();
  registerHookIntegrationCommands(program.command("connect"), () => undefined);
  await program.parseAsync(["node", "amc", "connect", "hooks", "health", "--provider", provider, "--json"]);
  const output = JSON.parse(lines.join("\n")) as Record<string, unknown>;
  vi.restoreAllMocks();
  return { output, exitCode: process.exitCode ?? 0 };
}

afterEach(() => {
  process.chdir(originalCwd);
  process.exitCode = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalVaultPassphrase === undefined) {
    delete process.env.AMC_VAULT_PASSPHRASE;
  } else {
    process.env.AMC_VAULT_PASSPHRASE = originalVaultPassphrase;
  }
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("AMC-1480 hook health and last-event diagnostics", () => {
  test("distinguishes not installed from an intact installation awaiting its first event without writing", () => {
    const workspace = newWorkspace();
    const absent = inspectHookHealth({ workspace, provider: "claude-code" });
    expect(absent).toMatchObject({
      schemaVersion: "2026-07-13",
      provider: "claude-code",
      agentId: null,
      status: "not_installed",
      failClosed: false,
      reasonCodes: ["HOOK_NOT_INSTALLED"],
      derivedDiagnostic: true,
      recorded: false,
      proofEligible: false,
    });

    install(workspace, "claude-code", "health-agent");
    const before = workspaceSnapshot(workspace);
    const waiting = inspectHookHealth({ workspace, provider: "claude-code" });
    const after = workspaceSnapshot(workspace);
    expect(waiting).toMatchObject({
      provider: "claude-code",
      agentId: "health-agent",
      mode: "observe",
      status: "awaiting_first_event",
      failClosed: false,
      reasonCodes: ["HOOK_EVENT_NOT_OBSERVED"],
      evidence: { state: "missing", eventCount: 0, lastEvent: null },
    });
    expect(before).toEqual(after);
  });

  test("returns only the latest verified provider event and privacy-safe historical context", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    install(workspace, "claude-code", "health-agent");
    ingest(workspace, event({
      agentId: "health-agent",
      provider: "gemini-cli",
      actionId: "gemini-other-provider",
      type: "action.requested",
      now: now - 3_000,
    }));
    const requested = ingest(workspace, event({
      agentId: "health-agent",
      provider: "claude-code",
      actionId: "toolu_health_01",
      type: "action.requested",
      now: now - 2_000,
      secret: "never-return-this-secret",
    }));
    const completed = ingest(workspace, event({
      agentId: "health-agent",
      provider: "claude-code",
      actionId: "toolu_health_01",
      type: "action.completed",
      now: now - 1_000,
      secret: "never-return-this-output",
    }));

    const health = inspectHookHealth({ workspace, provider: "claude-code" });
    expect(health).toMatchObject({
      status: "observed",
      failClosed: false,
      reasonCodes: [],
      installation: { state: "installed", configOwned: true, manifestValid: true, leaseValid: true },
      evidence: {
        state: "verified",
        eventCount: 2,
        lastEvent: {
          eventId: completed,
          eventType: "action.completed",
          actionId: "toolu_health_01",
          integrity: "verified",
        },
      },
    });
    expect(health.evidence.lastEvent?.eventId).not.toBe(requested);
    expect(JSON.stringify(health)).not.toMatch(/never-return|password|toolName|sessionId|payload|configPath|token|signature/i);
    expect(health.claimBoundary).toContain("historical");
    expect(health.claimBoundary).toContain("not current liveness");
  });

  test("fails closed instead of falling back when matching metadata or signed evidence is invalid", () => {
    const metadataWorkspace = newWorkspace("amc-1480-metadata-");
    const now = Date.now();
    install(metadataWorkspace, "claude-code", "metadata-agent");
    ingest(metadataWorkspace, event({
      agentId: "metadata-agent",
      provider: "claude-code",
      actionId: "toolu_valid_before_invalid",
      type: "action.requested",
      now,
    }));
    appendMalformedMatchingHookEvent(metadataWorkspace, "metadata-agent", "claude-code");
    const malformed = inspectHookHealth({ workspace: metadataWorkspace, provider: "claude-code" });
    expect(malformed).toMatchObject({
      status: "fail_closed",
      failClosed: true,
      reasonCodes: ["HOOK_EVENT_METADATA_INVALID"],
      evidence: { state: "invalid", lastEvent: null },
    });

    const tamperWorkspace = newWorkspace("amc-1480-tamper-");
    install(tamperWorkspace, "claude-code", "tamper-agent");
    const eventId = ingest(tamperWorkspace, event({
      agentId: "tamper-agent",
      provider: "claude-code",
      actionId: "toolu_tamper_health",
      type: "action.requested",
      now,
    }));
    const ledger = openLedger(tamperWorkspace);
    const stored = ledger.getEventById(eventId);
    ledger.close();
    expect(stored?.payload_path).toBeTruthy();
    writeFileSync(join(tamperWorkspace, stored!.payload_path!), "tampered", "utf8");
    const tampered = inspectHookHealth({ workspace: tamperWorkspace, provider: "claude-code" });
    expect(tampered.status).toBe("fail_closed");
    expect(tampered.reasonCodes).toContain("HOOK_EVIDENCE_INTEGRITY_FAILED");
    expect(tampered.evidence.lastEvent).toBeNull();
  });

  test("keeps drift and expiry fail closed even when historical hook evidence verifies", () => {
    const driftWorkspace = newWorkspace("amc-1480-drift-");
    const now = Date.now();
    install(driftWorkspace, "claude-code", "drift-agent");
    ingest(driftWorkspace, event({
      agentId: "drift-agent",
      provider: "claude-code",
      actionId: "toolu_before_drift",
      type: "action.requested",
      now,
    }));
    const configPath = join(driftWorkspace, ".claude", "settings.local.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    writeFileSync(configPath, `${JSON.stringify({ ...config, userChange: true }, null, 2)}\n`, "utf8");
    const drifted = inspectHookHealth({ workspace: driftWorkspace, provider: "claude-code" });
    expect(drifted).toMatchObject({ status: "fail_closed", failClosed: true });
    expect(drifted.reasonCodes).toContain("HOOK_INSTALLATION_DRIFTED");
    expect(drifted.evidence.state).toBe("verified");

    const expiryWorkspace = newWorkspace("amc-1480-expiry-");
    const installed = install(expiryWorkspace, "gemini-cli", "expiry-agent", "1m");
    ingest(expiryWorkspace, event({
      agentId: "expiry-agent",
      provider: "gemini-cli",
      actionId: "gemini_before_expiry",
      type: "action.requested",
      now,
    }));
    vi.spyOn(Date, "now").mockReturnValue((installed.lease.expiresTs ?? now) + 1);
    const expired = inspectHookHealth({ workspace: expiryWorkspace, provider: "gemini-cli" });
    expect(expired).toMatchObject({ status: "fail_closed", failClosed: true });
    expect(expired.reasonCodes).toContain("HOOK_INSTALLATION_EXPIRED");
    expect(expired.evidence.state).toBe("verified");
  });

  test("keeps CLI and Watch API byte-equivalent with stable exit classes", async () => {
    const absentWorkspace = newWorkspace("amc-1480-cli-absent-");
    const absent = await runHealthCli(absentWorkspace, "claude-code");
    expect(absent.output).toMatchObject({ status: "not_installed" });
    expect(absent.exitCode).toBe(1);

    const observedWorkspace = newWorkspace("amc-1480-cli-observed-");
    install(observedWorkspace, "claude-code", "surface-agent");
    const observedEventId = ingest(observedWorkspace, event({
      agentId: "surface-agent",
      provider: "claude-code",
      actionId: "toolu_surface_health",
      type: "action.requested",
      now: Date.now(),
    }));
    expect(inspectHookHealth({ workspace: observedWorkspace, provider: "claude-code" })).toMatchObject({
      status: "observed",
      reasonCodes: [],
    });
    expect(observedEventId).toMatch(/^hook_/);
    lockVault(observedWorkspace);
    delete process.env.AMC_VAULT_PASSPHRASE;
    const locked = inspectHookHealth({ workspace: observedWorkspace, provider: "claude-code" });
    expect(locked).toMatchObject({
      status: "fail_closed",
      reasonCodes: ["HOOK_EVIDENCE_UNAVAILABLE"],
      repairCommands: [
        "amc vault unlock",
        "amc connect hooks status --provider claude-code",
        "amc connect hooks install --provider claude-code --dry-run",
      ],
    });

    process.env.AMC_VAULT_PASSPHRASE = "amc-test-passphrase";
    const cli = await runHealthCli(observedWorkspace, "claude-code");
    expect(cli.output).toMatchObject({ status: "observed", reasonCodes: [] });
    expect(cli.exitCode).toBe(0);
    expect(vaultStatus(observedWorkspace).unlocked).toBe(true);
    const api = await callWatchRoute(observedWorkspace, "/api/v1/watch/hooks/claude-code/health");
    expect(api.status).toBe(200);
    expect(api.body).toEqual({ ok: true, data: cli.output });

    expect((await callWatchRoute(observedWorkspace, "/api/v1/watch/hooks/cursor/health")).status).toBe(400);
    expect((await callWatchRoute(observedWorkspace, "/api/v1/watch/hooks/%E0%A4%A/health")).status).toBe(400);
    expect((await callWatchRoute(observedWorkspace, "/api/v1/watch/hooks/claude-code/health", "POST")).status).toBe(405);

    const configPath = join(observedWorkspace, ".claude", "settings.local.json");
    writeFileSync(configPath, `${readFileSync(configPath, "utf8")}\n`, "utf8");
    const failed = await runHealthCli(observedWorkspace, "claude-code");
    expect(failed.output).toMatchObject({ status: "fail_closed" });
    expect(failed.exitCode).toBe(2);
  });

  test("publishes the bounded Studio and documentation surfaces without a daemon or second store", () => {
    const unconfiguredWorkspace = newWorkspace("amc-1480-studio-unconfigured-");
    const before = workspaceSnapshot(unconfiguredWorkspace);
    expect(integrationsStatusCli(unconfiguredWorkspace)).toMatchObject({
      signature: {
        valid: false,
        signatureExists: false,
        reason: "integrations config missing",
      },
      queueStats: { pending: 0, delivered: 0, deadLetter: 0 },
      queueDeadLetters: [],
      recentDeliveries: [],
      unresolvedDeadLetters: [],
      channels: [],
    });
    expect(workspaceSnapshot(unconfiguredWorkspace)).toEqual(before);

    const app = readFileSync("src/console/assets/app.js", "utf8");
    const styles = readFileSync("src/console/assets/styles.css", "utf8");
    const openApi = readFileSync("website/openapi.yaml", "utf8");
    const internalOpenApi = readFileSync("src/studio/openapi.ts", "utf8");
    const cliInventory = readFileSync("docs/CLI_COMMAND_INVENTORY.md", "utf8");
    const sourceReview = readFileSync("docs/source-reviews/AMC-1480-hook-health-diagnostics.md", "utf8");
    const ledger = readFileSync("docs/internal/agent-control-agentapprove-competitive-response.md", "utf8");

    expect(app).toContain('["claude-code", "gemini-cli"]');
    expect(app).toContain('/api/v1/watch/hooks/${provider}/health');
    expect(app).toContain("Last verified event");
    expect(app).toContain("amc integrations init");
    expect(app).toContain('disabled aria-disabled="true"');
    expect(app).not.toContain("JSON.stringify(status.status || status");
    expect(styles).toContain("button:disabled");
    expect(styles).toContain("cursor: not-allowed");
    expect(openApi).toContain("/v1/watch/hooks/{provider}/health:");
    expect(internalOpenApi).toContain("/api/v1/watch/hooks/{provider}/health");
    expect(cliInventory).toContain("amc connect hooks health");
    expect(sourceReview).toContain("not current liveness");
    expect(sourceReview).toContain("No daemon");
    expect(ledger).toContain("Implemented in AMC-1480");

    const implementation = readFileSync("src/watch/hookHealthDiagnostics.ts", "utf8");
    for (const forbidden of ["setInterval(", "setTimeout(", "CREATE TABLE", "INSERT INTO", "appendEvidence", "issueLease", "mintReceipt"]) {
      expect(implementation).not.toContain(forbidden);
    }
  });
});
