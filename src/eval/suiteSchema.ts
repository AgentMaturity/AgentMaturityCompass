/**
 * Eval suite schema `amc.eval-suite/v1` (SH-OBS-04): tasks run against the governed native agent and graded.
 *
 * Graders: `exact`, `contains`, `regex`, `not_contains` over the attempt's final assistant text; `script` and `tests`
 * run a command in a fresh grading directory restored from the pinned fixture plus the task's declared outputs, under
 * the OS sandbox seam. `llm_judge` is refused: a judge must run as a signed, budgeted native session (deferred D-12).
 */
import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "ids are 1-64 characters of [A-Za-z0-9_-]");
const relativePath = z.string().min(1).refine((value) => !value.startsWith("/") && !value.split(/[\\/]/).includes(".."), "paths are relative and never climb");
const command = z.array(z.string().min(1)).min(1).max(64);
const timeoutMs = z.number().int().min(1_000).max(3_600_000);

const graderSchema = z.union([
  z.object({ type: z.literal("exact"), expected: z.string(), normalize: z.enum(["none", "trim", "whitespace"]).default("trim") }).strict(),
  z.object({ type: z.literal("contains"), expected: z.string().min(1), caseSensitive: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal("not_contains"), expected: z.string().min(1), caseSensitive: z.boolean().default(false) }).strict(),
  z.object({ type: z.literal("regex"), pattern: z.string().min(1), flags: z.string().regex(/^[gimsuy]{0,6}$/).default("") }).strict(),
  z.object({ type: z.literal("script"), command, timeoutMs: timeoutMs.default(60_000), passExitCode: z.number().int().default(0) }).strict(),
  z.object({ type: z.literal("tests"), command, timeoutMs: timeoutMs.default(120_000) }).strict(),
  /** Parsed only so the refusal below can name the deferral instead of a generic union error. */
  z.object({ type: z.literal("llm_judge") }).passthrough()
]);

const taskSchema = z.object({
  id,
  prompt: z.string().min(1),
  systemPrompt: z.string().optional(),
  /** Directory relative to the suite file, copied into every attempt directory and restored for grading. */
  fixture: z.object({ dir: relativePath }).strict().optional(),
  /** Files (relative to the attempt directory) the graders may see: copied from the attempt into the pristine grading copy. */
  outputs: z.array(relativePath).max(256).default([]),
  tools: z.enum(["none", "workspace"]).optional(),
  allowedActionClasses: z.array(z.enum(["READ_ONLY", "WRITE_LOW", "WRITE_HIGH"])).min(1).optional(),
  timeoutMs: timeoutMs.optional(),
  graders: z.array(graderSchema).min(1).max(32),
  tags: z.array(z.string()).default([])
}).strict();

export const suiteSchema = z.object({
  version: z.literal(1),
  suiteId: id,
  description: z.string().optional(),
  defaults: z.object({
    tools: z.enum(["none", "workspace"]).default("none"),
    maxSteps: z.number().int().min(1).max(64).default(8),
    allowedActionClasses: z.array(z.enum(["READ_ONLY", "WRITE_LOW", "WRITE_HIGH"])).min(1).default(["READ_ONLY", "WRITE_LOW"]),
    timeoutMs: timeoutMs.default(300_000)
  }).strict().prefault({}),
  tasks: z.array(taskSchema).min(1).max(200)
}).strict().superRefine((suite, ctx) => {
  const ids = new Set<string>();
  for (const task of suite.tasks) {
    if (ids.has(task.id)) ctx.addIssue({ code: "custom", message: `duplicate task id ${task.id}` });
    ids.add(task.id);
    if (task.graders.some((grader) => grader.type === "llm_judge")) {
      ctx.addIssue({ code: "custom", message: `task ${task.id}: llm_judge graders are deferred (D-12): a judge must run as a signed, budgeted native session; none is offered in this build` });
    }
    if (task.graders.some((grader) => grader.type === "tests" || grader.type === "script") && task.fixture === undefined && task.outputs.length === 0) {
      ctx.addIssue({ code: "custom", message: `task ${task.id}: a script or tests grader needs a fixture or declared outputs to grade` });
    }
  }
});

export type EvalSuite = z.infer<typeof suiteSchema>;
export type EvalGrader = z.infer<typeof graderSchema>;
