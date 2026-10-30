import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as comparisonArtifacts from "../dist/benchmarks/harnessComparisonArtifacts.js";
import {
  campaignTrialEvidenceSchema, captureCampaignWorkspace, diffCampaignWorkspace,
  type CampaignWorkspaceSnapshot
} from "../dist/benchmarks/comparisonCampaignEvidence.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function workspace() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-campaign-evidence-")));
  directories.push(root);
  return root;
}
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const sidecar = (baseline: CampaignWorkspaceSnapshot | null = null) => ({
  schemaVersion: "comparison-campaign-evidence/1" as const, trialId: "target-task-1",
  manifestSha256: "a".repeat(64), comparisonStartedAt: "2026-10-30T00:00:00.000Z",
  source: "adapter-observation" as const, evidenceRef: "adapter/session-1",
  componentsUsed: null, workspace: baseline ? { baseline, after: baseline } : null
});
function hashedShape(files: CampaignWorkspaceSnapshot["files"]): CampaignWorkspaceSnapshot {
  const body = { version: "comparison-campaign-workspace/1" as const, files };
  return { ...body, snapshotSha256: sha256(JSON.stringify(body)) };
}

describe("campaign workspace baseline preparation", () => {
  test("installed harness files have an empty diff when the solver changes nothing", () => {
    const root = workspace();
    mkdirSync(join(root, "skills")); mkdirSync(join(root, "tools"));
    writeFileSync(join(root, "instructions.md"), "Installed harness instructions.\n");
    writeFileSync(join(root, "skills", "SKILL.md"), "Installed skill.\n");
    writeFileSync(join(root, "tools", "runner.mjs"), "// installed tool\n");
    writeFileSync(join(root, "answer.ts"), "export const answer = 0;\n");
    // The adapter installs its harness before this baseline, then invokes the solver.
    const baseline = captureCampaignWorkspace(root);
    expect(baseline.version).toBe("comparison-campaign-workspace/1");
    expect(baseline.files.map(file => file.path)).toEqual(["answer.ts", "instructions.md", "skills/SKILL.md", "tools/runner.mjs"]);
    expect(baseline.files[0]).toEqual({ path: "answer.ts", sha256: sha256("export const answer = 0;\n"), bytes: 25 });
    expect(baseline.snapshotSha256).toBe(hashedShape(baseline.files).snapshotSha256);
    expect(diffCampaignWorkspace(baseline, captureCampaignWorkspace(root))).toEqual([]);
  });

  test("measures only post-install solver additions, edits and deletions in path order", () => {
    const root = workspace();
    writeFileSync(join(root, "harness.md"), "installed");
    writeFileSync(join(root, "answer.ts"), "before");
    writeFileSync(join(root, "removed.ts"), "removed");
    const baseline = captureCampaignWorkspace(root);
    writeFileSync(join(root, "answer.ts"), "after");
    writeFileSync(join(root, "added.ts"), "added");
    unlinkSync(join(root, "removed.ts"));
    expect(diffCampaignWorkspace(baseline, captureCampaignWorkspace(root))).toEqual([
      { path: "added.ts", beforeSha256: null, afterSha256: sha256("added") },
      { path: "answer.ts", beforeSha256: sha256("before"), afterSha256: sha256("after") },
      { path: "removed.ts", beforeSha256: sha256("removed"), afterSha256: null }
    ]);
  });

  test("does not ignore harness changes after the baseline", () => {
    const root = workspace(); writeFileSync(join(root, "instructions.md"), "installed");
    const baseline = captureCampaignWorkspace(root); writeFileSync(join(root, "instructions.md"), "solver edit");
    expect(diffCampaignWorkspace(baseline, captureCampaignWorkspace(root))).toEqual([
      { path: "instructions.md", beforeSha256: sha256("installed"), afterSha256: sha256("solver edit") }
    ]);
  });

  test("omits only root .git directory metadata and captures a regular .git file", () => {
    const root = workspace(); mkdirSync(join(root, ".git")); writeFileSync(join(root, ".git", "HEAD"), "metadata");
    mkdirSync(join(root, "nested")); mkdirSync(join(root, "nested", ".git"));
    writeFileSync(join(root, "nested", ".git", "HEAD"), "nested file");
    expect(captureCampaignWorkspace(root).files.map(file => file.path)).toEqual(["nested/.git/HEAD"]);
    const linked = workspace(); writeFileSync(join(linked, ".git"), "gitdir: external\n");
    expect(captureCampaignWorkspace(linked).files.map(file => file.path)).toEqual([".git"]);
  });

  test.each(["file", "directory", "root", "parent", "git-metadata"])("refuses %s symlink aliases", kind => {
    const parent = workspace(); const root = join(parent, "workspace"); mkdirSync(root);
    const file = join(root, "answer.ts"); writeFileSync(file, "answer");
    if (kind === "root") { symlinkSync(root, join(parent, "alias")); expect(() => captureCampaignWorkspace(join(parent, "alias"))).toThrow(/symlink|alias/i); }
    else if (kind === "parent") { symlinkSync(parent, join(parent, "alias")); expect(() => captureCampaignWorkspace(join(parent, "alias", "workspace"))).toThrow(/symlink|alias/i); }
    else {
      symlinkSync(kind === "file" ? file : root, join(root, kind === "git-metadata" ? ".git" : "alias"));
      expect(() => captureCampaignWorkspace(root)).toThrow(/symlink|alias/i);
    }
  });

  test("refuses root paths that hide aliases through parent traversal", () => {
    const root = workspace(); mkdirSync(join(root, "child"));
    expect(() => captureCampaignWorkspace(`${root}/child/..`)).toThrow(/parent traversal|alias/i);
    expect(() => captureCampaignWorkspace(" ")).toThrow();
  });

  test("bounds empty-directory traversal and directory depth", () => {
    const root = workspace();
    for (let index = 0; index < 1025; index++) mkdirSync(join(root, `${index}`));
    expect(() => captureCampaignWorkspace(root)).toThrow(/entry.*budget/i);
    const deep = workspace(); let current = deep;
    for (let index = 0; index < 65; index++) { current = join(current, "d"); mkdirSync(current); }
    expect(() => captureCampaignWorkspace(deep)).toThrow(/directory level.*budget/i);
  });

  test.skipIf(process.platform === "win32")("refuses special files before trying to read them", () => {
    const root = workspace(); execFileSync("mkfifo", [join(root, "pipe")]);
    // A missing type guard must fail without opening a FIFO and blocking Vitest.
    const reader = vi.spyOn(comparisonArtifacts, "readComparisonFile").mockImplementation(() => {
      throw new Error("The comparison reader must not open this entry.");
    });
    try {
      expect(() => captureCampaignWorkspace(root)).toThrow(/regular|special/i);
      expect(reader).not.toHaveBeenCalled();
    } finally { reader.mockRestore(); }
  });

  test("accepts 256 files and refuses the 257th", () => {
    const root = workspace();
    for (let index = 0; index < 256; index++) writeFileSync(join(root, `${index}.txt`), "");
    expect(captureCampaignWorkspace(root).files).toHaveLength(256);
    writeFileSync(join(root, "overflow.txt"), "");
    const reader = vi.spyOn(comparisonArtifacts, "readComparisonFile");
    try {
      expect(() => captureCampaignWorkspace(root)).toThrow(/256|file.*limit|file.*budget/i);
      expect(reader).toHaveBeenCalledTimes(256);
    } finally { reader.mockRestore(); }
  });

  test("accepts exactly 4 MiB total and refuses one extra byte", () => {
    const root = workspace();
    writeFileSync(join(root, "first.bin"), Buffer.alloc(2 * 1024 * 1024));
    writeFileSync(join(root, "second.bin"), Buffer.alloc(2 * 1024 * 1024));
    expect(captureCampaignWorkspace(root).files.reduce((sum, file) => sum + file.bytes, 0)).toBe(4 * 1024 * 1024);
    writeFileSync(join(root, "third.bin"), "x");
    expect(() => captureCampaignWorkspace(root)).toThrow(/byte|oversized|budget/i);
  });

  test("refuses a single oversized file and nondirectory roots", () => {
    const root = workspace(); const file = join(root, "large.bin"); writeFileSync(file, Buffer.alloc(4 * 1024 * 1024 + 1));
    expect(() => captureCampaignWorkspace(root)).toThrow(/byte|oversized|budget/i);
    expect(() => captureCampaignWorkspace(file)).toThrow(/director/i);
  });

  test("empty workspaces produce a validated empty diff", () => {
    const root = workspace(); const baseline = captureCampaignWorkspace(root);
    expect(baseline.files).toEqual([]); expect(diffCampaignWorkspace(baseline, baseline)).toEqual([]);
    expect(campaignTrialEvidenceSchema.safeParse(sidecar(baseline)).success).toBe(true);
  });
});

