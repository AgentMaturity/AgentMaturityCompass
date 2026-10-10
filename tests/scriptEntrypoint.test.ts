import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = process.cwd();
// Scripts whose main guard compared the unresolved argv[1]: started through a symlink they skipped main() and exited 0.
const SCRIPTS = ["check-citations", "check-regulatory-currency", "human-first-use-capture", "human-first-use-intake",
  "human-first-use-observer", "package-lint", "per-file-coverage", "qualify-platform", "source-quality"]
  .map((name) => `scripts/${name}.mjs`);

describe("script entry points (P0-14 follow-up)", () => {
  it("isEntrypoint is true when a script is started directly or through a symlink, and false when imported", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-entrypoint-"));
    try {
      const helper = pathToFileURL(resolve(root, "scripts/lib/entrypoint.mjs")).href;
      writeFileSync(join(dir, "main.mjs"), `import { isEntrypoint } from ${JSON.stringify(helper)};\nconsole.log(isEntrypoint(import.meta.url) ? "main" : "imported");\n`);
      writeFileSync(join(dir, "importer.mjs"), 'import "./main.mjs";\n');
      symlinkSync(join(dir, "main.mjs"), join(dir, "link.mjs"));
      const run = (file: string) => spawnSync(process.execPath, [join(dir, file)], { encoding: "utf8" }).stdout.trim();
      expect(run("main.mjs")).toBe("main");
      expect(run("link.mjs")).toBe("main");
      expect(run("importer.mjs")).toBe("imported");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(SCRIPTS)("%s runs main() through the shared realpath guard", (script) => {
    const source = readFileSync(resolve(root, script), "utf8");
    expect(source).not.toContain("resolve(process.argv[1]) === fileURLToPath(import.meta.url)");
    expect(source).toContain('from "./lib/entrypoint.mjs"');
    expect(source).toMatch(/^if \(isEntrypoint\(import\.meta\.url\)\) \{$/m);
  });
});
