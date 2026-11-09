/** SH-OBS-04: eval suites against the native agent: graders, pass@k, confinement, isolation, baselines and gates. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { passAtK, scoreTask } from "../../src/eval/suiteScoring.js";
import { gradeCommand, gradeText, stageGradingDir } from "../../src/eval/suiteGraders.js";
import { loadEvalSuite } from "../../src/eval/suiteLoader.js";
import { suiteSchema } from "../../src/eval/suiteSchema.js";
import { baselineFromResults, canDetectTotalRegression, compareResults, gateSchema, type EvalBaseline } from "../../src/eval/suiteCompare.js";
import { attemptGuard, runEvalSuite, type EvalResults } from "../../src/eval/suiteRunner.js";
import { registerEvalSuiteCommands } from "../../src/cli-eval-suite-commands.js";
import { installClaimLabelHooks } from "../../src/cli/claimLabelHooks.js";
import { SandboxRunner } from "../../src/sandbox/sandboxRunner.js";
import type { SandboxBackend } from "../../src/sandbox/sandboxTypes.js";
import type { ToolExecution } from "../../src/tools/toolTypes.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { allEvents, removeWorkspace, stubWorkspace } from "../observability/helpers/stubSessionWorkspace.js";

vi.setConfig({ testTimeout: 300_000 });
const SUITE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "examples", "eval-suites", "stub-smoke", "suite.yaml");
// The same question the graders ask: can a backend here enforce the grader policy (writes, network, reads, processes)?
// A selected-but-partial backend (the write-only Seatbelt profile) refuses, so `select() !== null` would overstate it.
const probeDir = mkdtempSync(join(tmpdir(), "amc-eval-probe-"));
const confined = (await gradeCommand({ type: "script", command: [process.execPath, "-e", "process.exit(0)"], timeoutMs: 60_000, passExitCode: 0 },
  { fixture: [], attemptDir: probeDir, outputs: [], allowUnconfined: false, workspace: probeDir })).status === "pass";
let ws: string;
const cwd = process.cwd();
beforeEach(() => { ws = stubWorkspace("amc-eval-"); });
afterEach(() => { process.chdir(cwd); process.exitCode = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs(); removeWorkspace(ws); });

describe("scoring and graders (pure)", () => {
  it("pass@k is the unbiased estimator, refuses k > n, and pass^k is not used", () => {
    expect(passAtK(5, 2, 3)).toBeCloseTo(0.9, 10);
    expect(passAtK(2, 1, 2), "n=k=2, c=1: the plug-in (c/n)^k would say 0.25 for pass^2; pass@2 is 1").toBe(1);
    expect(passAtK(4, 1, 1)).toBeCloseTo(0.25, 10);
    expect(passAtK(3, 0, 2)).toBe(0);
    expect(() => passAtK(2, 1, 3)).toThrow(/undefined/);
    // An error attempt is neither a pass nor a fail: rates and pass@k run over the two graded attempts, never over three.
    const score = scoreTask("t", ["pass", "fail", "error"]);
    expect(score).toMatchObject({ attempts: 3, passes: 1, errors: 1, passRate: 0.5 });
    expect(score.passAtK).toEqual({ "pass@1": 0.5, "pass@2": 1 });
    expect(scoreTask("t", ["error", "error"]).passRate, "nothing graded: no rate, not 0").toBeNull();
  });

  it("--unsafe-unconfined-graders grades an unconfined run by its exit status (confined:false) and falls back when the selected backend refuses the policy", async () => {
    const grader = { type: "script" as const, command: [process.execPath, "-e", "process.exit(3)"], timeoutMs: 60_000, passExitCode: 3 };
    const input = { fixture: [], attemptDir: probeDir, outputs: [], workspace: probeDir };
    const none = await gradeCommand(grader, { ...input, allowUnconfined: true, runner: new SandboxRunner({ backends: [], allowUnconfined: true }) });
    expect(none, none.detail).toMatchObject({ status: "pass", confined: false, backend: "none", exitCode: 3 });
    expect(none.detail).toContain("UNCONFINED");
    expect((await gradeCommand({ ...grader, passExitCode: 0 }, { ...input, allowUnconfined: true, runner: new SandboxRunner({ backends: [], allowUnconfined: true }) })).status, "a wrong exit status under the opt-in is a fail, not an error").toBe("fail");
    // The write-only Seatbelt profile is selected on macOS but refuses network/readDeny/maxProcesses with nothing run: the opt-in falls back to an unconfined run.
    const refusing: SandboxBackend = { kind: "seatbelt", available: () => ({ ok: true }), run: async (_command, _cwd, policy) => ({ confined: false, backend: "seatbelt", exitCode: null, timedOut: false, stdout: "", stderr: "",
      writableRoots: policy.writableRoots, failure: { kind: "unavailable", reason: "the write-only Seatbelt backend cannot enforce network; nothing was run" } }) };
    const fallen = await gradeCommand(grader, { ...input, allowUnconfined: true, runner: new SandboxRunner({ backends: [refusing], allowUnconfined: true }) });
    expect(fallen, fallen.detail).toMatchObject({ status: "pass", confined: false, backend: "none", exitCode: 3 });
    // Without the opt-in the same refusal stays an error that names the flag.
    const refused = await gradeCommand(grader, { ...input, allowUnconfined: false, runner: new SandboxRunner({ backends: [refusing] }) });
    expect(refused.status).toBe("error");
    expect(refused.detail).toContain("--unsafe-unconfined-graders");
  });

  it("the attempt guard allows only listed tools, and file tools only with a path inside the attempt directory", () => {
    const guard = attemptGuard("/ws", "/ws/workspace/output/amc-eval/r/t/1", "eval s/t#1");
    const call = (name: string, args: Record<string, unknown> = {}) => guard({ name, arguments: args } as unknown as ToolExecution);
    for (const name of ["bash", "shell.exec", "job_start", "terminal_open", "terminal_send", "web_fetch", "web_search", "delegate", "workflow", "run_code", "skill.load", "ask_user", "mcp__fs__read_file"]) {
      expect(call(name, { path: "workspace/output/amc-eval/r/t/1/a.txt" }), name).toContain("is not offered to eval attempts");
    }
    for (const name of ["todo", "plan", "get_goal", "tool_search", "session.spill_read"]) expect(call(name), name).toBeUndefined();
    expect(call("fs.write", { path: "workspace/output/amc-eval/r/t/1/answer.txt", content: "42" })).toBeUndefined();
    expect(call("grep", { pattern: "x", path: "workspace/output/amc-eval/r/t/1" })).toBeUndefined();
    expect(call("grep", { pattern: "x" })).toContain("names no path");
    expect(call("glob", { pattern: "**/*.yaml", path: "." })).toContain("outside the attempt directory");
    expect(call("fs.read", { path: "workspace/output/amc-eval/r/t/2/answer.txt" })).toContain("outside the attempt directory");
    expect(call("fs.read", { path: "workspace/output/amc-eval/r/t/1/../../suite.yaml" })).toContain("outside the attempt directory");
    expect(call("fs.read", { path: 7 })).toContain("names no path");
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

  type Counts = Record<string, { attempts: number; passes: number; errors: number }>;
  const mk = (tasks: Counts, cost: number | null = null, suiteSha256 = "s1", fixtures: Record<string, Record<string, string>> = {}, runId = "r"): string => {
    const sum = (key: "attempts" | "passes" | "errors") => Object.values(tasks).reduce((s, t) => s + t[key], 0);
    const graded = sum("attempts") - sum("errors");
    return JSON.stringify({ schema: "amc.eval-results/v1", runId, suiteId: "x", suiteSha256, fixtures,
      tasks: Object.entries(tasks).map(([taskId, score]) => ({ taskId, score: { ...score, passRate: score.attempts - score.errors ? score.passes / (score.attempts - score.errors) : null } })),
      summary: { attempts: sum("attempts"), passes: sum("passes"), errors: sum("errors"), passRate: graded > 0 ? sum("passes") / graded : null, cost: { attributedUsd: cost, complete: cost !== null } } });
  };
  /** Baseline from `from`, compared with `cur`; the verified ledger is simulated by the digest sets (`unrecorded` names what it lacks). */
  const cmp = (from: string, cur: string, gate: Record<string, unknown> = {}, unrecorded: Array<"results" | "baseline" | "baselineSource"> = []) => {
    const baselineJson = JSON.stringify(baselineFromResults(from) satisfies EvalBaseline);
    const runs = new Set<string>([...(unrecorded.includes("baselineSource") ? [] : [sha256Hex(from)]), ...(unrecorded.includes("results") ? [] : [sha256Hex(cur)])]);
    const baselines = new Set<string>(unrecorded.includes("baseline") ? [] : [sha256Hex(baselineJson)]);
    return compareResults({ baselineJson, resultsJson: cur, gate: gateSchema.parse(gate), recorded: { runs, baselines } });
  };

  it("compare: Wilson-based regression, inconclusive on unrecorded digests, suite change, unknown cost or too few attempts", () => {
    // A task passing 9/10 then 2/3 is noise, not a regression: the intervals overlap.
    expect(cmp(mk({ a: { attempts: 10, passes: 9, errors: 0 } }), mk({ a: { attempts: 3, passes: 2, errors: 0 } })).status).toBe("pass");
    // 10/10 -> 0/10 is a regression.
    const regressed = cmp(mk({ a: { attempts: 10, passes: 10, errors: 0 } }), mk({ a: { attempts: 10, passes: 0, errors: 0 } }));
    expect(regressed.status).toBe("fail");
    expect(regressed.regressedTasks).toEqual(["a"]);
    const ten = mk({ a: { attempts: 10, passes: 10, errors: 0 } });
    // A second run with the same counts: its own digest, recorded or not independently of the baseline's source run.
    const tenAgain = mk({ a: { attempts: 10, passes: 10, errors: 0 } }, null, "s1", {}, "r2");
    expect(cmp(ten, tenAgain).status).toBe("pass");
    expect(cmp(ten, tenAgain, {}, ["results"]).status).toBe("inconclusive");
    expect(cmp(ten, tenAgain, {}, ["results"]).reasons.join()).toContain("results file digest is not recorded");
    expect(cmp(ten, tenAgain, {}, ["baseline"]).reasons.join()).toContain("baseline file digest is not recorded");
    // A baseline built from an edited results file (whose digest was never recorded) cannot launder it into a gate.
    expect(cmp(ten, tenAgain, {}, ["baselineSource"]).status).toBe("inconclusive");
    expect(cmp(ten, tenAgain, {}, ["baselineSource"]).reasons.join()).toContain("built from an edited file");
    expect(cmp(ten, mk({ a: { attempts: 10, passes: 10, errors: 0 } }, null, "s2")).status).toBe("inconclusive");
    expect(cmp(ten, ten, { maxCostIncreaseRatio: 1.1 }).status).toBe("inconclusive");
    expect(cmp(mk({ a: { attempts: 10, passes: 10, errors: 0 } }, 1), mk({ a: { attempts: 10, passes: 10, errors: 0 } }, 2), { maxCostIncreaseRatio: 1.1 }).status).toBe("fail");
    expect(cmp(mk({ a: { attempts: 1, passes: 1, errors: 0 } }), mk({ a: { attempts: 1, passes: 1, errors: 0 } }), { minAttemptsPerTask: 2 }).status).toBe("inconclusive");
    expect(cmp(ten, mk({ a: { attempts: 10, passes: 5, errors: 0 } }), { minPassRate: 0.9 }).status).toBe("fail");
  });

  it("compare has a power floor: counts that cannot separate even a total regression are inconclusive under the default gate, never a pass", () => {
    expect(canDetectTotalRegression(4, 4)).toBe(true);
    expect(canDetectTotalRegression(3, 3)).toBe(false);
    expect(canDetectTotalRegression(10, 3)).toBe(true);
    for (const n of [1, 2, 3]) {
      const verdict = cmp(mk({ a: { attempts: n, passes: n, errors: 0 } }), mk({ a: { attempts: n, passes: 0, errors: 0 } }));
      expect(verdict.status, `${n}/${n} -> 0/${n} under the default gate`).toBe("inconclusive");
      expect(verdict.reasons.join()).toContain("cannot separate even a total regression");
    }
    const four = cmp(mk({ a: { attempts: 4, passes: 4, errors: 0 } }), mk({ a: { attempts: 4, passes: 0, errors: 0 } }));
    expect(four.status).toBe("fail");
    expect(four.regressedTasks).toEqual(["a"]);
  });

  it("compare: a baseline task absent from the results, a changed fixture, and grader errors each make the gate inconclusive, not a pass or a fail", () => {
    const both = mk({ easy: { attempts: 10, passes: 10, errors: 0 }, hard: { attempts: 10, passes: 10, errors: 0 } });
    const subset = cmp(both, mk({ easy: { attempts: 10, passes: 10, errors: 0 } }));
    expect(subset.status).toBe("inconclusive");
    expect(subset.reasons.join()).toContain("baseline task hard is absent from the results");
    const fixtureChanged = cmp(mk({ a: { attempts: 10, passes: 10, errors: 0 } }, null, "s1", { a: { "check.mjs": "aa" } }), mk({ a: { attempts: 10, passes: 10, errors: 0 } }, null, "s1", { a: { "check.mjs": "bb" } }));
    expect(fixtureChanged.status).toBe("inconclusive");
    expect(fixtureChanged.reasons.join()).toContain("fixture files changed");
    // Two passes and one refused grader: the rate over graded attempts is 1.0, and the errored task is inconclusive, not a pass-rate failure.
    const errored = cmp(mk({ a: { attempts: 10, passes: 10, errors: 0 } }), mk({ a: { attempts: 3, passes: 2, errors: 1 } }), { minPassRate: 0.9 });
    expect(errored.status).toBe("inconclusive");
    expect(errored.reasons.join()).not.toContain("is below");
    // Below the rate however the errors resolve (even all passing gives 3/4 < 0.9): a fail, errors or not.
    const certain = cmp(mk({ a: { attempts: 10, passes: 10, errors: 0 } }), mk({ a: { attempts: 4, passes: 1, errors: 2 } }), { minPassRate: 0.9 });
    expect(certain.status).toBe("fail");
    expect(certain.reasons.join()).toContain("even if all 2 errored attempt(s) had passed");
    // Below the rate over graded attempts (8/9), but one errored attempt passing would meet it (9/10): inconclusive, not a fail.
    const open = cmp(mk({ a: { attempts: 10, passes: 10, errors: 0 } }), mk({ a: { attempts: 10, passes: 8, errors: 1 } }), { minPassRate: 0.9 });
    expect(open.status).toBe("inconclusive");
    expect(open.reasons.join()).toContain("could still decide it");
    expect(open.reasons.join()).not.toContain("even if all");
  });
});

