import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { packInitCli, resolvePackEntryPath } from "../src/packs/packCli.js";

const roots: string[] = [];

function tempPack(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-pack-cli-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("pack CLI scaffolding and entry resolution", () => {
  test("pack init scaffolds index.mjs and resolves it as the test entry point", async () => {
    const packDir = tempPack();
    const result = packInitCli({
      directory: packDir,
      name: "kwame-test",
      description: "Regression fixture for local pack test entry resolution",
      author: "AMC QA"
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(packDir, "index.mjs"))).toBe(true);
    expect(existsSync(join(packDir, "index.js"))).toBe(false);

    const manifest = JSON.parse(readFileSync(join(packDir, "package.json"), "utf8")) as { main: string };
    expect(manifest.main).toBe("index.mjs");

    const entryPath = resolvePackEntryPath(packDir, manifest.main);
    expect(entryPath).toBe(join(packDir, "index.mjs"));

    const packModule = await import(pathToFileURL(entryPath!).href);
    const pack = packModule.default;
    const run = await pack.execute({ agentId: "test-agent", workspace: packDir, mode: "sandbox" });
    expect(run.success).toBe(true);
    expect(run.results[0].scenarioId).toBe("example-check");
  });

  test("pack test entry resolution falls back to legacy index.js", () => {
    const packDir = tempPack();
    const result = packInitCli({ directory: packDir, name: "legacy-pack" });
    expect(result.success).toBe(true);

    unlinkSync(join(packDir, "index.mjs"));
    writeFileSync(
      join(packDir, "index.js"),
      "export default { async execute() { return { success: true, results: [] }; } };\n",
      "utf8"
    );

    expect(resolvePackEntryPath(packDir, "index.mjs")).toBe(join(packDir, "index.js"));
  });

  test("pack test entry resolution honors package main inside the pack", () => {
    const packDir = tempPack();
    const result = packInitCli({ directory: packDir, name: "custom-main-pack" });
    expect(result.success).toBe(true);

    writeFileSync(
      join(packDir, "custom-entry.mjs"),
      "export default { async execute() { return { success: true, results: [] }; } };\n",
      "utf8"
    );

    expect(resolvePackEntryPath(packDir, "custom-entry.mjs")).toBe(join(packDir, "custom-entry.mjs"));
    expect(resolvePackEntryPath(packDir, "../outside.mjs")).toBe(join(packDir, "index.mjs"));
  });
});
