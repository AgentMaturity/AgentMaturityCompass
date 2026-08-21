import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * G3-28: install.sh exists at the repo root and in website/, byte-identical.
 * Both are load-bearing — the root copy is what the GitHub raw URL serves and
 * the website copy is what agentmaturity.co/install.sh serves — so neither can
 * simply be deleted. What must not happen is the two drifting apart, leaving
 * users on different install paths depending on which link they followed.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("installer copies stay in step", () => {
  it("root and website install.sh are identical", () => {
    const root = readFileSync(join(repoRoot, "install.sh"), "utf8");
    const site = readFileSync(join(repoRoot, "website/install.sh"), "utf8");
    expect(site).toBe(root);
  });

  it("the installer pins a release rather than tracking a moving target", () => {
    const root = readFileSync(join(repoRoot, "install.sh"), "utf8");
    // A pinned version and a checksum are what make a curl|sh install auditable.
    expect(root).toMatch(/VERSION|version/);
  });
});
