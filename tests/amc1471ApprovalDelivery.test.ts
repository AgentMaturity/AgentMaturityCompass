import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import YAML from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { initActionPolicy } from "../src/governor/actionPolicyEngine.js";
import { initToolsConfig } from "../src/toolhub/toolhubValidators.js";
import { ToolHubService } from "../src/toolhub/toolhubServer.js";
import { initBudgets } from "../src/budgets/budgets.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { sha256Hex } from "../src/utils/hash.js";
import { setVaultSecret } from "../src/vault/vault.js";
import {
  initIntegrationsConfig,
  integrationsConfigPath,
  integrationsConfigSigPath
} from "../src/integrations/integrationStore.js";
import { verifyWebhookSignature } from "../src/integrations/webhookDelivery.js";
import {
  getApprovalInboxItem,
  listApprovalInbox,
  parseApprovalInboxStatus,
  projectApprovalInboxSummary
} from "../src/approvals/approvalInbox.js";
import {
  buildApprovalDeliveryEnvelope,
  deliverApprovalLifecycle
} from "../src/approvals/approvalDelivery.js";
import { startStudioApiServer } from "../src/studio/studioServer.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import {
  consumeApprovedExecution,
  decideApprovalForIntent,
  verifyApprovalForExecution
} from "../src/approvals/approvalEngine.js";
import { cancelApprovalRequest } from "../src/approvals/approvalChainStore.js";
import {
  authenticateUser,
  createSession,
  initUsersConfig,
  revokeSessionByToken,
  revokeUser,
  sessionFromRequest,
  setUserRoles
} from "../src/auth/authApi.js";
import { generateFullOpenApiSpec } from "../src/studio/openapi.js";
import {
  getIntegrationDeliveryStatusByQueueId,
  processIntegrationChannelQueue
} from "../src/integrations/integrationDeliveryQueue.js";
import { loadIntegrationDeliveryJournal } from "../src/integrations/integrationDeliveryStore.js";
import { loadIntegrationDeadLetters } from "../src/integrations/integrationDeadLetters.js";
import { drainDueIntegrationDeliveries } from "../src/integrations/integrationDispatcher.js";

const roots: string[] = [];

function newWorkspace(withIntegrations = true): string {
  const workspace = mkdtempSync(join(tmpdir(), "amc-1471-approval-delivery-"));
  roots.push(workspace);
  process.env.AMC_VAULT_PASSPHRASE = "amc-1471-test-passphrase";
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  initActionPolicy(workspace);
  initToolsConfig(workspace);
  initBudgets(workspace, "default");
  if (withIntegrations) {
    initIntegrationsConfig(workspace);
  }
  return workspace;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

function resignIntegrationsConfig(workspace: string): void {
  const path = integrationsConfigPath(workspace);
  const digest = sha256Hex(readFileSync(path));
  writeFileSync(
    integrationsConfigSigPath(workspace),
    JSON.stringify(
      {
        digestSha256: digest,
        signature: signHexDigest(digest, getPrivateKeyPem(workspace, "auditor")),
        signedTs: Date.now(),
        signer: "auditor"
      },
      null,
      2
    ),
    "utf8"
  );
}

function resignArtifact(workspace: string, path: string): void {
  const digest = sha256Hex(readFileSync(path));
  writeFileSync(
    `${path}.sig`,
    JSON.stringify({
      digestSha256: digest,
      signature: signHexDigest(digest, getPrivateKeyPem(workspace, "auditor")),
      signedTs: Date.now(),
      signer: "auditor"
    }),
    "utf8"
  );
}

function configureApprovalWebhook(params: {
  workspace: string;
  url: string;
  enabled?: boolean;
  routed?: boolean;
  maxRounds?: number;
}): void {
  setVaultSecret(params.workspace, "integrations/ops-webhook", "approval-delivery-test-secret");
  const path = integrationsConfigPath(params.workspace);
  const config = YAML.parse(readFileSync(path, "utf8")) as Record<string, any>;
  config.integrations.channels = [
    {
      id: "ops-webhook",
      type: "webhook",
      url: params.url,
      secretRef: "vault:integrations/ops-webhook",
      enabled: params.enabled !== false,
      delivery: {
        ordered: true,
        recordDeadLetters: true,
        maxRounds: params.maxRounds ?? 1,
        retry: {
          maxAttempts: 1,
          initialBackoffMs: 1,
          maxBackoffMs: 1,
          jitterFactor: 0,
          timeoutMs: 1_000
        }
      }
    }
  ];
  config.integrations.routing.APPROVAL_REQUEST_CREATED = params.routed === false ? [] : ["ops-webhook"];
  config.integrations.routing.APPROVAL_DECISION_RECORDED = ["ops-webhook"];
  config.integrations.routing.APPROVAL_QUORUM_MET = ["ops-webhook"];
  config.integrations.routing.APPROVAL_DENIED = ["ops-webhook"];
  config.integrations.routing.APPROVAL_CANCELLED = ["ops-webhook"];
  writeFileSync(path, YAML.stringify(config), "utf8");
  resignIntegrationsConfig(params.workspace);
}

function createProtectedIntent(workspace: string): {
  approvalRequestId: string;
  intentId: string;
} {
  const service = new ToolHubService(workspace);
  const intent = service.createIntent({
    agentId: "default",
    toolName: "process.spawn",
    args: {
      binary: "node",
      argv: ["-v"],
      secret: "must-not-leave-workspace"
    },
    requestedMode: "EXECUTE"
  });
  if (!intent.approvalRequestId) {
    throw new Error("expected approval request");
  }
  return {
    approvalRequestId: intent.approvalRequestId,
    intentId: intent.intentId
  };
}

async function listenServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<Server> {
  const server = createServer(handler);
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  return server;
}

function serverUrl(server: Server, path = "/approval"): string {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("missing server address");
  }
  return `http://127.0.0.1:${address.port}${path}`;
}

async function pickFreePort(): Promise<number> {
  const server = await listenServer((_req, res) => res.end("ok"));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("missing server address");
  }
  const port = address.port;
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  return port;
}

async function postJson(
  url: string,
  token: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string; headers: IncomingMessage["headers"] }> {
  const payload = JSON.stringify(body);
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      url,
      {
        method: "POST",
        headers: {
          "x-amc-admin-token": token,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          ...headers
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => resolvePromise({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
          headers: res.headers
        }));
      }
    );
    req.on("error", rejectPromise);
    req.write(payload);
    req.end();
  });
}

