import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  buildEpisodeRecord,
  exportEpisodeRecord,
  listEpisodeRecords,
  loadEpisodeRecord,
  writeEpisodeRecord
} from "../../src/lifecycle/episodeRecord.js";
import type { DiagnosticReport } from "../../src/types.js";

function sampleReport(): DiagnosticReport {
  return {
    agentId: "default",
    runId: "22222222-2222-4222-8222-222222222222",
    ts: Date.UTC(2026, 4, 22, 12, 0, 0),
    windowStartTs: Date.UTC(2026, 4, 21, 12, 0, 0),
    windowEndTs: Date.UTC(2026, 4, 22, 12, 0, 0),
    status: "VALID",
    verificationPassed: true,
    trustBoundaryViolated: false,
    trustBoundaryMessage: null,
    integrityIndex: 0.75,
    trustLabel: "DEVELOPING — some evidence, needs more coverage",
    targetProfileId: null,
    layerScores: [],
    questionScores: [
      {
        questionId: "AMC-1.1",
        claimedLevel: 3,
        supportedMaxLevel: 1,
        finalLevel: 1,
        confidence: 0.4,
        evidenceEventIds: ["ev-2", "ev-1", "ev-1"],
        flags: ["needs evidence"],
        narrative: "Not enough evidence."
      }
    ],
    inflationAttempts: [],
    unsupportedClaimCount: 0,
    contradictionCount: 0,
    correlationRatio: 1,
    invalidReceiptsCount: 0,
    correlationWarnings: [],
    evidenceCoverage: 0.25,
    evidenceTrustCoverage: {
      observed: 1,
      attested: 0,
      selfReported: 0
    },
    targetDiff: [],
    prioritizedUpgradeActions: [],
    evidenceToCollectNext: [],
    runSealSig: "sig",
    reportJsonSha256: "sha"
  };
}

describe("episode record", () => {
  test("distills diagnostic evidence into one reloadable episode", () => {
    const episode = buildEpisodeRecord({
      workspace: "/tmp/amc-episode-test",
      report: sampleReport(),
      source: "cli",
      command: "amc",
      resourceManifestIds: ["enforce-resources-test"]
    });

    expect(episode.episodeId).toBe(`episode-${sampleReport().runId}`);
    expect(episode.lifecycleRunId).toBe(`lifecycle-${sampleReport().runId}`);
    expect(episode.rawTraceRefs).toEqual(["ev-1", "ev-2"]);
    expect(episode.failureClassifications).toEqual([
      { questionId: "AMC-1.1", flags: ["needs evidence"], finalLevel: 1 }
    ]);
    expect(episode.resourceManifestIds).toEqual(["enforce-resources-test"]);
  });

  test("writes episode record beside agent outputs", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-episode-record-"));
    try {
      const result = writeEpisodeRecord({
        workspace,
        report: sampleReport(),
        source: "cli",
        command: "amc"
      });

      expect(existsSync(result.episodePath)).toBe(true);
      const parsed = JSON.parse(readFileSync(result.episodePath, "utf8")) as { episodeId?: string; runId?: string };
      expect(parsed.episodeId).toBe(`episode-${sampleReport().runId}`);
      expect(parsed.runId).toBe(sampleReport().runId);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("lists, loads, and exports episode records", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-episode-record-export-"));
    try {
      const written = writeEpisodeRecord({
        workspace,
        report: sampleReport(),
        source: "cli",
        command: "amc"
      });

      const listed = listEpisodeRecords({ workspace, agentId: "default" });
      expect(listed).toHaveLength(1);
      expect(listed[0]?.episodeId).toBe(`episode-${sampleReport().runId}`);

      const loaded = loadEpisodeRecord({ workspace, agentId: "default", selector: `episode-${sampleReport().runId}` });
      expect(loaded.runId).toBe(sampleReport().runId);

      const markdownPath = join(workspace, "episode.md");
      const exported = exportEpisodeRecord({
        workspace,
        agentId: "default",
        selector: sampleReport().runId,
        outputPath: markdownPath,
        format: "markdown"
      });
      expect(exported.outputPath).toBe(markdownPath);
      expect(readFileSync(markdownPath, "utf8")).toContain(`# AMC Episode ${loaded.episodeId}`);
      expect(existsSync(written.episodePath)).toBe(true);

      const redactedPath = join(workspace, "episode-redacted.json");
      const redacted = exportEpisodeRecord({
        workspace,
        agentId: "default",
        selector: sampleReport().runId,
        outputPath: redactedPath,
        redacted: true
      });
      const redactedBody = readFileSync(redactedPath, "utf8");
      expect(redacted.redacted).toBe(true);
      expect(redactedBody).toContain("$WORKSPACE/");
      expect(redactedBody).not.toContain(workspace);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
