import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const field = (block, start, end) => block.subarray(start, end).toString("utf8").replace(/\0[\s\S]*$/, "");
const XATTR = /(?:^|\n)\d+ ((?:LIBARCHIVE|SCHILY)\.xattr\.[^=\n]+)=/g;

/**
 * macOS metadata in a gzip tar meant for Linux (LIVE-DEPLOY-06, D6): AppleDouble `._*` entries (root level included) and
 * pax headers carrying extended attributes (LIBARCHIVE.xattr.*, SCHILY.xattr.*), which bsdtar on macOS writes unless told
 * not to. Walks the 512-byte headers itself (name 0..100, size 124..136, type 156, ustar prefix 345..500, pax `path=`),
 * so no host tar decides what is in the archive. Returns one problem per offending entry.
 */
function appleMetadataProblems(tar) {
  const problems = [];
  let offset = 0;
  let paxPath = null;
  let paxXattrs = [];
  while (offset + 512 <= tar.length) {
    const block = tar.subarray(offset, offset + 512);
    if (block.every((byte) => byte === 0)) break;
    const size = Number.parseInt(field(block, 124, 136).trim() || "0", 8);
    if (!Number.isSafeInteger(size)) throw new Error(`unreadable tar header at offset ${offset}`);
    const type = String.fromCharCode(block[156]);
    const body = tar.subarray(offset + 512, offset + 512 + size).toString("utf8");
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "x" || type === "g") {
      const xattrs = [...body.matchAll(XATTR)].map((match) => match[1]);
      if (type === "g") {
        if (xattrs.length > 0) problems.push(`extended attributes (${xattrs.join(", ")}) in a global pax header`);
        continue;
      }
      paxXattrs = xattrs;
      paxPath = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body)?.[1] ?? null;
      continue;
    }
    const prefix = field(block, 257, 262) === "ustar" ? field(block, 345, 500) : "";
    const path = paxPath ?? (prefix ? `${prefix}/${field(block, 0, 100)}` : field(block, 0, 100));
    if (paxXattrs.length > 0) problems.push(`extended attributes (${paxXattrs.join(", ")}) on ${path}`);
    if ((path.replace(/\/+$/, "").split("/").pop() ?? "").startsWith("._")) problems.push(`AppleDouble entry ${path}`);
    paxPath = null;
    paxXattrs = [];
  }
  return problems;
}

/** Throws, naming each offending entry, when a .tar.gz carries macOS metadata. */
export function assertNoAppleMetadata(archivePath) {
  const problems = appleMetadataProblems(gunzipSync(readFileSync(archivePath)));
  if (problems.length > 0) throw new Error(`${archivePath} carries macOS metadata: ${problems.join("; ")}`);
}
