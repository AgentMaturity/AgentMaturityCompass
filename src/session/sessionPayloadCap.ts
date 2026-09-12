/**
 * One signed session event carries at most `retention.maxPayloadBytesPerEvent`
 * bytes of payload (`.amc/ops-policy.yaml`, 64 KiB by default). The ledger
 * enforces that cap on every append, but it reports it as a bare ledger error
 * after admission has already happened. Native media input reaches the spine
 * through exactly two doors — the loop inbox and `recordUserAttachment` — so
 * the cap is checked at those doors, before anything is queued or recorded,
 * with a refusal that names the limit, the policy that set it and the fix.
 *
 * This is a fail-closed check against the same policy the ledger reads. It
 * never raises the limit: widening is an operator decision made by editing
 * and re-signing the ops policy, not something an input can talk its way past.
 */
import { loadOpsPolicy } from "../ops/policy.js";

export class SessionPayloadCapError extends Error {
  readonly code = "AMC_SESSION_PAYLOAD_CAP";
  readonly byteLength: number;
  readonly cap: number;
  constructor(what: string, byteLength: number, cap: number) {
    super(`${what} is ${byteLength} bytes, above the ${cap}-byte limit for one signed session event `
      + "(retention.maxPayloadBytesPerEvent in .amc/ops-policy.yaml). Nothing was queued or recorded. "
      + "Attach smaller media or split the input across turns; an operator can raise the limit by editing "
      + "retention.maxPayloadBytesPerEvent in .amc/ops-policy.yaml and re-signing it with `amc ops sign`.");
    this.name = "SessionPayloadCapError";
    this.byteLength = byteLength;
    this.cap = cap;
  }
}

/** The signed per-event payload cap for this workspace, as the ledger will apply it. */
export function sessionPayloadCap(workspace: string): number {
  return loadOpsPolicy(workspace).opsPolicy.retention.maxPayloadBytesPerEvent;
}

/** Refuse before admission when one payload cannot become one signed event. */
export function assertSessionPayloadWithinCap(workspace: string, what: string, byteLength: number): void {
  const cap = sessionPayloadCap(workspace);
  if (byteLength > cap) throw new SessionPayloadCapError(what, byteLength, cap);
}
