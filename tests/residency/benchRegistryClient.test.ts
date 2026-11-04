/** P2-01 benchmark registry GETs (src/bench/benchRegistryClient.ts readText/readBytes): residency denial, captured scope, no redirect. */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { browseBenchRegistry } from "../../src/bench/benchRegistryClient.js";
import { withWorkspaceScope } from "../../src/enforce/evidenceEmitter.js";
import { EgressBlocked } from "../../src/residency/checkEgress.js";
import { blockResidency, closeFixtures, listen, newWorkspace, redirectTo, tempRoot, type Listener } from "./egressFixture.js";

vi.setConfig({ testTimeout: 60_000 });
let blocked: string, open: string, registry: Listener;
beforeEach(async () => {
  const root = tempRoot();
  blocked = newWorkspace(root, "blocked");
  open = newWorkspace(root, "open");
  blockResidency(blocked);
  registry = await listen((_req, res) => { res.writeHead(200).end("{}"); });
});
afterEach(async () => { vi.restoreAllMocks(); await closeFixtures(); });

describe("benchmark registry browse", () => {
  test("a denied index, signature and key GET calls no fetch and opens no socket", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(withWorkspaceScope(blocked, () => browseBenchRegistry({ base: registry.url }))).rejects.toBeInstanceOf(EgressBlocked);
    expect(spy).not.toHaveBeenCalled();
    expect(registry.connections).toBe(0);
  });

  test("the scope captured at entry holds: a concurrent browse in an open workspace never lends it its scope", async () => {
    const [denied, allowed] = await Promise.allSettled([
      withWorkspaceScope(blocked, () => browseBenchRegistry({ base: registry.url })),
      withWorkspaceScope(open, () => browseBenchRegistry({ base: registry.url }))
    ]);
    expect(denied.status === "rejected" && denied.reason).toBeInstanceOf(EgressBlocked);
    // The open browse fetched its three files (then failed signature verification on the fixture bodies).
    expect(allowed.status === "rejected" && allowed.reason).not.toBeInstanceOf(EgressBlocked);
    expect(registry.requests.map(row => row.path).sort()).toEqual(["/index.json", "/index.sig", "/registry.pub"]);
  });

  test("a 3xx from the registry is not followed", async () => {
    const redirector = await redirectTo(registry);
    await expect(withWorkspaceScope(open, () => browseBenchRegistry({ base: redirector.url }))).rejects.toThrow(/registry fetch failed \(302\)/);
    expect(registry.connections).toBe(0);
  });
});
