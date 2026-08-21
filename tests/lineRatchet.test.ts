import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * G4-36: the structural guard used to track two files and only ask whether they
 * stayed under a fixed audit baseline, which permanently blessed the two worst
 * monoliths and left 57 other oversized files unguarded.
 *
 * G4-02/03: the largest files are append-only catalogs, where an 800-line cap
 * aimed at keeping logic reviewable does not apply — but an exemption is only
 * safe if it is verified rather than asserted.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  readFileSync(join(repoRoot, "scripts/line-budgets.json"), "utf8")
) as { cap: number; dataRegistries: string[]; budgets: Record<string, number> };

const LOGIC_PATTERN =
  /^\s*(if|for|while|switch|return|throw|try|catch|function |export function |export async function |class |=>\s*\{)/;

function logicRatio(file: string): number {
  const lines = readFileSync(join(repoRoot, file), "utf8").split("\n");
  return lines.filter((l) => LOGIC_PATTERN.test(l)).length / lines.length;
}

describe("line-count ratchet", () => {
  it("tracks every oversized file, not just a favoured two", () => {
    // The original guard covered two files; the repo has dozens over the cap.
    expect(Object.keys(manifest.budgets).length).toBeGreaterThan(40);
  });

  it("no tracked file exceeds its baseline", () => {
    const grown = Object.entries(manifest.budgets)
      .map(([file, baseline]) => ({
        file,
        baseline,
        actual: readFileSync(join(repoRoot, file), "utf8").split("\n").length
      }))
      .filter((f) => f.actual > f.baseline);
    expect(grown).toEqual([]);
  });

  it("every data-registry exemption really is data", () => {
    for (const file of manifest.dataRegistries) {
      // 3% is the ratchet's limit; anything higher is logic hiding behind a label.
      expect(logicRatio(file)).toBeLessThanOrEqual(0.03);
    }
  });

  it("exempted registries are genuinely large catalogs, not a loophole", () => {
    for (const file of manifest.dataRegistries) {
      const lines = readFileSync(join(repoRoot, file), "utf8").split("\n").length;
      expect(lines).toBeGreaterThan(manifest.cap);
    }
  });
});
