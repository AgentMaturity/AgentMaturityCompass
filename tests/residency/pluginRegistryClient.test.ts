/** P2-01 plugin registry GETs (src/plugins/pluginRegistryClient.ts readTextFromRegistry/readBytesFromRegistry). */
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { withWorkspaceScope } from "../../src/enforce/evidenceEmitter.js";
import { initPluginRegistry } from "../../src/plugins/pluginRegistry.js";
import { browseRegistry, registryTrust, resolveRegistryPackage } from "../../src/plugins/pluginRegistryClient.js";
import { EgressBlocked } from "../../src/residency/checkEgress.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";
import { blockResidency, closeFixtures, listen, newWorkspace, redirectTo, tempRoot, type Listener } from "./egressFixture.js";

vi.setConfig({ testTimeout: 60_000 });
const PLUGIN = "amc.plugin.fixture.residency";
let root: string, blocked: string, open: string, fingerprint: string, registryDir: string;
beforeEach(() => {
  root = tempRoot();
  blocked = newWorkspace(root, "blocked");
  open = newWorkspace(root, "open");
  blockResidency(blocked);
  registryDir = join(root, "registry");
  const init = initPluginRegistry({ dir: registryDir, registryId: "local", registryName: "Local Registry" });
  fingerprint = init.fingerprint;
  // One version whose package lives at packages/p.amcplug; the index is re-signed with the registry key.
  const index = { ...JSON.parse(readFileSync(init.indexPath, "utf8")), plugins: [{ id: PLUGIN, versions: [{ version: "1.0.0",
    sha256: "0".repeat(64), url: "packages/p.amcplug", publisherFingerprint: "1".repeat(64), riskCategory: "LOW" }] }] };
  const payload = Buffer.from(canonicalize(index), "utf8");
  writeFileSync(init.indexPath, `${canonicalize(index)}\n`);
  writeFileSync(init.sigPath, canonicalize({ digestSha256: sha256Hex(payload), signedTs: Date.now(), signer: "registry",
    signature: sign(null, payload, createPrivateKey(readFileSync(init.keyPath, "utf8"))).toString("base64") }));
});
afterEach(async () => { vi.restoreAllMocks(); await closeFixtures(); });

/** Serves the registry directory; `onServe` runs after each file is answered. */
const serveRegistry = (onServe: (path: string) => void = () => undefined): Promise<Listener> => listen((req, res) => {
  const path = (req.url ?? "/").slice(1);
  if (path === "packages/p.amcplug") res.writeHead(200).end("package-bytes");
  else res.writeHead(200).end(readFileSync(join(registryDir, path)));
  onServe(path);
});
const resolvePackage = (base: string) => resolveRegistryPackage({ registryBase: base, pluginRef: `${PLUGIN}@1.0.0`, pinnedRegistryPubkeyFingerprint: fingerprint });

describe("plugin registry browse and package resolution", () => {
  test("a denied index GET and a denied package resolution call no fetch and open no socket", async () => {
    const registry = await serveRegistry();
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(withWorkspaceScope(blocked, () => browseRegistry({ registryBase: registry.url, trust: registryTrust(fingerprint) })))
      .rejects.toBeInstanceOf(EgressBlocked);
    await expect(withWorkspaceScope(blocked, () => resolvePackage(registry.url))).rejects.toBeInstanceOf(EgressBlocked);
    expect(spy).not.toHaveBeenCalled();
    expect(registry.connections).toBe(0);
  });

  test("the open run reaches the package GET (the fixture index verifies)", async () => {
    const registry = await serveRegistry();
    await expect(withWorkspaceScope(open, () => resolvePackage(registry.url))).rejects.toThrow(/sha256 mismatch/);
    expect(registry.requests.map(row => row.path)).toEqual(["/index.json", "/index.sig", "/registry.pub", "/packages/p.amcplug"]);
  });

  test("the captured workspace is rechecked after each await: blocked mid-call, the next index file and the package are refused", async () => {
    let registry = await serveRegistry((path) => { if (path === "index.json") blockResidency(open); });
    await expect(withWorkspaceScope(open, () => resolvePackage(registry.url))).rejects.toBeInstanceOf(EgressBlocked);
    expect(registry.requests.map(row => row.path)).toEqual(["/index.json"]);

    open = newWorkspace(root, "open-2");
    registry = await serveRegistry((path) => { if (path === "registry.pub") blockResidency(open); });
    await expect(withWorkspaceScope(open, () => resolvePackage(registry.url))).rejects.toBeInstanceOf(EgressBlocked);
    expect(registry.requests.map(row => row.path)).toEqual(["/index.json", "/index.sig", "/registry.pub"]);
  });

  test("concurrent browses keep separate scopes: the blocked one sends nothing, the open one fetches", async () => {
    const registry = await serveRegistry();
    const [denied, allowed] = await Promise.allSettled([
      withWorkspaceScope(blocked, () => browseRegistry({ registryBase: registry.url, trust: registryTrust(fingerprint) })),
      withWorkspaceScope(open, () => browseRegistry({ registryBase: registry.url, trust: registryTrust(fingerprint) }))
    ]);
    expect(denied.status === "rejected" && denied.reason).toBeInstanceOf(EgressBlocked);
    expect(allowed.status).toBe("fulfilled");
    expect(registry.requests.map(row => row.path)).toEqual(["/index.json", "/index.sig", "/registry.pub"]);
  });

  test("a 3xx for the index or the package is not followed", async () => {
    const target = await listen();
    const redirector = await redirectTo(target);
    await expect(withWorkspaceScope(open, () => browseRegistry({ registryBase: redirector.url, trust: registryTrust(fingerprint) })))
      .rejects.toThrow(/registry fetch failed \(302\)/);
    const registry = await listen((req, res) => {
      const path = (req.url ?? "/").slice(1);
      if (path === "packages/p.amcplug") res.writeHead(302, { location: `${target.url}/stolen` }).end();
      else res.writeHead(200).end(readFileSync(join(registryDir, path)));
    });
    await expect(withWorkspaceScope(open, () => resolvePackage(registry.url))).rejects.toThrow(/registry fetch failed \(302\)/);
    expect(target.connections).toBe(0);
  });
});
