import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * G7-04: 171 assertions read `expect(x).toBeGreaterThanOrEqual(0)`. Where a
 * matching upper bound sits alongside, that is a legitimate range check. Where
 * it stands alone on a score, count or length it asserts nothing at all — those
 * values cannot be negative, so the test passes no matter what the code does.
 *
 * This is a ratchet, not a ban: the current standalone count is frozen and may
 * only fall. New vacuous assertions fail the suite, and every one replaced with
 * a real expectation lowers the ceiling.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = join(repoRoot, "tests");

/** Standalone vacuous assertions permitted while the existing ones are replaced. */
const STANDALONE_BUDGET = 81;

function allTestFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) allTestFiles(full, out);
    else if (entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function countStandaloneVacuous(): { total: number; files: string[] } {
  const offenders: string[] = [];
  let total = 0;
  for (const file of allTestFiles(testsDir)) {
    // The scanner mentions the pattern in its own logic and comments.
    if (file.endsWith("assertionQuality.test.ts")) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!line.includes("toBeGreaterThanOrEqual(0)")) return;
      // A nearby upper bound makes this a range check rather than a no-op.
      const window = lines.slice(Math.max(0, i - 2), i + 3).join("\n");
      if (window.includes("toBeLessThanOrEqual")) return;
      total += 1;
      if (!offenders.includes(file)) offenders.push(file);
    });
  }
  return { total, files: offenders };
}

describe("assertion quality", () => {
  it("does not add new vacuous lower-bound assertions", () => {
    const { total } = countStandaloneVacuous();
    expect(
      total,
      `Standalone toBeGreaterThanOrEqual(0) assertions rose to ${total}. ` +
        "A non-negative value cannot fail this check, so it tests nothing — " +
        "assert the value the code should actually produce."
    ).toBeLessThanOrEqual(STANDALONE_BUDGET);
  });

  it("keeps the budget honest by lowering it as they are fixed", () => {
    const { total } = countStandaloneVacuous();
    // If this fails, the budget is stale: lower STANDALONE_BUDGET to `total`.
    expect(
      STANDALONE_BUDGET - total,
      `${STANDALONE_BUDGET - total} vacuous assertions have been fixed since the ` +
        `budget was set. Lower STANDALONE_BUDGET to ${total}.`
    ).toBeLessThan(10);
  });
});
