/**
 * One signed session event carries at most `retention.maxPayloadBytesPerEvent`
 * bytes of payload (`.amc/ops-policy.yaml`, 64 KiB by default). The ledger
 * enforces that cap on every append, but it reports it as a bare ledger error
 * after admission has already happened. Native media input reaches the spine
 * through exactly two doors — the loop inbox and `recordUserAttachment` — so
 * the cap is checked at those doors, before anything is queued or recorded,
 * with a refusal that names the limit, the policy that set it and the fix.
 *
 * Two bounds, two outcomes. Above the per-event cap an attachment's bytes can
 * still be retained through the encrypted spill store (src/session/spill/
 * spillInput.ts) behind a signed commitment row, up to `retention.maxBlobBytes`
 * — the largest object the spill envelope will encrypt. Above THAT nothing can
 * retain the bytes, and the refusal names that policy key instead. Neither
 * check ever raises a limit: widening is an operator decision made by editing
 * and re-signing the ops policy, not something an input can talk its way past.
 * The inbox door takes the same two bounds: a queued input above the per-event
 * cap is retained behind a signed `loop/inbox` commitment (spill/spillInput.ts),
 * and every path that claims or replays a queued message resolves that
 * commitment before decoding the row.
 */
import { loadOpsPolicy } from "../ops/policy.js";

/** The spill envelope stores its plaintext length as a uint32. */
const SPILL_ENVELOPE_MAX_BYTES = 0xffffffff;

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

export class SessionSpillCapError extends Error {
  readonly code = "AMC_SESSION_SPILL_CAP";
  readonly byteLength: number;
  readonly cap: number;
  constructor(what: string, byteLength: number, cap: number) {
    super(`${what} is ${byteLength} bytes, above the ${cap}-byte limit for one retained spill object `
      + "(retention.maxBlobBytes in .amc/ops-policy.yaml). Nothing was queued or recorded. "
      + "Attach smaller media or split the input across turns; an operator can raise the limit by editing "
      + "retention.maxBlobBytes in .amc/ops-policy.yaml and re-signing it with `amc ops sign`.");
    this.name = "SessionSpillCapError";
    this.byteLength = byteLength;
    this.cap = cap;
  }
}

/** The signed per-event payload cap for this workspace, as the ledger will apply it. */
export function sessionPayloadCap(workspace: string): number {
  return loadOpsPolicy(workspace).opsPolicy.retention.maxPayloadBytesPerEvent;
}

/** The largest input the encrypted spill store will retain: the signed blob cap, bounded by the envelope's length field. */
export function sessionSpillCap(workspace: string): number {
  return Math.min(loadOpsPolicy(workspace).opsPolicy.retention.maxBlobBytes, SPILL_ENVELOPE_MAX_BYTES);
}

/** Refuse before admission when one payload cannot become one signed event. */
export function assertSessionPayloadWithinCap(workspace: string, what: string, byteLength: number): void {
  const cap = sessionPayloadCap(workspace);
  if (byteLength > cap) throw new SessionPayloadCapError(what, byteLength, cap);
}

/** Refuse before admission when not even the spill store can retain the payload. */
function assertSessionPayloadRetainable(workspace: string, what: string, byteLength: number): void {
  const cap = sessionSpillCap(workspace);
  if (byteLength > cap) throw new SessionSpillCapError(what, byteLength, cap);
}

/**
 * Which door an attachment's bytes take: one inline signed row, or the spill
 * store above the per-event cap. Both refusals happen here, before anything is
 * recorded. Audio routes like image and text: ./nativeAudioProvenance.ts and
 * the ACP attachment projector resolve a descriptor row through its signed
 * reference before comparing bytes.
 */
export function attachmentPayloadRoute(
  workspace: string, what: string, kind: "text" | "image" | "audio", byteLength: number
): { readonly cap: number; readonly spill: boolean } {
  void kind;
  return queuedInputPayloadRoute(workspace, what, byteLength);
}

/**
 * Which door a queued input's encoded bytes take: one inline signed `loop/inbox`
 * row, or — above the per-event cap — a signed `loop/inbox` spill commitment
 * plus a descriptor row. Above the blob cap the refusal happens here, before
 * anything is queued or recorded.
 */
export function queuedInputPayloadRoute(workspace: string, what: string, byteLength: number): { readonly cap: number; readonly spill: boolean } {
  const cap = sessionPayloadCap(workspace);
  if (byteLength <= cap) return { cap, spill: false };
  assertSessionPayloadRetainable(workspace, what, byteLength);
  return { cap, spill: true };
}
