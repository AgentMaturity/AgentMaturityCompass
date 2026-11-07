/** SH-OBS-04: eval suites against the native agent: graders, pass@k, confinement, isolation, baselines and gates. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { passAtK, scoreTask } from "../../src/eval/suiteScoring.js";
import { gradeText, stageGradingDir } from "../../src/eval/suiteGraders.js";
import { loadEvalSuite } from "../../src/eval/suiteLoader.js";
import { suiteSchema } from "../../src/eval/suiteSchema.js";
import { baselineFromResults, compareResults, type EvalBaseline } from "../../src/eval/suiteCompare.js";
import { runEvalSuite, type EvalResults } from "../../src/eval/suiteRunner.js";
import { registerEvalSuiteCommands } from "../../src/cli-eval-suite-commands.js";
import { SandboxRunner } from "../../src/sandbox/sandboxRunner.js";
import { allEvents, removeWorkspace, stubWorkspace } from "../observability/helpers/stubSessionWorkspace.js";

vi.setConfig({ testTimeout: 300_000 });
const SUITE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "examples", "eval-suites", "stub-smoke", "suite.yaml");
const confined = new SandboxRunner().select() !== null;
let ws: string;
const cwd = process.cwd();
beforeEach(() => { ws = stubWorkspace("amc-eval-"); });
afterEach(() => { process.chdir(cwd); process.exitCode = undefined; vi.restoreAllMocks(); removeWorkspace(ws); });

describe("scoring and graders (pure)", () => {
  it("pass@k is the unbiased estimator, refuses k > n, and pass^k is not used", () => {
    expect(passAtK(5, 2, 3)).toBeCloseTo(0.9, 10);
    expect(passAtK(2, 1, 2), "n=k=2, c=1: the plug-in (c/n)^k would say 0.25 for pass^2; pass@2 is 1").toBe(1);
    expect(passAtK(4, 1, 1)).toBeCloseTo(0.25, 10);
    expect(passAtK(3, 0, 2)).toBe(0);
    expect(() => passAtK(2, 1, 3)).toThrow(/undefined/);
    const score = scoreTask("t", ["pass", "fail", "error"]);
    expect(score).toMatchObject({ attempts: 3, passes: 1, errors: 1, passRate: 1 / 3 });
    expect(score.passAtK["pass@3"]).toBe(1);
  });

  it("text graders: exact/contains/regex/not_contains, and an unreadable answer is an error, never a pass", () => {
    expect(gradeText({ type: "exact", expected: " 42 ", normalize: "trim" }, "42\n").status).toBe("pass");
    expect(gradeText({ type: "contains", expected: "Yes", caseSensitive: false }, "yes indeed").status).toBe("pass");
    expect(gradeText({ type: "contains", expected: "Yes", caseSensitive: true }, "yes indeed").status).toBe("fail");
    expect(gradeText({ type: "regex", pattern: "^a+$", flags: "" }, "aaa").status).toBe("pass");
    expect(gradeText({ type: "regex", pattern: "(", flags: "" }, "aaa").status).toBe("error");
    expect(gradeText({ type: "not_contains", expected: "error", caseSensitive: false }, "all good").status).toBe("pass");
    expect(gradeText({ type: "not_contains", expected: "error", caseSensitive: false }, null).status, "a pruned answer cannot pass not_contains").toBe("error");
  });

  it("schema refuses llm_judge, climbing paths and command graders with nothing to grade", () => {
    const base = { version: 1, suiteId: "s", tasks: [{ id: "a", prompt: "p", graders: [{ type: "exact", expected: "x" }] }] };
    expect(suiteSchema.safeParse(base).success).toBe(true);
    const judge = suiteSchema.safeParse({ ...base, tasks: [{ id: "a", prompt: "p", graders: [{ type: "llm_judge", rubric: "r" }] }] });
    expect(judge.success).toBe(false);
    expect(JSON.stringify(judge.success ? "" : judge.error.issues)).toContain("D-12");
    expect(suiteSchema.safeParse({ ...base, tasks: [{ id: "a", prompt: "p", fixture: { dir: "../x" }, graders: [{ type: "exact", expected: "x" }] }] }).success).toBe(false);
    expect(suiteSchema.safeParse({ ...base, tasks: [{ id: "a", prompt: "p", graders: [{ type: "tests", command: ["node", "t.mjs"] }] }] }).success).toBe(false);
  });

  it("loader snapshots fixtures and refuses a fixture outside the suite directory", () => {
    const loaded = loadEvalSuite(SUITE);
    expect(loaded.suite.tasks).toHaveLength(3);
    expect([...loaded.fixtures.get("answer-file")!].map((file) => file.relativePath)).toEqual(["check.mjs"]);
    const dir = join(ws, "suite");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "bad.yaml"), "version: 1\nsuiteId: bad\ntasks:\n  - id: a\n    prompt: p\n    fixture: { dir: fx/../../workspace }\n    graders: [{ type: exact, expected: x }]\n");
    expect(() => loadEvalSuite(join(dir, "bad.yaml"))).toThrow(/outside the suite directory|never climb/);
  });

  it("grading directory holds only the snapshot plus declared plain-file outputs; a planted test file is not used", () => {
    const attempt = join(ws, "attempt");
    mkdirSync(attempt, { recursive: true });
    writeFileSync(join(attempt, "check.mjs"), "process.exit(0) // planted by the agent");
    writeFileSync(join(attempt, "answer.txt"), "42");
    writeFileSync(join(attempt, "secret.txt"), "not declared");
    const fixture = [{ relativePath: "check.mjs", bytes: Buffer.from("original"), sha256: "x", mode: 0o644 }];
    const staged = stageGradingDir({ fixture, attemptDir: attempt, outputs: ["answer.txt", "../escape.txt", "missing.txt"], allowUnconfined: false, workspace: ws });
    expect(readFileSync(join(staged.dir, "check.mjs"), "utf8"), "the grader runs the pinned test, not the agent's copy").toBe("original");
    expect(readFileSync(join(staged.dir, "answer.txt"), "utf8")).toBe("42");
    expect(existsSync(join(staged.dir, "secret.txt"))).toBe(false);
    expect(staged.missingOutputs).toEqual(["../escape.txt", "missing.txt"]);
  });

  it("compare: Wilson-based regression, inconclusive on unrecorded digests, suite change, unknown cost or too few attempts", () => {
    const mk = (tasks: Record<string, { attempts: number; passes: number; errors: number }>, cost: number | null = null, suiteSha256 = "s1"): string => JSON.stringify({
      schema: "amc.eval-results/v1", runId: "r", suiteId: "x", suiteSha256, tasks: Object.entries(tasks).map(([taskId, score]) => ({ taskId, score: { ...score, passRate: score.attempts ? score.passes / score.attempts : null } })),
      summary: { attempts: Object.values(tasks).reduce((s, t) => s + t.attempts, 0), passes: Object.values(tasks).reduce((s, t) => s + t.passes, 0), errors: 0,
        passRate: Object.values(tasks).reduce((s, t) => s + t.passes, 0) / Math.max(1, Object.values(tasks).reduce((s, t) => s + t.attempts, 0)), cost: { attributedUsd: cost, complete: cost !== null } } });
    const baseline = (json: string): string => JSON.stringify(baselineFromResults(json) satisfies EvalBaseline);
    const recorded = { results: true, baseline: true };
    const gate = { maxRegressedTasks: 0, minAttemptsPerTask: 1, requireSameSuite: true };
    // A task passing 9/10 then 2/3 is noise, not a regression: the intervals overlap.
    expect(compareResults({ baselineJson: baseline(mk({ a: { attempts: 10, passes: 9, errors: 0 } })), resultsJson: mk({ a: { attempts: 3, passes: 2, errors: 0 } }), gate, recorded }).status).toBe("pass");
    // 10/10 -> 0/10 is a regression.
    const regressed = compareResults({ baselineJson: baseline(mk({ a: { attempts: 10, passes: 10, errors: 0 } })), resultsJson: mk({ a: { attempts: 10, passes: 0, errors: 0 } }), gate, recorded });
    expect(regressed.status).toBe("fail");
    expect(regressed.regressedTasks).toEqual(["a"]);
    expect(compareResults({ baselineJson: baseline(mk({ a: { attempts: 2, passes: 2, errors: 0 } })), resultsJson: mk({ a: { attempts: 2, passes: 2, errors: 0 } }), gate, recorded: { results: false, baseline: true } }).status).toBe("inconclusive");
    expect(compareResults({ baselineJson: baseline(mk({ a: { attempts: 2, passes: 2, errors: 0 } })), resultsJson: mk({ a: { attempts: 2, passes: 2, errors: 0 } }, null, "s2"), gate, recorded }).status).toBe("inconclusive");
    expect(compareResults({ baselineJson: baseline(mk({ a: { attempts: 2, passes: 2, errors: 0 } })), resultsJson: mk({ a: { attempts: 2, passes: 2, errors: 0 } }), gate: { ...gate, maxCostIncreaseRatio: 1.1 }, recorded }).status).toBe("inconclusive");
    expect(compareResults({ baselineJson: baseline(mk({ a: { attempts: 2, passes: 2, errors: 0 } }, 1)), resultsJson: mk({ a: { attempts: 2, passes: 2, errors: 0 } }, 2), gate: { ...gate, maxCostIncreaseRatio: 1.1 }, recorded }).status).toBe("fail");
    expect(compareResults({ baselineJson: baseline(mk({ a: { attempts: 1, passes: 1, errors: 0 } })), resultsJson: mk({ a: { attempts: 1, passes: 1, errors: 0 } }), gate: { ...gate, minAttemptsPerTask: 2 }, recorded }).status).toBe("inconclusive");
    expect(compareResults({ baselineJson: baseline(mk({ a: { attempts: 2, passes: 2, errors: 0 } })), resultsJson: mk({ a: { attempts: 2, passes: 1, errors: 0 } }), gate: { ...gate, minPassRate: 0.9 }, recorded }).status).toBe("fail");
  });
});

describe("end to end through the CLI with the stub provider", () => {
  it("runs the shipped stub-smoke suite twice per task, records the run, gates it, and refuses an edited results file", async () => {
    const program = new Command();
    program.command("eval");
    registerEvalSuiteCommands(program);
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.push(args.join(" ")); });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { logs.push(args.join(" ")); });
    process.chdir(ws);
    const out = join(ws, "r.json"), baseline = join(ws, "b.json");
    await program.parseAsync(["eval", "suite", "run", SUITE, "--provider", "stub", "--attempts", "2", "--out", out, "--keep-dirs"], { from: "user" });
    expect(process.exitCode, logs.join("\n")).toBeUndefined();
    const results = JSON.parse(readFileSync(out, "utf8")) as EvalResults;
    expect(results.schema).toBe("amc.eval-results/v1");
    expect(results.attemptsPerTask).toBe(2);
    const byTask = Object.fromEntries(results.tasks.map((task) => [task.taskId, task]));
    expect(byTask["echo-exact"]!.score).toMatchObject({ attempts: 2, passes: 2 });
    expect(byTask["echo-exact"]!.score.passAtK).toEqual({ "pass@1": 1, "pass@2": 1 });
    expect(byTask["echo-regex"]!.score.passes).toBe(2);
    for (const attempt of results.tasks.flatMap((task) => task.attempts)) {
      expect(attempt.sessionId).not.toBeNull();
      expect(attempt.outcome).toBe("completed");
      expect(attempt.cost?.status, "stub cost is unavailable, never zero").toBe("unavailable");
    }
    expect(results.summary.cost.attributedUsd).toBeNull();
    expect(results.summary.cost.complete).toBe(false);
    expect(results.fixtures["answer-file"]!["check.mjs"]).toMatch(/^[0-9a-f]{64}$/);
    // The repository task: the governed fs.write landed inside the attempt directory only, and the pinned test graded it
    // under the OS sandbox, or was refused when no backend exists here.
    const repo = byTask["answer-file"]!;
    const first = repo.attempts[0]!;
    const attemptDir = join(ws, ".amc-eval", results.runId, "answer-file", "1");
    expect(existsSync(join(attemptDir, "answer.txt"))).toBe(true);
    expect(existsSync(join(ws, "answer.txt"))).toBe(false);
    const grader = first.graders[0]!;
    if (confined) { expect(grader.status, grader.detail).toBe("pass"); expect(grader.confined).toBe(true); expect(repo.score.passes).toBe(2); }
    else { expect(grader.status).toBe("error"); expect(grader.detail).toContain("unconfined grader refused"); expect(repo.score.errors).toBe(2); }
    // Evidence: every attempt is a sealed signed session with the eval stamp, plus one EVAL_SUITE_RUN audit row with the digest.
    const rows = allEvents(ws);
    const audit = rows.filter((row) => row.event_type === "audit" && (JSON.parse(row.meta_json) as { auditType?: string }).auditType === "EVAL_SUITE_RUN");
    expect(audit).toHaveLength(1);
    expect((JSON.parse(audit[0]!.meta_json) as { resultsSha256: string }).resultsSha256).toMatch(/^[0-9a-f]{64}$/);
    const stamped = rows.filter((row) => row.event_type === "session/open" && String((JSON.parse(row.meta_json) as { caseExecution?: { casebookId?: string } }).caseExecution?.casebookId) === "eval-suite:stub-smoke");
    expect(stamped).toHaveLength(6);
    expect((JSON.parse(stamped[0]!.meta_json) as { agentId: string }).agentId).toBe("eval-suite");

    logs.length = 0;
    await program.parseAsync(["eval", "suite", "baseline", out, "--out", baseline], { from: "user" });
    expect(process.exitCode).toBeUndefined();
    await program.parseAsync(["eval", "suite", "compare", baseline, out, "--json"], { from: "user" });
    const verdict = JSON.parse(logs[logs.length - 1]!) as { status: string; reasons: string[] };
    if (confined) { expect(verdict.status, verdict.reasons.join("; ")).toBe("pass"); expect(process.exitCode).toBe(0); }
    else { expect(verdict.status).toBe("inconclusive"); expect(process.exitCode).toBe(2); }
    // Mutation: an edited results file is no longer recorded in the ledger, so the gate is inconclusive (exit 2), never a pass.
    process.exitCode = undefined;
    writeFileSync(out, readFileSync(out, "utf8").replace('"passes": 2', '"passes": 1'));
    await program.parseAsync(["eval", "suite", "compare", baseline, out, "--json"], { from: "user" });
    expect(process.exitCode).toBe(2);
    expect(logs[logs.length - 1]).toContain("not recorded in the verified ledger");
  });

  it("the attempt guard denies a governed write outside the attempt directory, and runs refuse no-sign mode", async () => {
    const dir = join(ws, "suite");
    mkdirSync(dir, { recursive: true });
    const escape = join(dir, "escape.yaml");
    writeFileSync(escape, ["version: 1", "suiteId: escape", "defaults: { tools: workspace }", "tasks:", "  - id: out",
      `    prompt: '{"tool":"fs.write","arguments":{"path":"workspace/escaped.txt","content":"x"}}'`, "    graders: [{ type: contains, expected: 'wrote' }]"].join("\n"));
    const loaded = loadEvalSuite(escape);
    const { results } = await runEvalSuite({ workspace: ws, loaded, attempts: 1, provider: { providerId: "stub", maxSteps: 4 } });
    expect(existsSync(join(ws, "workspace", "escaped.txt")), "the deny-only guard refused the path").toBe(false);
    expect(results.tasks[0]!.attempts[0]!.verdict).not.toBe("pass");
    const denied = allEvents(ws).filter((row) => row.event_type === "audit" && (JSON.parse(row.meta_json) as { auditType?: string }).auditType === "TOOL_CALL_DENIED");
    expect(denied.length).toBeGreaterThan(0);
    expect(JSON.stringify(denied.map((row) => row.meta_json))).toContain("eval-attempt-scope");
    vi.stubEnv("AMC_NO_SIGN", "1");
    await expect(runEvalSuite({ workspace: ws, loaded, attempts: 1, provider: { providerId: "stub" } })).rejects.toThrow(/no-sign/);
    vi.unstubAllEnvs();
  });
});
