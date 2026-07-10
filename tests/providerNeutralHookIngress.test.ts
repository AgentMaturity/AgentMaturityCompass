import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { getPublicKeyHistory } from "../src/crypto/keys.js";
import {
  AEP_01_SOURCE_COMMIT,
  HookIngressError,
  OBSERVED_AEP_HOOK_PATH,
  ingestObservedAepHookEvent
} from "../src/bridge/hookIngress.js";
import { startBridgeServer } from "../src/bridge/bridgeServer.js";
import { openLedger, verifyLedgerIntegrity } from "../src/ledger/ledger.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { buildAgentTimelineData } from "../src/observability/timeline.js";
import { verifyReceipt } from "../src/receipts/receipt.js";
import { loadBlobPlaintext } from "../src/storage/blobs/blobStore.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initWorkspace } from "../src/workspace.js";
import {
  generateBridgeOpenApiSpec,
  observedAepActionEventOpenApiSchema,
  observedHookReceiptOpenApiSchema
} from "../src/setup/integrationScaffold.js";
import YAML from "yaml";
import Ajv from "ajv";

const roots: string[] = [];

function newWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-hook-ingress-"));
  roots.push(workspace);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  return workspace;
}

function actionEvent(now: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    aep_version: "0.1",
    id: "evt-action-001",
    type: "action.requested",
    time: new Date(now).toISOString(),
    hook: "before-tool",
    agent: {
      slug: "provider-neutral-agent",
      display_name: "Provider Neutral Agent",
      version: "1.0.0"
    },
    session: {
      id: "session-001",
      conversation_id: "conversation-001"
    },
    user: {
      email: "operator@example.test"
    },
    workspace: {
      cwd: "/private/customer/repository"
    },
    model: {
      id: "test-model",
      provider: "test-provider"
    },
    action: {
      type: "tool_call",
      id: "action-001",
      input: {
        command: "deploy",
        api_key: "sk-super-secret-value"
      }
    },
    tool: {
      id: "tool-001",
      type: "native",
      name: "Shell"
    },
    extensions: {
      "x-test-provider": {
        private_context: "must-not-be-retained"
      }
    },
    ...overrides
  };
}

function issueHookLease(workspace: string, input: { scopes?: string; routes?: string; rpm?: number } = {}): string {
  return issueLeaseForCli({
    workspace,
    agentId: "hook-agent",
    ttl: "30m",
    scopes: input.scopes ?? "hook:observe",
    routes: input.routes ?? "/hooks",
    models: "*",
    rpm: input.rpm ?? 100,
    tpm: 100_000,
    maxCostUsdPerDay: null
  }).token;
}

async function postJson(input: {
  url: string;
  rawBody: string;
  token?: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(input.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(input.rawBody)),
        ...(input.token ? { authorization: `Bearer ${input.token}` } : {})
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolvePromise({
          status: res.statusCode ?? 0,
          body: text ? JSON.parse(text) as Record<string, unknown> : {}
        });
      });
    });
    req.on("error", rejectPromise);
    req.write(input.rawBody);
    req.end();
  });
}

