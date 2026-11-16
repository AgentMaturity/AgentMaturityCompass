/**
 * Reads the members of a gzip-compressed tar archive (a .amcpass passport or a .amcbundle evidence bundle) into memory,
 * bounded, without writing anything to disk. Only regular files are read; directories, links and other entries are
 * skipped. POSIX (pax) and GNU long names are honoured. macOS tar's AppleDouble members (a name starting "._", which
 * carry file attributes, not content) are counted but not read. A name that appears twice is refused: two readers could
 * otherwise disagree on which copy is the record.
 */
import { gunzipSync } from "node:zlib";

const MiB = 1024 * 1024;
export const ARCHIVE_LIMITS = { expanded: 512 * MiB, members: 20_000 };

export interface Archive {
  members: Map<string, Buffer>;
  /** AppleDouble attribute members that were skipped. */
  appleDouble: number;
}

export const isGzip = (bytes: Uint8Array) => bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

function field(block: Buffer, start: number, length: number): string {
  const raw = block.subarray(start, start + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString("utf8");
}

function octal(block: Buffer, start: number, length: number): number {
  const text = field(block, start, length).trim();
  if (!/^[0-7]+$/.test(text)) throw new Error("a tar header has a size that is not octal");
  return parseInt(text, 8);
}

/** The `path` record of a pax extended header, if any. */
function paxPath(data: Buffer): string | null {
  let at = 0;
  let path: string | null = null;
  while (at < data.length) {
    const space = data.indexOf(0x20, at);
    if (space === -1) break;
    const length = Number(data.subarray(at, space).toString("ascii"));
    if (!Number.isSafeInteger(length) || length <= 0) throw new Error("a pax header is malformed");
    const record = data.subarray(space + 1, at + length - 1).toString("utf8");
    if (record.startsWith("path=")) path = record.slice(5);
    at += length;
  }
  return path;
}

/** Strips "./" and refuses absolute names and ".." segments, so a member name is always a plain relative path. */
function cleanName(name: string): string {
  const clean = name.replace(/^(\.\/)+/, "");
  if (clean.startsWith("/") || clean.split("/").includes("..")) throw new Error(`the archive member ${JSON.stringify(name)} points outside the archive`);
  return clean;
}

/** Throws the reason when the bytes are not a well-formed gzip-compressed tar archive within the limits. */
export function readTarGz(bytes: Uint8Array): Archive {
  let tar: Buffer;
  try {
    tar = gunzipSync(bytes, { maxOutputLength: ARCHIVE_LIMITS.expanded });
  } catch (error) {
    throw new Error(`not a readable gzip archive within ${ARCHIVE_LIMITS.expanded / MiB} MiB (${error instanceof Error ? error.message : String(error)})`);
  }
  const members = new Map<string, Buffer>();
  let appleDouble = 0;
  let longName: string | null = null;
  let at = 0;
  let count = 0;
  while (at + 512 <= tar.length) {
    const header = tar.subarray(at, at + 512);
    if (header.every(byte => byte === 0)) break;
    if (++count > ARCHIVE_LIMITS.members) throw new Error(`more than ${ARCHIVE_LIMITS.members} archive members`);
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] ?? 0);
    const dataStart = at + 512;
    if (dataStart + size > tar.length) throw new Error("the archive ends inside a member");
    const data = tar.subarray(dataStart, dataStart + size);
    at = dataStart + Math.ceil(size / 512) * 512;
    if (type === "x") { longName = paxPath(data); continue; }
    if (type === "L") { longName = field(data, 0, data.length); continue; }
    if (type === "g") continue;
    const prefix = field(header, 345, 155);
    const name = cleanName(longName ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100)));
    longName = null;
    if (type !== "0" && type !== "\0") continue;
    if ((name.split("/").pop() ?? "").startsWith("._")) { appleDouble += 1; continue; }
    if (members.has(name)) throw new Error(`the archive holds ${name} twice`);
    members.set(name, Buffer.from(data));
  }
  return { members, appleDouble };
}

/**
 * The members under one top folder (`amc-passport/`), or at the root when the archive has no such folder, keyed by
 * their path below it. Null when `marker` is in neither place.
 */
export function rootedAt(archive: Archive, folder: string, marker: string): Map<string, Buffer> | null {
  for (const prefix of [`${folder}/`, ""]) {
    if (!archive.members.has(`${prefix}${marker}`)) continue;
    const out = new Map<string, Buffer>();
    for (const [name, data] of archive.members) if (name.startsWith(prefix)) out.set(name.slice(prefix.length), data);
    return out;
  }
  return null;
}
