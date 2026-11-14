/**
 * The Node an observation hook command names. process.execPath is the resolved binary, which under Homebrew is a
 * versioned Cellar path (/opt/homebrew/Cellar/node/25.5.0/bin/node) that `brew upgrade node` deletes, silently breaking the
 * hook. A stable link that resolves to that same binary right now (the formula's opt link, else a `node` on PATH) is named
 * instead; with none, process.execPath is kept. Control hooks keep process.execPath (hookIntegration.ts expectedHandler):
 * a broken control hook blocks every action, which is the fail-closed outcome control wants, and an administrator may have
 * copied the exact control handler into managed settings.
 */
import { realpathSync } from "node:fs";
import { delimiter, join, sep } from "node:path";

export interface NodePathDeps {
  readonly execPath: string;
  readonly pathEnv: string | undefined;
  /** The resolved path, or null when it does not exist. */
  readonly realpath: (path: string) => string | null;
}

/** `<prefix>/Cellar/<formula>/<version>/bin/node` → `<prefix>/opt/<formula>/bin/node`. */
function homebrewOptLink(execPath: string): string | null {
  const match = /^(.*)[\\/]Cellar[\\/]([^\\/]+)[\\/][^\\/]+[\\/]bin[\\/]node$/.exec(execPath);
  return match ? join(match[1]!, "opt", match[2]!, "bin", "node") : null;
}

export function stableNodePath(deps: NodePathDeps = defaultNodePathDeps()): string {
  const target = deps.realpath(deps.execPath);
  if (target === null) return deps.execPath;
  const onPath = (deps.pathEnv ?? "").split(delimiter).filter((dir) => dir.length > 0 && !dir.split(sep).includes("Cellar")).map((dir) => join(dir, "node"));
  const candidates = [homebrewOptLink(target), ...onPath].filter((path): path is string => path !== null && path !== target);
  return candidates.find((path) => deps.realpath(path) === target) ?? deps.execPath;
}

function defaultNodePathDeps(): NodePathDeps {
  return {
    execPath: process.execPath,
    pathEnv: process.env.PATH,
    realpath: (path) => {
      try { return realpathSync(path); } catch { return null; }
    }
  };
}