async function getJson(
  url: string,
  token: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(url, {
      method: "GET",
      headers: { "x-amc-admin-token": token, ...headers }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => resolvePromise({
        status: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    req.on("error", rejectPromise);
    req.end();
  });
}

async function runBuiltCli(workspace: string, args: string[]): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  const cliPath = join(process.cwd(), "dist", "cli.js");
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: workspace,
      env: {
        ...process.env,
        AMC_VAULT_PASSPHRASE: "amc-1471-test-passphrase",
        NO_COLOR: "1"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", rejectPromise);
    child.once("close", (code) => resolvePromise({ code: code ?? -1, stdout, stderr }));
  });
}

async function waitForApprovalSse(params: {
  url: string;
  token: string;
}): Promise<{ event: string; data: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    let req: ReturnType<typeof httpRequest> | null = null;
    let buffer = "";
    const timer = setTimeout(() => {
      req?.destroy();
      rejectPromise(new Error("timed out waiting for approval SSE"));
    }, 10_000);
    req = httpRequest(
      params.url,
      {
        method: "GET",
        headers: {
          "x-amc-admin-token": params.token,
          accept: "text/event-stream"
        }
      },
      (res) => {
        res.on("data", (chunk) => {
          buffer += chunk.toString("utf8");
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const event = part.split(/\r?\n/).find((line) => line.startsWith("event:"))?.slice(6).trim();
            const data = part.split(/\r?\n/).find((line) => line.startsWith("data:"))?.slice(5).trim();
            if (event !== "APPROVAL_REQUEST_CREATED" || !data) {
              continue;
            }
            clearTimeout(timer);
            req?.destroy();
            resolvePromise({ event, data });
            return;
          }
        });
      }
    );
    req.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code !== "ECONNRESET") {
        clearTimeout(timer);
        rejectPromise(error);
      }
    });
    req.end();
  });
}

