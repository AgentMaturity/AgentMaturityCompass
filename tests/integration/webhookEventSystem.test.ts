import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { getPrivateKeyPem, signHexDigest } from "../../src/crypto/keys.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { setVaultSecret } from "../../src/vault/vault.js";
import { dispatchIntegrationEvent } from "../../src/integrations/integrationDispatcher.js";
import {
  initIntegrationsConfig,
  integrationsConfigPath,
  integrationsConfigSigPath
} from "../../src/integrations/integrationStore.js";
import {
  exportIntegrationDeliveryJournal,
  loadIntegrationDeliveryJournal
} from "../../src/integrations/integrationDeliveryStore.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-int-webhook-system-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "integration-webhook-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  initIntegrationsConfig(dir);
  return dir;
}

function resignIntegrationsConfig(workspace: string): void {
  const path = integrationsConfigPath(workspace);
  const sigPath = integrationsConfigSigPath(workspace);
  const digest = sha256Hex(readFileSync(path));
  const signature = signHexDigest(digest, getPrivateKeyPem(workspace, "auditor"));
  writeFileSync(
    sigPath,
    JSON.stringify(
      {
        digestSha256: digest,
        signature,
        signedTs: Date.now(),
        signer: "auditor"
      },
      null,
      2
    ),
    "utf8"
  );
}

function applyWebhookOnlyConfig(params: {
  workspace: string;
  webhookUrl: string;
  delivery?: {
    ordered?: boolean;
    recordDeadLetters?: boolean;
    maxRounds?: number;
    retry?: {
      maxAttempts?: number;
      initialBackoffMs?: number;
      maxBackoffMs?: number;
      jitterFactor?: number;
      timeoutMs?: number;
    };
  };
}): void {
  const cfgPath = integrationsConfigPath(params.workspace);
  const cfg = YAML.parse(readFileSync(cfgPath, "utf8")) as Record<string, any>;
  cfg.integrations.channels = [
    {
      id: "ops-webhook",
      type: "webhook",
      url: params.webhookUrl,
      secretRef: "vault:integrations/ops-webhook",
      enabled: true,
      ...(params.delivery ? { delivery: params.delivery } : {})
    }
  ];
  cfg.integrations.routing.INTEGRATION_TEST = ["ops-webhook"];
  writeFileSync(cfgPath, YAML.stringify(cfg), "utf8");
  resignIntegrationsConfig(params.workspace);
}

