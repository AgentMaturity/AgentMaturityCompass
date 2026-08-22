import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { boot, BootError, loadComposition, CompositionError, dumpComposition } from "@amc/core";

/**
 * P1.2's stated verification:
 *   - `--dump-config` shows the boot tree with provenance
 *   - a PENDING plugin with an unresolved service fails loud, naming it
 *   - changing one entry's config reconciles that fiber, not the process
 *
 * The failure these guard against is a runtime that reports success while
 * half-composed. Every later phase hangs enforcement, evidence and scoring off
 * this tree, so a silently absent plugin is a silently absent control.
 */
describe("amc-core boot", () => {
  let workspace: string;

  const writeComposition = (entries: Record<string, unknown>[]): string => {
    const path = join(workspace, "amc.cordis.yml");
    const yaml = entries
      .map((entry) =>
        Object.entries(entry)
          .map(([key, value], index) =>
            `${index === 0 ? "- " : "  "}${key}: ${JSON.stringify(value)}`
          )
          .join("\n")
      )
      .join("\n");
    writeFileSync(path, `${yaml}\n`);
    return path;
  };

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "amc-boot-"));
    mkdirSync(join(workspace, "plugins"), { recursive: true });
  });
  afterEach(() => rmSync(workspace, { recursive: true, force: true }));

  it("boots an empty composition and disposes cleanly", async () => {
    writeFileSync(join(workspace, "amc.cordis.yml"), "[]\n");
    const result = await boot({ workspace });
    expect(result.unsettled).toEqual([]);
    expect(result.composition.sha256).toMatch(/^[0-9a-f]{64}$/);
    await result.dispose();
  });

  it("refuses to boot without a composition file, and says where it looked", async () => {
    await expect(boot({ workspace })).rejects.toThrow(/composition file not found/);
  });

  it("reports an unsigned composition rather than assuming trust", () => {
    writeFileSync(join(workspace, "amc.cordis.yml"), "[]\n");
    const source = loadComposition({ workspace });
    expect(source.signature.present).toBe(false);
    expect(source.signature.valid).toBe(false);
    expect(source.signature.reason).toBe("no signature sidecar");
  });

  it("accepts a matching signature and rejects one that no longer matches", () => {
    const path = join(workspace, "amc.cordis.yml");
    writeFileSync(path, "[]\n");
    const digest = createHash("sha256").update("[]\n").digest("hex");
    writeFileSync(
      `${path}.sig`,
      JSON.stringify({ configSha256: digest, signature: "sig", signer: "auditor" })
    );
    expect(loadComposition({ workspace }).signature.valid).toBe(true);

    // Editing the composition after signing must invalidate it: the file
    // decides which controls run.
    writeFileSync(path, "[]\n# edited\n");
    const after = loadComposition({ workspace });
    expect(after.signature.valid).toBe(false);
    expect(after.signature.reason).toMatch(/changed since signing/);
  });

  it("refuses to boot an unsigned composition when attestation is required", async () => {
    writeFileSync(join(workspace, "amc.cordis.yml"), "[]\n");
    await expect(
      boot({ workspace, requireSignature: true })
    ).rejects.toThrow(CompositionError);
  });

  it("names the missing service when a plugin never settles", async () => {
    // A plugin injecting a service nothing provides stays PENDING forever.
    writeFileSync(
      join(workspace, "plugins", "needs-service.js"),
      // Cordis reads `inject` off the plugin object, not as a sibling module
      // export, so the object form is the one that actually declares a
      // dependency.
      `export default { name: "needsService", inject: ["amcLedger"], apply() {} };\n`
    );
    writeComposition([{ id: "1", name: "./plugins/needs-service.js" }]);

    const error = await boot({ workspace }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BootError);
    const message = (error as BootError).message;
    expect(message).toMatch(/did not settle/);
    // The whole point: the diagnostic must name what it is waiting for.
    expect(message).toContain("amcLedger");
  });

  it("disposes the partial tree when boot fails", async () => {
    const released: string[] = [];
    (globalThis as Record<string, unknown>).__amcBootProbe = released;
    writeFileSync(
      join(workspace, "plugins", "tracks-effect.js"),
      `export default function tracksEffect(ctx) {\n` +
        `  ctx.effect(() => () => globalThis.__amcBootProbe.push("released"));\n` +
        `}\n`
    );
    writeFileSync(
      join(workspace, "plugins", "stalls.js"),
      `export default { name: "stalls", inject: ["neverProvided"], apply() {} };\n`
    );
    writeComposition([
      { id: "1", name: "./plugins/tracks-effect.js" },
      { id: "2", name: "./plugins/stalls.js" }
    ]);

    await expect(boot({ workspace })).rejects.toThrow(BootError);
    // A failed boot must not leave live plugins holding resources.
    expect(released).toEqual(["released"]);
    delete (globalThis as Record<string, unknown>).__amcBootProbe;
  });

  it("dumps the composition with provenance, without booting it", () => {
    writeComposition([
      { id: "1", name: "./plugins/a.js", config: { level: 2 } },
      { id: "2", name: "./plugins/b.js", disabled: true }
    ]);
    const dump = dumpComposition(loadComposition({ workspace }));

    expect(dump.composition.signed).toBe(false);
    expect(dump.entries).toHaveLength(2);
    expect(dump.entries[0]!.name).toBe("./plugins/a.js");
    expect(dump.entries[0]!.source).toContain("amc.cordis.yml");
    expect(dump.entries[1]!.disabled).toBe(true);
  });
});
