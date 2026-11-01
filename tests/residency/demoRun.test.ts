/** P2-01 internal demo caller POST (src/demo/demoRun.ts sendRequest via runDemo, under the no-vault demo's workspace scope). */
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { prepareNoVaultDemoWorkspace, runDemo, type PreparedNoVaultDemoWorkspace } from "../../src/demo/demoRun.js";
import { withWorkspaceScope } from "../../src/enforce/evidenceEmitter.js";
import { EgressBlocked } from "../../src/residency/checkEgress.js";
import { blockResidency, closeFixtures, listen, redirectTo, tempRoot, type Listener } from "./egressFixture.js";

vi.setConfig({ testTimeout: 60_000 });
const COMPLETION = JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] });
let root: string, demo: PreparedNoVaultDemoWorkspace, gateway: Listener;
beforeEach(async () => {
  root = tempRoot();
  gateway = await listen((_req, res) => { res.writeHead(200, { "content-type": "application/json" }).end(COMPLETION); });
  demo = prepareNoVaultDemoWorkspace({ upstreamBaseUrl: gateway.url, workspace: join(root, "demo") });
  vi.stubEnv("AMC_VAULT_PASSPHRASE", demo.passphrase);
});
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); await closeFixtures(); });

const run = (url: string) => withWorkspaceScope(demo.workspace, () => runDemo(url, demo.leaseToken, demo.agentId));

describe("internal demo traffic", () => {
  test("a denied demo request calls no fetch and opens no socket", async () => {
    blockResidency(demo.workspace);
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(run(gateway.url)).rejects.toBeInstanceOf(EgressBlocked);
    expect(spy).not.toHaveBeenCalled();
    expect(gateway.connections).toBe(0);
  });

  test("the demo workspace scope holds across the run: blocked after the first request, the next is refused", async () => {
    const flipping = await listen((_req, res) => {
      blockResidency(demo.workspace);
      res.writeHead(200, { "content-type": "application/json" }).end(COMPLETION);
    });
    await expect(run(flipping.url)).rejects.toBeInstanceOf(EgressBlocked);
    expect(flipping.requests).toHaveLength(1);
  });

  test("a 3xx stops the run, never followed", async () => {
    const redirector = await redirectTo(gateway);
    await expect(run(redirector.url)).rejects.toThrow(/Gateway returned 302/);
    expect(gateway.connections).toBe(0);
  });
});
