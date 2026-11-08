import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { readRegularFile, regularFileStat } from "../tools/builtin/fsRegularFile.js";
import { sha256Hex } from "../utils/hash.js";
import { MAX_PLAN_BYTES, parseWorkflowPlan, type WorkflowNode } from "./workflowPlan.js";

export type WorkflowPlanFile =
  | { readonly ok: true; readonly plan: WorkflowNode; readonly path: string; readonly sha256: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Read a reviewed plan file for `agent-loop run --workflow-plan`: a regular file
 * inside the workspace (the file itself is never followed as a symlink; its
 * directory is resolved through symlinks, so a linked prefix such as macOS
 * `/var` or a linked checkout is judged by where it really is), at most
 * MAX_PLAN_BYTES, JSON, and a plan `parseWorkflowPlan` accepts. Any file name is
 * accepted: containment is a path comparison, not a character class. Refused as
 * data before any session exists; the sha256 of the parsed bytes is reported so
 * an operator can pin them with `--workflow-plan-sha256`. Durable progress pins
 * the canonical plan itself, not this file.
 */
export function readWorkflowPlanFile(workspace: string, file: string): WorkflowPlanFile {
  let root: string;
  try { root = realpathSync(workspace); }
  catch { return { ok: false, reason: "the workspace could not be resolved" }; }
  const named = resolve(root, file);
  let dir: string;
  try { dir = realpathSync(dirname(named)); }
  catch { return { ok: false, reason: `--workflow-plan file not found: ${file}` }; }
  const path = join(dir, basename(named));
  const rel = relative(root, path);
  if (rel.length === 0 || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) {
    return { ok: false, reason: `--workflow-plan must name a regular file inside the workspace: ${file}` };
  }
  let bytes: Buffer;
  try {
    // lstat (a symlink is not a regular file), then an O_NOFOLLOW open checked against it, bounded to the opened size.
    const stat = regularFileStat(path);
    if (stat === null) return { ok: false, reason: `--workflow-plan file not found: ${file}` };
    if (stat.size > MAX_PLAN_BYTES) return { ok: false, reason: `--workflow-plan exceeds ${MAX_PLAN_BYTES} bytes: ${file}` };
    bytes = readRegularFile(path);
  } catch (error) { return { ok: false, reason: `--workflow-plan must name a regular file inside the workspace (${file}): ${error instanceof Error ? error.message : String(error)}` }; }
  let raw: unknown;
  try { raw = JSON.parse(bytes.toString("utf8")); }
  catch { return { ok: false, reason: `--workflow-plan is not JSON: ${file}` }; }
  const parsed = parseWorkflowPlan(raw);
  if (!parsed.ok) return { ok: false, reason: `--workflow-plan refused: ${parsed.reason}` };
  return { ok: true, plan: parsed.plan, path, sha256: sha256Hex(bytes) };
}
