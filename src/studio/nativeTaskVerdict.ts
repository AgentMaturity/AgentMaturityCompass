/**
 * Studio's verdict for a native task's evidence (P0-14). This is the only caller that enables the live scope: a
 * running Studio's own gateway session is never sealed while it serves, so the run verifier may name it as
 * unfinalized instead of failing. A verified prefix is its own state ("anchored-prefix"), never "externally-anchored",
 * and every throw or unexpected shape is "failed".
 */
import { verifyAgentRun } from "../agent/runReport.js";
import type { TrustContext } from "../trust/trustContext.js";
import type { NativeTaskView } from "./nativeTaskTypes.js";

export interface NativeEvidenceVerdict {
  readonly verification: "externally-anchored" | "anchored-prefix" | "failed";
  readonly scope: NativeTaskView["verificationScope"];
  readonly error: string | null;
}

const INCOMPLETE = "Cold native verification did not complete. No verified result is claimed.";
const REFUSED = "Cold native verification refused this evidence. Inspect the ledger before making claims.";
const UNEXPECTED = "Native verification returned an unexpected result. No verified result is claimed.";
const failed = (error: string): NativeEvidenceVerdict => ({ verification: "failed", scope: null, error });

export function nativeEvidenceVerdict(report: unknown): NativeEvidenceVerdict {
  if (!report || typeof report !== "object") return failed(UNEXPECTED);
  const r = report as Record<string, unknown>;
  const list = r.unfinalizedSessions;
  if (typeof r.ok !== "boolean" || typeof r.prefixVerified !== "boolean" || typeof r.integrityOk !== "boolean"
    || (r.scope !== "complete-ledger" && r.scope !== "verified-prefix")
    || !Array.isArray(list) || !list.every((id): id is string => typeof id === "string")) return failed(UNEXPECTED);
  if (r.scope === "complete-ledger" && r.ok && !r.prefixVerified && list.length === 0) {
    return { verification: "externally-anchored", scope: { scope: "complete-ledger", unfinalizedSessions: [] }, error: null };
  }
  if (r.scope === "verified-prefix" && r.prefixVerified && !r.ok && list.length > 0) {
    return { verification: "anchored-prefix", scope: { scope: "verified-prefix", unfinalizedSessions: [...list] }, error: null };
  }
  if (r.ok || r.prefixVerified) return failed(UNEXPECTED);
  if (!r.integrityOk) return failed(REFUSED);
  const trustRoot = r.trustRoot as { monitorAdmission?: { status?: string; keyId?: string } } | undefined;
  const monitor = trustRoot?.monitorAdmission;
  return failed(`UNTRUSTED: the recorded evidence is internally consistent, but the operator's trust list and AMC_EXPECTED_MONITOR_FINGERPRINT do not admit its monitor key (${monitor?.status ?? "not-pinned"}${monitor?.keyId ? ` ${monitor.keyId}` : ""}), so authorship is not verified. No verified result is claimed.`);
}

export async function verifyNativeTaskEvidence(workspace: string, sessionId: string, trust: TrustContext,
  verify: typeof verifyAgentRun = verifyAgentRun): Promise<NativeEvidenceVerdict> {
  let report: unknown;
  try {
    report = await verify(workspace, sessionId, trust, { allowLiveLegacySessions: true });
  } catch {
    return failed(INCOMPLETE);
  }
  return nativeEvidenceVerdict(report);
}
