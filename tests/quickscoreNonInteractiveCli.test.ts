import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  AUTO_QUICKSCORE_NO_EVIDENCE_NOTICE,
  NON_INTERACTIVE_QUICKSCORE_NOTICE,
  parseQuickscoreAnswers,
  withAutoQuickscoreNoEvidenceNotice,
  withNonInteractiveQuickscoreNotice,
  withProvidedAnswersQuickscoreMetadata,
} from "../src/diagnostic/nonInteractiveQuickscore.js";

describe("quickscore non-interactive CLI output", () => {
  test("marks placeholder scores with structured non-interactive metadata", () => {
    const parsed = withNonInteractiveQuickscoreNotice({ totalScore: 0, maxScore: 1220 });

    expect(parsed.nonInteractive).toBe(true);
    expect(parsed.scoreStatus).toBe("NON_INTERACTIVE_PLACEHOLDER");
    expect(parsed.warning).toContain("no measured maturity result");
    expect(parsed.suggestedCommands).toContain("amc quickscore --auto");
    expect(parsed.totalScore).toBe(0);
  });

  test("keeps notice fields stable for CLI JSON consumers", () => {
    expect(NON_INTERACTIVE_QUICKSCORE_NOTICE).toEqual({
      nonInteractive: true,
      scoreStatus: "NON_INTERACTIVE_PLACEHOLDER",
      warning: "No TTY detected; no questions were answered. No placeholder L0 score was generated; no measured maturity result was produced.",
      firstRunHint: "Did you mean to run the interactive score? Run `amc quickscore` in a terminal, or pass answers with `amc quickscore --answers answers.json --json`.",
      suggestedCommands: [
        "amc quickscore",
        "amc quickscore --answers answers.json --json",
        "amc quickscore --auto",
        "amc wrap <runtime> -- <your-agent-command>"
      ]
    });
  });

  test("keeps auto no-evidence notice fields stable for CLI JSON consumers", () => {
    expect(AUTO_QUICKSCORE_NO_EVIDENCE_NOTICE).toEqual({
      nonInteractive: true,
      scoreStatus: "AUTO_NO_EVIDENCE",
      warning: "Auto-score could not find execution evidence. No measured maturity score was produced.",
      firstRunHint: "Capture evidence with `amc wrap <runtime> -- <your-agent-command>` or use `amc quickscore --answers answers.json --json` for CI-safe survey scoring.",
      suggestedCommands: [
        "amc wrap <runtime> -- <your-agent-command>",
        "amc adapters run --agent <id> --workorder <workOrderId>",
        "amc quickscore --answers answers.json --json",
        "amc quickscore"
      ]
    });

    expect(withAutoQuickscoreNoEvidenceNotice({ agentId: "empty-agent", error: "missing context" })).toEqual({
      agentId: "empty-agent",
      error: "missing context",
      ...AUTO_QUICKSCORE_NO_EVIDENCE_NOTICE
    });
  });

  test("compiled default non-interactive output fails closed before producing a placeholder score", () => {
    const result = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "quickscore"
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" }
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Interactive quickscore requires a terminal");
    expect(result.stdout).toContain("No placeholder L0 score was generated");
    expect(result.stdout).toContain("Did you mean to run the interactive score?");
    expect(result.stdout).toContain("Run in a terminal: amc quickscore");
    expect(result.stdout).toContain("amc quickscore --answers answers.json --json");
    expect(result.stdout).not.toContain("AMC Full Diagnostic");
    expect(result.stdout).not.toContain("Score: 0/");
  });

  test("compiled default non-interactive JSON fails closed without score fields", () => {
    const result = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "quickscore",
      "--json"
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" }
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    const parsed = JSON.parse(result.stdout) as {
      scoreStatus: string;
      warning: string;
      totalScore?: number;
      questionScores?: unknown[];
      suggestedCommands: string[];
    };
    expect(parsed.scoreStatus).toBe("NON_INTERACTIVE_PLACEHOLDER");
    expect(parsed.warning).toContain("no measured maturity result");
    expect(parsed.totalScore).toBeUndefined();
    expect(parsed.questionScores).toBeUndefined();
    expect(parsed.suggestedCommands).toContain("amc quickscore --answers answers.json --json");
  });

  test("compiled rapid non-interactive output also fails closed before placeholder scoring", () => {
    const result = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "quickscore",
      "--rapid"
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" }
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Interactive quickscore requires a terminal");
    expect(result.stdout).toContain("No placeholder L0 score was generated");
    expect(result.stdout).toContain("amc quickscore --rapid --answers answers.json --json");
    expect(result.stdout).not.toContain("AMC Rapid Quickscore");
    expect(result.stdout).not.toContain("Score: 0/");
  });

  test("compiled auto no-evidence JSON fails closed without pretending a zero score was measured", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-auto-empty-"));
    const result = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "quickscore",
      "--auto",
      "--json",
      "--agent",
      "empty-agent"
    ], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" }
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    const parsed = JSON.parse(result.stdout) as {
      scoreStatus: string;
      warning: string;
      totalScore?: number;
      suggestedCommands: string[];
    };
    expect(parsed.scoreStatus).toBe("AUTO_NO_EVIDENCE");
    expect(parsed.warning).toContain("No measured maturity score was produced");
    expect(parsed.totalScore).toBeUndefined();
    expect(parsed.suggestedCommands).toContain("amc quickscore --answers answers.json --json");
  });

  test("audit and getting-started docs record the first-run hint fix", () => {
    const audit = readFileSync("docs/AUDIT_50_AGENTS_BATCH5.md", "utf8");
    const gettingStarted = readFileSync("docs/GETTING_STARTED.md", "utf8");
    const quickstart = readFileSync("docs/QUICKSTART.md", "utf8");
    const readme = readFileSync("README.md", "utf8");
    const uxAudit = readFileSync("docs/UX_AUDIT_REPORT.md", "utf8");

    expect(audit).toContain("First-run interactive hint — ✅ Resolved 2026-06-16");
    expect(audit).toContain("Auto no-evidence status — ✅ Resolved 2026-06-16");
    expect(audit).toContain("Node.js TTY documentation");
    expect(audit).not.toContain('No "did you mean to run interactive mode?" hint');
    expect(audit).not.toContain("still gets 0");
    expect(gettingStarted).toContain("Did you mean to run the interactive score?");
    expect(gettingStarted).toContain("AUTO_NO_EVIDENCE");
    expect(quickstart).toContain("AUTO_NO_EVIDENCE");
    expect(readme).toContain("AUTO_NO_EVIDENCE");
    expect(uxAudit).toContain("R25 — non-interactive quickscore fails closed before placeholder scoring");
    expect(uxAudit).not.toContain("Force-interactive `quickscore` with a TTY; continue reducing first-run evidence setup friction");
  });

  test("parses inline JSON answers for headless scoring", () => {
    const parsed = parseQuickscoreAnswers('{"AMC-1.1":3,"AMC-2.1":"4"}');

    expect(parsed).toEqual({
      answers: {
        "AMC-1.1": 3,
        "AMC-2.1": 4
      },
      answeredQuestions: 2,
      source: "inline"
    });
  });

  test("parses answer files and wrapped answer payloads", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-answers-"));
    const file = join(dir, "answers.json");
    writeFileSync(file, JSON.stringify({ answers: { "AMC-3.1.1": 5 } }));

    const parsed = parseQuickscoreAnswers("answers.json", { cwd: dir });

    expect(parsed).toEqual({
      answers: {
        "AMC-3.1.1": 5
      },
      answeredQuestions: 1,
      source: "file"
    });
  });

  test("rejects invalid answer payloads before scoring", () => {
    expect(() => parseQuickscoreAnswers('{"AMC-1.1":6}')).toThrow("between 0 and 5");
    expect(() => parseQuickscoreAnswers('{"AMC-1.1":2.5}')).toThrow("integer");
    expect(() => parseQuickscoreAnswers("missing.json", { cwd: tmpdir() })).toThrow("Could not read --answers file");
  });

  test("marks provided-answer scores with structured metadata", () => {
    const parsed = withProvidedAnswersQuickscoreMetadata(
      { totalScore: 7, maxScore: 25 },
      { answeredQuestions: 2, source: "inline" },
      { nonInteractive: true }
    );

    expect(parsed).toEqual({
      totalScore: 7,
      maxScore: 25,
      nonInteractive: true,
      scoreStatus: "PROVIDED_ANSWERS",
      answersSource: "inline",
      answeredQuestions: 2
    });
  });

  test("compiled rapid --share path emits an offline badge and summary without Studio", () => {
    const answers = JSON.stringify({
      "AMC-1.1": 3,
      "AMC-2.1": 2,
      "AMC-3.1.1": 3,
      "AMC-4.1": 2,
      "AMC-5.1": 2
    });
    const result = spawnSync(process.execPath, [
      join(process.cwd(), "dist", "cli.js"),
      "quickscore",
      "--rapid",
      "--share",
      "--answers",
      answers
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" }
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Shareable Badge");
    expect(result.stdout).toContain("Markdown (paste in README)");
    expect(result.stdout).toContain("img.shields.io");
    expect(result.stdout).toContain("Assessed via AMC Rapid Score");
    expect(result.stdout).not.toContain("Studio");
  });
});
