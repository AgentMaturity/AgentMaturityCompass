import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { renderGuides } from "../scripts/gen-industry-guides.mjs";

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

describe("guide citations survive unrelated edits (P1-42 review)", () => {
  test("adding a line to the top of src/cli.ts leaves every guide unchanged", () => {
    const real = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
    const seen = new Set<string>();
    const shifted = renderGuides((file) => {
      seen.add(file);
      return file === "src/cli.ts" ? `// an unrelated line\n${real(file)}` : real(file);
    });
    expect(seen.has("src/cli.ts")).toBe(true);
    for (const [file, md] of shifted) expect(md, file).toBe(readFileSync(join(process.cwd(), "docs", "industries", file), "utf8"));
  });

  test("a cited symbol that disappears still fails the render", () => {
    const real = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
    expect(() => renderGuides((file) => file === "src/receipts/receipt.ts" ? real(file).replaceAll("export function mintReceipt", "export function mint") : real(file)))
      .toThrow(/export function mintReceipt/);
  });
});

describe("station-owned overlay guide sections", () => {
  const file = "docs/catalog/technology/guide-section.md";
  const real = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const missing = () => Object.assign(new Error("No station-owned section"), { code: "ENOENT" });

  test("includes Technology prose once before its appendix and leaves every other guide unchanged", () => {
    const baseline = renderGuides((path) => { if (path === file) throw missing(); return real(path); });
    const prose = "## Experimental catalog overlay\n\nSynthetic overlay regression marker.\n";
    const withSection = renderGuides((path) => path === file ? prose : real(path));
    const marker = "## Verification appendix\n";
    expect(withSection.get("technology.md")).toBe(baseline.get("technology.md")!.replace(marker, `${prose}\n${marker}`));
    for (const [name, md] of baseline) {
      if (name !== "technology.md") expect(withSection.get(name), name).toBe(md);
    }
  });

  test("does not suppress a station-owned section read error other than ENOENT", () => {
    const denied = Object.assign(new Error("Station-owned section is unreadable"), { code: "EACCES" });
    expect(() => renderGuides((path) => { if (path === file) throw denied; return real(path); })).toThrow(denied);
  });
});
