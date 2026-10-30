/**
 * The DeepSeek Harness install a control installation binds (P2-17). DSH is a tree of packages, not one bundle: AMC
 * measures the `@deepseek-ai/dsh` package and `@deepseek-ai/dsh-tools` (the tool pipeline whose `tools/pre-execute`
 * waterfall and guards AMC's plugin relies on), each as its package.json and every file under it outside nested
 * node_modules, at install and again when a DSH session registers. The other DSH packages (fs, shell, web tools,
 * Cordis) are not measured. It is a check that the bound DSH on disk is unchanged, not proof that a session ran it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { cachedFileSha256, findPackageOnPath } from "../pi/piInstall.js";

const DSH_PACKAGE = "@deepseek-ai/dsh";
const TOOLS_PACKAGE = "@deepseek-ai/dsh-tools";

export interface DshInstall {
  readonly packageDir: string;
  readonly version: string;
  readonly sha256: string;
}

/** Every file under `dir` except nested node_modules, relative to `root`, with its SHA-256; a symlink or unreadable file throws. */
function tree(root: string, dir: string): Array<[string, string]> {
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1)).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : tree(root, path);
    const sha256 = cachedFileSha256(path);
    if (sha256 === null) throw new Error(`unreadable: ${path}`);
    return [[relative(root, path), sha256] as [string, string]];
  });
}

function packageName(dir: string): { name?: unknown; version?: unknown } | null {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name?: unknown; version?: unknown };
  } catch {
    return null;
  }
}

/** The `@deepseek-ai/dsh-tools` directory Node resolves from `packageDir`: its own node_modules, then each ancestor's. */
function toolsDir(packageDir: string): string | null {
  for (let dir = packageDir; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", "@deepseek-ai", "dsh-tools");
    if (packageName(candidate)?.name === TOOLS_PACKAGE) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

/** DSH's version and digest as installed at `packageDir` now, or null when it is not a readable DSH package with its tool pipeline. */
export function measureDshInstall(packageDir: string): DshInstall | null {
  try {
    const manifest = packageName(packageDir);
    const tools = toolsDir(packageDir);
    if (manifest?.name !== DSH_PACKAGE || typeof manifest.version !== "string" || !tools) return null;
    const sha256 = sha256Hex(Buffer.from(canonicalize({ dsh: tree(packageDir, packageDir), tools: tree(tools, tools) }), "utf8"));
    return { packageDir, version: manifest.version, sha256 };
  } catch {
    return null;
  }
}

/** The DSH package behind the `dsh` command on `searchPath` (what a person running `dsh` gets), or null. */
export function findDshPackage(searchPath = process.env.PATH ?? ""): string | null {
  return findPackageOnPath("dsh", measureDshInstall, searchPath);
}
