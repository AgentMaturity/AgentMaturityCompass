import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCompositionCommands } from "../src/cli-composition-commands.js";

describe("composition inspection through the bundled runtime seam", () => {
  let workspace: string;
  let program: Command;
  const source = "- id: inspection\n  name: ./not-installed.mjs\n  disabled: true\n";

  beforeEach(() => {
    workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-composition-cli-")));
    vi.spyOn(process, "cwd").mockReturnValue(workspace);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((code) => { throw new Error(`exit ${code}`); });
    program = new Command();
    registerCompositionCommands(program);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(workspace, { recursive: true, force: true });
  });

  it("inspects an explicit unsigned composition without loading its missing plugin", async () => {
    const path = join(workspace, "inspect.yml");
    writeFileSync(path, source);
    await program.parseAsync(["composition", "--config", "inspect.yml", "--json"], { from: "user" });
    const dump = JSON.parse(vi.mocked(console.log).mock.calls[0]![0] as string);
    expect(dump.composition).toEqual({ path, sha256: createHash("sha256").update(source).digest("hex"),
      signed: false, signatureReason: "no signature sidecar" });
    expect(dump.entries).toEqual([{ id: "inspection", name: "./not-installed.mjs", disabled: true, source: path }]);
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("renders the default composition for people", async () => {
    writeFileSync(join(workspace, "amc.cordis.yml"), source);
    await program.parseAsync(["composition"], { from: "user" });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("./not-installed.mjs [disabled]"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("UNSIGNED"));
  });

  it("reports the missing file rather than a misleading missing private package", async () => {
    await expect(program.parseAsync(["composition", "--json"], { from: "user" })).rejects.toThrow("exit 1");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("composition file not found"));
    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining("@amc/core"));
  });
});
