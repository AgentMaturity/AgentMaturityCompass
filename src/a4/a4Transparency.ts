/**
 * A release package's transparency entry (P1-62; design §14.1). The release effect appends it once RELEASE committed (a
 * refused release attests nothing in the append-only log); it is found again by the exact release id and package
 * digest, so a retry, or an owner's repair (POST …/releases/:rid/transparency), reuses an entry and never appends a
 * second. Readiness reads the log through `releaseEntries` (Activate's `package.transparency`): a package with no entry
 * never reaches the deployment approval.
 */
import { appendTransparencyEntry, readTransparencyEntries } from "../transparency/logChain.js";
import type { TransparencyEntry } from "../transparency/logSchema.js";
import type { A4ChainLink } from "./a4Schema.js";

const entryOf = (entries: readonly TransparencyEntry[], releaseId: string, packageDigest: string): string | null =>
  entries.find((row) => row.artifact.kind === "a4-package" && row.artifact.id === releaseId && row.artifact.sha256 === packageDigest)?.hash ?? null;

/**
 * Appends the package's entry, or reuses the one of this exact release and package (a retry, or a line that landed
 * before its seal or Merkle update failed). Never throws: an entry that could not be appended is `entryId: null` with
 * the reason.
 */
export function packageEntry(workspace: string, agentId: string, releaseId: string, packageDigest: string): { releaseId: string; entryId: string | null; reason: string | null } {
  const find = (): string | null => entryOf(readTransparencyEntries(workspace), releaseId, packageDigest);
  try {
    return { releaseId, entryId: find() ?? appendTransparencyEntry({ workspace, type: "A4_PACKAGE_SIGNED", agentId, artifact: { kind: "a4-package", sha256: packageDigest, id: releaseId } }).hash,
      reason: null };
  } catch (error) {
    let landed: string | null = null;
    try {
      landed = find();
    } catch {
      // An unreadable log names no entry.
    }
    return { releaseId, entryId: landed, reason: `${landed === null ? "TRANSPARENCY_NOT_APPENDED" : "TRANSPARENCY_SEAL_LAGGING"}: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}` };
  }
}

/**
 * Each recorded release's entry as the log reads now (release id → entry hash; null when no entry names its exact package
 * digest), or null when the log does not read. Nothing is read before the first release.
 * ponytail: reads the whole log on each Activate evaluation and checks no seal (`amc transparency verify` does); index it if the log grows large.
 */
export function releaseEntries(workspace: string, chain: readonly A4ChainLink[]): Record<string, string | null> | null {
  const releases = chain.filter((link) => link.kind === "RELEASE");
  if (releases.length === 0) return {};
  try {
    const entries = readTransparencyEntries(workspace);
    return Object.fromEntries(releases.map((link) => [String(link.body.releaseId), entryOf(entries, String(link.body.releaseId), String(link.body.packageDigest))]));
  } catch {
    return null;
  }
}
