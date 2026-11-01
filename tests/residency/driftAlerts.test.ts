/** P2-01 drift alert webhook POST (src/drift/alerts.ts postWebhook via dispatchAlert / sendTestAlert). */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initAlertsConfig, loadAlertsConfig, sendTestAlert, signAlertsConfig } from "../../src/drift/alerts.js";
import { EgressBlocked } from "../../src/residency/checkEgress.js";
import { setVaultSecret } from "../../src/vault/vault.js";
import { blockResidency, closeFixtures, listen, newWorkspace, redirectTo, tempRoot, type Listener } from "./egressFixture.js";

vi.setConfig({ testTimeout: 60_000 });
const cwd = process.cwd();
let root: string, blocked: string, open: string;
beforeEach(() => {
  root = tempRoot();
  blocked = newWorkspace(root, "blocked");
  open = newWorkspace(root, "open");
});
afterEach(async () => { process.chdir(cwd); vi.restoreAllMocks(); await closeFixtures(); });

/** Signed alerts config whose channels post to `urls`, in order. */
function configure(workspace: string, urls: string[]): void {
  initAlertsConfig(workspace);
  const config = loadAlertsConfig(workspace);
  config.alerts.channels = urls.map((url, index) => {
    setVaultSecret(workspace, `alerts/ch${index}`, `secret-${index}`);
    return { type: "webhook" as const, name: `ch${index}`, url, secretRef: `vault:alerts/ch${index}` };
  });
  writeFileSync(join(workspace, ".amc", "alerts.yaml"), JSON.stringify(config, null, 2));
  signAlertsConfig(workspace);
}
const ok = (): Promise<Listener> => listen((_req, res) => { res.writeHead(200).end("ok"); });

describe("drift alert webhook", () => {
  test("a denied endpoint constructs no request and opens no socket", async () => {
    const hook = await ok();
    configure(blocked, [`${hook.url}/webhook`]);
    blockResidency(blocked);
    await expect(sendTestAlert(blocked)).rejects.toBeInstanceOf(EgressBlocked);
    expect(hook.connections).toBe(0);
  });

  test("the workspace is resolved once at dispatch: a cwd change during the first delivery does not widen the second", async () => {
    // "open" relative to root is the captured workspace; relative to elsewhere it names an unregulated one.
    const elsewhere = join(root, "elsewhere");
    mkdirSync(elsewhere);
    newWorkspace(elsewhere, "open");
    const second = await ok();
    const first = await listen((_req, res) => {
      blockResidency(open);
      process.chdir(elsewhere);
      res.writeHead(200).end("ok");
    });
    configure(open, [`${first.url}/webhook`, `${second.url}/webhook`]);
    process.chdir(root);
    await expect(sendTestAlert("open")).rejects.toBeInstanceOf(EgressBlocked);
    expect(first.requests).toHaveLength(1);
    expect(second.connections).toBe(0);
  });

  test("a 3xx is a failed delivery, not followed", async () => {
    const target = await ok();
    const redirector = await redirectTo(target);
    configure(open, [`${redirector.url}/webhook`]);
    await expect(sendTestAlert(open)).rejects.toThrow(/alert webhook failed with HTTP 302/);
    expect(target.connections).toBe(0);
  });
});
