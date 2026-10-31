import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const generator = resolve("scripts/vendor/gen-third-party-notices.mjs");
const run = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [generator, ...args], { cwd, encoding: "utf8" });
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

/** A workspace with no vendored package and one adapted module whose provenance lists `sources`. */
function workspace(sources: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "amc-notices-"));
  dirs.push(root);
  mkdirSync(join(root, "vendor"));
  mkdirSync(join(root, "prov"));
  writeFileSync(join(root, "vendor", "UPSTREAM_LEDGER_DSH.md"), "# Vendored Packages\n");
  writeFileSync(join(root, "prov", "LICENSE.txt"), "MIT License\n\nCopyright (c) 2026 Upstream\n");
  writeFileSync(join(root, "prov", "provenance.json"), JSON.stringify({ revision: "a".repeat(40), sources: sources.map(path => ({ path })) }));
  writeFileSync(join(root, "vendor", "ADAPTED_MODULES.json"), JSON.stringify([{ title: "Upstream framing reference",
    adaptedIn: "src/frames.ts", upstreamRepo: "https://example.test/upstream", provenance: "prov/provenance.json",
    sourceModule: "src/zstd.ts", license: "MIT", licenseFile: "prov/LICENSE.txt", note: "The scanner adapts the upstream algorithm." }]));
  return root;
}

describe("THIRD_PARTY_NOTICES generator", () => {
  test("the committed notices are current and keep the DSH v4 Zstandard attribution", () => {
    const result = run(process.cwd(), "--check");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const notices = readFileSync("THIRD_PARTY_NOTICES", "utf8");
    expect(notices).toContain("## DSH v4 Zstandard framing reference\n\n- Adapted in: `src/importers/dshSessionFrames.ts`");
    expect(notices).toContain("- Upstream commit: `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`");
    expect(notices).toContain("Copyright (c) 2026 DeepSeek");
  });

  test("renders an adapted module from the tracked manifest, its commit from the provenance record", () => {
    const root = workspace(["src/zstd.ts"]);
    expect(run(root).status).toBe(0);
    const notices = readFileSync(join(root, "THIRD_PARTY_NOTICES"), "utf8");
    expect(notices.endsWith("## Upstream framing reference\n\n- Adapted in: `src/frames.ts`\n- Upstream source: https://example.test/upstream\n"
      + `- Upstream commit: \`${"a".repeat(40)}\`\n- Source module: \`src/zstd.ts\`\n- License: MIT\n\n`
      + "The scanner adapts the upstream algorithm.\n\n```\nMIT License\n\nCopyright (c) 2026 Upstream\n```\n")).toBe(true);
  });

  test("refuses an adapted module whose provenance record does not list its source module", () => {
    const root = workspace(["src/format.ts"]);
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Upstream framing reference: prov/provenance.json pins no upstream commit for src/zstd.ts");
  });
});
