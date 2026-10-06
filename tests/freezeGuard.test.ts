import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { evaluateFreeze, parseFreezeExceptions } from "../scripts/check-freeze.mjs";

const counts = { cliCommandPaths: 1228, cliInventoryPaths: 1228, stationPacks: 41, stationPackQuestions: 600 };

function baseline(overrides: Partial<typeof counts> = {}, allowedExceptionKeys = ["P0-12"], freezeActive = true) {
  return {
    schemaVersion: 1 as const,
    freezeActive,
    measuredAt: "2026-10-05T00:00:00.000Z",
    measuredOn: "786d8abb2a12b82d0986c3a286864d7966d21166",
    counts: { ...counts, ...overrides },
    allowedExceptionKeys
  };
}

const exception = "---\n\"agent-maturity-compass\": patch\n---\n\nfreeze-exception: P0-12 — S3 15-question floor\n";

describe("P0-01 freeze guard", () => {
  test("counts equal to the baseline pass", () => {
    const result = evaluateFreeze({ counts, baseline: baseline(), baseBaseline: baseline(), changesetTexts: [] });
    expect(result).toEqual({ ok: true, failures: [], notices: [] });
  });

  test("a new CLI command path against an unchanged baseline fails", () => {
    const result = evaluateFreeze({
      counts: { ...counts, cliCommandPaths: 1229 }, baseline: baseline(), baseBaseline: baseline(), changesetTexts: []
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("cliCommandPaths rose from 1228 to 1229");
  });

  test("fewer questions against an unchanged baseline fail as stale", () => {
    const result = evaluateFreeze({
      counts: { ...counts, stationPackQuestions: 570 }, baseline: baseline(), baseBaseline: baseline(), changesetTexts: []
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("stale: stationPackQuestions fell from 600 to 570");
  });

  test("fewer questions with a lowered baseline pass without an exception", () => {
    const result = evaluateFreeze({
      counts: { ...counts, stationPackQuestions: 570 },
      baseline: baseline({ stationPackQuestions: 570 }),
      baseBaseline: baseline(),
      changesetTexts: []
    });
    expect(result.ok).toBe(true);
  });

  const raised = { ...counts, stationPackQuestions: 632 };

  test("a raised baseline with an allowed freeze exception passes", () => {
    const result = evaluateFreeze({
      counts: raised, baseline: baseline({ stationPackQuestions: 632 }), baseBaseline: baseline(), changesetTexts: [exception]
    });
    expect(result).toEqual({ ok: true, failures: [], notices: [] });
  });

  test("the HTML-comment form of the exception is accepted", () => {
    const result = evaluateFreeze({
      counts: raised,
      baseline: baseline({ stationPackQuestions: 632 }),
      baseBaseline: baseline(),
      changesetTexts: ["<!-- freeze-exception: P0-12 — S3 15-question floor -->\n"]
    });
    expect(result.ok).toBe(true);
  });

  test("a raised baseline without the freeze-exception line fails", () => {
    const result = evaluateFreeze({
      counts: raised, baseline: baseline({ stationPackQuestions: 632 }), baseBaseline: baseline(), changesetTexts: ["---\n---\n\nAdds questions.\n"]
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("stationPackQuestions rose from 600 to 632");
  });

  test("an exception key the base does not allow fails, even if the PR allows it", () => {
    const result = evaluateFreeze({
      counts: raised,
      baseline: baseline({ stationPackQuestions: 632 }, ["P0-12", "P1-22"]),
      baseBaseline: baseline(),
      changesetTexts: ["freeze-exception: P1-22 — more questions\n"]
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("P1-22 is not in the base baseline's allowedExceptionKeys");
  });

  test("an exception line without a reason fails", () => {
    const result = evaluateFreeze({
      counts: raised, baseline: baseline({ stationPackQuestions: 632 }), baseBaseline: baseline(), changesetTexts: ["freeze-exception: P0-12\n"]
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("P0-12 has no reason");
  });

  test("an inactive freeze passes higher counts with a notice", () => {
    const off = baseline({}, ["P0-12"], false);
    const result = evaluateFreeze({ counts: raised, baseline: off, baseBaseline: off, changesetTexts: [] });
    expect(result.ok).toBe(true);
    expect(result.notices.join("\n")).toContain("inactive");
  });

  test("a PR cannot switch the freeze off for itself", () => {
    const result = evaluateFreeze({
      counts: raised, baseline: baseline({}, ["P0-12"], false), baseBaseline: baseline(), changesetTexts: []
    });
    expect(result.ok).toBe(false);
  });

  test("without a base baseline only the exact check runs, with a notice", () => {
    const raisedBaseline = baseline({ stationPackQuestions: 632 });
    const result = evaluateFreeze({ counts: raised, baseline: raisedBaseline, baseBaseline: null, changesetTexts: [] });
    expect(result.ok).toBe(true);
    expect(result.notices.join("\n")).toContain("exact check only");
    expect(evaluateFreeze({ counts, baseline: raisedBaseline, baseBaseline: null, changesetTexts: [] }).ok).toBe(false);
  });

  test("parses exception lines in plain and comment form", () => {
    expect(parseFreezeExceptions("x\nfreeze-exception: P0-12 — S3 floor\n<!-- freeze-exception: P1-08 - reason -->\nfreeze-exception: D-09\n"))
      .toEqual([{ key: "P0-12", reason: "S3 floor" }, { key: "P1-08", reason: "reason" }, { key: "D-09", reason: "" }]);
  });

  test("the CLI fails on growth read from --counts-json", () => {
    const fixture = mkdtempSync(join(tmpdir(), "amc-freeze-cli-"));
    try {
      mkdirSync(join(fixture, "scripts"));
      writeFileSync(join(fixture, "scripts/freeze-baseline.json"), JSON.stringify(baseline()));
      writeFileSync(join(fixture, "counts.json"), JSON.stringify({ ...counts, cliCommandPaths: 1229 }));
      const run = spawnSync(process.execPath, [resolve("scripts/check-freeze.mjs"), "--counts-json", "counts.json"], {
        cwd: fixture, encoding: "utf8", timeout: 10_000, env: { ...process.env, GITHUB_BASE_REF: "", GITHUB_EVENT_NAME: "" }
      });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("cliCommandPaths rose from 1228 to 1229");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("the CLI rejects missing or non-numeric counts", () => {
    const fixture = mkdtempSync(join(tmpdir(), "amc-freeze-cli-"));
    try {
      mkdirSync(join(fixture, "scripts"));
      writeFileSync(join(fixture, "scripts/freeze-baseline.json"), JSON.stringify(baseline()));
      writeFileSync(join(fixture, "counts.json"), JSON.stringify({ ...counts, cliCommandPaths: "x", stationPacks: undefined }));
      const run = spawnSync(process.execPath, [resolve("scripts/check-freeze.mjs"), "--counts-json", "counts.json"], {
        cwd: fixture, encoding: "utf8", timeout: 10_000, env: { ...process.env, GITHUB_BASE_REF: "", GITHUB_EVENT_NAME: "" }
      });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain("cliCommandPaths, stationPacks");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("on push, a baseline raise in an earlier commit of the push is checked against the pre-push tip", () => {
    const fixture = mkdtempSync(join(tmpdir(), "amc-freeze-push-"));
    const git = (...args: string[]) => {
      const result = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], {
        cwd: fixture, encoding: "utf8"
      });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    try {
      mkdirSync(join(fixture, "scripts"));
      git("init", "-q");
      writeFileSync(join(fixture, "scripts/freeze-baseline.json"), JSON.stringify(baseline()));
      git("add", ".");
      git("commit", "-q", "-m", "base");
      const before = git("rev-parse", "HEAD");
      writeFileSync(join(fixture, "scripts/freeze-baseline.json"), JSON.stringify(baseline({ cliCommandPaths: 1278 })));
      git("commit", "-q", "-am", "raise without an exception");
      writeFileSync(join(fixture, "other.txt"), "unrelated\n");
      git("add", "other.txt");
      git("commit", "-q", "-m", "unrelated");
      writeFileSync(join(fixture, "counts.json"), JSON.stringify({ ...counts, cliCommandPaths: 1278 }));
      const runPush = (eventBefore: string) => {
        writeFileSync(join(fixture, "event.json"), JSON.stringify({ before: eventBefore }));
        return spawnSync(process.execPath, [resolve("scripts/check-freeze.mjs"), "--counts-json", "counts.json"], {
          cwd: fixture, encoding: "utf8", timeout: 10_000,
          env: { ...process.env, GITHUB_BASE_REF: "", GITHUB_EVENT_NAME: "push", GITHUB_EVENT_PATH: join(fixture, "event.json") }
        });
      };
      const pushed = runPush(before);
      expect(pushed.status).toBe(1);
      expect(pushed.stderr).toContain("baseline cliCommandPaths rose from 1228 to 1278");
      // A new branch reports an all-zero "before"; the guard falls back to HEAD^1.
      expect(runPush("0".repeat(40)).status).toBe(0);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
