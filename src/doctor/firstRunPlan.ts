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

/**
 * The three operator actions after `amc init`, in order. `amc init` already
 * signs tools.yaml; the runtime firewall policy is the precondition it leaves
 * open, and every tool call is denied (`missing-policy`) until it is signed.
 */
export function firstRunActions(): readonly FirstRunAction[] {
  return [
    {
      cmd: "amc firewall enable",
      desc: "Create and sign the Runtime Firewall policy. Until it exists every tool call is denied (missing-policy). Idempotent; explains what it wrote."
    },
    {
      cmd: STUB_FIRST_TURN_COMMAND,
      desc: "Run the first governed turn keyless: the stub provider records a canned response through the signed session log (no real model answer)."
    },
    {
      cmd: "amc agent-loop verify <session-id>",
      desc: "Verify the recorded evidence of that turn; the run prints the session id. Verification checks integrity, not answer quality."
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
