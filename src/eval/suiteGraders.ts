/**
 * Eval suite graders (SH-OBS-04). Text graders are pure. Command graders (`script`, `tests`) run in a fresh grading
 * directory restored from the pinned fixture snapshot plus the attempt's declared outputs, through the OS sandbox seam:
 * no enforced backend means the grader is REFUSED (status `error`), never run unconfined by default. A grader error is
 * neither a pass nor a fail.
 */
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { SandboxRunner } from "../sandbox/sandboxRunner.js";
import type { FixtureFile } from "./suiteLoader.js";
import type { EvalGrader } from "./suiteSchema.js";

export interface GraderResult {
  readonly type: EvalGrader["type"];
  readonly status: "pass" | "fail" | "error";
  readonly detail: string;
  /** Command graders only: whether an OS backend confined the command. */
  readonly confined?: boolean;
  readonly backend?: string;
  readonly exitCode?: number | null;
}

const MAX_DETAIL = 2_000;
const clip = (text: string): string => text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL)}…` : text;

/** The deterministic text graders over the attempt's final assistant text. */
export function gradeText(grader: EvalGrader, text: string | null): GraderResult {
  if (text === null) return { type: grader.type, status: "error", detail: "no final assistant text could be read from the verified session rows" };
  const fold = (value: string, caseSensitive: boolean) => caseSensitive ? value : value.toLowerCase();
  switch (grader.type) {
    case "exact": {
      const norm = (value: string) => grader.normalize === "none" ? value : grader.normalize === "trim" ? value.trim() : value.replace(/\s+/g, " ").trim();
      const pass = norm(text) === norm(grader.expected);
      return { type: grader.type, status: pass ? "pass" : "fail", detail: pass ? "exact match" : `expected ${JSON.stringify(norm(grader.expected))}, got ${JSON.stringify(clip(norm(text)))}` };
    }
    case "contains": {
      const pass = fold(text, grader.caseSensitive).includes(fold(grader.expected, grader.caseSensitive));
      return { type: grader.type, status: pass ? "pass" : "fail", detail: pass ? "contains expected" : `missing ${JSON.stringify(grader.expected)}` };
    }
    case "not_contains": {
      const pass = !fold(text, grader.caseSensitive).includes(fold(grader.expected, grader.caseSensitive));
      return { type: grader.type, status: pass ? "pass" : "fail", detail: pass ? "forbidden text absent" : `contains forbidden ${JSON.stringify(grader.expected)}` };
    }
    case "regex": {
      let pass: boolean;
      try { pass = new RegExp(grader.pattern, grader.flags.replace("g", "")).test(text); } catch (error) { return { type: grader.type, status: "error", detail: `invalid pattern: ${error instanceof Error ? error.message : String(error)}` }; }
      return { type: grader.type, status: pass ? "pass" : "fail", detail: pass ? "regex matched" : `/${grader.pattern}/${grader.flags} did not match` };
    }
    default:
      return { type: grader.type, status: "error", detail: `${grader.type} is not a text grader` };
  }
}

export interface CommandGradingInput {
  readonly fixture: readonly FixtureFile[];
  readonly attemptDir: string;
  readonly outputs: readonly string[];
  /** Explicit CLI opt-in only; never a suite-file field. */
  readonly allowUnconfined: boolean;
  readonly workspace: string;
  readonly runner?: SandboxRunner;
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
}

/** A pristine grading directory: fixture from the snapshot, then only the declared outputs from the attempt. */
export function stageGradingDir(input: CommandGradingInput): { dir: string; copiedOutputs: string[]; missingOutputs: string[] } {
  const dir = mkdtempSync(join(tmpdir(), "amc-eval-grade-"));
  for (const file of input.fixture) {
    const target = join(dir, ...file.relativePath.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.bytes, { mode: file.mode });
  }
  const copiedOutputs: string[] = [];
  const missingOutputs: string[] = [];
  for (const output of input.outputs) {
    const source = resolve(input.attemptDir, output);
    const target = resolve(dir, output);
    if (!inside(input.attemptDir, source) || !inside(dir, target)) { missingOutputs.push(output); continue; }
    const stat = lstatSync(source, { throwIfNoEntry: false });
    // A symlink the agent planted could point the grader at a file outside the attempt; only plain files cross.
    if (!stat?.isFile()) { missingOutputs.push(output); continue; }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    copiedOutputs.push(output);
  }
  return { dir, copiedOutputs, missingOutputs };
}

export async function gradeCommand(grader: Extract<EvalGrader, { type: "script" | "tests" }>, input: CommandGradingInput): Promise<GraderResult> {
  const staged = stageGradingDir(input);
  try {
    const runner = input.runner ?? new SandboxRunner({ allowUnconfined: input.allowUnconfined });
    const home = homedir();
    const outcome = await runner.run(grader.command, staged.dir, {
      writableRoots: [staged.dir], timeoutMs: grader.timeoutMs, network: "deny", maxProcesses: 64,
      readDeny: [join(home, ".ssh"), join(home, ".aws"), join(home, ".config", "gcloud"), join(input.workspace, ".amc"), input.attemptDir]
    });
    const note = `${staged.copiedOutputs.length} output(s) copied${staged.missingOutputs.length ? `, missing: ${staged.missingOutputs.join(", ")}` : ""}`;
    if (outcome.failure !== null) {
      return { type: grader.type, status: "error", confined: false, backend: outcome.backend, exitCode: null,
        detail: outcome.failure.kind === "unavailable" && !input.allowUnconfined ? `unconfined grader refused: ${outcome.failure.reason}. Pass --unsafe-unconfined-graders to run it with your full user rights.` : outcome.failure.reason };
    }
    const base = { type: grader.type, confined: outcome.confined, backend: outcome.backend, exitCode: outcome.exitCode } as const;
    if (outcome.timedOut) return { ...base, status: "error", detail: `timed out after ${grader.timeoutMs} ms; ${note}` };
    if (outcome.exitCode === null) return { ...base, status: "error", detail: `no exit status; ${note}` };
    const expected = grader.type === "script" ? grader.passExitCode : 0;
    const tail = clip(`${outcome.stdout}\n${outcome.stderr}`.trim());
    return { ...base, status: outcome.exitCode === expected ? "pass" : "fail", detail: `exit ${outcome.exitCode} (expected ${expected}); ${note}${tail ? `\n${tail}` : ""}` };
  } finally {
    rmSync(staged.dir, { recursive: true, force: true });
  }
}