async function listenServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<Server> {
  const server = createServer(handler);
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  return server;
}

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("integration webhook event system", () => {
  test("retries failed deliveries and records ordered receipt journal", async () => {
    const workspace = newWorkspace();
    setVaultSecret(workspace, "integrations/ops-webhook", "retry-secret");
    let calls = 0;
    const seenAttempts: string[] = [];
    const seenSequences: string[] = [];
    const server = await listenServer((req, res) => {
      calls += 1;
      seenAttempts.push(String(req.headers["x-amc-webhook-attempt"] ?? ""));
      seenSequences.push(String(req.headers["x-amc-ordered-sequence"] ?? ""));
      if (calls === 1) {
        res.statusCode = 500;
        res.end("retry");
        return;
      }
      res.statusCode = 202;
      res.end("accepted");
    });

    try {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        throw new Error("missing server address");
      }
      applyWebhookOnlyConfig({
        workspace,
        webhookUrl: `http://127.0.0.1:${addr.port}/hooks/amc`,
        delivery: {
          ordered: true,
          recordDeadLetters: true,
          retry: {
            maxAttempts: 3,
            initialBackoffMs: 1,
            maxBackoffMs: 10,
            jitterFactor: 0,
            timeoutMs: 1_000
          }
        }
      });

      const result = await dispatchIntegrationEvent({
        workspace,
        eventName: "INTEGRATION_TEST",
        agentId: "agent-retry",
        summary: "retry behavior"
      });

      expect(result.dispatched).toHaveLength(1);
      expect(result.dispatched[0]?.attempts).toBe(2);
      expect(result.dispatched[0]?.orderedSequence).toBe(1);
      expect(result.dispatched[0]?.httpStatus).toBe(202);
      expect(result.skipped).toHaveLength(0);
      expect(calls).toBe(2);
      expect(seenAttempts).toEqual(["1", "2"]);
      expect(seenSequences).toEqual(["1", "1"]);

      const journal = loadIntegrationDeliveryJournal(workspace);
      expect(journal.sequenceByChannel["ops-webhook"]).toBe(1);
      expect(journal.receipts).toHaveLength(1);
      expect(journal.receipts[0]?.delivered).toBe(true);
      expect(journal.receipts[0]?.attempts).toBe(2);
      expect(journal.deadLetters).toHaveLength(0);
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });

  test("writes dead letters when retry attempts are exhausted", async () => {
    const workspace = newWorkspace();
    setVaultSecret(workspace, "integrations/ops-webhook", "dead-letter-secret");
    const server = await listenServer((_req, res) => {
      res.statusCode = 503;
      res.end("down");
    });

    try {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        throw new Error("missing server address");
      }
      applyWebhookOnlyConfig({
        workspace,
        webhookUrl: `http://127.0.0.1:${addr.port}/hooks/fail`,
        delivery: {
          ordered: true,
          recordDeadLetters: true,
          maxRounds: 1,
          retry: {
            maxAttempts: 2,
            initialBackoffMs: 1,
            maxBackoffMs: 10,
            jitterFactor: 0,
            timeoutMs: 1_000
          }
        }
      });

      const result = await dispatchIntegrationEvent({
        workspace,
        eventName: "INTEGRATION_TEST",
        agentId: "agent-fail",
        summary: "dead-letter behavior"
      });

      expect(result.dispatched).toHaveLength(0);
      expect(result.skipped.some((row) => row.startsWith("ops-webhook:dispatch-failed:"))).toBe(true);

      const journal = loadIntegrationDeliveryJournal(workspace);
      expect(journal.receipts).toHaveLength(1);
      expect(journal.receipts[0]?.delivered).toBe(false);
      expect(journal.deadLetters).toHaveLength(1);
      expect(journal.deadLetters[0]?.resolved).toBe(false);

    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });

  test("preserves ordered sequence under concurrent dispatch requests", async () => {
    const workspace = newWorkspace();
    setVaultSecret(workspace, "integrations/ops-webhook", "concurrency-secret");
    const seen: Array<{ sequence: string; summary: string }> = [];
    let requestCount = 0;
    const server = await listenServer((req, res) => {
      requestCount += 1;
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on("end", () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { summary?: string };
        seen.push({
          sequence: String(req.headers["x-amc-ordered-sequence"] ?? ""),
          summary: payload.summary ?? ""
        });
        const delay = requestCount === 1 ? 60 : 0;
        setTimeout(() => {
          res.statusCode = 200;
          res.end("ok");
        }, delay);
      });
    });

    try {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        throw new Error("missing server address");
      }
      applyWebhookOnlyConfig({
        workspace,
        webhookUrl: `http://127.0.0.1:${addr.port}/hooks/concurrent`,
        delivery: {
          ordered: true,
          recordDeadLetters: true,
          retry: {
            maxAttempts: 1,
            initialBackoffMs: 1,
            maxBackoffMs: 1,
            jitterFactor: 0,
            timeoutMs: 1_000
          }
        }
      });

      const first = dispatchIntegrationEvent({
        workspace,
        eventName: "INTEGRATION_TEST",
        agentId: "agent-concurrent",
        summary: "first concurrent"
      });
      await new Promise<void>((resolvePromise) => setTimeout(() => resolvePromise(), 0));
      const second = dispatchIntegrationEvent({
        workspace,
        eventName: "INTEGRATION_TEST",
        agentId: "agent-concurrent",
        summary: "second concurrent"
      });
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(firstResult.skipped).toHaveLength(0);
      expect(secondResult.skipped).toHaveLength(0);
      expect(seen.map((row) => row.sequence)).toEqual(["1", "2"]);
      expect(seen.map((row) => row.summary)).toEqual(["first concurrent", "second concurrent"]);
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });

  test("persists ordered sequence counters across dispatches and exports journal", async () => {
    const workspace = newWorkspace();
    setVaultSecret(workspace, "integrations/ops-webhook", "sequence-secret");
    const server = await listenServer((_req, res) => {
      res.statusCode = 200;
      res.end("ok");
    });

    try {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        throw new Error("missing server address");
      }
      applyWebhookOnlyConfig({
        workspace,
        webhookUrl: `http://127.0.0.1:${addr.port}/hooks/ok`,
        delivery: {
          ordered: true,
          recordDeadLetters: true,
          retry: {
            maxAttempts: 1,
            initialBackoffMs: 1,
            maxBackoffMs: 1,
            jitterFactor: 0,
            timeoutMs: 1_000
          }
        }
      });

      const first = await dispatchIntegrationEvent({
        workspace,
        eventName: "INTEGRATION_TEST",
        agentId: "agent-seq",
        summary: "first dispatch"
      });
      const second = await dispatchIntegrationEvent({
        workspace,
        eventName: "INTEGRATION_TEST",
        agentId: "agent-seq",
        summary: "second dispatch"
      });

      expect(first.dispatched[0]?.orderedSequence).toBe(1);
      expect(second.dispatched[0]?.orderedSequence).toBe(2);

      const journal = loadIntegrationDeliveryJournal(workspace);
      expect(journal.sequenceByChannel["ops-webhook"]).toBe(2);
      expect(journal.receipts).toHaveLength(2);

      const out = exportIntegrationDeliveryJournal({
        workspace,
        outFile: ".amc/integrations/delivery-export.json"
      });
      expect(out.receiptCount).toBe(2);
      expect(out.deadLetterCount).toBe(0);
      const exported = JSON.parse(readFileSync(out.outFile, "utf8")) as {
        receipts: unknown[];
        deadLetters: unknown[];
      };
      expect(exported.receipts).toHaveLength(2);
      expect(exported.deadLetters).toHaveLength(0);
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  });
});
