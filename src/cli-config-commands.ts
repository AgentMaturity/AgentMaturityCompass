import type { Command } from "commander";
import { loadDeclarativeConfig } from "./config/amcConfigLoader.js";

/**
 * `amc config provenance [pointer]` (SH-EXT-07): where every resolved amcconfig.yaml leaf came from (layer, file,
 * sha256), and for one JSON Pointer the winning source plus every value the lower layers gave it. `config validate
 * --json` already prints the per-leaf provenance; this is the human view and the shadow history.
 *
 * THE WINNER'S VALUE IS READ FROM THE RESOLVED CONFIG, never from the history's last entry: when a layer replaces a
 * whole subtree, a leaf it does not set falls back to its default while the history still holds the replaced layer's
 * value (now shadowed), and an untouched default has no history at all.
 */
function valueAt(config: unknown, pointer: string): unknown {
  let current: unknown = config;
  for (const token of pointer.split("/").slice(1)) {
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function registerConfigProvenanceCommand(config: Command): void {
  config.command("provenance [pointer]")
    .description("Show which layer and file set each resolved amcconfig.yaml value; with a JSON Pointer, the winner and every shadowed value")
    .option("--config <path>", "explicit config file (replaces the discovered workspace file)")
    .option("--user-config [path]", "opt in to the user layer (~/.amc/amcconfig.yaml, or a file)")
    .option("--json", "machine-readable output", false)
    .action((pointer: string | undefined, opts: { config?: string; userConfig?: string | boolean; json: boolean }) => {
      try {
        const result = loadDeclarativeConfig(opts.config, process.cwd(), { ...(opts.userConfig === undefined ? {} : { userConfig: opts.userConfig }) });
        if (pointer !== undefined) {
          if (!(pointer in result.provenance)) throw new Error(`${pointer} is not a resolved leaf; known pointers: ${Object.keys(result.provenance).slice(0, 20).join(", ")}${Object.keys(result.provenance).length > 20 ? ", …" : ""}`);
          const history = result.history[pointer] ?? [];
          const winner = result.provenance[pointer]!, value = valueAt(result.config, pointer);
          // A default winner shadows every recorded value (the layer that set them was replaced); otherwise the last entry is the winner.
          const shadowed = winner.layer === "default" ? history : history.slice(0, -1);
          if (opts.json) { console.log(JSON.stringify({ ok: true, pointer, winner: { ...winner, value }, shadowed }, null, 2)); return; }
          console.log(`${pointer}: ${JSON.stringify(value)} from ${winner.layer}${winner.path === null ? "" : ` ${winner.path}`}${winner.sha256 === null ? "" : ` (sha256 ${winner.sha256})`}`);
          for (const entry of shadowed) console.log(`  shadowed: ${JSON.stringify(entry.value)} from ${entry.layer}${entry.path === null ? "" : ` ${entry.path}`}`);
          if (shadowed.length === 0 && winner.layer === "default") console.log("  (built-in default; no layer set it)");
          return;
        }
        const rows = Object.entries(result.provenance).map(([at, source]) => ({ pointer: at, ...source, shadowed: Math.max(0, (result.history[at]?.length ?? 0) - 1) }));
        if (opts.json) { console.log(JSON.stringify({ ok: true, configPath: result.configPath, leaves: rows }, null, 2)); return; }
        console.log(`Resolved from ${result.configPath}`);
        for (const row of rows) console.log(`${row.pointer}: ${row.layer}${row.path === null ? "" : ` ${row.path}`}${row.shadowed > 0 ? ` (shadows ${row.shadowed})` : ""}`);
      } catch (error) {
        if (opts.json) console.log(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }, null, 2));
        else console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });
}
