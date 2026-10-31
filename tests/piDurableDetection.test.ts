import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runNeutralImport, validateNeutralImport } from "../src/importers/neutralImporter.js";
import { parseDetectedPiSession } from "../src/importers/piSessionImport.js";
import { SourceFormatError } from "../src/importers/sourceFormatError.js";

// Synthetic parser-contract fixtures, not a captured Pi session or proof of
// source execution. Pi CLI v3 and Pi durable storage are distinct formats.
const jsonl = (rows: unknown[]) => rows.map(row => JSON.stringify(row)).join("\n") + "\n";
const validV3 = [
  { type: "session", version: 3, id: "synthetic-pi-v3", timestamp: "2026-09-08T00:00:00.000Z", cwd: "/synthetic" },
  { type: "message", id: "u", parentId: null, timestamp: "2026-09-08T00:00:01.000Z", message: { role: "user", content: "synthetic prompt" } },
  { type: "message", id: "a", parentId: "u", timestamp: "2026-09-08T00:00:02.000Z", message: { role: "assistant", provider: "fixture", model: "fixture", stopReason: "stop", content: [{ type: "text", text: "synthetic answer" }] } }
];

function withSource(text: string, body: (input: { workspace: string; inputPath: string; agentId: string }) => void): void {
  const root = mkdtempSync(join(tmpdir(), "amc-p124-pi-durable-"));
  chmodSync(root, 0o700);
  const workspace = join(root, "workspace"), inputPath = join(root, "session.jsonl");
  mkdirSync(workspace, { mode: 0o700 });
  writeFileSync(inputPath, text, { mode: 0o600 });
  try {
    body({ workspace, inputPath, agentId: "default" });
    expect(readFileSync(inputPath)).toEqual(Buffer.from(text));
    // Preview/refusal initializes no ledger, vault, service or owned child.
    expect(existsSync(join(workspace, ".amc"))).toBe(false);
  } catch (error) {
    console.error(`P124 retained owned Pi-format fixture: ${root}`);
    throw error;
  }
  rmSync(root, { recursive: true });
}

const durableHeaders: Array<{ label: string; header: Record<string, unknown>; version: number | null; message: string }> = [
  ...[1, 3, 4].map(version => ({ label: `durable v${version}`, header: { kind: "header", v: version, storageVersion: 4, id: "synthetic-durable" }, version, message: `Pi durable session format v${version} is not supported; AMC imports Pi CLI session v3.` })),
  { label: "storageVersion without v", header: { kind: "header", storageVersion: 4, id: "synthetic-durable" }, version: null, message: "Pi durable session format with a missing or invalid version is not supported; AMC imports Pi CLI session v3." },
  { label: "string v", header: { kind: "header", v: "synthetic-private-version", storageVersion: 4 }, version: null, message: "Pi durable session format with a missing or invalid version is not supported; AMC imports Pi CLI session v3." },
  { label: "object v", header: { kind: "header", v: { secret: "synthetic-private-version" }, storageVersion: 4 }, version: null, message: "Pi durable session format with a missing or invalid version is not supported; AMC imports Pi CLI session v3." }
];

