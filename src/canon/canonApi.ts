import { initCanon, readCanonForApi, saveCanon, verifyCanonSignature, initCanonAsync, saveCanonAsync, prepareCanonAsync } from "./canonLoader.js";
import type { OrgPairsOptions } from "../org/preparedOrgPairs.js";
import type { CompassCanon } from "./canonSchema.js";

export function canonInitForApi(workspace: string) {
  return initCanon(workspace);
}

export function canonGetForApi(workspace: string): {
  canon: CompassCanon;
  signature: ReturnType<typeof verifyCanonSignature>;
} {
  return readCanonForApi(workspace);
}

export function canonApplyForApi(params: {
  workspace: string;
  canon: CompassCanon;
}) {
  return saveCanon(params.workspace, params.canon);
}

export function canonVerifyForApi(workspace: string) {
  return verifyCanonSignature(workspace);
}

export function canonInitForApiAsync(workspace: string, options: OrgPairsOptions = {}) { return initCanonAsync(workspace, options); }
/** Actual Studio suffix retains the original prepared authority and published bytes. */
export async function canonApplyForPublicationAsync(params: { workspace: string; canon: CompassCanon }, options: OrgPairsOptions = {}) {
  const prepared = await prepareCanonAsync(params.workspace, params.canon, options), result = prepared.publish()[0]!;
  return { result, assertCurrent: prepared.assertCurrent };
}
export class CanonAuditIncompleteError extends Error {
  readonly code = "CANON_AUDIT_INCOMPLETE";
  constructor(readonly completedPaths: readonly string[], cause: unknown) {
    super("canon pair was published but its Studio audit did not complete", { cause }); this.name = "CanonAuditIncompleteError";
  }
}
