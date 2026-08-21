import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configInit, configValidate } from "../src/config/amcConfigCli.js";
import { runFromConfig } from "../src/config/amcConfigRunner.js";

/**
 * G2-29: the amcconfig.yaml loader, validator and runner were ~1,100 lines
 * with no CLI path. The runner's own header advertised `amc eval run --config`,
 * a command that was never registered, so a documented amcconfig.yaml could
 * not actually be executed. They are now behind `amc config init|validate|run`.
 */
const dirs: string[] = [];
function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-declcfg-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("declarative config pipeline", () => {
  it("init writes a config the validator accepts", () => {
    const ws = workspace();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    configInit({ workspace: ws, force: false });
    expect(existsSync(join(ws, "amcconfig.yaml"))).toBe(true);

    // The starter file must be valid; validate exits non-zero otherwise.
    expect(() => configValidate({ workspace: ws })).not.toThrow();
    log.mockRestore();
  });

  it("points at a command that exists", () => {
    const ws = workspace();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    configInit({ workspace: ws, force: false });
    const printed = log.mock.calls.flat().join(" ");
    // It used to tell the user to run `amc eval run`, which was never registered.
    expect(printed).toContain("amc config run");
    expect(printed).not.toContain("amc eval run");
    log.mockRestore();
  });

  it("dry run resolves the declared agents without executing", async () => {
    const ws = workspace();
    vi.spyOn(console, "log").mockImplementation(() => {});
    configInit({ workspace: ws, force: false });

    const result = await runFromConfig({ workspace: ws, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.agents.length).toBeGreaterThan(0);
    expect(result.configPath).toContain("amcconfig.yaml");
  });

  it("refuses to overwrite an existing config without --force", () => {
    const ws = workspace();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation(((): never => {
      throw new Error("exit");
    }) as never);
    configInit({ workspace: ws, force: false });
    expect(() => configInit({ workspace: ws, force: false })).toThrow("exit");
    exit.mockRestore();
  });
});
