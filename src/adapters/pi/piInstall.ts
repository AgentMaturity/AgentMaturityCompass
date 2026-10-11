/**
 * The Pi install a control installation binds (P1-22). The `pi` CLI of Pi 1.0.2 and 1.0.4 is a bundle: package.json
 * names its version and `bin.pi`, and the directory holding that entry (dist/bundle) holds the code Pi runs, the
 * extension runner and tool hooks included. AMC records the package directory, the version and one SHA-256 over
 * package.json and every file in that directory at install, and measures them again when a Pi session registers and
 * when status runs. It is a check that the bound Pi on disk is unchanged, not proof that a session ran it.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { delimiter, dirname, join, relative } from "node:path";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";

const PI_PACKAGE = "@earendil-works/pi-coding-agent";

export interface PiInstall {
  readonly packageDir: string;
  readonly version: string;
  readonly sha256: string;
}

const digests = new Map<string, { key: string; sha256: string }>();

/**
 * The SHA-256 of `path`, re-read only when its (dev, ino, size, ctime) changes, so a check on every call stays cheap;
 * null when it cannot be read. Any write, rename or replacement changes ctime, which a process cannot set back.
 */
export function cachedFileSha256(path: string): string | null {
  try {
    const stat = statSync(path, { bigint: true });
    const key = `${stat.dev}:${stat.ino}:${stat.size}:${stat.ctimeNs}`;
    const cached = digests.get(path);
    if (cached?.key === key) return cached.sha256;
    const sha256 = sha256Hex(readFileSync(path));
    digests.set(path, { key, sha256 });
    return sha256;
  } catch {
    return null;
  }
}

/** Every file under `dir`, relative to `root`, with its SHA-256, in path order; symlinks are read through. */
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
    const manifestBytes = readFileSync(join(packageDir, "package.json"));
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as { name?: unknown; version?: unknown; bin?: { pi?: unknown } };
    if (manifest.name !== PI_PACKAGE || typeof manifest.version !== "string" || typeof manifest.bin?.pi !== "string") return null;
    const runtime = dirname(join(packageDir, manifest.bin.pi));
    const sha256 = sha256Hex(Buffer.from(canonicalize({ packageJson: sha256Hex(manifestBytes), files: files(packageDir, runtime) }), "utf8"));
    return { packageDir, version: manifest.version, sha256 };
  } catch {
    return null;
  }
}

/** The Pi package behind the `pi` command on `searchPath` (what a person running `pi` gets), or null. */
export function findPiPackage(searchPath = process.env.PATH ?? ""): string | null {
  for (const dir of searchPath.split(delimiter).filter(Boolean)) {
    const bin = join(dir, "pi");
    if (!existsSync(bin)) continue;
    for (let current = dirname(realpathSync(bin)); dirname(current) !== current; current = dirname(current)) {
      if (measurePiInstall(current)) return current;
    }
  }
  return null;
}
