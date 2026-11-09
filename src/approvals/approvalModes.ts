/**
 * Operator-selectable approval modes (SH-SANDBOX-04), mapped onto AMC's existing gate and SIMULATE narrowing.
 *
 * Every competitor names its modes (Claude Code `plan|default|acceptEdits`, Codex `untrusted|on-request`); AMC's
 * `--approve-tools <CLASS>` is a per-class gate nobody can relate to those. This table is the mapping, and it can only
 * NARROW: a mode decides which calls are put to a human and which never execute, on top of the signed tools policy,
 * the compiled policy's approval classes, every guard, every freeze and the signed Action Policy. No mode removes any of
 * those, and there is no bypass mode: the names competitors use for one are refused by name.
 *
 * - `plan`: nothing executes. Every call outside READ_ONLY enters as SIMULATE (the pipeline's `narrowMode` seam, the
 *   same one the Action Policy uses), so the tool reports what it would do. No question is asked, because nothing is
 *   done. Delegated children inherit the mode: `delegate` and `workflow` are READ_ONLY and so not narrowed, but every
 *   child toolset is composed under `plan` too.
 * - `default`: every call outside READ_ONLY is asked (file edits, the shell, network, deploys, secrets).
 * - `accept-edits`: as `default`, except WRITE_LOW (the file tools' edits inside the workspace) runs without a question.
 *   The shell still asks; AMC does not pre-approve "filesystem-looking" shell commands by inspecting their text.
 * - `untrusted`: every call is asked, READ_ONLY included, except `ask_user` (a question tool: gating it would ask a
 *   human to approve asking a human).
 *
 * `on-failure` (Codex) needs the denial-to-escalation loop, which is not built; it is refused with that reason rather
 * than mapped onto something weaker.
 */
import type { ActionClass } from "../types.js";
import { ACTION_CLASSES } from "../governor/actionCatalog.js";
import type { ToolMode } from "../tools/toolTypes.js";

export const APPROVAL_MODES = ["plan", "default", "accept-edits", "untrusted"] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

/** Names other harnesses use for a mode AMC does not have, each refused with the reason. */
const REFUSED_MODES: Readonly<Record<string, string>> = {
  "on-failure": "needs the sandbox denial-to-escalation loop, which AMC does not have yet; use default, or --approve-tools for an expert gate",
  never: "AMC has no bypass mode: omit --approval-mode for no gate (outside a regulated profile), or use plan to run nothing",
  bypass: "AMC has no bypass mode: omit --approval-mode for no gate (outside a regulated profile), or use plan to run nothing",
  "bypass-permissions": "AMC has no bypass mode",
  "dont-ask": "AMC has no bypass mode",
  yolo: "AMC has no bypass mode",
  auto: "a classifier that can allow is an answerer that grants, which AMC confines to signed exceptions",
  "danger-full-access": "AMC never runs a shell unconfined where a boundary exists"
};

/** Parse the operator's spelling: lower-cased, `acceptEdits`/`accept_edits` accepted as `accept-edits`. */
export function parseApprovalMode(raw: string): { ok: true; mode: ApprovalMode } | { ok: false; reason: string } {
  const normalized = raw.trim().toLowerCase().replace(/_/g, "-").replace("acceptedits", "accept-edits").replace("bypasspermissions", "bypass-permissions").replace("dontask", "dont-ask");
  if ((APPROVAL_MODES as readonly string[]).includes(normalized)) return { ok: true, mode: normalized as ApprovalMode };
  const refused = Object.hasOwn(REFUSED_MODES, normalized) ? REFUSED_MODES[normalized] : undefined;
  return { ok: false, reason: refused === undefined
    ? `--approval-mode must be one of ${APPROVAL_MODES.join(", ")}, got ${JSON.stringify(raw)}`
    : `--approval-mode ${normalized} is refused: ${refused}.` };
}

const ALL_CLASSES: ReadonlySet<ActionClass> = new Set(ACTION_CLASSES);
const except = (...omit: readonly ActionClass[]): ReadonlySet<ActionClass> => new Set(ACTION_CLASSES.filter(cls => !omit.includes(cls)));

/** Action classes whose calls the mode puts to a human; null when the mode composes no gate (`plan` runs nothing). */
export function approvalModeGatedClasses(mode: ApprovalMode): ReadonlySet<ActionClass> | null {
  switch (mode) {
    case "plan": return null;
    case "default": return except("READ_ONLY");
    case "accept-edits": return except("READ_ONLY", "WRITE_LOW");
    case "untrusted": return ALL_CLASSES;
  }
}

/** Tools a mode never asks about even when their class is gated. */
export function approvalModeExemptTools(mode: ApprovalMode): readonly string[] {
  return mode === "untrusted" ? ["ask_user"] : [];
}

/** The mode a call enters with under this approval mode: `plan` turns every EXECUTE outside READ_ONLY into SIMULATE. Never widens. */
export function approvalModeNarrowing(mode: ApprovalMode): (call: { readonly actionClass: ActionClass; readonly requestedMode: ToolMode }) => ToolMode {
  return call => mode === "plan" && call.requestedMode === "EXECUTE" && call.actionClass !== "READ_ONLY" ? "SIMULATE" : call.requestedMode;
}
