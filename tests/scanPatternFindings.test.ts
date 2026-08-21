import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanLocal } from "../src/scanner/localScanner.js";
import { scanCodeForAmcPatterns } from "../src/scanner/patterns/patternScanner.js";

/**
 * G2-44: eight source anti-pattern rules lived in src/vscode behind a barrel
 * nothing imported — the shipped VS Code extension never used them either, so
 * they ran nowhere. They now run as part of `amc scan`.
 */
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function projectWith(file: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-scan-"));
  dirs.push(dir);
  writeFileSync(join(dir, file), content);
  return dir;
}

describe("scan surfaces source anti-patterns", () => {
  it("reports a hardcoded secret", () => {
    const dir = projectWith("agent.ts", 'const key = "sk-abcdefghijklmnop";\n');
    const result = scanLocal(dir);
    const ids = result.patternFindings.map((f) => f.ruleId);
    expect(ids).toContain("hardcoded-secret");
  });

  it("ties each finding to the diagnostic question it affects", () => {
    const dir = projectWith("agent.ts", 'const key = "sk-abcdefghijklmnop";\n');
    const finding = scanLocal(dir).patternFindings.find((f) => f.ruleId === "hardcoded-secret");
    expect(finding?.questionId).toMatch(/^AMC-/);
    expect(finding?.line).toBeGreaterThan(0);
    expect(finding?.file).toContain("agent.ts");
  });

  it("stays quiet on clean source", () => {
    const dir = projectWith("clean.ts", "export const add = (a: number, b: number) => a + b;\n");
    expect(scanLocal(dir).patternFindings).toEqual([]);
  });

  it("flags fetch without a timeout but not one with a signal", () => {
    expect(scanCodeForAmcPatterns('await fetch("https://x.test");')).toHaveLength(1);
    expect(
      scanCodeForAmcPatterns('await fetch("https://x.test", { signal: AbortSignal.timeout(1000) });')
    ).toHaveLength(0);
  });
});
