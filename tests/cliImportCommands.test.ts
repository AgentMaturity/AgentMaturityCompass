// AMC-1523: the human-readable `amc import` / `amc imports show` drilldown.
// The importer is replaced by a fixed receipt; this checks rendering only.
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const importer = vi.hoisted(() => ({ runNeutralImport: vi.fn(), loadNeutralImportManifest: vi.fn() }));
vi.mock("../src/importers/neutralImporter.js", () => importer);
const { registerNeutralImportCommands } = await import("../src/cli-import-commands.js");

const digest = "a".repeat(64);
const plan = {
  importId: "imp-1", status: "ready", candidateCount: 1, categories: ["traces"], redactionCount: 0, wouldWrite: [],
  candidates: [{ path: "/fixture/pi session.jsonl", digest: "b".repeat(64), format: "jsonl", sourceFormat: { name: "pi-session", version: 3 } }],
  normalization: {
    normalizerVersion: "amc-neutral/2026-09-08", semanticDigest: digest, sourceTrust: "SELF_REPORTED", evaluation: "NOT_EVALUATED",
    counts: { recognizedFiles: 1, skippedFiles: 0, malformedFiles: 0, unsupportedFiles: 0, oversizedFiles: 0, sourceItems: 5,
      normalizedTraces: 3, failureTraces: 1, unknownTimestamps: 0, unknownDurations: 2 },
    recordMapping: { counts: { records: 5, mapped: 3, retainedOnly: 1, malformed: 1, unsupported: 0 } },
    losses: ["Fixture loss."],
    nextActions: [
      { label: "Inspect supported import options", argv: ["amc", "import", "--help"] },
      { label: "Apply the reviewed import", argv: ["amc", "import", "/fixture/pi session.jsonl", "--agent", "default", "--expected-digest", digest] }
    ]
  }
};
const preview = { importId: "imp-1", mode: "dry-run", applied: false, plan };

let lines: string[] = [];
beforeEach(() => {
  lines = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(" ")); });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(" ")); });
});
afterEach(() => { vi.restoreAllMocks(); importer.runNeutralImport.mockReset(); importer.loadNeutralImportManifest.mockReset(); });
const text = () => lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
async function run(...argv: string[]): Promise<void> {
  const program = new Command().exitOverride();
  registerNeutralImportCommands(program, () => undefined);
  await program.parseAsync(["node", "amc", ...argv]);
}

describe("amc import text rendering", () => {
  test("a preview names the source format and version, record counts and the structured next actions", async () => {
    importer.runNeutralImport.mockReturnValue(preview);
    await run("import", "fixture", "--dry-run");
    const output = text();
    expect(output).toContain(`  Source: /fixture/pi session.jsonl; SHA-256 ${"b".repeat(64)}; format pi-session v3 (jsonl)`);
    expect(output).toContain("  Records: 5 (3 mapped, 1 retained only, 1 malformed, 0 unsupported)");
    expect(output).toContain("  Next: Inspect supported import options: amc import --help");
    expect(output).toContain(`  Next: Apply the reviewed import: amc import '/fixture/pi session.jsonl' --agent default --expected-digest ${digest}`);
    expect(output).not.toContain("format 3");
  });

  test("an unrecognized source keeps its container format and a legacy receipt prints no invented actions", async () => {
    const legacy = { ...plan, candidates: [{ ...plan.candidates[0], sourceFormat: undefined }],
      normalization: { ...plan.normalization, recordMapping: undefined, nextActions: undefined } };
    importer.runNeutralImport.mockReturnValue({ ...preview, plan: legacy });
    await run("import", "fixture", "--dry-run");
    expect(text()).toContain("; format jsonl");
    expect(text()).not.toMatch(/Records:|Next:/);
  });

  test("an applied import and its manifest point to inspection instead of re-applying", async () => {
    importer.runNeutralImport.mockReturnValue({ ...preview, mode: "import", applied: true, externalEvidencePaths: [] });
    await run("import", "fixture");
    expect(text()).toContain("  Next: inspect with amc imports show imp-1");
    expect(text()).not.toContain("--expected-digest");
    lines = [];
    importer.loadNeutralImportManifest.mockReturnValue({ importId: "imp-1", createdAt: "2026-10-03T00:00:00.000Z", agentId: "default",
      sourcePath: "/fixture", plan, externalEvidencePaths: [] });
    await run("imports", "show", "imp-1");
    expect(text()).toContain("  Records: 5 (3 mapped, 1 retained only, 1 malformed, 0 unsupported)");
    expect(text()).not.toMatch(/Next:|--expected-digest/);
  });

  test("JSON output is the exact receipt serialization plus its claim fields (P0-22)", async () => {
    importer.runNeutralImport.mockReturnValue(preview);
    await run("import", "fixture", "--dry-run", "--json");
    expect(lines).toHaveLength(1);
    const { claimKind, statusDimensions, claimLabel, ...receipt } = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(receipt).toEqual(preview);
    // Imported records are what their source reported: self-reported, never evaluated by the import.
    expect(claimKind).toBe("self_reported");
    expect(statusDimensions).toMatchObject({ result: "not_evaluated" });
    expect(claimLabel).toMatch(/^Claim: Self-reported · Result: not evaluated/);
  });
});
