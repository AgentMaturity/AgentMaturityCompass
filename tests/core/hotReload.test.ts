import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { boot, type BootResult } from "@amc/core";

/**
 * P1.4's stated verifications:
 *   - editing a plugin file hot-reloads it without dropping sibling plugins
 *   - a deliberately broken reload restores the prior good tree (never
 *     half-loaded)
 *   - the watcher is AMC's first fs-watch code
 *
 * The second is the one that matters. A reload that fails halfway leaves the
 * runtime enforcing a mixture of the old policy and the new — worse than either,
 * and undetectable from inside. Transactional reload is what makes editing a
 * live governed system safe rather than reckless.
 */
describe("hot reload", () => {
  let workspace: string;
  let booted: BootResult | undefined;

  const log = (): string[] => (globalThis as Record<string, unknown>).__amcHmr as string[];

  const writePlugin = (name: string, marker: string): void => {
    writeFileSync(
      join(workspace, "plugins", `${name}.js`),
      `export default {\n` +
        `  name: ${JSON.stringify(name)},\n` +
        `  apply(ctx) {\n` +
        `    globalThis.__amcHmr.push(${JSON.stringify(name)} + ":" + ${JSON.stringify(marker)});\n` +
        `    ctx.effect(() => () => globalThis.__amcHmr.push(${JSON.stringify(name)} + ":dispose"));\n` +
        `  }\n` +
        `};\n`
    );
  };

  const writeComposition = (names: string[]): void => {
    const yaml = names
      .map((name, index) => `- id: "${index}"\n  name: "./plugins/${name}.js"`)
      .join("\n");
    writeFileSync(join(workspace, "amc.cordis.yml"), `${yaml}\n`);
  };

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-hmr-"));
    mkdirSync(join(workspace, "plugins"), { recursive: true });
    (globalThis as Record<string, unknown>).__amcHmr = [];
  });

  afterEach(async () => {
    await booted?.dispose();
    booted = undefined;
    delete (globalThis as Record<string, unknown>).__amcHmr;
    rmSync(workspace, { recursive: true, force: true });
  });

  it("does not watch unless asked", async () => {
    writePlugin("alpha", "v1");
    writeComposition(["alpha"]);
    booted = await boot({ workspace });

    writePlugin("alpha", "v2");
    await new Promise((resolve) => setTimeout(resolve, 400));

    // A file watcher in production turns an accidental write into a live
    // reconfiguration of the controls enforcing policy. It has to be asked for.
    expect(log()).toEqual(["alpha:v1"]);
  });

  it("reloads an edited plugin without dropping its siblings", async () => {
    writePlugin("alpha", "v1");
    writePlugin("beta", "v1");
    writeComposition(["alpha", "beta"]);

    booted = await boot({ workspace, watch: { debounce: 20 } });
    expect(log()).toEqual(["alpha:v1", "beta:v1"]);
    log().length = 0;

    writePlugin("alpha", "v2");

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && !log().includes("alpha:v2")) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(log(), "the edited plugin reloads").toContain("alpha:v2");
    expect(log(), "its previous instance is disposed").toContain("alpha:dispose");
    // If beta reloads too, this is a restart wearing a disguise.
    expect(log().filter((line) => line.startsWith("beta:"))).toEqual([]);
  }, 30_000);

  it("keeps the prior good tree when a reload is broken", async () => {
    writePlugin("alpha", "v1");
    writePlugin("beta", "v1");
    writeComposition(["alpha", "beta"]);

    booted = await boot({ workspace, watch: { debounce: 20 } });
    log().length = 0;

    // Syntactically invalid: the reload must fail, not half-apply.
    writeFileSync(join(workspace, "plugins", "alpha.js"), "export default { this is not javascript\n");
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    // Neither plugin may be left disposed-but-not-replaced. A runtime enforcing
    // a mixture of old and new policy is worse than either.
    const disposedWithoutReplacement = log().filter((line) => line.endsWith(":dispose")).length;
    const reapplied = log().filter((line) => /:(v1|v2)$/.test(line)).length;
    expect(
      disposedWithoutReplacement,
      `a failed reload must not strand a disposed plugin (log: ${log().join(", ")})`
    ).toBe(reapplied);
  }, 30_000);

  it("stops watching when the runtime is disposed", async () => {
    writePlugin("alpha", "v1");
    writeComposition(["alpha"]);
    booted = await boot({ workspace, watch: { debounce: 20 } });
    await booted.dispose();
    booted = undefined;
    log().length = 0;

    writePlugin("alpha", "v3");
    await new Promise((resolve) => setTimeout(resolve, 500));

    // A watcher outliving its runtime holds the process open and reloads into
    // a tree that no longer exists.
    expect(log()).toEqual([]);
  }, 20_000);
});
