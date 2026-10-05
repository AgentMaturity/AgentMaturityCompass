import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { duplicateFindings, knipFindings, scanSourceQuality } from "../scripts/source-quality.mjs";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-source-quality-contract-"));
  roots.push(root);
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "quality-contract", version: "1.0.0", type: "module" }));
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022" }, include: ["src"] }));
  writeFileSync(join(root, "knip.json"), JSON.stringify({ entry: ["src/index.ts"], project: ["src/**/*.ts"] }));
  writeFileSync(join(root, ".jscpd.json"), JSON.stringify({ minTokens: 50, minLines: 5, format: ["typescript"], reporters: ["json"], workers: 1 }));
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("real source quality scanners", () => {
  it("detects an orphaned source file and accepts its reachable counterpart", () => {
    const root = fixture();
    writeFileSync(join(root, "src/index.ts"), "export {};\n");
    writeFileSync(join(root, "src/orphan.ts"), "export const unusedValue = 1;\n");
    expect(scanSourceQuality("dead-code", root).findings.some((item: string) => item.includes("src/orphan.ts"))).toBe(true);
    writeFileSync(join(root, "src/index.ts"), 'export { unusedValue } from "./orphan.js";\n');
    expect(scanSourceQuality("dead-code", root).findings).toEqual([]);

    // A documented standalone example is a real workspace with its own
    // dependency manifest, even when it is not a pnpm installation member.
    const example = join(root, "examples/demo");
    mkdirSync(example, { recursive: true });
    writeFileSync(join(example, "package.json"), JSON.stringify({
      name: "standalone-example", type: "module", dependencies: { chalk: "5.0.0" }
    }));
    writeFileSync(join(example, "index.ts"), 'import chalk from "chalk"; console.log(chalk.green("ready"));\n');
    writeFileSync(join(example, "orphan.ts"), 'export const exampleValue = 1;\n');
    writeFileSync(join(root, "knip.json"), JSON.stringify({ workspaces: {
      ".": { entry: ["src/index.ts"], project: ["src/**/*.ts"] },
      "examples/demo": { entry: ["index.ts"], project: ["**/*.ts"] }
    } }));
    const findings = scanSourceQuality("dead-code", root).findings;
    expect(findings.some((item: string) => item.includes("examples/demo/orphan.ts"))).toBe(true);
    expect(findings.some((item: string) => item.includes('"unlisted"'))).toBe(false);
    writeFileSync(join(example, "index.ts"), 'import chalk from "chalk"; export { exampleValue } from "./orphan.js"; console.log(chalk.green("ready"));\n');
    expect(scanSourceQuality("dead-code", root).findings).toEqual([]);
  });
  it("keeps the explicitly invoked Playwright config reachable without hiding adjacent orphans", () => {
    const root = fixture();
    const projectConfig = JSON.parse(readFileSync(join(process.cwd(), "knip.json"), "utf8"));
    const entry: string[] = projectConfig.workspaces["."].entry;
    expect(entry).toContain("tests/e2e/playwright.config.ts");
    mkdirSync(join(root, "tests/e2e"), { recursive: true });
    writeFileSync(join(root, "src/index.ts"), "export {};\n");
    writeFileSync(join(root, "tests/e2e/playwright.config.ts"), "export default { testDir: './tests' };\n");
    writeFileSync(join(root, "tests/e2e/orphan.ts"), "export const unusedFixture = 1;\n");
    const configure = (entries: string[]) => writeFileSync(join(root, "knip.json"), JSON.stringify({
      workspaces: { ".": { entry: entries, project: ["src/**/*.ts", "tests/**/*.ts"] } }
    }));
    configure(entry);
    const classified = scanSourceQuality("dead-code", root).findings;
    expect(classified.some((item: string) => item.includes("tests/e2e/playwright.config.ts"))).toBe(false);
    expect(classified.some((item: string) => item.includes("tests/e2e/orphan.ts"))).toBe(true);
    configure(entry.filter(path => path !== "tests/e2e/playwright.config.ts"));
    expect(scanSourceQuality("dead-code", root).findings.some((item: string) =>
      item.includes("tests/e2e/playwright.config.ts"))).toBe(true);
  });
  it("detects real duplicated code and accepts a single copy", () => {
    const root = fixture();
    const code = `export function transform(values: number[]) {
  const output: number[] = [];
  for (const value of values) {
    if (value > 0) output.push(value * 2);
    else if (value === 0) output.push(0);
    else output.push(-value);
  }
  return output.reduce((total, value) => total + value, 0);
}\n`;
    writeFileSync(join(root, "src/index.ts"), code);
    expect(scanSourceQuality("duplicates", root).findings).toEqual([]);
    writeFileSync(join(root, "src/copy.ts"), code);
    expect(scanSourceQuality("duplicates", root).findings.length).toBeGreaterThan(0);
  });
  it("keeps symbol identity while ignoring shifted line numbers", () => {
    const report = (line: number, name: string) => ({ issues: [{ file: "src/a.ts", exports: [{ name, line, col: 1, pos: 1 }] }] });
    expect(knipFindings(report(1, "unused"))).toEqual(knipFindings(report(5, "unused")));
    expect(knipFindings(report(1, "other"))).not.toEqual(knipFindings(report(1, "unused")));
  });
  it("refuses missing scan evidence", () => {
    expect(() => knipFindings({})).toThrow(/valid issue report/);
    expect(() => duplicateFindings({ duplicates: [], statistics: { total: { sources: 0 } } })).toThrow(/no source evidence/);
  });
});
