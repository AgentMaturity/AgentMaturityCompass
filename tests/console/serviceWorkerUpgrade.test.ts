import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

// 2026-11-14: a profile that still held the 1.0 worker (cache-first) loaded the new page with old cached scripts, and the
// first screen stayed on "Authentication required". The new worker reloads open pages once when it replaces an old cache.
async function activate(cacheKeys: string[]): Promise<{ navigated: string[]; deleted: string[]; claimed: boolean }> {
  const source = readFileSync("src/console/assets/sw.js", "utf8");
  const listeners: Record<string, (event: { waitUntil: (work: Promise<unknown>) => void }) => void> = {};
  const seen = { navigated: [] as string[], deleted: [] as string[], claimed: false };
  const self = {
    registration: { scope: "http://127.0.0.1:3212/w/demo/console/" },
    addEventListener: (name: string, listener: (typeof listeners)[string]) => { listeners[name] = listener; },
    clients: {
      claim: async () => { seen.claimed = true; },
      matchAll: async () => [
        { url: "http://127.0.0.1:3212/w/demo/console/", navigate: async (url: string) => { seen.navigated.push(url); } },
        { url: "http://127.0.0.1:3212/w/demo/console/agent", navigate: async () => { throw new Error("client gone"); } }
      ]
    }
  };
  const caches = { keys: async () => cacheKeys, delete: async (key: string) => { seen.deleted.push(key); return true; } };
  vm.runInNewContext(source, { self, caches, URL, Response, fetch: async () => new Response("") });
  let work: Promise<unknown> = Promise.resolve();
  listeners.activate!({ waitUntil: (promise) => { work = promise; } });
  await work;
  return seen;
}

describe("console service worker upgrade", () => {
  const current = /const CACHE_NAME = "([^"]+)";/.exec(readFileSync("src/console/assets/sw.js", "utf8"))![1]!;

  it("reloads the open pages once when it replaces an older worker's cache, and survives a client that is gone", async () => {
    const seen = await activate(["amc-console-v1", current]);
    expect(seen.deleted).toEqual(["amc-console-v1"]);
    expect(seen.claimed).toBe(true);
    expect(seen.navigated).toEqual(["http://127.0.0.1:3212/w/demo/console/"]);
  });

  it("does not reload anything on a first install or a restart of the same version", async () => {
    expect((await activate([])).navigated).toEqual([]);
    expect((await activate([current])).navigated).toEqual([]);
  });
});
