import { describe, expect, it } from "vitest";
import { stableNodePath } from "../src/adapters/hookProviders/nodePath.js";

const CELLAR = "/opt/homebrew/Cellar/node/25.5.0/bin/node";
const links: Record<string, string> = {
  [CELLAR]: CELLAR,
  "/opt/homebrew/opt/node/bin/node": CELLAR,
  "/opt/homebrew/bin/node": CELLAR,
  "/usr/local/bin/node": "/usr/local/Cellar/node/20.1.0/bin/node"
};
const deps = (over: Partial<Parameters<typeof stableNodePath>[0] & object> = {}) => ({
  execPath: CELLAR, pathEnv: "/usr/local/bin:/opt/homebrew/bin", realpath: (path: string) => links[path] ?? null, ...over
});

describe("the Node an observation hook names survives brew upgrade", () => {
  it("names the formula's opt link when it resolves to the running binary", () => {
    expect(stableNodePath(deps())).toBe("/opt/homebrew/opt/node/bin/node");
  });
  it("falls back to a node on PATH that resolves to the same binary, skipping one that resolves elsewhere", () => {
    const noOpt: Record<string, string> = { ...links, "/opt/homebrew/opt/node/bin/node": "/elsewhere" };
    expect(stableNodePath(deps({ realpath: (path) => noOpt[path] ?? null }))).toBe("/opt/homebrew/bin/node");
  });
  it("keeps process.execPath when nothing stable resolves to it", () => {
    expect(stableNodePath(deps({ execPath: "/custom/node", pathEnv: "/usr/local/bin", realpath: (p) => (p === "/custom/node" ? p : links[p] ?? null) }))).toBe("/custom/node");
    expect(stableNodePath(deps({ realpath: () => null }))).toBe(CELLAR);
  });
});