describe("end to end through the CLI with the stub provider", () => {
  it("runs the shipped stub-smoke suite twice per task, records the run, gates it, and refuses an edited results file", async () => {
    // A host without an `eval` group gets one (the late-stage registration used to throw here).
    const bare = new Command();
    registerEvalSuiteCommands(bare);
    expect(bare.commands.find((command) => command.name() === "eval")?.commands.map((command) => command.name())).toEqual(["suite"]);
    const program = new Command();
    program.command("eval");
    registerEvalSuiteCommands(program);
    installClaimLabelHooks(program);
    vi.stubEnv("AMC_CLAIM_LABELS_STRICT", "1");
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logs.push(args.join(" ")); });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { logs.push(args.join(" ")); });
    process.chdir(ws);
    const out = join(ws, "r.json"), baseline = join(ws, "b.json");
    await program.parseAsync(["eval", "suite", "run", SUITE, "--provider", "stub", "--attempts", "2", "--out", out, "--keep-dirs"], { from: "user" });
    expect(process.exitCode, logs.join("\n")).toBeUndefined();
    const title = logs.findIndex(line => line.includes("Eval suite stub-smoke run"));
    expect(title, "suite run title").not.toBe(-1);
    expect(logs[title + 1]).toContain("Claim: Synthetic example (not evidence) · Result: not evaluated");
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
    const attemptDir = join(ws, "workspace", "output", "amc-eval", results.runId, "answer-file", "1");
    expect(existsSync(join(attemptDir, "answer.txt"))).toBe(true);
    expect(existsSync(join(ws, "answer.txt"))).toBe(false);
    const grader = first.graders[0]!;
    if (confined) { expect(grader.status, grader.detail).toBe("pass"); expect(grader.confined).toBe(true); expect(repo.score.passes).toBe(2); }
    else { expect(grader.status).toBe("error"); expect(grader.detail).toContain("unconfined grader refused"); expect(repo.score.errors).toBe(2); }
    // Evidence: every attempt is a sealed signed session with the eval stamp, plus one EVAL_SUITE_RUN audit row with the digest.
    const rows = allEvents(ws);
    const audit = rows.filter((row) => row.event_type === "audit" && (JSON.parse(row.meta_json) as { auditType?: string }).auditType === "EVAL_SUITE_RUN");
    expect(audit).toHaveLength(1);
    expect((JSON.parse(audit[0]!.meta_json) as { resultsSha256: string }).resultsSha256).toBe(sha256Hex(readFileSync(out)));
    const stamped = rows.filter((row) => row.event_type === "session/open" && String((JSON.parse(row.meta_json) as { caseExecution?: { casebookId?: string } }).caseExecution?.casebookId) === "eval-suite:stub-smoke");
    expect(stamped).toHaveLength(6);
    expect((JSON.parse(stamped[0]!.meta_json) as { agentId: string }).agentId).toBe("eval-suite");

    expect(results.taskSelection, "a whole-suite run records no selection").toBeNull();

    logs.length = 0;
    await program.parseAsync(["eval", "suite", "baseline", out, "--out", baseline], { from: "user" });
    expect(process.exitCode, logs.join("\n")).toBeUndefined();
    // Re-running baseline on the same results file is idempotent (the record exists; no duplicate session id).
    await program.parseAsync(["eval", "suite", "baseline", out, "--out", baseline], { from: "user" });
    expect(process.exitCode, logs.join("\n")).toBeUndefined();
    expect(logs.join("\n")).toContain("digest already recorded");
    await program.parseAsync(["eval", "suite", "compare", baseline, out, "--json"], { from: "user" });
    const verdict = JSON.parse(logs[logs.length - 1]!) as { status: string; reasons: string[] };
    expect(verdict).toMatchObject({ claimKind: "synthetic_example", statusDimensions: { result: "not_evaluated" },
      claimLabel: expect.stringMatching(/^Claim: Synthetic example/) });
    // Two attempts per side cannot separate even a total regression: the gate says so instead of passing (and names the refused graders where there is no backend).
    expect(verdict.status, verdict.reasons.join("; ")).toBe("inconclusive");
    expect(verdict.reasons.join("; ")).toContain("cannot separate even a total regression");
    if (!confined) expect(verdict.reasons.join("; ")).toContain("grader error");
    expect(process.exitCode).toBe(2);
    logs.length = 0;
    process.exitCode = undefined;
    await program.parseAsync(["eval", "suite", "compare", baseline, out], { from: "user" });
    expect(logs[0]).toContain("Eval gate INCONCLUSIVE");
    expect(logs[1]).toContain("Claim: Synthetic example (not evidence) · Result: not evaluated");
    expect(process.exitCode).toBe(2);
    // Mutation: an edited results file is no longer recorded in the ledger, so the gate is inconclusive (exit 2), never a pass.
    process.exitCode = undefined;
    const edited = join(ws, "r-edited.json");
    writeFileSync(edited, readFileSync(out, "utf8").replace('"passes": 2', '"passes": 1'));
    await program.parseAsync(["eval", "suite", "compare", baseline, edited, "--json"], { from: "user" });
    expect(process.exitCode).toBe(2);
    expect(logs[logs.length - 1]).toContain("not recorded in the verified ledger");
    expect(JSON.parse(logs.at(-1)!)).toMatchObject({ claimKind: "self_reported", statusDimensions: { result: "not_evaluated" } });
    // Nor can the edited file be laundered through `baseline`: only a recorded run becomes a baseline.
    process.exitCode = undefined;
    logs.length = 0;
    await program.parseAsync(["eval", "suite", "baseline", edited, "--out", join(ws, "b-laundered.json")], { from: "user" });
    expect(process.exitCode).toBe(1);
    expect(logs.join("\n")).toContain("not a recorded EVAL_SUITE_RUN");
    expect(existsSync(join(ws, "b-laundered.json"))).toBe(false);
    // A mistyped bound never runs (and signs) a suite of crashed attempts.
    for (const args of [["--max-steps", "abc"], ["--max-steps", "0"], ["--attempts", "0"], ["--attempts", "x"]]) {
      process.exitCode = undefined;
      logs.length = 0;
      await program.parseAsync(["eval", "suite", "run", SUITE, "--tasks", "echo-exact", ...args], { from: "user" });
      expect(process.exitCode, args.join(" ")).toBe(1);
      expect(logs.join("\n")).toContain(`${args[0]} must be an integer`);
    }
    expect(allEvents(ws).filter((row) => row.event_type === "audit" && (JSON.parse(row.meta_json) as { auditType?: string }).auditType === "EVAL_SUITE_RUN"), "no run was recorded for the refused flags").toHaveLength(1);

    process.exitCode = undefined;
    logs.length = 0;
    const jsonOut = join(ws, "r-json.json");
    await program.parseAsync(["eval", "suite", "run", SUITE, "--tasks", "echo-exact", "--out", jsonOut, "--json"], { from: "user" });
    expect(process.exitCode, logs.join("\n")).toBeUndefined();
    const { claimKind, statusDimensions, claimLabel, ...output } = JSON.parse(logs.at(-1)!);
    expect({ claimKind, statusDimensions, claimLabel }).toMatchObject({ claimKind: "synthetic_example",
      statusDimensions: { result: "not_evaluated" }, claimLabel: expect.stringMatching(/^Claim: Synthetic example/) });
    const artifact = readFileSync(jsonOut, "utf8");
    expect(output).toEqual(JSON.parse(artifact));
    const jsonAudit = allEvents(ws).filter(row => row.event_type === "audit").map(row => JSON.parse(row.meta_json))
      .find(meta => meta.auditType === "EVAL_SUITE_RUN" && meta.runId === output.runId);
    expect(jsonAudit?.resultsSha256).toBe(sha256Hex(artifact));
  });

  it("an attempt that never started its turn is an error, not a fail; --unsafe-unconfined-graders grades the shipped repository task", async () => {
    const loaded = loadEvalSuite(SUITE);
    // maxSteps 0 makes openAgentSession refuse before any turn: nothing the agent did could fail.
    const crashed = await runEvalSuite({ workspace: ws, loaded, attempts: 1, taskIds: ["echo-exact"], provider: { providerId: "stub", maxSteps: 0 } });
    const attempt = crashed.results.tasks[0]!.attempts[0]!;
    expect(attempt.outcome).toBe("unavailable");
    expect(attempt.verdict, attempt.reason ?? "").toBe("error");
    expect(attempt.reason).toContain("never started its turn");
    expect(crashed.results.tasks[0]!.score.passRate, "nothing graded: no rate").toBeNull();
    // With the opt-in, the repository task's pinned test runs and decides the attempt wherever the grader can run at all.
    const graded = await runEvalSuite({ workspace: ws, loaded, attempts: 1, taskIds: ["answer-file"], provider: { providerId: "stub", maxSteps: 4 }, allowUnconfinedGraders: true });
    const repo = graded.results.tasks[0]!.attempts[0]!;
    expect(repo.verdict, JSON.stringify(repo.graders)).toBe("pass");
    expect(graded.results.graderMode).toBe("unsafe-unconfined-allowed");
    if (!confined) expect(repo.graders[0]).toMatchObject({ status: "pass", confined: false, backend: "none" });
  });

  it("under the default signed Action Policy a governed write runs SIMULATE, and the attempt is an error naming it, not a fail", async () => {
    const policyWs = stubWorkspace("amc-eval-policy-", { defaultActionPolicy: true });
    try {
      const loaded = loadEvalSuite(SUITE);
      const { results } = await runEvalSuite({ workspace: policyWs, loaded, attempts: 1, taskIds: ["answer-file"], provider: { providerId: "stub", maxSteps: 4 }, keepDirs: true });
      const attempt = results.tasks[0]!.attempts[0]!;
      expect(attempt.outcome).toBe("completed");
      expect(attempt.verdict).toBe("error");
      expect(attempt.reason).toContain("SIMULATE");
      expect(existsSync(join(policyWs, "workspace", "output", "amc-eval", results.runId, "answer-file", "1", "answer.txt")), "a simulated write leaves no file").toBe(false);
    } finally { removeWorkspace(policyWs); }
  });

  it("the attempt guard denies a governed write outside the attempt directory, a root-defaulting grep or glob, and a `.` path; runs refuse no-sign mode", async () => {
    const dir = join(ws, "suite");
    mkdirSync(dir, { recursive: true });
    const escape = join(dir, "escape.yaml");
    writeFileSync(escape, ["version: 1", "suiteId: escape", "defaults: { tools: workspace }", "tasks:", "  - id: out",
      // Inside the shipped write allowlist (workspace/output/**) but outside the attempt directory: only the eval guard can refuse it.
      `    prompt: '{"tool":"fs.write","arguments":{"path":"workspace/output/escaped.txt","content":"x"}}'`, "    graders: [{ type: contains, expected: 'wrote' }]",
      // No `path`: grep and glob would search the workspace root, where this suite file (and its graders' answers) lives.
      "  - id: grep-root", `    prompt: '{"tool":"grep","arguments":{"pattern":"CANARY-4711"}}'`, "    graders: [{ type: not_contains, expected: 'CANARY-4711' }]",
      "  - id: glob-dot", `    prompt: '{"tool":"glob","arguments":{"pattern":"**/*.yaml","path":"."}}'`, "    graders: [{ type: not_contains, expected: 'escape.yaml' }]"].join("\n"));
    const loaded = loadEvalSuite(escape);
    const { results } = await runEvalSuite({ workspace: ws, loaded, attempts: 1, provider: { providerId: "stub", maxSteps: 4 }, taskIds: ["out", "grep-root", "glob-dot"] });
    expect(results.taskSelection).toEqual(["out", "grep-root", "glob-dot"]);
    expect(existsSync(join(ws, "workspace", "output", "escaped.txt")), "the deny-only guard refused the path").toBe(false);
    expect(results.tasks[0]!.attempts[0]!.verdict).not.toBe("pass");
    const denied = allEvents(ws).map((row) => JSON.parse(row.meta_json) as { auditType?: string; denialGuard?: string; denialReason?: string })
      .filter((meta) => meta.auditType === "TOOL_CALL_DENIED");
    const reasons = denied.map((meta) => String(meta.denialReason)).join("\n");
    expect(denied.length).toBeGreaterThanOrEqual(3);
    expect(denied.every((meta) => meta.denialGuard === "eval-attempt-scope"), reasons).toBe(true);
    expect(reasons, "a grep without a path is denied before it searches the workspace root").toContain("grep names no path inside the attempt directory");
    expect(reasons, "`.` is the workspace root, outside the attempt directory").toContain('path "." is outside the attempt directory');
    expect(allEvents(ws).filter((row) => row.event_type === "audit" && (JSON.parse(row.meta_json) as { auditType?: string; toolName?: string }).auditType === "TOOL_CALL_ALLOWED" && ["grep", "glob"].includes(String((JSON.parse(row.meta_json) as { toolName?: string }).toolName))), "neither search ever ran").toHaveLength(0);
    vi.stubEnv("AMC_NO_SIGN", "1");
    await expect(runEvalSuite({ workspace: ws, loaded, attempts: 1, provider: { providerId: "stub" } })).rejects.toThrow(/no-sign/);
    vi.unstubAllEnvs();
  });
});
