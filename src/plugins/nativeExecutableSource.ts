import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { verifySignedDigest } from "../crypto/signing/signer.js";
import { orgSignatureSchema } from "../org/orgSchema.js";
import { sha256Hex } from "../utils/hash.js";
import { NativeExecutableError } from "./nativeExecutableSchema.js";

function assertPath(root: string, file: string): void {
  if (realpathSync(root) !== root || !lstatSync(root).isDirectory()) throw new Error("invalid root");
  const suffix = relative(root, file);
  if (!suffix || isAbsolute(suffix) || suffix === ".." || suffix.startsWith(`..${sep}`)) throw new Error("invalid path");
  let cursor = root;
  const parts = suffix.split(sep);
  for (let index = 0; index < parts.length; index++) {
    cursor = join(cursor, parts[index]!);
    const info = lstatSync(cursor);
    if (info.isSymbolicLink() || (index < parts.length - 1 && !info.isDirectory())) throw new Error("invalid source");
  }
}

/** Read once from an unchanged, bounded regular inode; no symlinks or special files. */
export function readNativeExecutableFile(root: string, file: string, limit: number): Buffer {
  try {
    root = resolve(root); file = resolve(file);
    assertPath(root, file);
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      const before = fstatSync(fd);
      if (!before.isFile() || before.size > limit || before.nlink !== 1) throw new Error("invalid size or alias");
      const bytes = Buffer.alloc(Math.min(limit + 1, before.size + 1));
      let offset = 0;
      while (offset < bytes.length) {
        const count = readSync(fd, bytes, offset, bytes.length - offset, null);
        if (count === 0) break;
        offset += count;
      }
      const after = fstatSync(fd);
      assertPath(root, file);
      const current = lstatSync(file);
      if (offset > limit || offset !== after.size || before.dev !== after.dev || before.ino !== after.ino
        || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
        || current.dev !== after.dev || current.ino !== after.ino || current.nlink !== 1) throw new Error("changed source");
      return bytes.subarray(0, offset);
    } finally { closeSync(fd); }
  } catch {
    throw new NativeExecutableError("EXECUTABLE_SOURCE_UNREADABLE", "Executable extension authority or content is missing, changed, oversized, aliased or not a regular nonsymlink file. Review the selected installation; source and filesystem diagnostics are withheld.");
  }
}

/** Uses the existing AMC signing-policy verifier, never a signature-valid caller flag. */
export function readNativeExecutableSignedJson(workspace: string, path: string, limit: number): { value: unknown; digest: string } {
  const bytes = readNativeExecutableFile(workspace, path, limit);
  const signatureBytes = readNativeExecutableFile(workspace, `${path}.sig`, 65_536);
  const digest = sha256Hex(bytes);
  try {
    const signature = orgSignatureSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(signatureBytes)));
    if (signature.digestSha256 !== digest || !verifySignedDigest({ workspace, digestHex: digest,
      signed: { signature: signature.signature, envelope: signature.envelope } })) throw new Error("untrusted signature");
    return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown, digest };
  } catch {
    throw new NativeExecutableError("EXECUTABLE_AUTHORITY_INVALID", "Executable extension authority requires an unchanged valid signature from this AMC workspace.");
  }
}
