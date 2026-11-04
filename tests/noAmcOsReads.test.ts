import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * P1-42: AMC_OS/ is git-ignored program material that a clone does not have, so no code, script or test may read
 * from it (contract section 5). A line counts as a read when it calls a file, path or URL function and holds a
 * string literal that starts with AMC_OS/ (after any ./ or ../) or is the bare AMC_OS segment. Comments are skipped.
 */
const ROOTS = ["src", "scripts", "tests"];
const READ_CALL = /\b(readFileSync|readFile|readdirSync|readdir|existsSync|statSync|createReadStream|join|resolve|URL|import)\s*\(/;
const AMC_OS_LITERAL = /["'`](\.{1,2}\/)*AMC_OS(\/|["'`])/;
const COMMENT = /^\s*(\/\/|\/\*|\*)/;

/** Pre-existing reads that are not repository reads, each with its reason. */
const ALLOWED: Record<string, string> = {
  "scripts/research-amc-landscape.mjs": "opt-in research tool that writes its own output folder (AMC_RESEARCH_OUT); no build, test or release step runs it",
  "scripts/verify-amc-landscape.mjs": "re-reads the research tool's own output folder; no build, test or release step runs it",
  "src/org/orgRun.ts": "joins a path inside the operator's workspace, not the repository's AMC_OS/",
};

function files(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "fixtures" && entry.name !== "node_modules") files(path, out); }
    else if (/\.(c|m)?[jt]sx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

function amcOsReads(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of ROOTS.flatMap((root) => files(root))) {
    const hits = readFileSync(file, "utf8").split("\n")
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => !COMMENT.test(line) && READ_CALL.test(line) && AMC_OS_LITERAL.test(line))
      .map(({ line, n }) => `${file}:${n}: ${line.trim()}`);
    if (hits.length > 0) found.set(file, hits);
  }
  return found;
}

describe("nothing reads AMC_OS/ (P1-42)", () => {
  const reads = amcOsReads();

  test("no file under src/, scripts/ or tests/ reads an AMC_OS/ path", () => {
    expect([...reads].filter(([file]) => !(file in ALLOWED)).flatMap(([, hits]) => hits)).toEqual([]);
  });

  test("every allowance still matches a line, so none goes stale", () => {
    for (const file of Object.keys(ALLOWED)) expect(reads.has(file), file).toBe(true);
  });

  test("the detector sees the read the candidate's split test made", () => {
    // Split so this line is not itself a read.
    const line = 'const SNAPSHOT_DIR = new URL("../AMC' + '_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/split/", import.meta.url);';
    expect(READ_CALL.test(line) && AMC_OS_LITERAL.test(line)).toBe(true);
  });
});