describe("campaign adapter attribution sidecar", () => {
  test("preserves unknown component use separately from explicitly observed none", () => {
    expect(campaignTrialEvidenceSchema.parse(sidecar()).componentsUsed).toBeNull();
    expect(campaignTrialEvidenceSchema.parse({ ...sidecar(), componentsUsed: [] }).componentsUsed).toEqual([]);
  });

  test("requires the manifest digest and exact comparison start timestamp", () => {
    const { manifestSha256: _manifest, ...missingManifest } = sidecar();
    const { comparisonStartedAt: _startedAt, ...missingStart } = sidecar();
    for (const value of [missingManifest, missingStart, { ...sidecar(), manifestSha256: "invalid" },
      { ...sidecar(), comparisonStartedAt: "2026-10-30" }, { ...sidecar(), comparisonStartedAt: "not-a-timestamp" }]) {
      expect(campaignTrialEvidenceSchema.safeParse(value).success).toBe(false);
    }
    const parsed = campaignTrialEvidenceSchema.parse(sidecar());
    expect(parsed.manifestSha256).toBe("a".repeat(64));
    expect(parsed.comparisonStartedAt).toBe("2026-10-30T00:00:00.000Z");
  });

  test("retains attributed instruction, skill and tool evidence", () => {
    const componentsUsed = ["instruction", "skill", "tool"].map(kind => ({ id: `used-${kind}`, kind, evidenceRef: `session/${kind}` }));
    const parsed = campaignTrialEvidenceSchema.parse({ ...sidecar(), componentsUsed });
    expect(parsed.componentsUsed).toEqual(componentsUsed); expect(parsed.source).toBe("adapter-observation");
    expect(parsed).not.toHaveProperty("authenticated");
  });

  test("rejects omitted missingness, source promotion, unknown fields and invalid components", () => {
    const { componentsUsed: _missing, ...omitted } = sidecar();
    const { workspace: _workspace, ...omittedWorkspace } = sidecar();
    for (const value of [
      omitted, omittedWorkspace, { ...sidecar(), schemaVersion: "unknown" }, { ...sidecar(), source: "authenticated" }, { ...sidecar(), authenticated: true },
      { ...sidecar(), evidenceRef: "" }, { ...sidecar(), evidenceRef: " " }, { ...sidecar(), trialId: "" },
      { ...sidecar(), evidenceRef: "x".repeat(4097) },
      { ...sidecar(), componentsUsed: [{ id: "one", kind: "provider", evidenceRef: "session/one" }] },
      { ...sidecar(), componentsUsed: [{ id: "one", kind: "tool", evidenceRef: "session/one", authenticated: true }] },
      { ...sidecar(), workspace: { baseline: null, after: null } },
      { ...sidecar(), componentsUsed: [{ id: "", kind: "tool", evidenceRef: "session/one" }] }
    ]) expect(campaignTrialEvidenceSchema.safeParse(value).success).toBe(false);
  });

  test("rejects duplicate component use and component arrays above the bound", () => {
    const component = { id: "used-tool", kind: "tool", evidenceRef: "session/tool" };
    expect(campaignTrialEvidenceSchema.safeParse({ ...sidecar(), componentsUsed: [component, component] }).success).toBe(false);
    const componentsUsed = Array.from({ length: 257 }, (_, index) => ({ ...component, id: `tool-${index}` }));
    expect(campaignTrialEvidenceSchema.safeParse({ ...sidecar(), componentsUsed }).success).toBe(false);
  });

  test("rejects inconsistent byte lengths for identical digests", () => {
    const file = { path: "answer.ts", sha256: sha256("answer"), bytes: 6 };
    expect(() => diffCampaignWorkspace(hashedShape([file]), hashedShape([{ ...file, bytes: 7 }]))).toThrow(/bytes.*digest/i);
  });

  test("rejects tampered snapshot hashes for both diff and sidecar validation", () => {
    const root = workspace(); writeFileSync(join(root, "answer.ts"), "before");
    const baseline = captureCampaignWorkspace(root);
    const tampered = { ...baseline, files: baseline.files.map(file => ({ ...file, sha256: "f".repeat(64) })) };
    expect(() => diffCampaignWorkspace(tampered, baseline)).toThrow();
    expect(() => diffCampaignWorkspace(baseline, tampered)).toThrow();
    expect(campaignTrialEvidenceSchema.safeParse(sidecar(tampered)).success).toBe(false);
    expect(() => diffCampaignWorkspace({ ...baseline, snapshotSha256: "0".repeat(64) }, baseline)).toThrow();
    expect(campaignTrialEvidenceSchema.safeParse({ ...sidecar(), workspace: { baseline, after: baseline, authenticated: true } }).success).toBe(false);
  });

  test("validates paths, ordering, unique files, sizes and exact snapshot fields even with recomputed digests", () => {
    const file = { path: "answer.ts", sha256: sha256("answer"), bytes: 6 };
    const malformed: unknown[] = [
      hashedShape([{ ...file, path: "../outside" }]), hashedShape([{ ...file, path: "/absolute" }]),
      hashedShape([{ ...file, path: "a\\b" }]), hashedShape([{ ...file, path: "./answer.ts" }]),
      hashedShape([{ ...file, path: "a//b" }]), hashedShape([{ ...file, path: "C:/answer.ts" }]),
      hashedShape([{ ...file, path: ".git/HEAD" }]), hashedShape([{ ...file, path: "x".repeat(4097) }]),
      hashedShape([{ ...file, sha256: "invalid" }]),
      hashedShape([{ ...file, bytes: -1 }]), hashedShape([{ ...file, bytes: 0.5 }]),
      hashedShape([{ ...file, bytes: 4 * 1024 * 1024 + 1 }]),
      hashedShape([{ ...file, path: "a", bytes: 3 * 1024 * 1024 }, { ...file, path: "b", bytes: 3 * 1024 * 1024 }]),
      hashedShape([file, file]), hashedShape([{ ...file, path: "z" }, file]),
      hashedShape([{ ...file, path: "a" }, { ...file, path: "a/b" }]),
      hashedShape(Array.from({ length: 257 }, (_, index) => ({ ...file, path: `${index}` })).sort((a, b) => a.path.localeCompare(b.path))),
      { ...hashedShape([file]), version: "unknown" },
      { version: "unknown", files: [file], snapshotSha256: sha256(JSON.stringify({ version: "unknown", files: [file] })) },
      { ...hashedShape([file]), authenticated: true },
      hashedShape([{ ...file, authenticated: true } as typeof file]),
      { ...hashedShape([file]), files: [{ ...file, authenticated: true }] }
    ];
    const valid = hashedShape([file]);
    for (const value of malformed) {
      expect(() => diffCampaignWorkspace(value as CampaignWorkspaceSnapshot, valid)).toThrow();
      expect(campaignTrialEvidenceSchema.safeParse(sidecar(value as CampaignWorkspaceSnapshot)).success).toBe(false);
    }
  });
});
