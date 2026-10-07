import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ConformanceEnvironment } from "./conformanceSchema.js";

const GIT_SHA_RE = /^[0-9a-f]{40}$/;

export interface SourceCommitResolution {
  sourceCommit: string;
  /** How the value was obtained, so a reader can judge it. */
  resolution: string;
}

/** The boundary every conformance result names: OS, architecture, Node. */
export function currentConformanceEnvironment(): ConformanceEnvironment {
  return { platform: process.platform, arch: process.arch, node: process.version };
}

/**
 * Resolves the AMC source commit a run was produced from.
 *
 * An explicit value must be a full sha. Otherwise `AMC_SOURCE_COMMIT`, then
 * `git rev-parse HEAD` when this package's root is itself the top of a git
 * checkout (never the HEAD of a project that installed AMC under
 * node_modules). When none of those yields a sha the answer is "unknown" with
 * the reason — a guessed or borrowed commit would be a boundary the reader
 * cannot check.
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
    // src/domains/conformance/ and dist/domains/conformance/ both sit three levels under the package root.
    const packageRoot = realpathSync(fileURLToPath(new URL("../../../", import.meta.url)));
    const [top, sha] = execFileSync("git", ["rev-parse", "--show-toplevel", "HEAD"], {
      cwd: packageRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000
    }).trim().split("\n");
    if (top !== undefined && realpathSync(top) === packageRoot && sha !== undefined && GIT_SHA_RE.test(sha)) {
      return { sourceCommit: sha, resolution: "git rev-parse HEAD (AMC checkout; uncommitted changes are not shown)" };
    }
  } catch {
    // git absent, or the package root is not a checkout — fall through.
  }
  return {
    sourceCommit: "unknown",
    resolution: "no explicit value, no valid AMC_SOURCE_COMMIT, and the package root is not an AMC git checkout"
  };
}