describe("AMC-1471 privacy-safe approval delivery", () => {
  test("projects the canonical quorum store and preserves the APPROVED alias", () => {
    const workspace = newWorkspace(false);
    const created = createProtectedIntent(workspace);

    const rows = listApprovalInbox({ workspace, agentId: "default" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.request.approvalRequestId).toBe(created.approvalRequestId);
    expect(rows[0]?.status).toBe("PENDING");
    expect(rows[0]?.quorum).toEqual(expect.objectContaining({ required: 2, received: 0 }));
    expect(rows[0]?.requestIntegrity.valid).toBe(true);
    expect(getApprovalInboxItem({ workspace, agentId: "default", approvalRequestId: created.approvalRequestId })).toEqual(rows[0]);
    expect(parseApprovalInboxStatus("approved")).toBe("QUORUM_MET");
    expect(parseApprovalInboxStatus("cancelled")).toBe("CANCELLED");
    const summary = projectApprovalInboxSummary(rows[0]!);
    expect(summary).toEqual(expect.objectContaining({
      approvalRequestId: created.approvalRequestId,
      actionClass: "WRITE_HIGH",
      riskTier: "medium",
      decisionCount: 0
    }));
    expect(JSON.stringify(summary)).not.toMatch(/process\.spawn|"(?:intentId|workOrderId|boundHashes|toolName|reason)"/i);
  });

  test("delivers an HMAC-signed metadata-only envelope with signed receipt references", async () => {
    const workspace = newWorkspace();
    const captured: Array<{ body: string; headers: IncomingMessage["headers"] }> = [];
    const receiver = await listenServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on("end", () => {
        captured.push({ body: Buffer.concat(chunks).toString("utf8"), headers: req.headers });
        res.statusCode = 202;
        res.end("accepted");
      });
    });

    try {
      configureApprovalWebhook({ workspace, url: serverUrl(receiver) });
      const created = createProtectedIntent(workspace);
      const envelope = buildApprovalDeliveryEnvelope({
        workspace,
        agentId: "default",
        approvalRequestId: created.approvalRequestId,
        trigger: "REQUEST_CREATED"
      });
      const delivered = await deliverApprovalLifecycle({
        workspace,
        agentId: "default",
        approvalRequestId: created.approvalRequestId,
        trigger: "REQUEST_CREATED"
      });

      expect(delivered.status).toBe("DELIVERED");
      expect(delivered.eventName).toBe("APPROVAL_REQUEST_CREATED");
      expect(delivered.channels).toHaveLength(1);
      expect(delivered.channels[0]).toEqual(expect.objectContaining({
        channelId: "ops-webhook",
        attempts: 1,
        httpStatus: 202,
        eventId: expect.any(String),
        receiptId: expect.any(String)
      }));
      expect(delivered.evidence).toEqual(expect.objectContaining({
        eventId: expect.any(String),
        receiptId: expect.any(String)
      }));
      expect(captured).toHaveLength(1);

      const raw = captured[0]!.body;
      const parsed = JSON.parse(raw) as { agentId: string; summary: string; details: Record<string, unknown> };
      expect(parsed.agentId).toBe("approval");
      expect(parsed.summary).toBe("Approval review required");
      expect(parsed.details).toEqual(envelope);
      expect(envelope).toEqual(expect.objectContaining({
        v: 1,
        type: "AMC_APPROVAL_NOTIFICATION",
        lifecycle: "REQUEST_CREATED",
        approvalRequestId: created.approvalRequestId,
        requestDigestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        status: "PENDING",
        notificationOnly: true,
        proofEligible: false,
        reviewPath: `/console/approvals?approval=${encodeURIComponent(created.approvalRequestId)}`
      }));
      const timestamp = Number(captured[0]!.headers["x-amc-webhook-timestamp"]);
      expect(verifyWebhookSignature({
        secret: "approval-delivery-test-secret",
        payload: raw,
        timestamp,
        signature: String(captured[0]!.headers["x-amc-webhook-signature"] ?? "")
      })).toBe(true);
      expect(captured[0]!.headers["x-amc-integration-secret"]).toBeUndefined();

      const serialized = `${raw}\n${JSON.stringify(delivered)}`;
      expect(serialized).not.toContain("process.spawn");
      expect(serialized).not.toContain(created.intentId);
      expect(serialized).not.toContain("must-not-leave-workspace");
      expect(serialized).not.toContain("approval-delivery-test-secret");
      expect(serialized).not.toContain(workspace);
      expect(serialized).not.toMatch(/vault:|x-amc-admin-token|x-amc-lease|https?:\/\/127\.0\.0\.1/i);

      const persisted = [
        join(workspace, ".amc", "integration-delivery.sqlite"),
        join(workspace, ".amc", "integrations-delivery-journal.json")
      ]
        .map((path) => readFileSync(path).toString("utf8"))
        .join("\n");
      expect(persisted).not.toContain(serverUrl(receiver));
      expect(persisted).not.toContain("approval-delivery-test-secret");
      expect(persisted).not.toMatch(/ECONN|socket hang up|vault:integrations/i);
    } finally {
      await new Promise<void>((resolvePromise) => receiver.close(() => resolvePromise()));
    }
  });

  test("redacts legacy queue, journal, dead-letter, and WAL persistence in place", async () => {
    const workspace = newWorkspace();
    const receiver = await listenServer((_req, res) => {
      res.statusCode = 202;
      res.end("accepted");
    });
    const legacyUrl = "https://legacy.example.test/hook/private-canary";
    const legacySecret = "legacy-approval-secret-canary";
    const rawError = "connect ECONNREFUSED legacy-private-host";
    try {
      configureApprovalWebhook({ workspace, url: serverUrl(receiver) });
      const created = createProtectedIntent(workspace);
      await deliverApprovalLifecycle({
        workspace,
        agentId: "default",
        approvalRequestId: created.approvalRequestId,
        trigger: "REQUEST_CREATED"
      });

      const queuePath = join(workspace, ".amc", "integration-delivery.sqlite");
      const db = new Database(queuePath);
      const row = db.prepare("SELECT queue_id, delivery_receipt_json FROM integration_delivery_queue LIMIT 1").get() as {
        queue_id: string;
        delivery_receipt_json: string;
      };
      const receipt = JSON.parse(row.delivery_receipt_json) as Record<string, any>;
      receipt.url = legacyUrl;
      receipt.attempts[0].error = rawError;
      db.prepare(
        `UPDATE integration_delivery_queue
         SET destination_url = ?, destination_ref = ?, secret_ref = ?,
             extra_headers_json = ?, last_error = ?, delivery_receipt_json = ?
         WHERE queue_id = ?`
      ).run(
        legacyUrl,
        "vault:integrations/legacy-url",
        `vault:integrations/${legacySecret}`,
        JSON.stringify({ authorization: legacySecret }),
        rawError,
        JSON.stringify(receipt),
        row.queue_id
      );
      db.close();

      const journalPath = join(workspace, ".amc", "integrations-delivery-journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Record<string, any>;
      journal.receipts[0].url = legacyUrl;
      journal.receipts[0].error = rawError;
      journal.receipts[0].receipt.url = legacyUrl;
      journal.receipts[0].receipt.attempts[0].error = rawError;
      writeFileSync(journalPath, JSON.stringify(journal, null, 2), "utf8");

      const deadLetterDir = join(workspace, ".amc", "integrations");
      mkdirSync(deadLetterDir, { recursive: true });
      const deadLetterPath = join(deadLetterDir, "dead-letters.jsonl");
      writeFileSync(deadLetterPath, `${JSON.stringify({
        v: 1,
        deadLetterId: "idl_legacy",
        ts: Date.now(),
        channelId: "ops-webhook",
        eventName: "APPROVAL_REQUEST_CREATED",
        agentId: "approval",
        url: legacyUrl,
        orderedSequence: 1,
        payloadSha256: "a".repeat(64),
        attemptCount: 1,
        lastHttpStatus: null,
        reason: rawError
      })}\n`, "utf8");

      expect(getIntegrationDeliveryStatusByQueueId(workspace, row.queue_id)).toEqual(expect.objectContaining({
        lastError: "TRANSPORT_CONNECTION_REFUSED"
      }));
      loadIntegrationDeliveryJournal(workspace);
      loadIntegrationDeadLetters(workspace);

      const persistedPaths = [queuePath, journalPath, deadLetterPath, `${queuePath}-wal`]
        .filter((path) => existsSync(path));
      const persisted = persistedPaths.map((path) => readFileSync(path).toString("utf8")).join("\n");
      expect(persisted).not.toContain(legacyUrl);
      expect(persisted).not.toContain(legacySecret);
      expect(persisted).not.toContain(rawError);
      expect(persisted).not.toContain("vault:integrations/legacy-url");
    } finally {
      await new Promise<void>((resolvePromise) => receiver.close(() => resolvePromise()));
    }
  });

  test("rejects a tampered signed outbox row before a retry can reach the network", async () => {
    const workspace = newWorkspace();
    let calls = 0;
    const receiver = await listenServer((_req, res) => {
      calls += 1;
      res.statusCode = calls === 1 ? 503 : 202;
      res.end(calls === 1 ? "retry" : "accepted");
    });
    try {
      configureApprovalWebhook({
        workspace,
        url: serverUrl(receiver),
        maxRounds: 2
      });
      const created = createProtectedIntent(workspace);
      const first = await deliverApprovalLifecycle({
        workspace,
        agentId: "default",
        approvalRequestId: created.approvalRequestId,
        trigger: "REQUEST_CREATED"
      });
      expect(first.status).toBe("QUEUED");
      expect(first.reasonCode).toBe("DELIVERY_QUEUED");
      expect(first.queued).toHaveLength(1);
      expect(calls).toBe(1);

      const queuePath = join(workspace, ".amc", "integration-delivery.sqlite");
      const db = new Database(queuePath);
      const row = db.prepare(
        "SELECT queue_id FROM integration_delivery_queue WHERE state = 'PENDING' LIMIT 1"
      ).get() as { queue_id: string };
      db.prepare(
        `UPDATE integration_delivery_queue
         SET payload_body = ?, next_attempt_ts = 0
         WHERE queue_id = ?`
      ).run('{"tampered":true}', row.queue_id);
      db.close();

      const processed = await processIntegrationChannelQueue({
        workspace,
        channelId: "ops-webhook",
        deliveryPolicy: { maxAttempts: 1 }
      });
      expect(processed.processed).toEqual([
        expect.objectContaining({
          queueId: row.queue_id,
          state: "DEAD_LETTER",
          lastError: "DELIVERY_QUEUE_BINDING_INVALID"
        })
      ]);
      expect(calls).toBe(1);
      expect(getIntegrationDeliveryStatusByQueueId(workspace, row.queue_id)).toEqual(
        expect.objectContaining({
          state: "DEAD_LETTER",
          lastError: "DELIVERY_QUEUE_BINDING_INVALID"
        })
      );
    } finally {
      await new Promise<void>((resolvePromise) => receiver.close(() => resolvePromise()));
    }
  });

  test("resumes queued delivery after restart and finalizes evidence exactly once", async () => {
    const workspace = newWorkspace();
    let calls = 0;
    const receiver = await listenServer((_req, res) => {
      calls += 1;
      res.statusCode = calls === 1 ? 503 : 202;
      res.end(calls === 1 ? "retry" : "accepted");
    });
    try {
      configureApprovalWebhook({
        workspace,
        url: serverUrl(receiver),
        maxRounds: 2
      });
      const created = createProtectedIntent(workspace);
      const first = await deliverApprovalLifecycle({
        workspace,
        agentId: "default",
        approvalRequestId: created.approvalRequestId,
        trigger: "REQUEST_CREATED"
      });
      expect(first.status).toBe("QUEUED");
      expect(first.queued).toHaveLength(1);
      expect(calls).toBe(1);

      const queued = first.queued[0]!;
      const resumed = await drainDueIntegrationDeliveries({
        workspace,
        nowTs: queued.nextAttemptTs
      });
      expect(resumed.processed).toEqual([
        expect.objectContaining({ queueId: queued.queueId, state: "DELIVERED" })
      ]);
      expect(resumed.finalizationFailures).toEqual([]);
      expect(calls).toBe(2);
      expect(getIntegrationDeliveryStatusByQueueId(workspace, queued.queueId)).toEqual(
        expect.objectContaining({ state: "DELIVERED", finalizedTs: expect.any(Number) })
      );
      expect(loadIntegrationDeliveryJournal(workspace).receipts).toHaveLength(1);

      const repeated = await drainDueIntegrationDeliveries({
        workspace,
        nowTs: queued.nextAttemptTs + 60_000
      });
      expect(repeated.processed).toEqual([]);
      expect(calls).toBe(2);
      expect(loadIntegrationDeliveryJournal(workspace).receipts).toHaveLength(1);
    } finally {
      await new Promise<void>((resolvePromise) => receiver.close(() => resolvePromise()));
    }
  });

  test("blocks tampered requests before dispatch and reports unrouted delivery honestly", async () => {
    const workspace = newWorkspace();
    let calls = 0;
    const receiver = await listenServer((_req, res) => {
      calls += 1;
      res.statusCode = 202;
      res.end("accepted");
    });

    try {
      configureApprovalWebhook({ workspace, url: serverUrl(receiver), routed: false });
      const skippedRequest = createProtectedIntent(workspace);
      const skipped = await deliverApprovalLifecycle({
        workspace,
        agentId: "default",
        approvalRequestId: skippedRequest.approvalRequestId,
        trigger: "REQUEST_CREATED"
      });
      expect(skipped.status).toBe("SKIPPED");
      expect(skipped.channels).toHaveLength(0);
      expect(skipped.skipped).toContain("no-routed-channels");
      expect(calls).toBe(0);

      configureApprovalWebhook({ workspace, url: serverUrl(receiver) });
      const tamperedRequest = createProtectedIntent(workspace);
      const requestPath = join(
        getAgentPaths(workspace, "default").rootDir,
        "approvals",
        "requests",
        `${tamperedRequest.approvalRequestId}.json`
      );
      writeFileSync(requestPath, `${readFileSync(requestPath, "utf8")}\n`, "utf8");
      const blocked = await deliverApprovalLifecycle({
        workspace,
        agentId: "default",
        approvalRequestId: tamperedRequest.approvalRequestId,
        trigger: "REQUEST_CREATED"
      });
      expect(blocked.status).toBe("BLOCKED");
      expect(blocked.reasonCode).toBe("REQUEST_INTEGRITY_INVALID");
      expect(blocked.channels).toHaveLength(0);
      expect(JSON.stringify(blocked)).not.toContain(workspace);
      expect(calls).toBe(0);
      expect(listApprovalInbox({ workspace, agentId: "default" }).some(
        (row) => row.request.approvalRequestId === tamperedRequest.approvalRequestId
      )).toBe(false);

      const decisionRequest = createProtectedIntent(workspace);
      decideApprovalForIntent({
        workspace,
        approvalId: decisionRequest.approvalRequestId,
        decision: "APPROVED",
        mode: "EXECUTE",
        reason: "first reviewer",
        userId: "owner-a",
        username: "owner-a",
        userRoles: ["OWNER"]
      });
      const decisionsDir = join(getAgentPaths(workspace, "default").rootDir, "approvals", "decisions");
      const decisionFile = readdirSync(decisionsDir).find((file) => file.endsWith(".json"));
      if (!decisionFile) throw new Error("expected decision artifact");
      const decisionPath = join(decisionsDir, decisionFile);
      writeFileSync(decisionPath, `${readFileSync(decisionPath, "utf8")}\n`, "utf8");
      const blockedDecision = await deliverApprovalLifecycle({
        workspace,
        agentId: "default",
        approvalRequestId: decisionRequest.approvalRequestId,
        trigger: "DECISION_RECORDED"
      });
      expect(blockedDecision.status).toBe("BLOCKED");
      expect(blockedDecision.reasonCode).toBe("APPROVAL_CHAIN_UNTRUSTED");
      expect(calls).toBe(0);
    } finally {
      await new Promise<void>((resolvePromise) => receiver.close(() => resolvePromise()));
    }
  });

  test("blocks every signed approval context boundary and tampered consumption proof", async () => {
    const contextCases = [
      ["approval-policy.yaml", "APPROVAL_POLICY_UNTRUSTED"],
      ["action-policy.yaml", "ACTION_POLICY_UNTRUSTED"],
      ["tools.yaml", "TOOLS_UNTRUSTED"],
      ["budgets.yaml", "BUDGETS_UNTRUSTED"]
    ] as const;
    for (const [file, reasonCode] of contextCases) {
      const workspace = newWorkspace(false);
      const created = createProtectedIntent(workspace);
      const path = join(workspace, ".amc", file);
      writeFileSync(path, `${readFileSync(path, "utf8")}\n# tampered`, "utf8");
      expect(() => decideApprovalForIntent({
        workspace,
        approvalId: created.approvalRequestId,
        decision: "APPROVED",
        mode: "EXECUTE",
        reason: "must not persist under tampered context",
        userId: "owner-context",
        username: "owner-context",
        userRoles: ["OWNER"]
      })).toThrow(/context is untrusted/i);
      const blocked = await deliverApprovalLifecycle({
        workspace,
        agentId: "default",
        approvalRequestId: created.approvalRequestId,
        trigger: "REQUEST_CREATED"
      });
      expect(blocked.status).toBe("BLOCKED");
      expect(blocked.reasonCode).toBe(reasonCode);
    }

    const workspace = newWorkspace(false);
    const created = createProtectedIntent(workspace);
    for (const suffix of ["a", "b"]) {
      decideApprovalForIntent({
        workspace,
        approvalId: created.approvalRequestId,
        decision: "APPROVED",
        mode: "EXECUTE",
        reason: `reviewer ${suffix}`,
        userId: `owner-${suffix}`,
        username: `owner-${suffix}`,
        userRoles: ["OWNER"]
      });
    }
    consumeApprovedExecution({
      workspace,
      approvalId: created.approvalRequestId,
      expectedAgentId: "default",
      executionId: "exec-context-test"
    });
    const consumedPath = join(
      getAgentPaths(workspace, "default").rootDir,
      "approvals",
      "consumed",
      `${created.approvalRequestId}.json`
    );
    writeFileSync(consumedPath, `${readFileSync(consumedPath, "utf8")}\n`, "utf8");
    const blockedConsumption = await deliverApprovalLifecycle({
      workspace,
      agentId: "default",
      approvalRequestId: created.approvalRequestId,
      trigger: "STATUS_CHECK"
    });
    expect(blockedConsumption.status).toBe("BLOCKED");
    expect(blockedConsumption.reasonCode).toBe("APPROVAL_CHAIN_UNTRUSTED");
  });

  test("rejects a validly signed consumption artifact transplanted to another request", () => {
    const workspace = newWorkspace(false);
    const source = createProtectedIntent(workspace);
    const target = createProtectedIntent(workspace);
    for (const suffix of ["a", "b"]) {
      decideApprovalForIntent({
        workspace,
        approvalId: source.approvalRequestId,
        decision: "APPROVED",
        mode: "EXECUTE",
        reason: `source reviewer ${suffix}`,
        userId: `owner-${suffix}`,
        username: `owner-${suffix}`,
        userRoles: ["OWNER"]
      });
    }
    consumeApprovedExecution({
      workspace,
      approvalId: source.approvalRequestId,
      expectedAgentId: "default",
      executionId: "exec-source"
    });

    const consumedDir = join(getAgentPaths(workspace, "default").rootDir, "approvals", "consumed");
    const sourcePath = join(consumedDir, `${source.approvalRequestId}.json`);
    const targetPath = join(consumedDir, `${target.approvalRequestId}.json`);
    writeFileSync(targetPath, readFileSync(sourcePath));
    writeFileSync(`${targetPath}.sig`, readFileSync(`${sourcePath}.sig`));

    const projected = getApprovalInboxItem({
      workspace,
      agentId: "default",
      approvalRequestId: target.approvalRequestId
    });
    expect(projected.chainIntegrity.valid).toBe(false);
    expect(projected.status).not.toBe("CONSUMED");
    expect(projected.executionReady).toBe(false);
  });

  test("reports disabled channels honestly and delivers expiry without granting authority", async () => {
    const workspace = newWorkspace();
    let calls = 0;
    const receiver = await listenServer((_req, res) => {
      calls += 1;
      res.statusCode = 202;
      res.end("accepted");
    });
    try {
      configureApprovalWebhook({ workspace, url: serverUrl(receiver), enabled: false });
      const disabledRequest = createProtectedIntent(workspace);
      const disabled = await deliverApprovalLifecycle({
        workspace,
        agentId: "default",
        approvalRequestId: disabledRequest.approvalRequestId,
        trigger: "REQUEST_CREATED"
      });
      expect(disabled.status).toBe("SKIPPED");
      expect(disabled.skipped).toContain("ops-webhook:disabled");
      expect(calls).toBe(0);

      configureApprovalWebhook({ workspace, url: serverUrl(receiver), enabled: true });
      const expiredRequest = createProtectedIntent(workspace);
      const requestPath = join(
        getAgentPaths(workspace, "default").rootDir,
        "approvals",
        "requests",
        `${expiredRequest.approvalRequestId}.json`
      );
      const request = JSON.parse(readFileSync(requestPath, "utf8")) as Record<string, unknown>;
      request.expiresTs = Date.now() - 1;
      writeFileSync(requestPath, JSON.stringify(request, null, 2), "utf8");
      resignArtifact(workspace, requestPath);

      const expired = await deliverApprovalLifecycle({
        workspace,
        agentId: "default",
        approvalRequestId: expiredRequest.approvalRequestId,
        trigger: "STATUS_CHECK"
      });
      expect(expired.status).toBe("DELIVERED");
      expect(expired.eventName).toBe("APPROVAL_EXPIRED");
      expect(calls).toBe(1);
      expect(verifyApprovalForExecution({
        workspace,
        approvalId: expiredRequest.approvalRequestId,
        expectedAgentId: "default",
        expectedIntentId: expiredRequest.intentId,
        expectedToolName: "process.spawn",
        expectedActionClass: "WRITE_HIGH"
      })).toEqual(expect.objectContaining({ ok: false, status: "EXPIRED" }));
    } finally {
      await new Promise<void>((resolvePromise) => receiver.close(() => resolvePromise()));
    }
  });

  test("delivers bounded decision lifecycle updates and never treats delivery as authority", async () => {
    const workspace = newWorkspace();
    const events: string[] = [];
    const receiver = await listenServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { eventName?: string };
        events.push(body.eventName ?? "");
        res.statusCode = 202;
        res.end("accepted");
      });
    });
    try {
      configureApprovalWebhook({ workspace, url: serverUrl(receiver) });
      const request = createProtectedIntent(workspace);
      decideApprovalForIntent({
        workspace,
        approvalId: request.approvalRequestId,
        decision: "APPROVED",
        mode: "EXECUTE",
        reason: "first reviewer context must remain local",
        userId: "owner-a",
        username: "owner-a",
        userRoles: ["OWNER"]
      });
      const partial = await deliverApprovalLifecycle({
        workspace,
        agentId: "default",
        approvalRequestId: request.approvalRequestId,
        trigger: "DECISION_RECORDED"
      });
      expect(partial.eventName).toBe("APPROVAL_DECISION_RECORDED");
      expect(partial.status).toBe("DELIVERED");

      decideApprovalForIntent({
        workspace,
        approvalId: request.approvalRequestId,
        decision: "APPROVED",
        mode: "EXECUTE",
        reason: "second reviewer context must remain local",
        userId: "owner-b",
        username: "owner-b",
        userRoles: ["OWNER"]
      });
      const quorum = await deliverApprovalLifecycle({
        workspace,
        agentId: "default",
        approvalRequestId: request.approvalRequestId,
        trigger: "DECISION_RECORDED"
      });
      expect(quorum.eventName).toBe("APPROVAL_QUORUM_MET");
      expect(quorum.status).toBe("DELIVERED");

      const deniedRequest = createProtectedIntent(workspace);
      decideApprovalForIntent({
        workspace,
        approvalId: deniedRequest.approvalRequestId,
        decision: "DENIED",
        mode: "SIMULATE",
        reason: "sensitive denial reason",
        userId: "owner-c",
        username: "owner-c",
        userRoles: ["OWNER"]
      });
      const denied = await deliverApprovalLifecycle({
        workspace,
        agentId: "default",
        approvalRequestId: deniedRequest.approvalRequestId,
        trigger: "DECISION_RECORDED"
      });
      expect(denied.eventName).toBe("APPROVAL_DENIED");

      const cancelledRequest = createProtectedIntent(workspace);
      cancelApprovalRequest({
        workspace,
        agentId: "default",
        approvalRequestId: cancelledRequest.approvalRequestId
      });
      const cancelled = await deliverApprovalLifecycle({
        workspace,
        agentId: "default",
        approvalRequestId: cancelledRequest.approvalRequestId,
        trigger: "CANCELLED"
      });
      expect(cancelled.eventName).toBe("APPROVAL_CANCELLED");

      expect(events).toEqual([
        "APPROVAL_DECISION_RECORDED",
        "APPROVAL_QUORUM_MET",
        "APPROVAL_DENIED",
        "APPROVAL_CANCELLED"
      ]);
      expect(events.join(" ")).not.toMatch(/reviewer|reason|intent|tool/i);
    } finally {
      await new Promise<void>((resolvePromise) => receiver.close(() => resolvePromise()));
    }
  });

  test("blocks untrusted integration configuration while approval stays denied by default", async () => {
    const workspace = newWorkspace(false);
    const created = createProtectedIntent(workspace);
    const delivery = await deliverApprovalLifecycle({
      workspace,
      agentId: "default",
      approvalRequestId: created.approvalRequestId,
      trigger: "REQUEST_CREATED"
    });
    expect(delivery.status).toBe("BLOCKED");
    expect(delivery.reasonCode).toBe("INTEGRATIONS_UNTRUSTED");
    expect(delivery.evidence?.receiptId).toEqual(expect.any(String));

    const execution = verifyApprovalForExecution({
      workspace,
      approvalId: created.approvalRequestId,
      expectedAgentId: "default",
      expectedIntentId: created.intentId,
      expectedToolName: "process.spawn",
      expectedActionClass: "WRITE_HIGH"
    });
    expect(execution.ok).toBe(false);
    expect(execution.status).toBe("PENDING");
  });

  test("Studio automatically delivers protected intents and emits a privacy-safe SSE refresh", async () => {
    const workspace = newWorkspace();
    let webhookPayload = "";
    const receiver = await listenServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on("end", () => {
        webhookPayload = Buffer.concat(chunks).toString("utf8");
        res.statusCode = 202;
        res.end("accepted");
      });
    });
    configureApprovalWebhook({ workspace, url: serverUrl(receiver) });

    const token = "amc-1471-admin-token";
    const lease = issueLeaseForCli({
      workspace,
      agentId: "default",
      ttl: "60m",
      scopes: "toolhub:intent",
      routes: "/openai",
      models: "*",
      rpm: 100,
      tpm: 100_000,
      maxCostUsdPerDay: null
    }).token;
    const port = await pickFreePort();
    const studio = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port,
      token,
      publicConsoleBasePath: "/w/ws-b/console"
    });
    try {
      const eventPromise = waitForApprovalSse({ url: `${studio.url}/events/org`, token });
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100));
      const response = await postJson(
        `${studio.url}/toolhub/intent`,
        token,
        {
          agentId: "default",
          toolName: "process.spawn",
          args: {
            binary: "node",
            argv: ["-v"],
            credential: "never-deliver-this"
          },
          requestedMode: "EXECUTE"
        },
        { "x-amc-lease": lease }
      );
      expect(response.status).toBe(200);
      const body = JSON.parse(response.body) as {
        approvalRequestId?: string;
        approvalDelivery?: { status: string; evidence?: { receiptId?: string } };
      };
      expect(body.approvalRequestId).toMatch(/^apprreq_/);
      expect(body.approvalDelivery).toEqual(expect.objectContaining({
        status: "DELIVERED",
        evidence: expect.objectContaining({ receiptId: expect.any(String) })
      }));
      const event = await eventPromise;
      expect(event.event).toBe("APPROVAL_REQUEST_CREATED");
      expect(event.data).not.toMatch(/process\.spawn|never-deliver-this|token|lease|secret/i);
      expect(webhookPayload).not.toMatch(/process\.spawn|never-deliver-this|amc-1471-admin-token|vault:/i);
      expect(JSON.parse(webhookPayload)).toEqual(expect.objectContaining({
        details: expect.objectContaining({
          reviewPath: `/w/ws-b/console/approvals?approval=${body.approvalRequestId}`
        })
      }));
      expect(() => buildApprovalDeliveryEnvelope({
        workspace,
        agentId: "default",
        approvalRequestId: body.approvalRequestId!,
        trigger: "STATUS_CHECK",
        reviewBasePath: "https://attacker.example/console"
      })).toThrow(/REVIEW_PATH_INVALID/);
    } finally {
      await studio.close();
      await new Promise<void>((resolvePromise) => receiver.close(() => resolvePromise()));
    }
  });

  test("Studio persists and delivers expiry exactly once from the authenticated detail route", async () => {
    const workspace = newWorkspace();
    const events: string[] = [];
    const receiver = await listenServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { eventName?: string };
        events.push(body.eventName ?? "");
        res.statusCode = 202;
        res.end("accepted");
      });
    });
    const token = "amc-1471-expiry-token";
    try {
      configureApprovalWebhook({ workspace, url: serverUrl(receiver) });
      const created = createProtectedIntent(workspace);
      const requestPath = join(
        getAgentPaths(workspace, "default").rootDir,
        "approvals",
        "requests",
        `${created.approvalRequestId}.json`
      );
      const request = JSON.parse(readFileSync(requestPath, "utf8")) as Record<string, unknown>;
      request.expiresTs = Date.now() - 1;
      writeFileSync(requestPath, JSON.stringify(request, null, 2), "utf8");
      resignArtifact(workspace, requestPath);

      const port = await pickFreePort();
      const studio = await startStudioApiServer({ workspace, host: "127.0.0.1", port, token });
      try {
        const url = `${studio.url}/approvals/requests/${encodeURIComponent(created.approvalRequestId)}`;
        const first = await getJson(url, token);
        expect(first.status).toBe(200);
        expect(JSON.parse(first.body)).toEqual(expect.objectContaining({
          status: "EXPIRED",
          approvalDelivery: expect.objectContaining({
            status: "DELIVERED",
            eventName: "APPROVAL_EXPIRED"
          })
        }));
        const second = await getJson(url, token);
        expect(second.status).toBe(200);
        expect(JSON.parse(second.body)).not.toHaveProperty("approvalDelivery");
        expect(events).toEqual(["APPROVAL_EXPIRED"]);
      } finally {
        await studio.close();
      }
    } finally {
      await new Promise<void>((resolvePromise) => receiver.close(() => resolvePromise()));
    }
  });

  test("Studio delivers consumed lifecycle from an actual ToolHub execution", async () => {
    const workspace = newWorkspace();
    const events: Array<{ eventName: string; serialized: string }> = [];
    const receiver = await listenServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on("end", () => {
        const serialized = Buffer.concat(chunks).toString("utf8");
        const body = JSON.parse(serialized) as { eventName?: string };
        events.push({ eventName: body.eventName ?? "", serialized });
        res.statusCode = 202;
        res.end("accepted");
      });
    });
    const token = "amc-1471-consumption-token";
    try {
      configureApprovalWebhook({ workspace, url: serverUrl(receiver) });
      const lease = issueLeaseForCli({
        workspace,
        agentId: "default",
        ttl: "60m",
        scopes: "toolhub:intent,toolhub:execute",
        routes: "/openai",
        models: "*",
        rpm: 100,
        tpm: 100_000,
        maxCostUsdPerDay: null
      }).token;
      const port = await pickFreePort();
      const studio = await startStudioApiServer({ workspace, host: "127.0.0.1", port, token });
      try {
        const intentResponse = await postJson(`${studio.url}/toolhub/intent`, token, {
          agentId: "default",
          toolName: "process.spawn",
          args: { binary: "node", argv: ["-v"] },
          requestedMode: "EXECUTE"
        }, { "x-amc-lease": lease });
        const intent = JSON.parse(intentResponse.body) as {
          intentId: string;
          approvalRequestId: string;
        };
        for (const suffix of ["a", "b"]) {
          decideApprovalForIntent({
            workspace,
            approvalId: intent.approvalRequestId,
            decision: "APPROVED",
            mode: "EXECUTE",
            reason: `execution reviewer ${suffix}`,
            userId: `owner-${suffix}`,
            username: `owner-${suffix}`,
            userRoles: ["OWNER"]
          });
        }
        events.length = 0;

        const executed = await postJson(`${studio.url}/toolhub/execute`, token, {
          intentId: intent.intentId,
          approvalRequestId: intent.approvalRequestId
        }, { "x-amc-lease": lease });
        expect(executed.status).toBe(200);
        expect(JSON.parse(executed.body)).toEqual(expect.objectContaining({
          allowed: true,
          approvalDelivery: expect.objectContaining({
            status: "DELIVERED",
            eventName: "APPROVAL_CONSUMED"
          })
        }));
        expect(events.map((row) => row.eventName)).toEqual(["APPROVAL_CONSUMED"]);
        expect(events[0]!.serialized).not.toMatch(/process\.spawn|execution reviewer|argv|binary/i);
      } finally {
        await studio.close();
      }
    } finally {
      await new Promise<void>((resolvePromise) => receiver.close(() => resolvePromise()));
    }
  });

  test("built CLI binds distinct reviewer identity and delivers each decision lifecycle", async () => {
    const workspace = newWorkspace();
    const events: string[] = [];
    const receiver = await listenServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { eventName?: string };
        events.push(body.eventName ?? "");
        res.statusCode = 202;
        res.end("accepted");
      });
    });
    try {
      configureApprovalWebhook({ workspace, url: serverUrl(receiver) });
      const created = createProtectedIntent(workspace);
      const base = [
        "approvals",
        "approve",
        created.approvalRequestId,
        "--agent",
        "default",
        "--mode",
        "execute",
        "--roles",
        "OWNER"
      ];
      const first = await runBuiltCli(workspace, [
        ...base,
        "--username",
        "owner-a",
        "--reason",
        "first reviewer"
      ]);
      expect(first.code).toBe(0);
      expect(first.stdout).toContain("Lifecycle delivery: DELIVERED (APPROVAL_DECISION_RECORDED)");

      const duplicate = await runBuiltCli(workspace, [
        ...base,
        "--username",
        "owner-a",
        "--reason",
        "duplicate reviewer"
      ]);
      expect(duplicate.code).toBe(1);
      expect(duplicate.stderr).toMatch(/distinct approver|same user|not pending/i);

      const second = await runBuiltCli(workspace, [
        ...base,
        "--username",
        "owner-b",
        "--reason",
        "second reviewer"
      ]);
      expect(second.code).toBe(0);
      expect(second.stdout).toContain("Lifecycle delivery: DELIVERED (APPROVAL_QUORUM_MET)");
      expect(getApprovalInboxItem({
        workspace,
        agentId: "default",
        approvalRequestId: created.approvalRequestId
      })).toEqual(expect.objectContaining({
        status: "QUORUM_MET",
        decisions: expect.arrayContaining([
          expect.objectContaining({ username: "owner-a" }),
          expect.objectContaining({ username: "owner-b" })
        ])
      }));
      expect(events).toEqual(["APPROVAL_DECISION_RECORDED", "APPROVAL_QUORUM_MET"]);
    } finally {
      await new Promise<void>((resolvePromise) => receiver.close(() => resolvePromise()));
    }
  });

  test("rejects unknown decisions and terminal-state decision replay", async () => {
    const workspace = newWorkspace(false);
    const token = "amc-1471-decision-token";
    const studio = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port: await pickFreePort(),
      token
    });
    try {
      const unknownRequest = createProtectedIntent(workspace);
      const listed = await getJson(`${studio.url}/approvals/requests?agentId=default`, token);
      expect(listed.status).toBe(200);
      expect(listed.body).toContain(unknownRequest.approvalRequestId);
      expect(listed.body).not.toMatch(/process\.spawn|"(?:intentId|workOrderId|boundHashes|toolName|reason)"/i);
      const unknown = await postJson(
        `${studio.url}/approvals/requests/${encodeURIComponent(unknownRequest.approvalRequestId)}/decide`,
        token,
        { decision: "APPROVE_EVERYTHING", reason: "must reject" }
      );
      expect(unknown.status).toBe(400);
      expect(getApprovalInboxItem({
        workspace,
        agentId: "default",
        approvalRequestId: unknownRequest.approvalRequestId
      }).decisions).toHaveLength(0);

      const cancelledRequest = createProtectedIntent(workspace);
      cancelApprovalRequest({
        workspace,
        agentId: "default",
        approvalRequestId: cancelledRequest.approvalRequestId
      });
      expect(() => decideApprovalForIntent({
        workspace,
        approvalId: cancelledRequest.approvalRequestId,
        decision: "APPROVED",
        mode: "EXECUTE",
        reason: "too late",
        userId: "owner-a",
        username: "owner-a",
        userRoles: ["OWNER"]
      })).toThrow(/not pending.*CANCELLED/i);
      const replay = await postJson(
        `${studio.url}/approvals/requests/${encodeURIComponent(cancelledRequest.approvalRequestId)}/decide`,
        token,
        { decision: "APPROVE_EXECUTE", reason: "too late" }
      );
      expect(replay.status).toBe(409);
      expect(getApprovalInboxItem({
        workspace,
        agentId: "default",
        approvalRequestId: cancelledRequest.approvalRequestId
      }).decisions).toHaveLength(0);
    } finally {
      await studio.close();
    }
  });

  test("revalidates session revocation, user status, and current roles on every request", () => {
    const workspace = newWorkspace(false);
    initUsersConfig({ workspace, username: "owner", password: "owner-pass" });
    const login = authenticateUser({ workspace, username: "owner", password: "owner-pass" });
    if (!login.user) throw new Error("expected owner user");

    const first = createSession({ workspace, user: login.user });
    const requestFor = (token: string) => ({
      headers: { cookie: `amc_session=${encodeURIComponent(token)}` }
    } as IncomingMessage);
    expect(sessionFromRequest({ workspace, req: requestFor(first.token) }).ok).toBe(true);
    revokeSessionByToken({ workspace, token: first.token });
    expect(sessionFromRequest({ workspace, req: requestFor(first.token) })).toEqual(expect.objectContaining({
      ok: false,
      error: "session revoked"
    }));

    const second = createSession({ workspace, user: login.user });
    setUserRoles({ workspace, username: "owner", roles: ["VIEWER"] });
    expect(sessionFromRequest({ workspace, req: requestFor(second.token) })).toEqual(expect.objectContaining({
      ok: false,
      error: "session roles changed"
    }));

    const current = authenticateUser({ workspace, username: "owner", password: "owner-pass" });
    if (!current.user) throw new Error("expected current user");
    const third = createSession({ workspace, user: current.user });
    revokeUser({ workspace, username: "owner" });
    expect(sessionFromRequest({ workspace, req: requestFor(third.token) })).toEqual(expect.objectContaining({
      ok: false,
      error: "user revoked"
    }));
  });

  test("marks session cookies Secure only when the request is HTTPS", async () => {
    const workspace = newWorkspace(false);
    initUsersConfig({ workspace, username: "owner", password: "owner-pass" });
    const token = "amc-1471-cookie-token";
    const studio = await startStudioApiServer({
      workspace,
      host: "127.0.0.1",
      port: await pickFreePort(),
      token
    });
    try {
      const httpsLogin = await postJson(
        `${studio.url}/auth/login`,
        token,
        { username: "owner", password: "owner-pass" },
        { "x-forwarded-proto": "https" }
      );
      expect(httpsLogin.status).toBe(200);
      expect(String(httpsLogin.headers["set-cookie"] ?? "")).toContain("; Secure;");

      const httpLogin = await postJson(
        `${studio.url}/auth/login`,
        token,
        { username: "owner", password: "owner-pass" }
      );
      expect(httpLogin.status).toBe(200);
      expect(String(httpLogin.headers["set-cookie"] ?? "")).not.toContain("; Secure;");
    } finally {
      await studio.close();
    }
  });

  test("publishes the actual approval routes, decision enum, and session cookie name", () => {
    const spec = generateFullOpenApiSpec() as any;
    expect(spec.paths).toHaveProperty("/approvals/requests");
    expect(spec.paths).toHaveProperty("/approvals/requests/{id}");
    expect(spec.paths).toHaveProperty("/approvals/requests/{id}/decide");
    expect(spec.paths).toHaveProperty("/approvals/requests/{id}/cancel");
    expect(spec.paths).not.toHaveProperty("/api/approvals");
    expect(
      spec.paths["/approvals/requests/{id}/decide"].post.requestBody.content["application/json"].schema.properties.decision.enum
    ).toEqual(["APPROVE_EXECUTE", "APPROVE_SIMULATE", "DENY"]);
    expect(spec.paths["/approvals/requests/{id}/decide"].post.responses).toHaveProperty("403");
    expect(spec.paths["/approvals/requests/{id}/cancel"].post.responses).toHaveProperty("403");
    expect(spec.components.securitySchemes.sessionCookie.name).toBe("amc_session");

    const published = YAML.parse(readFileSync("website/openapi.yaml", "utf8")) as any;
    expect(published.paths).toHaveProperty("/approvals/requests");
    expect(published.paths).toHaveProperty("/approvals/requests/{id}");
    expect(published.paths).toHaveProperty("/approvals/requests/{id}/decide");
    expect(published.paths).toHaveProperty("/approvals/requests/{id}/cancel");
    expect(published.components.securitySchemes.amcSessionCookie.name).toBe("amc_session");
    expect(published.components.schemas.ApprovalDecisionRequest.properties.decision.enum).toEqual([
      "APPROVE_EXECUTE",
      "APPROVE_SIMULATE",
      "DENY"
    ]);
    expect(published.components.schemas.ApprovalDeliverySummary.properties.status.enum).toContain("QUEUED");
    expect(published.components.schemas.ApprovalDeliverySummary.required).toContain("queued");
    expect(published.paths["/approvals/requests/{id}/decide"].post.responses).toHaveProperty("403");
    expect(published.paths["/approvals/requests/{id}/cancel"].post.responses).toHaveProperty("403");
  });
});
