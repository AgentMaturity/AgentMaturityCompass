import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { distrustEntry } from "./trustFixtures.js";

const shipped = vi.hoisted(() => ({ text: "" }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const readFileSync = ((path: unknown, ...rest: unknown[]) => /[\\/]trust[\\/]amc-distrust\.json$/.test(String(path)) && shipped.text
    ? shipped.text
    : (actual.readFileSync as (...args: unknown[]) => unknown)(path, ...rest)) as typeof actual.readFileSync;
  return { ...actual, default: { ...actual, readFileSync }, readFileSync };
});
const { readFileSync, readdirSync } = await import("node:fs");
const { trustFromFlags } = await import("../../src/cli-trust-flags.js");
const { initPluginRegistry, verifyPluginRegistry } = await import("../../src/plugins/pluginRegistry.js");
const { verdictExitCode } = await import("../../src/trust/index.js");

/**
 * P0-09 verify surfaces: the inventory, the CLI registrations and the handlers agree that portable verifiers take the
 * operator's pins, and that no handler builds a verdict from the workspace's own keys.
 */
const roots: string[] = [];
afterEach(() => { shipped.text = ""; });
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

const PR3_COMMANDS = [
  "audit binder verify", "bench verify", "benchmark verify", "backup verify", "plugin verify", "plugin registry verify",
  "prompt pack verify", "federate verify-bundle"
];

function inventoryRows(): Array<{ command: string; kind: string; pinning: string }> {
  return readFileSync(resolve("docs/security/verifier-inventory.md"), "utf8").split("\n")
    .filter(line => line.startsWith("| `amc "))
    .map(line => line.split(" | ").map(cell => cell.replace(/^\|\s*|\s*\|$/g, "").trim()))
    .map(cells => ({ command: cells[0]!.replace(/^`amc |`$/g, ""), kind: cells[2]!, pinning: cells[3]! }));
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? sourceFiles(join(directory, entry.name))
    : /\.(ts|js)$/.test(entry.name) ? [join(directory, entry.name)] : []);
}

describe("verify surfaces (P0-09)", () => {
  it("lists every PR 3 command as a wired portable verifier", () => {
    const rows = new Map(inventoryRows().map(row => [row.command, row]));
    for (const command of PR3_COMMANDS) {
      expect(rows.get(command), command).toMatchObject({ kind: "portable artifact" });
      expect(rows.get(command)?.pinning, command).toMatch(/^Wired \(PR 3/);
    }
    const unreviewed = inventoryRows().filter(row => /not yet reviewed|^PR 3 \(/.test(row.pinning));
    expect(unreviewed.map(row => row.command)).toEqual([]);
  });

  it("registers --trust-list on every wired portable command", () => {
    const wired = inventoryRows().filter(row => row.kind === "portable artifact" && row.pinning.startsWith("Wired"));
    expect(wired.length).toBeGreaterThanOrEqual(PR3_COMMANDS.length + 5);
    for (const row of wired) {
      const help = spawnSync(process.execPath, [resolve("dist/cli.js"), ...row.command.split(" "), "--help"], { encoding: "utf8", timeout: 60_000 });
      expect(help.stdout, row.command).toContain("--trust-list");
      expect(help.stdout, row.command).toContain("--allow-unpinned");
    }
  }, 300_000);

  it("never imports workspaceSelfTrust into a CLI or API handler", () => {
    const handler = /(^src\/cli[^/]*\.ts$)|(Cli\.ts$)|(^src\/api\/)|(Router\.ts$)|(^src\/studio\/studioServer\.ts$)/;
    const offenders = sourceFiles(resolve("src")).map(file => file.slice(resolve(".").length + 1).replace(/\\/g, "/"))
      .filter(file => handler.test(file) && readFileSync(resolve(file), "utf8").includes("workspaceSelfTrust"));
    expect(offenders).toEqual([]);
  });

  it("refuses a key in an injected built-in distrust entry even with --pubkey", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-surface-registry-"));
    roots.push(dir);
    const registry = initPluginRegistry({ dir });
    shipped.text = JSON.stringify({ distrust: [distrustEntry(registry.fingerprint, { reason: "exposed-in-public-history", source: "amc-project" })] });
    for (const allowUnpinned of [false, true]) {
      const trust = trustFromFlags({ pubkey: registry.pubPath, allowUnpinned }, ["artifact-seal"]);
      const out = verifyPluginRegistry(dir, trust as never) as unknown as { ok: boolean; report: Parameters<typeof verdictExitCode>[0] };
      expect(out.ok).toBe(false);
      expect(out.report.issuerAdmission.signatures[0]).toMatchObject({ status: "distrusted", keyId: registry.fingerprint });
      expect(verdictExitCode(out.report)).toBe(1);
    }
  });
});
