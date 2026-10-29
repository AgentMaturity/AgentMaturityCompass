import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { validateNeutralImport } from "../src/importers/neutralImporter.js";

test("pinned compressed compatibility fixture enters public import with exact bytes and self-reported trust", () => {
  const root = mkdtempSync(join(tmpdir(), "amc-wp26-frame-public-"));
  const workspace = join(root, "workspace"), inputPath = join(root, "session.jsonl.zstd");
  const raw = readFileSync(new URL("./fixtures/dsh-v4/frame-concatenated.jsonl.zstd", import.meta.url));
  mkdirSync(workspace);
  writeFileSync(inputPath, raw);
  try {
    const plan = validateNeutralImport({ workspace, inputPath });
    expect(plan.status).toBe("ready");
    expect(plan.candidates[0]).toMatchObject({ bytes: raw.length, digest: createHash("sha256").update(raw).digest("hex"),
      sourceFormat: { name: "dsh-session", version: 4, sourceRevision: "22ddee3792402c3e70ec5f86a63c3e3e895a2f60", eventCount: 1,
        sourceTrust: "SELF_REPORTED", evaluationStatus: "NOT_EVALUATED" } });
    expect(plan.normalization).toMatchObject({ sourceTrust: "SELF_REPORTED", evaluation: "NOT_EVALUATED", counts: { normalizedTraces: 0 } });
    expect(plan.normalization?.recordMapping?.counts).toMatchObject({ records: 2, mapped: 0, retainedOnly: 2, unlinkedTraces: 0 });
    expect(plan.warnings.join(" ")).toContain("SELF_REPORTED");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
