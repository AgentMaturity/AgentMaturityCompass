import { closeSync, constants, fstatSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import type { TrustContext } from "../trust/index.js";
import { containedPath } from "../utils/pathSafety.js";
import { AMC_ARCHIVE_LIMITS, verifyTransparencyProofBundle } from "./merkleIndexStore.js";

/**
 * The bytes of the proof bundle a Studio or API request names (P0-51): `file` resolved under
 * `<workspace>/.amc/transparency/proofs/` (where Studio's prove writes), a regular, singly linked file with no symbolic
 * link anywhere from `.amc` down, read through one no-follow descriptor that is re-checked against that path after
 * opening; else null. An absolute path or `..` that leaves the directory is refused by name, before anything is read.
 */
function readRequestedProofBundle(workspace: string, file: string): Buffer | null {
  try {
    const lexical = containedPath(join(workspace, ".amc", "transparency", "proofs"), "the transparency proofs directory", file);
    // Its real path must be the lexical one re-rooted at the workspace's real path: no link from .amc down.
    const unlinked = join(realpathSync(workspace), relative(resolve(workspace), lexical));
    const inside = () => realpathSync(lexical) === unlinked;
    if (!inside()) return null;
    const fd = openSync(unlinked, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const opened = fstatSync(fd);
      const now = inside() ? statSync(unlinked) : null;
      if (!opened.isFile() || opened.nlink !== 1 || opened.size > AMC_ARCHIVE_LIMITS.maxCompressedBytes
        || now === null || now.dev !== opened.dev || now.ino !== opened.ino) return null;
      return readFileSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

/**
 * Studio's and the API's verify-proof (P0-51): only a bundle `readRequestedProofBundle` admits is read, and it is
 * verified from a private copy of those bytes, under the server's trust context. A path outside the proofs directory,
 * a missing file, a link and a non-regular file all verify as the same `UNREADABLE: cannot read proof bundle` with an
 * all-zero digest, so a request learns nothing about other files. The report names the file as requested.
 */
export function verifyWorkspaceProofBundle(workspace: string, file: string, trust: TrustContext): ReturnType<typeof verifyTransparencyProofBundle> {
  const bytes = readRequestedProofBundle(workspace, file);
  const tmp = mkdtempSync(join(tmpdir(), "amc-proof-request-"));
  try {
    const copy = join(tmp, "bundle.amcproof");
    // Nothing read leaves no copy, which the check below reports as UNREADABLE like any other unreadable bundle.
    if (bytes) writeFileSync(copy, bytes, { mode: 0o600 });
    const out = verifyTransparencyProofBundle(copy, trust);
    return { ...out, report: { ...out.report, artifact: { ...out.report.artifact, path: file } } };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
