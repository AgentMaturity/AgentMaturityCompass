import type { IncomingMessage, ServerResponse } from "node:http";
import { assertNativeApprovalIdentity, assertNativeBrowserAdmission, NativeAdmissionError, type NativeAdmissionActor } from "./nativeAdmission.js";

/** Additional browser/demo proof; existing reviewer roles, signatures and quorum remain mandatory. */
export function admitStudioApproval(options: {
  req: IncomingMessage; res: ServerResponse; actor: NativeAdmissionActor;
  allowedOrigins: readonly string[]; readOnly: boolean;
}): boolean {
  try {
    assertNativeBrowserAdmission({ req: options.req, actor: options.actor, allowedOrigins: options.allowedOrigins });
    assertNativeApprovalIdentity(options.actor);
    if (options.readOnly) throw new NativeAdmissionError(403, "NATIVE_READ_ONLY", "Workspace trust or user signatures require read-only operation; no approval decision was recorded.");
    return true;
  } catch (error) {
    if (!(error instanceof NativeAdmissionError)) throw error;
    options.res.statusCode = error.statusCode;
    options.res.setHeader("content-type", "application/json");
    options.res.end(JSON.stringify({ ok: false, error: error.message, code: error.code }));
    return false;
  }
}
