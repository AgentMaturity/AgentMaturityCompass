import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CertificationEnvironment } from "./certificationSchema.js";

const GIT_SHA_RE = /^[0-9a-f]{40}$/;

export interface SourceCommitResolution {
  sourceCommit: string;
  /** How the value was obtained, so a reader can judge it. */
  resolution: string;
}

/** The boundary every certification result names: OS, architecture, Node. */
export function currentCertificationEnvironment(): CertificationEnvironment {
  return { platform: process.platform, arch: process.arch, node: process.version };
}

/**
 * Resolves the AMC source commit a run was produced from.
 *
 * An explicit value must be a full sha. Otherwise `AMC_SOURCE_COMMIT`, then
 * `git rev-parse HEAD` in the checkout this module lives in. When none of
 * those yields a sha the answer is "unknown" with the reason — a guessed or
 * truncated commit would be a boundary the reader cannot check.
 */
export function resolveSourceCommit(explicit?: string): SourceCommitResolution {
  if (explicit !== undefined) {
    if (!GIT_SHA_RE.test(explicit)) {
      throw new Error(`sourceCommit must be a full 40-hex git sha, got "${explicit}"`);
    }
    return { sourceCommit: explicit, resolution: "explicit" };
  }
  const fromEnv = process.env.AMC_SOURCE_COMMIT?.trim();
  if (fromEnv && GIT_SHA_RE.test(fromEnv)) {
    return { sourceCommit: fromEnv, resolution: "env:AMC_SOURCE_COMMIT" };
  }
  try {
    const cwd = dirname(fileURLToPath(import.meta.url));
    const out = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000
    }).trim();
    if (GIT_SHA_RE.test(out)) {
      return { sourceCommit: out, resolution: "git rev-parse HEAD (module checkout)" };
    }
  } catch {
    // git absent, or the module is not inside a checkout — fall through.
  }
  return {
    sourceCommit: "unknown",
    resolution: "no explicit value, no valid AMC_SOURCE_COMMIT, git rev-parse unavailable"
  };
}
