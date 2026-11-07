import { realpathSync } from "node:fs";
import { relative, resolve } from "node:path";
import { readContainedOrNull } from "../utils/containedFs.js";
import { sha256Hex } from "../utils/hash.js";
import { MAX_PLAN_BYTES, parseWorkflowPlan, type WorkflowNode } from "./workflowPlan.js";

export type WorkflowPlanFile =
  | { readonly ok: true; readonly plan: WorkflowNode; readonly path: string; readonly sha256: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Read a reviewed plan file for `agent-loop run --workflow-plan`: a regular file
 * inside the workspace (no symlink, no traversal), at most MAX_PLAN_BYTES, JSON,
 * and a plan `parseWorkflowPlan` accepts. Refused as data before any session
 * exists; the sha256 is reported so an operator can name the exact bytes that
 * ran. Durable progress pins the canonical plan itself, not this file.
 */
export function readWorkflowPlanFile(workspace: string, file: string): WorkflowPlanFile {
  let root: string;
  try { root = realpathSync(workspace); }
  catch { return { ok: false, reason: "the workspace could not be resolved" }; }
  const rel = relative(root, resolve(root, file));
  if (rel.length === 0) return { ok: false, reason: `--workflow-plan must name a regular file inside the workspace: ${file}` };
  // The contained reader refuses traversal, symlinks, special files and oversize in one place; nothing is re-checked here.
  let bytes: Buffer | null;
  try { bytes = readContainedOrNull(root, rel, MAX_PLAN_BYTES); }
  catch (error) { return { ok: false, reason: `--workflow-plan must name a regular file inside the workspace (${file}): ${error instanceof Error ? error.message : String(error)}` }; }
  if (bytes === null) return { ok: false, reason: `--workflow-plan file not found: ${file}` };
  let raw: unknown;
  try { raw = JSON.parse(bytes.toString("utf8")); }
  catch { return { ok: false, reason: `--workflow-plan is not JSON: ${file}` }; }
  const parsed = parseWorkflowPlan(raw);
  if (!parsed.ok) return { ok: false, reason: `--workflow-plan refused: ${parsed.reason}` };
  return { ok: true, plan: parsed.plan, path: resolve(root, rel), sha256: sha256Hex(bytes) };
}
