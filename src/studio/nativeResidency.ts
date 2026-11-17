/** Storage admission before a native task descriptor is written (split from nativeTaskService.ts for its line budget). */
import { storageAdmissionRefusal } from "../residency/admissionWords.js";
import { NativeTaskServiceError } from "./nativeTaskTypes.js";

/**
 * The check SessionService.open runs, asked first, so a refused start uses no task slot and names its reason in words
 * (409 NATIVE_RESIDENCY_REFUSED, with the decision's reason and detail codes). It refuses exactly what session open would.
 */
export function assertNativeStorageAdmission(workspace: string): void {
  const refusal = storageAdmissionRefusal(workspace);
  if (refusal !== null) throw new NativeTaskServiceError("RESIDENCY_REFUSED", 409, refusal.message, { reason: refusal.reason, detail: refusal.detail });
}
