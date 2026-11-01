/**
 * P2-01 queued webhook POST (src/integrations/webhookDelivery.ts deliverWebhookWithRetry and the native default client) and the
 * shared dispatcher's typed catch (src/integrations/integrationDispatcher.ts: a denied channel stays queued, nothing is sent).
 */
import { readFileSync, writeFileSync } from "node:fs";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getPrivateKeyPem, signHexDigest } from "../../src/crypto/keys.js";
import { withWorkspaceScope } from "../../src/enforce/evidenceEmitter.js";
import { dispatchIntegrationEvent } from "../../src/integrations/integrationDispatcher.js";
import { getIntegrationDeliveryStatusByQueueId } from "../../src/integrations/integrationDeliveryQueue.js";
import { initIntegrationsConfig, integrationsConfigPath, integrationsConfigSigPath } from "../../src/integrations/integrationStore.js";
import { defaultWebhookHttpClient, deliverWebhookWithRetry, type WebhookDeliveryRequest } from "../../src/integrations/webhookDelivery.js";
import { EgressBlocked } from "../../src/residency/checkEgress.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { setVaultSecret } from "../../src/vault/vault.js";
import { blockResidency, closeFixtures, listen, newWorkspace, redirectTo, tempRoot, type Listener } from "./egressFixture.js";

vi.setConfig({ testTimeout: 60_000 });
let root: string, blocked: string, open: string, hook: Listener;
beforeEach(async () => {
  root = tempRoot();
  blocked = newWorkspace(root, "blocked");
  open = newWorkspace(root, "open");
  blockResidency(blocked);
  hook = await listen((_req, res) => { res.writeHead(202).end("ok"); });
});
afterEach(async () => { vi.restoreAllMocks(); await closeFixtures(); });

const request = (url: string): WebhookDeliveryRequest => ({ url, eventType: "residency.fixture", payload: { ok: true }, secret: "s" });
const POLICY = { maxAttempts: 3, initialBackoffMs: 1, maxBackoffMs: 1, timeoutMs: 5_000 };

describe("webhook delivery", () => {
  test("a denied delivery opens no socket and is not retried, through the retry loop and the native client alike", async () => {
    const sleep = vi.fn(async () => undefined);
    await expect(withWorkspaceScope(blocked, () => deliverWebhookWithRetry({ request: request(`${hook.url}/w`), policy: POLICY, dependencies: { sleep } })))
      .rejects.toBeInstanceOf(EgressBlocked);
    await expect(withWorkspaceScope(blocked, () => defaultWebhookHttpClient.post({ url: `${hook.url}/w`, body: "{}", headers: {}, timeoutMs: 5_000 })))
      .rejects.toBeInstanceOf(EgressBlocked);
    expect(sleep).not.toHaveBeenCalled();
    expect(hook.connections).toBe(0);
  });

  test("the captured scope is rechecked on each retry: blocked during the backoff, the retry is refused and sends nothing", async () => {
    const input = request("");
    const failing = await listen((_req, res) => { res.writeHead(500).end("busy"); });
    input.url = `${failing.url}/w`;
    const sleep = vi.fn(async () => { blockResidency(open); });
    await expect(withWorkspaceScope(open, () => deliverWebhookWithRetry({ request: input, policy: POLICY, dependencies: { sleep } })))
      .rejects.toBeInstanceOf(EgressBlocked);
    expect(failing.requests).toHaveLength(1);
  });

  test("a supplied client is never called for a denied attempt: the retry loop checks before every post", async () => {
    const client = { post: vi.fn(async () => ({ status: 202, body: "" })) };
    await expect(withWorkspaceScope(blocked, () => deliverWebhookWithRetry({ request: request(`${hook.url}/w`), policy: POLICY, dependencies: { client } })))
      .rejects.toBeInstanceOf(EgressBlocked);
    expect(client.post).not.toHaveBeenCalled();
  });

  test("concurrent deliveries keep separate scopes: the blocked one sends nothing, the open one delivers", async () => {
    const [denied, delivered] = await Promise.allSettled([
      withWorkspaceScope(blocked, () => deliverWebhookWithRetry({ request: request(`${hook.url}/w`), policy: POLICY })),
      withWorkspaceScope(open, () => deliverWebhookWithRetry({ request: request(`${hook.url}/w`), policy: POLICY }))
    ]);
    expect(denied.status === "rejected" && denied.reason).toBeInstanceOf(EgressBlocked);
    expect(delivered.status === "fulfilled" && delivered.value.delivered).toBe(true);
    expect(hook.requests).toHaveLength(1);
  });

  test("a 3xx is an undelivered attempt, never followed", async () => {
    const redirector = await redirectTo(hook);
    const receipt = await withWorkspaceScope(open, () => deliverWebhookWithRetry({ request: request(`${redirector.url}/w`), policy: { ...POLICY, maxAttempts: 1 } }));
    expect(receipt).toMatchObject({ delivered: false, attempts: [expect.objectContaining({ httpStatus: 302 })] });
    expect(hook.connections).toBe(0);
  });
});

describe("integration dispatcher", () => {
  test("a denied channel is left queued and PENDING; nothing is sent and the dispatch does not throw", async () => {
    initIntegrationsConfig(blocked);
    setVaultSecret(blocked, "integrations/ops-webhook", "ok-secret");
    const path = integrationsConfigPath(blocked);
    const config = YAML.parse(readFileSync(path, "utf8")) as { integrations: { channels: unknown[]; routing: Record<string, string[]> } };
    config.integrations.channels = [{ id: "ops", type: "webhook", url: `${hook.url}/ops`, secretRef: "vault:integrations/ops-webhook", enabled: true }];
    config.integrations.routing.INTEGRATION_TEST = ["ops"];
    writeFileSync(path, YAML.stringify(config));
    const digest = sha256Hex(readFileSync(path));
    writeFileSync(integrationsConfigSigPath(blocked), JSON.stringify({ digestSha256: digest, signature: signHexDigest(digest, getPrivateKeyPem(blocked, "auditor")),
      signedTs: Date.now(), signer: "auditor" }));

    const outcome = await dispatchIntegrationEvent({ workspace: blocked, eventName: "INTEGRATION_TEST", agentId: "system", summary: "residency" });
    expect(outcome.dispatched).toEqual([]);
    expect(outcome.queued).toHaveLength(1);
    expect(getIntegrationDeliveryStatusByQueueId(blocked, outcome.queued[0]!.queueId)).toMatchObject({ state: "PENDING" });
    expect(hook.connections).toBe(0);
  });
});
