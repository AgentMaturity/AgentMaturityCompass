/**
 * The Pi install a control installation binds (P1-22). The `pi` CLI of Pi 1.0.2 and 1.0.4 is a bundle: package.json
 * names its version and `bin.pi`, and the directory holding that entry (dist/bundle) holds the code Pi runs, the
 * extension runner and tool hooks included. AMC records the package directory, the version and one SHA-256 over
 * package.json and every file in that directory at install, and measures them again when a Pi session registers and
 * when status runs. It is a check that the bound Pi on disk is unchanged, not proof that a session ran it.
 */
import { closeSync, constants, existsSync, fstatSync, openSync, readdirSync, readFileSync, realpathSync, type BigIntStats } from "node:fs";
import { delimiter, dirname, join, relative } from "node:path";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";

const PI_PACKAGE = "@earendil-works/pi-coding-agent";

export interface PiInstall {
  readonly packageDir: string;
  readonly version: string;
  readonly sha256: string;
}

/** Per process, no expiry: a digest is reused only for a file whose descriptor shows exactly the key it was read under. */
const digests = new Map<string, { key: string; sha256: string }>();

/** Forget every cached digest (a reinstall or a new registration). */
export function clearPiDigestCache(): void {
  digests.clear();
}

const fileKey = (stat: BigIntStats) => `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;

/**
 * Runs `use` on a descriptor for `path` opened without following a final symlink (and without blocking on a FIFO),
 * with that descriptor's own stat, only when it is a regular file. Null on any error, a symlink or any other file type.
 */
function regularFile<T>(path: string, use: (fd: number, stat: BigIntStats) => T | null): T | null {
  if (constants.O_NOFOLLOW === undefined) return null;
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd, { bigint: true });
    return stat.isFile() ? use(fd, stat) : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** All bytes of the open file, or null when its stat changed while it was read (the key would not describe them). */
function readUnchanged(fd: number, stat: BigIntStats): Buffer | null {
  const bytes = readFileSync(fd);
  return BigInt(bytes.length) === stat.size && fileKey(fstatSync(fd, { bigint: true })) === fileKey(stat) ? bytes : null;
}

/**
 * The SHA-256 of the regular file at `path`, so a check on every call stays cheap. The key is the descriptor's
 * (dev, ino, size, mtime, ctime) in nanoseconds; a cached digest is reused only for exactly that key, and only a
 * successful read is cached. Any error, a missing file, a symlink or another file type is null and drops the entry.
 */
export function cachedFileSha256(path: string): string | null {
  const sha256 = regularFile(path, (fd, stat) => {
    const key = fileKey(stat);
    const cached = digests.get(path);
    if (cached?.key === key) return cached.sha256;
    const bytes = readUnchanged(fd, stat);
    if (!bytes) return null;
    const digest = sha256Hex(bytes);
    digests.set(path, { key, sha256: digest });
    return digest;
  });
  if (sha256 === null) digests.delete(path);
  return sha256;
}

/** Every file under `dir`, relative to `root`, with its SHA-256, in path order; a symlink or other non-regular entry throws. */
function files(root: string, dir: string): Array<[string, string]> {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(root, path);
    const sha256 = cachedFileSha256(path);
    if (sha256 === null) throw new Error(`unreadable: ${path}`);
    return [[relative(root, path), sha256] as [string, string]];
  });
}

/** Pi's version and digest as installed at `packageDir` now, or null when it is not a readable Pi package. */
export function measurePiInstall(packageDir: string): PiInstall | null {
  try {
    const manifestBytes = regularFile(join(packageDir, "package.json"), readUnchanged);
    if (!manifestBytes) return null;
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as { name?: unknown; version?: unknown; bin?: { pi?: unknown } };
    if (manifest.name !== PI_PACKAGE || typeof manifest.version !== "string" || typeof manifest.bin?.pi !== "string") return null;
    const runtime = dirname(join(packageDir, manifest.bin.pi));
    const sha256 = sha256Hex(Buffer.from(canonicalize({ packageJson: sha256Hex(manifestBytes), files: files(packageDir, runtime) }), "utf8"));
    return { packageDir, version: manifest.version, sha256 };
  } catch {
    return null;
  }
}

/** The package directory behind `command` on `searchPath` (what a person running it gets) that `measure` accepts, or null. */
export function findPackageOnPath(command: string, measure: (dir: string) => unknown, searchPath = process.env.PATH ?? ""): string | null {
  for (const dir of searchPath.split(delimiter).filter(Boolean)) {
    const bin = join(dir, command);
    if (!existsSync(bin)) continue;
    for (let current = dirname(realpathSync(bin)); dirname(current) !== current; current = dirname(current)) {
      if (measure(current)) return current;
    }
  }
  return null;
}

/** The Pi package behind the `pi` command on `searchPath`, or null. */
export function findPiPackage(searchPath = process.env.PATH ?? ""): string | null {
  return findPackageOnPath("pi", measurePiInstall, searchPath);
}
