import { STUB_PROVIDER_MODEL } from "../agent/stubProvider.js";
import type { DoctorReport, DoctorStatus } from "./doctorRules.js";

/**
 * The first-run plan: the operator actions that take a freshly initialized
 * workspace to a first governed, verified, keyless turn, and the fix commands
 * a doctor report implies.
 *
 * Two rules from the execution brief (§7a) shape this file:
 *  - a refusal that does not name its fix is a defect, so every fix here is a
 *    command the operator can copy verbatim;
 *  - nothing here runs anything. `amc init` and `amc doctor` print these; the
 *    operator decides.
 */
export interface FirstRunAction {
  readonly cmd: string;
  readonly desc: string;
}

export interface FirstRunFix extends FirstRunAction {
  readonly checkId: string;
  readonly status: DoctorStatus;
}

/** The keyless governed turn: the stub provider needs no credential reference and answers with a canned recording. */
export const STUB_FIRST_TURN_COMMAND =
  `amc --agent default agent-loop run "Check recording with a local demonstration." --provider stub --model ${STUB_PROVIDER_MODEL} --tools echo --max-steps 2 --max-tokens 512`;

/** The prefix a doctor fixHint uses when it names one copyable command. */
const RUN_PREFIX = "Run: ";

/** The verify command that pins the monitor key; the last, optional step `amc init` prints. */
export const PINNED_VERIFY_COMMAND = "amc agent-loop verify <session-id> --expect-monitor <monitor sha256>";

/**
 * What `amc init` prints next, plain steps first: the start menu, a keyless demo chat, then the Runtime Firewall
 * policy (every WORKSPACE tool call is denied, `missing-policy`, until it is signed). The monitor-key pin is last and
 * optional: without it `amc agent-loop verify` still checks integrity but says UNANCHORED and exits 1.
 * STUB_FIRST_TURN_COMMAND is the scripted (non-interactive) form of the same keyless demo turn.
 */
export function firstRunActions(): readonly FirstRunAction[] {
  return [
    { cmd: "amc", desc: "Start here: pick what to do (watch Claude Code or Codex, chat with a model, or open the console)." },
    { cmd: "amc agent-loop chat --provider stub", desc: "Try a demo chat with no account or key. The replies are canned; every turn is recorded in a signed session log." },
    { cmd: "amc firewall enable", desc: "Before AMC's own agent may read or change files here, sign the policy for workspace tools. Until then those tool calls are refused." },
    {
      cmd: PINNED_VERIFY_COMMAND,
      desc: "Optional extra protection: copy the sha256 of .amc/keys/monitor_ed25519.pub somewhere outside this folder now, then pass it when you check a session, so a swapped key is caught. Without it the check says UNANCHORED."
    }
  ];
}

/**
 * Every check that still needs attention, as a copyable command, FAIL before
 * WARN and otherwise in report order. A check whose hint is prose rather than
 * a single command is kept with the prose as its `cmd`, so no needed fix is
 * silently dropped; INFO rows are optional and are not fixes.
 */
export function firstRunFixCommands(report: DoctorReport): readonly FirstRunFix[] {
  const rank: Record<DoctorStatus, number> = { FAIL: 0, WARN: 1, INFO: 2, PASS: 3 };
  return report.checks
    .filter((check) => (check.status === "FAIL" || check.status === "WARN") && typeof check.fixHint === "string" && check.fixHint.length > 0)
    .map((check) => ({
      checkId: check.id,
      status: check.status,
      cmd: check.fixHint!.startsWith(RUN_PREFIX) ? check.fixHint!.slice(RUN_PREFIX.length) : check.fixHint!,
      desc: check.message
    }))
    .sort((left, right) => rank[left.status] - rank[right.status]);
}

/** A missing adapter CLI matters only to someone who runs that adapter, so its install hint is optional. */
const optionalFix = (fix: FirstRunFix): boolean => fix.checkId.startsWith("adapter-");

/**
 * What `amc doctor` lists under What's next: the needed fixes (FAIL before WARN), then the closing steps the
 * CLI passes (such as the first score), then the optional adapter installs.
 */
export function doctorNextSteps(report: DoctorReport, closing: readonly FirstRunAction[]): FirstRunAction[] {
  const fixes = firstRunFixCommands(report);
  const step = (fix: FirstRunFix): FirstRunAction => ({ cmd: fix.cmd, desc: `[${fix.status}] ${fix.checkId}: ${fix.desc}` });
  return [...fixes.filter((fix) => !optionalFix(fix)).map(step), ...closing, ...fixes.filter(optionalFix).map(step)];
}