function deferredPostJson(input: {
  url: string;
  rawBody: string;
  token: string;
}): {
  ready: Promise<void>;
  send: () => void;
  response: Promise<{ status: number; body: Record<string, unknown> }>;
} {
  let resolveReady!: () => void;
  let settled = false;
  const ready = new Promise<void>((resolvePromise) => {
    resolveReady = resolvePromise;
  });
  let req: ReturnType<typeof httpRequest>;
  const response = new Promise<{ status: number; body: Record<string, unknown> }>((resolvePromise, rejectPromise) => {
    req = httpRequest(input.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(input.rawBody)),
        authorization: `Bearer ${input.token}`
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        settled = true;
        const text = Buffer.concat(chunks).toString("utf8");
        resolvePromise({
          status: res.statusCode ?? 0,
          body: text ? JSON.parse(text) as Record<string, unknown> : {}
        });
      });
    });
    req.on("socket", (socket) => {
      if (socket.connecting) socket.once("connect", resolveReady);
      else resolveReady();
    });
    req.on("error", (error) => {
      if (!settled) rejectPromise(error);
    });
    req.flushHeaders();
  });
  return {
    ready,
    send: () => {
      if (!req.destroyed && !req.writableEnded) req.end(input.rawBody);
    },
    response
  };
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  const address = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!address || typeof address === "string") throw new Error("unable to allocate test port");
  return address.port;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("provider-neutral observed hook ingress", () => {
  test("writes one privacy-safe observed event and a verifiable receipt bound to raw bytes", async () => {
    const workspace = newWorkspace();
    const now = Date.parse("2026-07-10T18:00:00.000Z");
    const rawBody = JSON.stringify(actionEvent(now));

    const result = ingestObservedAepHookEvent({
      workspace,
      authenticatedAgentId: "hook-agent",
      rawBody: Buffer.from(rawBody, "utf8"),
      now
    });

    expect(result.protocol).toEqual({
      name: "aep",
      version: "0.1",
      sourceCommit: AEP_01_SOURCE_COMMIT,
      conformanceClaim: false
    });
    expect(result.observed).toBe(true);
    expect(result.sourceEventId).toBe("evt-action-001");
    expect(result.actionId).toBe("action-001");
    expect(result.rawBodySha256).toBe(sha256Hex(Buffer.from(rawBody, "utf8")));

    const ledger = openLedger(workspace);
    const events = ledger.getAllEvents();
    ledger.close();
    expect(events).toHaveLength(1);
    expect(events[0]?.event_type).toBe("tool_action");

    const stored = loadBlobPlaintext(workspace, events[0]!.payload_path!).bytes.toString("utf8");
    const metadata = JSON.parse(events[0]!.meta_json) as Record<string, unknown>;
    expect(stored).toContain('"rawStored": false');
    expect(stored).toContain('"conformanceClaim": false');
    expect(stored).toContain('"actionId": "action-001"');
    expect(stored).not.toContain("sk-super-secret-value");
    expect(stored).not.toContain("operator@example.test");
    expect(stored).not.toContain("/private/customer/repository");
    expect(stored).not.toContain("must-not-be-retained");
    expect(JSON.stringify(metadata)).not.toContain("sk-super-secret-value");
    expect(metadata).toMatchObject({
      trustTier: "OBSERVED",
      agentId: "hook-agent",
      sourceProtocol: "aep",
      sourceProtocolVersion: "0.1",
      sourceProtocolCommit: AEP_01_SOURCE_COMMIT,
      sourceConformanceClaim: false,
      sourceEventId: "evt-action-001",
      sourceEventType: "action.requested",
      actionId: "action-001",
      rawBodySha256: result.rawBodySha256,
      rawPayloadStored: false,
      projectionRedacted: true
    });

    const receipt = verifyReceipt(result.receipt, getPublicKeyHistory(workspace, "monitor"));
    expect(receipt.ok).toBe(true);
    expect(receipt.payload?.body_sha256).toBe(events[0]!.payload_sha256);
    expect(receipt.payload?.receipt_id).toBe(result.receiptId);
    const integrity = await verifyLedgerIntegrity(workspace);
    expect(integrity.errors).toEqual([]);
    expect(integrity.ok).toBe(true);

    const timeline = buildAgentTimelineData({ workspace, agentId: "hook-agent" });
    expect(timeline.evidenceSeries).toContainEqual(expect.objectContaining({
      eventId: result.eventId,
      eventType: "tool_action",
      trustTier: "OBSERVED"
    }));
  });

  test("hashes arbitrary error text instead of retaining sensitive free text", () => {
    const workspace = newWorkspace();
    const now = Date.parse("2026-07-10T18:00:00.000Z");
    const sensitiveMessage = "operator@example.test password=hunter2 SSN 123-45-6789 /private/customer/repository";
    const event = actionEvent(now, {
      id: "evt-private-error",
      type: "action.failed",
      action: {
        type: "tool_call",
        id: "action-private-error",
        status: "failure",
        error: { code: "E_PRIVATE", message: sensitiveMessage }
      }
    });

    ingestObservedAepHookEvent({
      workspace,
      authenticatedAgentId: "hook-agent",
      rawBody: Buffer.from(JSON.stringify(event)),
      now
    });

    const ledger = openLedger(workspace);
    const storedEvent = ledger.getAllEvents()[0]!;
    ledger.close();
    const stored = loadBlobPlaintext(workspace, storedEvent.payload_path!).bytes.toString("utf8");
    expect(stored).not.toContain(sensitiveMessage);
    expect(stored).not.toContain("operator@example.test");
    expect(stored).not.toContain("123-45-6789");
    expect(stored).not.toContain("/private/customer/repository");
    const projection = JSON.parse(stored) as { action: Record<string, unknown>; privacy: { omittedFields: string[] } };
    expect(projection.action).not.toHaveProperty("errorMessage");
    expect(projection.action.errorMessageSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(projection.privacy.omittedFields).toContain("action.error.message");
  });

  test.each([
    ["action.requested", "tool_action"],
    ["action.completed", "tool_result"],
    ["action.failed", "tool_result"],
    ["action.denied", "tool_result"]
  ])("maps the pinned %s subset into existing ledger evidence", (sourceType, evidenceType) => {
    const workspace = newWorkspace();
    const now = Date.parse("2026-07-10T18:00:00.000Z");
    const event = actionEvent(now, {
      id: `evt-${sourceType}`,
      type: sourceType,
      action: {
        type: "tool_call",
        id: `action-${sourceType}`,
        ...(sourceType === "action.completed" ? { status: "success", output: { ok: true } } : {}),
        ...(sourceType === "action.failed" ? { status: "failure", error: { code: "E_TEST", message: "failed" } } : {}),
        ...(sourceType === "action.denied" ? { status: "cancelled" } : {})
      },
      ...(sourceType === "action.denied" ? { decision: { outcome: "denied" } } : {})
    });
    const result = ingestObservedAepHookEvent({
      workspace,
      authenticatedAgentId: "hook-agent",
      rawBody: Buffer.from(JSON.stringify(event)),
      now
    });
    expect(result.evidenceType).toBe(evidenceType);
  });

  test("recovers the original receipt for an exact retry and rejects a conflicting replay", () => {
    const workspace = newWorkspace();
    const now = Date.parse("2026-07-10T18:00:00.000Z");
    const rawBody = Buffer.from(JSON.stringify(actionEvent(now)));
    const accepted = ingestObservedAepHookEvent({ workspace, authenticatedAgentId: "hook-agent", rawBody, now });

    const interrupted = openLedger(workspace);
    // Reconstruct the durable post-commit/pre-seal state that a process interruption can leave behind.
    interrupted.db.exec("DROP TRIGGER protect_sessions_sealed_immutable");
    interrupted.db.prepare(
      "UPDATE sessions SET ended_ts = NULL, session_final_event_hash = NULL, session_seal_sig = NULL WHERE session_id = ?"
    ).run(accepted.sessionId);
    interrupted.close();

    const recovered = ingestObservedAepHookEvent({ workspace, authenticatedAgentId: "hook-agent", rawBody, now });
    expect(recovered.receipt).toBe(accepted.receipt);
    expect(recovered.receiptId).toBe(accepted.receiptId);
    expect((recovered as ObservedReplayResult).idempotentReplay).toBe(true);

    const conflict = Buffer.from(JSON.stringify(actionEvent(now, {
      action: { type: "tool_call", id: "action-001", input: { command: "different" } }
    })));
    expect(() => ingestObservedAepHookEvent({
      workspace,
      authenticatedAgentId: "hook-agent",
      rawBody: conflict,
      now
    })).toThrowError(expect.objectContaining<Partial<HookIngressError>>({ code: "HOOK_EVENT_REPLAY" }));

    const ledger = openLedger(workspace);
    expect(ledger.getAllEvents()).toHaveLength(1);
    ledger.close();
  });

  test("rejects exact-retry recovery when receipt metadata or its source pin was tampered", () => {
    const now = Date.parse("2026-07-10T18:00:00.000Z");
    for (const mutate of [
      (meta: Record<string, unknown>) => {
        meta.receipt = "forged-receipt";
        meta.receipt_sha256 = "0".repeat(64);
      },
      (meta: Record<string, unknown>) => {
        meta.sourceProtocolCommit = "0".repeat(40);
      }
    ]) {
      const workspace = newWorkspace();
      const rawBody = Buffer.from(JSON.stringify(actionEvent(now)));
      const accepted = ingestObservedAepHookEvent({ workspace, authenticatedAgentId: "hook-agent", rawBody, now });
      const ledger = openLedger(workspace);
      const event = ledger.getAllEvents()[0]!;
      const metadata = JSON.parse(event.meta_json) as Record<string, unknown>;
      mutate(metadata);
      ledger.db.exec("DROP TRIGGER protect_evidence_immutable");
      ledger.db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(JSON.stringify(metadata), accepted.eventId);
      ledger.close();

      expect(() => ingestObservedAepHookEvent({
        workspace,
        authenticatedAgentId: "hook-agent",
        rawBody,
        now
      })).toThrowError(expect.objectContaining<Partial<HookIngressError>>({
        code: "HOOK_LEDGER_UNAVAILABLE",
        statusCode: 503
      }));
    }
  });

  test("rejects exact retry and full integrity verification after encrypted payload tampering", async () => {
    const workspace = newWorkspace();
    const now = Date.parse("2026-07-10T18:00:00.000Z");
    const rawBody = Buffer.from(JSON.stringify(actionEvent(now)));
    ingestObservedAepHookEvent({ workspace, authenticatedAgentId: "hook-agent", rawBody, now });
    const ledger = openLedger(workspace);
    const event = ledger.getAllEvents()[0]!;
    ledger.close();
    const blobPath = join(workspace, event.payload_path!);
    const tampered = Buffer.from(readFileSync(blobPath));
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff;
    writeFileSync(blobPath, tampered);

    const integrity = await verifyLedgerIntegrity(workspace);
    expect(integrity.ok).toBe(false);
    expect(integrity.errors.join("\n")).toMatch(/payload.*(?:authentication|integrity|hash)/i);
    expect(() => ingestObservedAepHookEvent({
      workspace,
      authenticatedAgentId: "hook-agent",
      rawBody,
      now
    })).toThrowError(expect.objectContaining<Partial<HookIngressError>>({
      code: "HOOK_LEDGER_UNAVAILABLE",
      statusCode: 503
    }));
  });

  test("rejects forged archive or pruning state without signed retention proof", async () => {
    const archiveWorkspace = newWorkspace();
    const archiveNow = Date.parse("2026-07-10T18:00:00.000Z");
    const archiveBody = Buffer.from(JSON.stringify(actionEvent(archiveNow)));
    const archiveAccepted = ingestObservedAepHookEvent({
      workspace: archiveWorkspace,
      authenticatedAgentId: "hook-agent",
      rawBody: archiveBody,
      now: archiveNow
    });
    const archiveLedger = openLedger(archiveWorkspace);
    archiveLedger.db.prepare(
      `UPDATE evidence_events
       SET archived = 1,
           archive_segment_id = 'forged-segment',
           archive_manifest_sha256 = ?
       WHERE id = ?`
    ).run("0".repeat(64), archiveAccepted.eventId);
    archiveLedger.close();
    const archiveIntegrity = await verifyLedgerIntegrity(archiveWorkspace);
    expect(archiveIntegrity.ok).toBe(false);
    expect(archiveIntegrity.errors.join("\n")).toMatch(/retention|archive/i);
    expect(() => ingestObservedAepHookEvent({
      workspace: archiveWorkspace,
      authenticatedAgentId: "hook-agent",
      rawBody: archiveBody,
      now: archiveNow
    })).toThrowError(expect.objectContaining<Partial<HookIngressError>>({
      code: "HOOK_LEDGER_UNAVAILABLE",
      statusCode: 503
    }));

    const workspace = newWorkspace();
    const now = Date.parse("2026-07-10T18:00:00.000Z");
    const rawBody = Buffer.from(JSON.stringify(actionEvent(now)));
    const accepted = ingestObservedAepHookEvent({ workspace, authenticatedAgentId: "hook-agent", rawBody, now });
    const ledger = openLedger(workspace);
    const event = ledger.getAllEvents()[0]!;
    ledger.db.prepare(
      `UPDATE evidence_events
       SET archived = 1,
           archive_segment_id = 'forged-segment',
           archive_manifest_sha256 = ?,
           payload_path = NULL,
           payload_inline = NULL,
           payload_pruned = 1,
           payload_pruned_ts = ?
       WHERE id = ?`
    ).run("0".repeat(64), now, accepted.eventId);
    ledger.close();
    rmSync(join(workspace, event.payload_path!));

    const integrity = await verifyLedgerIntegrity(workspace);
    expect(integrity.ok).toBe(false);
    expect(integrity.errors.join("\n")).toMatch(/retention|archive|prun/i);
    expect(() => ingestObservedAepHookEvent({
      workspace,
      authenticatedAgentId: "hook-agent",
      rawBody,
      now
    })).toThrowError(expect.objectContaining<Partial<HookIngressError>>({
      code: "HOOK_LEDGER_UNAVAILABLE",
      statusCode: 503
    }));
  });

  test("bounds retry payload verification to the target while full verification audits history", async () => {
    const workspace = newWorkspace();
    const historical = openLedger(workspace);
    historical.startSession({
      sessionId: "historical-session",
      runtime: "unknown",
      binaryPath: "amc",
      binarySha256: "amc"
    });
    historical.appendEvidenceBatch(
      Array.from({ length: 128 }, (_, index) => ({
        id: `historical-${index}`,
        ts: Date.now() - 10_000 + index,
        sessionId: "historical-session",
        runtime: "unknown" as const,
        eventType: "stdout" as const,
        payload: Buffer.alloc(32 * 1024, index % 251),
        inline: false,
        meta: { index }
      })),
      { autoLink: false }
    );
    historical.sealSession("historical-session");
    const historicalBlob = historical.getAllEvents()[0]!.payload_path!;
    historical.close();

    const now = Date.parse("2026-07-10T18:00:00.000Z");
    const rawBody = Buffer.from(JSON.stringify(actionEvent(now)));
    const accepted = ingestObservedAepHookEvent({ workspace, authenticatedAgentId: "hook-agent", rawBody, now });
    const corrupted = Buffer.from(readFileSync(join(workspace, historicalBlob)));
    corrupted[corrupted.length - 1] = corrupted[corrupted.length - 1]! ^ 0xff;
    writeFileSync(join(workspace, historicalBlob), corrupted);

    const replay = ingestObservedAepHookEvent({ workspace, authenticatedAgentId: "hook-agent", rawBody, now });
    expect(replay.eventId).toBe(accepted.eventId);
    expect((replay as ObservedReplayResult).idempotentReplay).toBe(true);

    const integrity = await verifyLedgerIntegrity(workspace);
    expect(integrity.ok).toBe(false);
    expect(integrity.errors.join("\n")).toMatch(/payload.*authentication/i);
  });

  test("rejects exact retry when any event in its hash-chain prefix was tampered", () => {
    const workspace = newWorkspace();
    const now = Date.parse("2026-07-10T18:00:00.000Z");
    ingestObservedAepHookEvent({
      workspace,
      authenticatedAgentId: "hook-agent",
      rawBody: Buffer.from(JSON.stringify(actionEvent(now))),
      now
    });
    const secondBody = Buffer.from(JSON.stringify(actionEvent(now, {
      id: "evt-action-002",
      action: { type: "tool_call", id: "action-002" }
    })));
    ingestObservedAepHookEvent({ workspace, authenticatedAgentId: "hook-agent", rawBody: secondBody, now });

    const ledger = openLedger(workspace);
    const first = ledger.getAllEvents()[0]!;
    const metadata = JSON.parse(first.meta_json) as Record<string, unknown>;
    metadata.claimedAgentSlug = "tampered-agent";
    ledger.db.exec("DROP TRIGGER protect_evidence_immutable");
    ledger.db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(JSON.stringify(metadata), first.id);
    ledger.close();

    expect(() => ingestObservedAepHookEvent({
      workspace,
      authenticatedAgentId: "hook-agent",
      rawBody: secondBody,
      now
    })).toThrowError(expect.objectContaining<Partial<HookIngressError>>({
      code: "HOOK_LEDGER_UNAVAILABLE",
      statusCode: 503
    }));
  });

  test("rejects exact retry when a predecessor writer signature was tampered", () => {
    const workspace = newWorkspace();
    const now = Date.parse("2026-07-10T18:00:00.000Z");
    ingestObservedAepHookEvent({
      workspace,
      authenticatedAgentId: "hook-agent",
      rawBody: Buffer.from(JSON.stringify(actionEvent(now))),
      now
    });
    const secondBody = Buffer.from(JSON.stringify(actionEvent(now, {
      id: "evt-action-002",
      action: { type: "tool_call", id: "action-002" }
    })));
    ingestObservedAepHookEvent({ workspace, authenticatedAgentId: "hook-agent", rawBody: secondBody, now });

    const ledger = openLedger(workspace);
    const first = ledger.getAllEvents()[0]!;
    ledger.db.exec("DROP TRIGGER protect_evidence_immutable");
    ledger.db.prepare("UPDATE evidence_events SET writer_sig = ? WHERE id = ?").run("forged-signature", first.id);
    ledger.close();

    expect(() => ingestObservedAepHookEvent({
      workspace,
      authenticatedAgentId: "hook-agent",
      rawBody: secondBody,
      now
    })).toThrowError(expect.objectContaining<Partial<HookIngressError>>({
      code: "HOOK_LEDGER_UNAVAILABLE",
      statusCode: 503
    }));
  });

  test("enforces pinned denied and cancelled-failure lifecycle semantics", () => {
    const workspace = newWorkspace();
    const now = Date.parse("2026-07-10T18:00:00.000Z");
    for (const decision of [undefined, { outcome: "approved" }]) {
      const denied = actionEvent(now, {
        id: `evt-denied-${decision ? "approved" : "missing"}`,
        type: "action.denied",
        action: { type: "tool_call", id: "action-denied", status: "cancelled" },
        ...(decision ? { decision } : {})
      });
      expect(() => ingestObservedAepHookEvent({
        workspace,
        authenticatedAgentId: "hook-agent",
        rawBody: Buffer.from(JSON.stringify(denied)),
        now
      })).toThrowError(expect.objectContaining<Partial<HookIngressError>>({ code: "HOOK_SCHEMA_INVALID" }));
    }

    const cancelled = actionEvent(now, {
      id: "evt-failed-cancelled",
      type: "action.failed",
      action: { type: "tool_call", id: "action-failed-cancelled", status: "cancelled" }
    });
    expect(ingestObservedAepHookEvent({
      workspace,
      authenticatedAgentId: "hook-agent",
      rawBody: Buffer.from(JSON.stringify(cancelled)),
      now
    }).sourceEventType).toBe("action.failed");
  });

  test.each([
    ["unknown protocol version", { aep_version: "1.0" }, "HOOK_SCHEMA_INVALID"],
    ["unsupported event type", { type: "model.response" }, "HOOK_SCHEMA_INVALID"],
    ["missing stable action id", { action: { type: "tool_call" } }, "HOOK_SCHEMA_INVALID"],
    ["tool action without a tool", { tool: undefined }, "HOOK_SCHEMA_INVALID"],
    ["future timestamp", { time: "2026-07-10T18:06:00.000Z" }, "HOOK_EVENT_FUTURE"],
    ["stale timestamp", { time: "2026-07-09T17:59:59.000Z" }, "HOOK_EVENT_STALE"]
  ])("fails closed for %s", (_label, overrides, expectedCode) => {
    const workspace = newWorkspace();
    const now = Date.parse("2026-07-10T18:00:00.000Z");
    const rawBody = Buffer.from(JSON.stringify(actionEvent(now, overrides as Record<string, unknown>)));
    expect(() => ingestObservedAepHookEvent({
      workspace,
      authenticatedAgentId: "hook-agent",
      rawBody,
      now
    })).toThrowError(expect.objectContaining<Partial<HookIngressError>>({ code: expectedCode }));
  });

  test("rejects duplicate JSON keys and oversized payloads before persistence", () => {
    const workspace = newWorkspace();
    const now = Date.parse("2026-07-10T18:00:00.000Z");
    const valid = JSON.stringify(actionEvent(now));
    const duplicate = valid.replace('"aep_version":"0.1"', '"aep_version":"0.1","aep_version":"0.1"');
    expect(() => ingestObservedAepHookEvent({
      workspace,
      authenticatedAgentId: "hook-agent",
      rawBody: Buffer.from(duplicate),
      now
    })).toThrowError(expect.objectContaining<Partial<HookIngressError>>({ code: "HOOK_JSON_AMBIGUOUS" }));

    expect(() => ingestObservedAepHookEvent({
      workspace,
      authenticatedAgentId: "hook-agent",
      rawBody: Buffer.alloc(262_145, 0x20),
      now
    })).toThrowError(expect.objectContaining<Partial<HookIngressError>>({ code: "HOOK_PAYLOAD_TOO_LARGE" }));

    const ledger = openLedger(workspace);
    expect(ledger.getAllEvents()).toHaveLength(0);
    ledger.close();
  });

  test("requires the dedicated hook scope and route before HTTP body parsing", async () => {
    const workspace = newWorkspace();
    const port = await freePort();
    const bridge = await startBridgeServer({
      workspace,
      host: "127.0.0.1",
      port,
      gatewayBaseUrl: "http://127.0.0.1:1"
    });
    const url = `http://127.0.0.1:${port}${OBSERVED_AEP_HOOK_PATH}`;
    try {
      const intentionallyInvalidBody = "not-json";
      const missing = await postJson({ url, rawBody: intentionallyInvalidBody });
      expect(missing.status).toBe(401);
      expect(missing.body.error).toBe("missing lease token");

      const wrongScope = await postJson({
        url,
        rawBody: intentionallyInvalidBody,
        token: issueHookLease(workspace, { scopes: "gateway:llm" })
      });
      expect(wrongScope.status).toBe(403);
      expect(wrongScope.body.error).toContain("hook:observe");

      const wrongRoute = await postJson({
        url,
        rawBody: intentionallyInvalidBody,
        token: issueHookLease(workspace, { routes: "/openai" })
      });
      expect(wrongRoute.status).toBe(403);
      expect(wrongRoute.body.error).toBe("lease route denied");

      const ledger = openLedger(workspace);
      expect(ledger.getAllEvents()).toHaveLength(0);
      ledger.close();
    } finally {
      await bridge.close();
    }
  });

  test("accepts a valid event over HTTP and returns its original receipt for an exact retry", async () => {
    const workspace = newWorkspace();
    const port = await freePort();
    const bridge = await startBridgeServer({
      workspace,
      host: "127.0.0.1",
      port,
      gatewayBaseUrl: "http://127.0.0.1:1"
    });
    const url = `http://127.0.0.1:${port}${OBSERVED_AEP_HOOK_PATH}`;
    const token = issueHookLease(workspace);
    const rawBody = JSON.stringify(actionEvent(Date.now()));
    try {
      const accepted = await postJson({ url, rawBody, token });
      expect(accepted.status).toBe(201);
      expect(accepted.body).toMatchObject({
        ok: true,
        observed: true,
        conformanceClaim: false,
        sourceEventId: "evt-action-001",
        actionId: "action-001"
      });
      expect(typeof accepted.body.receipt).toBe("string");

      const replay = await postJson({ url, rawBody, token });
      expect(replay.status).toBe(200);
      expect(replay.body).toMatchObject({
        ok: true,
        idempotentReplay: true,
        eventId: accepted.body.eventId,
        receipt: accepted.body.receipt,
        receiptId: accepted.body.receiptId
      });

      const ledger = openLedger(workspace);
      expect(ledger.getAllEvents()).toHaveLength(1);
      ledger.close();
    } finally {
      await bridge.close();
    }
  });

  test("serializes concurrent duplicate delivery into one stored event and one recoverable receipt", async () => {
    const workspace = newWorkspace();
    const port = await freePort();
    const bridge = await startBridgeServer({
      workspace,
      host: "127.0.0.1",
      port,
      gatewayBaseUrl: "http://127.0.0.1:1"
    });
    const url = `http://127.0.0.1:${port}${OBSERVED_AEP_HOOK_PATH}`;
    const token = issueHookLease(workspace);
    const rawBody = JSON.stringify(actionEvent(Date.now()));
    try {
      const responses = await Promise.all([
        postJson({ url, rawBody, token }),
        postJson({ url, rawBody, token })
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
      expect(new Set(responses.map((response) => response.body.receipt)).size).toBe(1);

      const ledger = openLedger(workspace);
      expect(ledger.getAllEvents()).toHaveLength(1);
      ledger.close();
      const integrity = await verifyLedgerIntegrity(workspace);
      expect(integrity.errors).toEqual([]);
      expect(integrity.ok).toBe(true);
    } finally {
      await bridge.close();
    }
  });

  test("accepts requested and completed events for one stable action without reopening a sealed session", () => {
    const workspace = newWorkspace();
    const now = Date.parse("2026-07-10T18:00:00.000Z");
    const requested = ingestObservedAepHookEvent({
      workspace,
      authenticatedAgentId: "hook-agent",
      rawBody: Buffer.from(JSON.stringify(actionEvent(now))),
      now
    });
    const completed = ingestObservedAepHookEvent({
      workspace,
      authenticatedAgentId: "hook-agent",
      rawBody: Buffer.from(JSON.stringify(actionEvent(now, {
        id: "evt-action-002",
        type: "action.completed",
        action: { type: "tool_call", id: "action-001", status: "success", output: { ok: true } }
      }))),
      now
    });

    expect(requested.actionId).toBe("action-001");
    expect(completed.actionId).toBe("action-001");
    expect(requested.sessionId).not.toBe(completed.sessionId);
    const ledger = openLedger(workspace);
    expect(ledger.getAllEvents().map((event) => event.event_type)).toEqual(["tool_action", "tool_result"]);
    ledger.close();
  });

  test("honors the signed lease request budget before persisting another event", async () => {
    const workspace = newWorkspace();
    const port = await freePort();
    const bridge = await startBridgeServer({
      workspace,
      host: "127.0.0.1",
      port,
      gatewayBaseUrl: "http://127.0.0.1:1"
    });
    const url = `http://127.0.0.1:${port}${OBSERVED_AEP_HOOK_PATH}`;
    const token = issueHookLease(workspace, { rpm: 1 });
    try {
      const first = await postJson({
        url,
        rawBody: JSON.stringify(actionEvent(Date.now())),
        token
      });
      expect(first.status).toBe(201);

      const second = await postJson({
        url,
        rawBody: JSON.stringify(actionEvent(Date.now(), {
          id: "evt-action-002",
          action: { type: "tool_call", id: "action-002", input: { command: "test" } }
        })),
        token
      });
      expect(second.status).toBe(429);
      expect(second.body).toEqual({ error: "hook lease rate limit exceeded" });

      const ledger = openLedger(workspace);
      expect(ledger.getAllEvents()).toHaveLength(1);
      ledger.close();
    } finally {
      await bridge.close();
    }
  });

  test("atomically enforces one signed request across concurrent in-flight bodies", async () => {
    const workspace = newWorkspace();
    const port = await freePort();
    const bridge = await startBridgeServer({
      workspace,
      host: "127.0.0.1",
      port,
      gatewayBaseUrl: "http://127.0.0.1:1"
    });
    const url = `http://127.0.0.1:${port}${OBSERVED_AEP_HOOK_PATH}`;
    const token = issueHookLease(workspace, { rpm: 1 });
    const requests = Array.from({ length: 8 }, (_, index) => deferredPostJson({
      url,
      token,
      rawBody: JSON.stringify(actionEvent(Date.now(), {
        id: `evt-concurrent-${index}`,
        action: { type: "tool_call", id: `action-concurrent-${index}` },
        tool: { id: "tool-001", type: "native", name: "Shell" }
      }))
    }));
    try {
      await Promise.all(requests.map((entry) => entry.ready));
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      for (const entry of requests) entry.send();
      const responses = await Promise.all(requests.map((entry) => entry.response));
      expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
      expect(responses.filter((response) => response.status === 429)).toHaveLength(7);

      const ledger = openLedger(workspace);
      expect(ledger.getAllEvents()).toHaveLength(1);
      ledger.close();
    } finally {
      for (const entry of requests) entry.send();
      await bridge.close();
    }
  });

  test("fails closed without terminating Bridge when the quota ledger is unavailable", async () => {
    const workspace = newWorkspace();
    const ledger = openLedger(workspace);
    ledger.db.pragma("query_only = ON");
    ledger.close();
    const port = await freePort();
    const bridge = await startBridgeServer({
      workspace,
      host: "127.0.0.1",
      port,
      gatewayBaseUrl: "http://127.0.0.1:1"
    });
    const url = `http://127.0.0.1:${port}${OBSERVED_AEP_HOOK_PATH}`;
    try {
      const response = await postJson({
        url,
        token: issueHookLease(workspace),
        rawBody: JSON.stringify(actionEvent(Date.now()))
      });
      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: "hook quota ledger unavailable" });

      const health = await fetch(`http://127.0.0.1:${port}/bridge/health`);
      expect(health.status).toBe(200);
    } finally {
      await bridge.close();
    }
  });

  test("publishes the observed-subset and non-conformance boundary in both OpenAPI contracts and docs", () => {
    const generated = generateBridgeOpenApiSpec();
    const route = generated.paths[OBSERVED_AEP_HOOK_PATH] as Record<string, any>;
    expect(generated.info.version).toBe("1.1.0");
    expect(route.post.security).toEqual([{ leaseToken: [] }]);
    expect(route.post.description).toContain("does not claim AEP conformance");
    expect(generated.components.securitySchemes).toHaveProperty("leaseToken");
    expect(route.post.responses).toHaveProperty("200");
    expect(route.post.responses).toHaveProperty("201");
    expect(route.post.responses).toHaveProperty("409");
    expect(route.post.responses).toHaveProperty("429");
    expect(route.post.responses).toHaveProperty("503");
    expect(generated.components.schemas).toHaveProperty("ObservedAepActionEvent");
    expect(generated.components.schemas).toHaveProperty("ObservedHookReceipt");
    const generatedRequestSchema = generated.components.schemas.ObservedAepActionEvent as Record<string, any>;
    expect(generatedRequestSchema.allOf).toHaveLength(3);
    expect(generatedRequestSchema.oneOf).toHaveLength(4);
    const conditionalRules = JSON.stringify({ allOf: generatedRequestSchema.allOf, oneOf: generatedRequestSchema.oneOf });
    for (const requiredValue of ["tool_call", "skill_use", "mcp", "action.completed", "action.failed", "action.denied", "cancelled", "decision", "denied"]) {
      expect(conditionalRules).toContain(requiredValue);
    }
    const generatedReceiptSchema = generated.components.schemas.ObservedHookReceipt as Record<string, any>;
    expect(generatedReceiptSchema).toEqual(observedHookReceiptOpenApiSchema());
    expect(generatedReceiptSchema.required).toEqual(expect.arrayContaining([
      "sourceEventType",
      "evidenceType",
      "sessionId",
      "idempotentReplay"
    ]));
    expect(generatedReceiptSchema.additionalProperties).toBe(false);
    expect(generatedReceiptSchema.properties.protocol.required).toEqual([
      "name",
      "version",
      "sourceCommit",
      "conformanceClaim"
    ]);
    expect(generatedReceiptSchema.properties.protocol.additionalProperties).toBe(false);

    const publicSpec = YAML.parse(readFileSync("website/openapi.yaml", "utf8")) as Record<string, any>;
    expect(publicSpec.paths).toHaveProperty(OBSERVED_AEP_HOOK_PATH);
    expect(publicSpec.paths[OBSERVED_AEP_HOOK_PATH].post.security).toEqual([{ leaseToken: [] }]);
    expect(publicSpec.components.securitySchemes).toHaveProperty("leaseToken");
    const publicSchemaRef = publicSpec.components.schemas.ObservedAepActionEvent.$ref as string;
    expect(publicSchemaRef).toBe("./schemas/observed-aep-action-event-0.1.schema.json");
    const publicSchema = JSON.parse(readFileSync("website/schemas/observed-aep-action-event-0.1.schema.json", "utf8"));
    expect(publicSchema).toEqual(observedAepActionEventOpenApiSchema("openapi-3.0"));
    expect(publicSchema.properties.extensions.propertyNames.pattern).toBe("^x-[a-z0-9][a-z0-9._-]*$");
    const validatePublicEvent = new Ajv({ strict: true, validateFormats: false }).compile(publicSchema);
    const schemaEvent = actionEvent(Date.now());
    expect(validatePublicEvent({ ...schemaEvent, type: "action.denied", decision: undefined })).toBe(false);
    expect(validatePublicEvent({ ...schemaEvent, type: "action.denied", decision: { outcome: "approved" } })).toBe(false);
    expect(validatePublicEvent({ ...schemaEvent, type: "action.denied", decision: { outcome: "denied" } })).toBe(true);
    expect(validatePublicEvent({
      ...schemaEvent,
      type: "action.failed",
      action: { type: "tool_call", id: "action-schema", status: "cancelled" }
    })).toBe(true);
    expect(validatePublicEvent({ ...schemaEvent, tool: undefined })).toBe(false);
    expect(validatePublicEvent({
      ...schemaEvent,
      action: { type: "skill_use", id: "action-schema" },
      tool: undefined,
      skill: undefined
    })).toBe(false);
    expect(validatePublicEvent({
      ...schemaEvent,
      tool: { type: "mcp", name: "MCP" },
      server: undefined
    })).toBe(false);
    const publicReceiptRef = publicSpec.components.schemas.ObservedHookReceipt.$ref as string;
    expect(publicReceiptRef).toBe("./schemas/observed-hook-receipt.schema.json");
    const publicReceipt = JSON.parse(readFileSync("website/schemas/observed-hook-receipt.schema.json", "utf8"));
    expect(publicReceipt).toEqual(observedHookReceiptOpenApiSchema());

    const apiDocs = readFileSync("docs/API_SURFACES.md", "utf8");
    const sdkDocs = readFileSync("docs/SDK.md", "utf8");
    const sourceReview = readFileSync("docs/source-reviews/AMC-1462-provider-neutral-hook-ingress.md", "utf8");
    for (const doc of [apiDocs, sdkDocs, sourceReview]) {
      expect(doc).toContain(OBSERVED_AEP_HOOK_PATH);
      expect(doc).toContain(AEP_01_SOURCE_COMMIT);
      expect(doc).toMatch(/does not claim|no AEP conformance claim|not claim AEP conformance/i);
    }
  });
});

type ObservedReplayResult = ReturnType<typeof ingestObservedAepHookEvent> & { idempotentReplay: boolean };
