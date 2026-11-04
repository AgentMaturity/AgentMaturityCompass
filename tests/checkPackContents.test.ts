import { describe, expect, test } from "vitest";
import { forbiddenPackPaths } from "../scripts/check-pack-contents.mjs";

describe("check-pack-contents (P0-34)", () => {
  test("private trees, key material, vault data and env files are refused", () => {
    const listing = ["AMC_OS/x", ".amc/keys/a.pub", "dist/vault.json", "tests/a.test.ts", "src/index.ts", "research/n.md",
      "plans/p.md", "dist/release.pem", "dist/signing.key", "dist/.env", "dist/.env.local", "deploy/secrets/token",
      "dist/x/.amc/vault.amcvault", "dist/ws.amcvault"];
    expect(forbiddenPackPaths(listing)).toEqual(listing);
  });

  test("a clean listing passes, including code that only mentions vault, research or secrets in its name", () => {
    expect(forbiddenPackPaths(["package.json", "README.md", "LICENSE", "dist/cli.js", "dist/vault/vault.js",
      "dist/vault/vault.d.ts", "dist/api/vaultRouter.js", "dist/steer/research/index.js", "dist/vault/secretsBroker.js",
      "dist/env.js", "catalog/controls.json", "deploy/apparmor/amc-shell", "scripts/postinstall.js"])).toEqual([]);
  });
});
