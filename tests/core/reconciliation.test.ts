import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { boot, type BootResult } from "@amc/core";

/**
 * P1.2's third verification: changing one entry's config reconciles only that
 * fiber — not a restart, and not its siblings.
 *
 * This is what makes a composed runtime worth having. If every config change
 * cost a process restart, AMC would lose its in-flight state: the evidence
 * ledger's open handles, the gateway's leases, and any agent mid-run. The
 * property later phases assume is that a policy or budget can change under a
 * live agent without dropping the run it is governing.
 */
describe("composition reconciliation", () => {
  let workspace: string;
  let booted: BootResult | undefined;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-reconcile-"));
    mkdirSync(join(workspace, "plugins"), { recursive: true });
    (globalThis as Record<string, unknown>).__amcReconcile = [];
  });

  afterEach(async () => {
    await booted?.dispose();
    booted = undefined;
    delete (globalThis as Record<string, unknown>).__amcReconcile;
    rmSync(workspace, { recursive: true, force: true });
  });

  const log = (): string[] => (globalThis as Record<string, unknown>).__amcReconcile as string[];

  /** A plugin that records each apply and each disposal, with its config. */
  const writePlugin = (name: string): void => {
    writeFileSync(
      join(workspace, "plugins", `${name}.js`),
      `export default {\n` +
        `  name: ${JSON.stringify(name)},\n` +
        `  apply(ctx, config) {\n` +
        `    globalThis.__amcReconcile.push(${JSON.stringify(name)} + ":apply:" + JSON.stringify(config ?? null));\n` +
        `    ctx.effect(() => () => globalThis.__amcReconcile.push(${JSON.stringify(name)} + ":dispose"));\n` +
        `  }\n` +
        `};\n`
    );
  };

  const writeComposition = (entries: Record<string, unknown>[]): void => {
    const yaml = entries
      .map((entry) =>
        Object.entries(entry)
          .map(([key, value], index) => {
            const prefix = index === 0 ? "- " : "  ";
            if (key === "config" && value && typeof value === "object") {
              const inner = Object.entries(value as Record<string, unknown>)
                .map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`)
                .join("\n");
              return `${prefix}config:\n${inner}`;
            }
            return `${prefix}${key}: ${JSON.stringify(value)}`;
          })
          .join("\n")
      )
      .join("\n");
    writeFileSync(join(workspace, "amc.cordis.yml"), `${yaml}\n`);
  };

  it("reloads only the entry whose config changed", async () => {
    writePlugin("alpha");
    writePlugin("beta");
    writeComposition([
      { id: "a", name: "./plugins/alpha.js", config: { level: 1 } },
      { id: "b", name: "./plugins/beta.js", config: { level: 1 } }
    ]);

    booted = await boot({ workspace });
    expect(log()).toEqual([
      'alpha:apply:{"level":1}',
      'beta:apply:{"level":1}'
    ]);

    log().length = 0;

    // Rewrite only alpha's config. The include watcher picks the file up and
    // reconciles by entry id.
    writeComposition([
      { id: "a", name: "./plugins/alpha.js", config: { level: 2 } },
      { id: "b", name: "./plugins/beta.js", config: { level: 1 } }
    ]);

    // Drive the refresh directly rather than through a file watcher. Config
    // watching arrives with HMR in P1.4; what P1.2 must establish is the
    // reconciliation *semantics* — that a changed entry is diffed by id and
    // only that fiber is rebuilt.
    await booted.reload();

    const events = log();
    expect(events, "alpha must reload with its new config").toContain('alpha:apply:{"level":2}');
    expect(events, "alpha's previous fiber must be disposed").toContain("alpha:dispose");
    // The point of id-diff reconciliation: an untouched sibling is not
    // disturbed. If beta reloads too, this is a restart wearing a disguise.
    expect(events.filter((line) => line.startsWith("beta:"))).toEqual([]);
  });
});
