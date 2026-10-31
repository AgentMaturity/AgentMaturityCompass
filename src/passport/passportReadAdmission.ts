import { join } from "node:path";
import { captureOrgFiles, captureOrgPairs, assertOrgPairsCurrent, orgPairBytes } from "../org/preparedOrgPairs.js";
import { verifyAuditorSignatureBytes } from "../org/orgSignatureBytes.js";
import { getAuthenticatedKeyHistory } from "../crypto/keys.js";
import { canonicalize } from "../utils/json.js";
import {
  passportPolicyPath,
  passportLatestCachePath,
  verifyPassportPolicySignature as verifyLegacyPolicySignature,
  verifyPassportCacheSignature as verifyLegacyCacheSignature
} from "./passportStore.js";

type LegacyVerdict = ReturnType<typeof verifyLegacyPolicySignature>;
type CacheInput = Parameters<typeof verifyLegacyCacheSignature>[0];
type PolicyRead = { kind: "policy"; workspace: string };
type CacheRead = { kind: "cache"; input: CacheInput };
interface Admission { readonly legacy: Readonly<LegacyVerdict>; readonly intrinsic: () => void }
interface MissingCache { readonly legacy: ReturnType<typeof verifyLegacyCacheSignature>; readonly intrinsic: null }

/** Two fixed recipes only. No caller supplies a path, legacy verdict, purpose, provider or positive proof. */
function captureReadAdmission(selection: PolicyRead): Admission;
function captureReadAdmission(selection: CacheRead): Admission | MissingCache;
function captureReadAdmission(selection: PolicyRead | CacheRead): Admission | MissingCache {
  const workspace = selection.kind === "policy" ? selection.workspace : selection.input.workspace;
  const observed = selection.kind === "policy" ? verifyLegacyPolicySignature(workspace) : verifyLegacyCacheSignature(selection.input);
  // Preserve the actual missing-body point verdict, including an ignored orphan sidecar, without another read.
  if (selection.kind === "cache" && observed.valid && !observed.signatureExists) return { legacy: observed, intrinsic: null };
  const legacy = Object.freeze({ ...observed });
  const prefix = selection.kind === "policy" ? "passport policy signature invalid" : "passport cache signature invalid";
  const refused = (cause?: unknown) => new Error(`${prefix}: ${legacy.reason ?? "unknown"}`, { cause });
  const exception = !legacy.valid && legacy.reason === "signature verify failed";
  let initialFailure: unknown;
  const captured = (() => { try {
    if (!legacy.valid && !exception) throw refused();
    const path = selection.kind === "policy" ? passportPolicyPath(workspace)
      : passportLatestCachePath(workspace, selection.input.scopeType, selection.input.scopeId);
    const historyPath = join(workspace, ".amc", "keys", "auditor_history.json");
    const pair = captureOrgPairs([path]), body = orgPairBytes(pair, path), signature = orgPairBytes(pair, `${path}.sig`);
    if (body === null || signature === null) throw new Error(`${prefix}: missing or untrusted pair`);
    const history = exception ? captureOrgFiles([historyPath]) : null, historyBytes = history === null ? null : orgPairBytes(history, historyPath);
    const historyCanonical = historyBytes === null ? null : canonicalize(JSON.parse(historyBytes.toString("utf8")));
    return { pair, body, signature, history, historyCanonical };
  } catch (cause) { initialFailure = exception ? refused(cause) : cause; return null; } })();
  if (captured === null) {
    const failure = initialFailure;
    return Object.freeze({ legacy, intrinsic: () => { throw failure; } });
  }
  let failed = false, failure: unknown;
  const intrinsic = () => { if (failed) throw failure; try {
    assertOrgPairsCurrent(captured.pair); if (captured.history !== null) assertOrgPairsCurrent(captured.history);
    if (captured.historyCanonical !== null) {
      const admitted = getAuthenticatedKeyHistory(workspace, "auditor");
      if (admitted === null || canonicalize(admitted) !== captured.historyCanonical) throw new Error("original auditor history is not currently authenticated");
    }
    const admitted = verifyAuditorSignatureBytes(workspace, "BUNDLE", captured.body, captured.signature);
    if (!admitted.valid) throw new Error(`${prefix}: ${admitted.reason ?? "missing or untrusted pair"}`);
    assertOrgPairsCurrent(captured.pair); if (captured.history !== null) assertOrgPairsCurrent(captured.history);
  } catch (cause) { failed = true; failure = exception ? refused(cause) : cause; throw failure; } };
  return Object.freeze({ legacy, intrinsic });
}

/** Internal policy capture for the genuine direct export; its initial selector remains the literal Store reader. */
export function capturePassportPolicyReadAdmission(workspace: string): Admission {
  return captureReadAdmission({ kind: "policy", workspace });
}
function pointVerdict(admission: Admission): LegacyVerdict {
  const { legacy, intrinsic } = admission;
  try { intrinsic(); return { ...legacy, valid: true, reason: null }; }
  catch (cause) { return { ...legacy, valid: false, reason: legacy.reason ?? String(cause) }; }
}

/** Fixed public-material policy observation. No default loader, private warm or signing operation. */
export function verifyPassportPolicySignatureForApi(workspace: string): LegacyVerdict {
  return pointVerdict(capturePassportPolicyReadAdmission(workspace));
}
/** The existing cache scope recipe; a genuinely missing cache is an ordinary point observation, not signed authority. */
export function verifyPassportCacheSignatureForApi(params: CacheInput): ReturnType<typeof verifyLegacyCacheSignature> {
  const input = { workspace: params.workspace, scopeType: params.scopeType, scopeId: params.scopeId };
  const actual = captureReadAdmission({ kind: "cache", input });
  if (actual.intrinsic === null) return actual.legacy;
  return pointVerdict({ legacy: actual.legacy, intrinsic: actual.intrinsic });
}