describe("P1-24 Pi durable format discrimination", () => {
  test.each(durableHeaders)("$label refuses explicitly before generic event-log detection", ({ header, version, message }) => {
    // The second row would be a recognizable generic event if durable
    // discrimination were skipped. It must not rescue this entire file.
    const text = jsonl([header, { event: "synthetic-action", timestamp: 1000, input: "synthetic generic candidate" }]);
    let caught: unknown;
    try { parseDetectedPiSession(text); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(SourceFormatError);
    expect(caught).toMatchObject({ code: "PI_DURABLE_SESSION_UNSUPPORTED", format: "pi-durable-session", detectedVersion: version, supported: "pi-session v3", sourceRevision: null, message });
    withSource(text, input => {
      const plan = validateNeutralImport(input);
      expect(plan.status).toBe("unsupported");
      expect(plan.candidates).toEqual([]);
      expect(plan.unsupported).toHaveLength(1);
      expect(plan.unsupported[0]?.reason).toBe(message);
      expect(plan.unsupported[0]?.reason).not.toContain("Could not parse");
      expect(JSON.stringify(plan)).not.toContain("synthetic-private-version");
      expect(plan.normalization?.recordMapping?.sources[0]).toMatchObject({ disposition: "skipped", originalSha256: createHash("sha256").update(Buffer.from(text)).digest("hex"), sourceRevision: null });
      expect(plan.normalization?.nextActions.some(action => action.argv.includes("--expected-digest"))).toBe(false);
      expect(() => runNeutralImport({ ...input, mode: "import" })).toThrow(/Unsupported import/);
    });
  });

  test("a valid synthetic Pi CLI v3 session stays supported with unknown revision and self-reported semantics", () => {
    const text = jsonl(validV3), parsed = parseDetectedPiSession(text);
    expect(parsed?.format).toMatchObject({ name: "pi-session", version: 3, mappingVersion: 2, sessionId: "synthetic-pi-v3", entries: { message: 2, structural: 0, total: 2 }, malformedEntries: 0, branch: { leafEntryId: "a", currentPathLength: 2 } });
    withSource(text, input => {
      const result = runNeutralImport({ ...input, mode: "dry-run" });
      expect(result.applied).toBe(false);
      expect(result.plan.status).toBe("ready");
      expect(result.plan.candidates).toHaveLength(1);
      expect(result.plan.candidates[0]?.sourceFormat).toMatchObject({ name: "pi-session", version: 3, mappingVersion: 2 });
      expect(result.plan.normalization).toMatchObject({ sourceTrust: "SELF_REPORTED", evaluation: "NOT_EVALUATED", counts: { normalizedTraces: 1, unknownDurations: 1 } });
      const map = result.plan.normalization!.recordMapping!;
      expect(map.schemaVersion).toBe("amc-record-map/2");
      expect(map.sources[0]).toMatchObject({ format: "pi-session", version: 3, sourceRevision: null, originalSha256: createHash("sha256").update(Buffer.from(text)).digest("hex") });
      expect(map.records.flatMap(row => row.traces)).toEqual([expect.objectContaining({ traceId: "synthetic-pi-v3:a", durationMs: null, inferredDuration: false, cost: null })]);
      expect(result.originals).toEqual([]);
    });
  });

  test("a Pi CLI session v4 refusal remains distinct from the durable-v4 message", () => {
    const text = jsonl([{ ...validV3[0], version: 4 }, ...validV3.slice(1)]);
    withSource(text, input => {
      const plan = validateNeutralImport(input);
      expect(plan.status).toBe("unsupported");
      expect(plan.candidates).toEqual([]);
      expect(plan.unsupported[0]?.reason).toBe("Pi session version 4 is not supported; AMC imports Pi v3 session JSONL. Open the session in pi to migrate it, then re-import.");
      expect(plan.unsupported[0]?.reason).not.toContain("Pi durable");
      expect(() => runNeutralImport({ ...input, mode: "import" })).toThrow(/Unsupported import/);
    });
  });

  test("an unrelated generic JSONL event remains supported rather than blanket-refusing all logs", () => {
    const text = jsonl([{ event: "synthetic-event", timestamp: 1000, input: "synthetic source claim", output: "synthetic result" }]);
    expect(parseDetectedPiSession(text)).toBeNull();
    withSource(text, input => {
      const plan = validateNeutralImport(input);
      expect(plan.status).toBe("ready");
      expect(plan.candidates).toHaveLength(1);
      expect(plan.candidates[0]?.sourceFormat).toBeUndefined();
      expect(plan.normalization).toMatchObject({ sourceTrust: "SELF_REPORTED", evaluation: "NOT_EVALUATED" });
      expect(plan.normalization?.recordMapping?.sources[0]).toMatchObject({ sourceRevision: null, version: null });
    });
  });
});
