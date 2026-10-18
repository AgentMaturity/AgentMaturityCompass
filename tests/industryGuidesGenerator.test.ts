import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";

/** P1-42: the station guides come from a tracked generator, and --check catches any hand edit or source drift. */
const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");
const run = (...args: string[]) => spawnSync(TSX, ["scripts/gen-industry-guides.mts", ...args], { encoding: "utf8", timeout: 120_000 });
const scratch = mkdtempSync(join(tmpdir(), "amc-guides-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("scripts/gen-industry-guides.mts --check", () => {
  test("exits 0 on the committed guides", () => {
    const result = run("--check");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  test("exits 1 after a one-line edit, naming the edited guide", () => {
    const dir = join(scratch, "industries");
    cpSync(join(process.cwd(), "docs", "industries"), dir, { recursive: true });
    const file = join(dir, "wealth.md");
    const lines = readFileSync(file, "utf8").split("\n");
    lines[lines.findIndex((l) => l.startsWith("Total: "))] = "Total: 1 packs, 1 questions.";
    writeFileSync(file, lines.join("\n"));
    const result = run("--check", "--dir", dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("wealth.md");
  });
});
