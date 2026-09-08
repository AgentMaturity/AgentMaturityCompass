/**
 * One consistent reading of the three file-backed layers.
 *
 * The process environment is not in here, and that omission is the design. Env
 * is read live on every resolve — it is already in memory, it costs nothing,
 * and it is the layer most likely to change under a running process (a rotated
 * key exported into a supervisor, an operator's `unset`). Snapshotting it would
 * reintroduce exactly the staleness this seam exists to remove, and would make
 * the "re-judge shadowing after queuing" rule unimplementable, since the write
 * queue would re-judge against the same cached copy it was queued under.
 *
 * The file layers, by contrast, cost a syscall each and change rarely, so they
 * are read as a set and swapped in atomically. A snapshot is all-or-nothing on
 * purpose: half-applied layers would let a reload that failed on the second
 * file leave the first one's values live.
 */
import { readFileSync, statSync } from "node:fs";
import { assertOwnerOnly } from "./credentialsFilePermissions.js";
import { parseCredentialsFile } from "./credentialsFileFormat.js";
import type { CredentialsPaths } from "./credentialsPaths.js";
import { readDotenvLayer } from "./dotenvLayer.js";
import type { CredentialLayer } from "./credentialResolution.js";

export interface CredentialsSnapshot {
  /** The AMC-owned store. */
  readonly file: ReadonlyMap<string, string>;
  readonly projectEnv: ReadonlyMap<string, string>;
  readonly userEnv: ReadonlyMap<string, string>;
  /** When these readings were taken, for diagnostics that must not show values. */
  readonly loadedAt: string;
  /** Whether the AMC-owned file existed at read time. */
  readonly filePresent: boolean;
}

function emptyMap(): ReadonlyMap<string, string> {
  return new Map<string, string>();
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

/**
 * Reads the AMC-owned file, asserting permissions on it and on its directory.
 *
 * Both assertions run on every call, not only the first, because this is the
 * function every reload goes through — which is what makes "asserted at boot
 * and on every reload" true rather than aspirational.
 */
function readOwnedFile(paths: CredentialsPaths): {
  readonly entries: ReadonlyMap<string, string>;
  readonly present: boolean;
} {
  let directoryStats;
  try {
    directoryStats = statSync(paths.homeDir);
  } catch (error) {
    // No directory means no store yet; a store that does not exist cannot leak.
    if (isMissing(error)) return { entries: emptyMap(), present: false };
    throw error;
  }
  assertOwnerOnly({ path: paths.homeDir, kind: "directory", stats: directoryStats });

  let raw: string;
  try {
    const fileStats = statSync(paths.file);
    assertOwnerOnly({ path: paths.file, kind: "file", stats: fileStats });
    raw = readFileSync(paths.file, "utf8");
  } catch (error) {
    if (isMissing(error)) return { entries: emptyMap(), present: false };
    throw error;
  }

  return { entries: parseCredentialsFile(paths.file, raw), present: true };
}

/**
 * Takes a fresh reading of every file-backed layer.
 *
 * Throws on any failure of the AMC-owned file — bad permissions, unparsable
 * YAML, an unreadable path. The caller decides what to do with the throw: at
 * boot it propagates, on reload the previous snapshot is kept. That decision
 * does not belong here, because a loader that swallowed the error would make
 * "the last good snapshot survived" indistinguishable from "the file is now
 * empty".
 */
export function loadCredentialsSnapshot(paths: CredentialsPaths, includeDotenv = true): CredentialsSnapshot {
  const owned = readOwnedFile(paths);
  return Object.freeze({
    file: owned.entries,
    // A disabled project layer contributes no entries at all, so nothing the
    // evaluated agent can write is even read.
    projectEnv: !includeDotenv || paths.projectEnvFile === null ? new Map() : readDotenvLayer(paths.projectEnvFile),
    userEnv: includeDotenv ? readDotenvLayer(paths.userEnvFile) : new Map(),
    loadedAt: new Date().toISOString(),
    filePresent: owned.present
  });
}

/**
 * Assembles the four layer readings for one reference.
 *
 * Order here is presentation only — `resolveCredentialLayers` ranks by the
 * declared precedence rather than trusting this array — but it is written
 * highest-first anyway so a reader of this function and a reader of
 * `CREDENTIAL_SOURCE_PRECEDENCE` see the same story.
 */
export function credentialLayersFor(input: {
  readonly snapshot: CredentialsSnapshot;
  readonly env: NodeJS.ProcessEnv;
  readonly name: string;
}): readonly CredentialLayer[] {
  return [
    { source: "env", raw: input.env[input.name] },
    { source: "file", raw: input.snapshot.file.get(input.name) },
    { source: "project-env", raw: input.snapshot.projectEnv.get(input.name) },
    { source: "user-env", raw: input.snapshot.userEnv.get(input.name) }
  ];
}
