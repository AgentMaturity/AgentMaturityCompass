/**
 * Protected-data admission for one provider request (P2-02), shared by every plane that sends one: the native runtime's
 * prepared request (llmRuntime), a body the gateway forwards upstream and a body the bridge relays to the gateway. One
 * rule (`admitProtectedModelRequest`), one evidence row and one typed refusal (`DataFlowRefused`) on all three.
 */
import { DETECTOR_SET_DIGEST, MAX_REQUEST_SCAN_CHARS, protectedWalk, type IssuedToken, type ProtectedDataDetection } from "./detectors.js";
import { protectedDataOptedIn } from "./processorRegistry.js";
import { admitProtectedModelRequest, DataFlowRefused } from "./purposePolicy.js";
import { openTokenLookup } from "./tokenVault.js";
import type { ProtectedDataClass } from "../vault/dataClassification.js";

export interface ProtectedRequestAdmission {
  /** The PROTECTED_DATA_DETECTED row to record before any dispatch or refusal; null for a detector refusal. */
  readonly row: { readonly eventType: "audit"; readonly payload: string; readonly meta: Record<string, unknown> } | null;
  /** Set when the request must not be sent; the caller records the row first (`audit_failed` when it cannot). */
  readonly refusal: DataFlowRefused | null;
}

/**
 * Admission for a request to `providerId` at `baseUrl` that `detect` inspects. Null when nothing is to be recorded or
 * refused: the workspace has not opted in (no .amc/dataflow/processors.yaml and no .sig), or the request holds no
 * protected data under a run purpose that does not allow PHI. Opt-in is latched like redaction, so a registry removed
 * mid-process refuses (registry_missing) instead of skipping admission. Tokens this workspace issued are skipped, and an
 * issued PHI token, like a run purpose that allows PHI, still needs a BAA route: the rest of the text may be PHI. A
 * detector refusal (over-long leaf, excessive nesting, unsupported shape) is the typed refusal `detector_invalid`.
 */
export function protectedRequestAdmission(workspace: string, providerId: string, baseUrl: string,
  detect: (issued: IssuedToken) => ProtectedDataDetection): ProtectedRequestAdmission | null {
  if (!protectedDataOptedIn(workspace)) return null;
  let detection: ProtectedDataDetection;
  let phiToken = false;
  const tokens = openTokenLookup(workspace);
  // Detection asks `issued` about every token-shaped match in the request, so this sees every issued PHI token.
  const issued = (token: string): boolean => {
    const known = tokens.issued(token);
    phiToken ||= known && token.startsWith("[[amc:phi:");
    return known;
  };
  try { detection = detect(issued); } catch { return { row: null, refusal: new DataFlowRefused("detector_invalid") }; } finally { tokens.close(); }
  const admission = admitProtectedModelRequest(workspace, providerId, baseUrl, detection, phiToken ? ["phi"] : []);
  if (admission.reason === "no_protected_data") return null;
  const declaredClasses = admission.classes.filter(value => !detection.classes.includes(value));
  const evidence = {
    classes: [...detection.classes],
    counts: { ...detection.counts },
    detectorSetDigest: detection.detectorSetDigest,
    processorId: admission.processorId,
    ...(declaredClasses.length > 0 ? { declaredClasses } : {})
  };
  return { row: { eventType: "audit", payload: JSON.stringify(evidence), meta: { auditType: "PROTECTED_DATA_DETECTED", ...evidence } },
    refusal: admission.allowed ? null : new DataFlowRefused(admission.reason, admission) };
}

const CLASSES: readonly ProtectedDataClass[] = ["phi", "pii", "card_number", "bank_account", "credential"];

/**
 * One counting walk over the texts of an HTTP provider request as the provider receives them, each `[text, key]` read
 * under its name where it has one (a header). A text the walk cannot read (a zero byte, over-long) throws.
 */
function detectProtectedTexts(texts: readonly (readonly [text: string, key?: string])[], issued: IssuedToken): ProtectedDataDetection {
  const walk = protectedWalk({ budget: MAX_REQUEST_SCAN_CHARS, issued });
  for (const [text, key] of texts) walk.text(text, key);
  const counts: Partial<Record<ProtectedDataClass, number>> = {};
  for (const finding of walk.findings) counts[finding.dataClass] = (counts[finding.dataClass] ?? 0) + 1;
  return Object.freeze({ classes: Object.freeze(CLASSES.filter(kind => (counts[kind] ?? 0) > 0)), counts: Object.freeze(counts),
    detectorSetDigest: DETECTOR_SET_DIGEST });
}

/**
 * Admission for an HTTP request the gateway or the bridge would send to `providerId` at `baseUrl`: its target (path and
 * query), the headers it forwards, each under its name, and the body, which must be strict UTF-8 text the walk can read,
 * so a binary or compressed body is `detector_invalid` rather than passed unread.
 */
export function admitProviderHttpRequest(workspace: string, providerId: string, baseUrl: string,
  request: { readonly target: string; readonly headers: Readonly<Record<string, string>>; readonly body: Buffer }): ProtectedRequestAdmission | null {
  return protectedRequestAdmission(workspace, providerId, baseUrl, issued => detectProtectedTexts([[request.target],
    ...Object.entries(request.headers).map(([name, value]) => [value, name] as const),
    [new TextDecoder("utf-8", { fatal: true }).decode(request.body)]], issued));
}

/** The JSON a refused HTTP request answers with (403): the refusal's code, reason and registry identifiers, never content. */
export function dataFlowRefusalBody(refusal: DataFlowRefused): string {
  return JSON.stringify({ error: refusal.code, reason: refusal.reason, processorId: refusal.processorId, purposeId: refusal.purposeId });
}
