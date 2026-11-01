/** P2-01 native web GET (src/tools/builtin/nativeToolBreadth/governedFetch.ts governedGet, used by web_fetch and web_search). */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { withWorkspaceScope } from "../../src/enforce/evidenceEmitter.js";
import { EgressBlocked } from "../../src/residency/checkEgress.js";
import { governedGet, type GovernedGetInput, type WebEgressDecision } from "../../src/tools/builtin/nativeToolBreadth/governedFetch.js";
import { NativeToolRefusal } from "../../src/tools/builtin/nativeToolBreadth/originPolicy.js";
import { blockResidency, closeFixtures, listen, newWorkspace, redirectTo, tempRoot, type Listener } from "./egressFixture.js";

vi.setConfig({ testTimeout: 60_000 });
let root: string, blocked: string, open: string, site: Listener;
beforeEach(async () => {
  root = tempRoot();
  blocked = newWorkspace(root, "blocked");
  open = newWorkspace(root, "open");
  blockResidency(blocked);
  site = await listen((_req, res) => { res.writeHead(200, { "content-type": "text/plain" }).end("page"); });
});
afterEach(async () => { vi.restoreAllMocks(); await closeFixtures(); });

/** A GET of `origin` (signed origins: that origin; egress hosts: its name and the loopback literal it resolves to). */
function input(origin: string, extra: Partial<GovernedGetInput> = {}): GovernedGetInput & { workspace?: string } {
  const host = new URL(origin).hostname;
  return { tool: "web_fetch", url: `${origin}/doc`, maxBytes: 10_000, recordEgress: (_decision: WebEgressDecision) => undefined,
    policy: { origins: new Set([origin]), hosts: [...new Set([host, "127.0.0.1"])], maxBytes: 10_000, policyDigestSha256: "0".repeat(64) },
    agentId: "default", ...extra };
}

describe("native web governed GET", () => {
  test("a denied GET opens no socket, with an explicit workspace or the caller's scope", async () => {
    await expect(governedGet(input(site.url, { workspace: blocked }))).rejects.toBeInstanceOf(EgressBlocked);
    await expect(withWorkspaceScope(blocked, () => governedGet(input(site.url)))).rejects.toBeInstanceOf(EgressBlocked);
    expect(site.connections).toBe(0);
  });

  test("the workspace is captured before DNS: changing the caller's input during the lookup does not widen the check", async () => {
    const port = new URL(site.url).port;
    const request = input(`http://fixture.test:${port}`, { workspace: blocked });
    request.resolve = async () => {
      request.workspace = open; // an open workspace would admit the GET if it were read now
      return ["127.0.0.1"];
    };
    await expect(governedGet(request)).rejects.toBeInstanceOf(EgressBlocked);
    expect(site.connections).toBe(0);
    // Control: the same lookup path reaches the site when the captured workspace is open.
    await expect(governedGet({ ...input(`http://fixture.test:${port}`, { workspace: open }), resolve: async () => ["127.0.0.1"] }))
      .resolves.toMatchObject({ status: 200, address: "127.0.0.1" });
    expect(site.connections).toBe(1);
  });

  test("a 3xx is refused, not followed, even when the target is reachable", async () => {
    const redirector = await redirectTo(site);
    await expect(governedGet(input(redirector.url, { workspace: open }))).rejects.toBeInstanceOf(NativeToolRefusal);
    expect(site.connections).toBe(0);
  });
});
