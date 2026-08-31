import { getPublicKeyHistory, verifyHexDigestAny } from "../crypto/keys.js";
import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";

/**
 * The one definition of "this run report is the bytes its writer sealed".
 *
 * Diagnostic and assurance runs share the same seal discipline: the writer
 * hashes the canonical report with `reportJsonSha256`/`runSealSig` emptied,
 * then signs that hash with the workspace auditor key. Every consumer that
 * feeds a report back into scoring must check the seal the same way — G9
 * exists because each reader had been deciding for itself, and most decided
 * not to look.
 *
 * "unsigned" fails deliberately: a deliberately-unsigned report may exist for
 * local diagnosis, but a scoring input cannot tell it from a fabricated one.
 */
export function sealedRunReportVerifies(
  workspace: string,
  parsed: Record<string, unknown>
): boolean {
  const claimedHash = parsed.reportJsonSha256;
  const seal = parsed.runSealSig;
  if (typeof claimedHash !== "string" || claimedHash.length !== 64) return false;
  if (typeof seal !== "string" || seal.length === 0 || seal === "unsigned") return false;
  const recomputed = sha256Hex(
    canonicalize({ ...parsed, reportJsonSha256: "", runSealSig: "" })
  );
  if (recomputed !== claimedHash) return false;
  try {
    return verifyHexDigestAny(claimedHash, seal, getPublicKeyHistory(workspace, "auditor"));
  } catch {
    return false;
  }
}
