import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { findToolDefinition, loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import type { SandboxPolicy } from "./sandboxTypes.js";

function within(root: string, path: string): boolean {
  const suffix = relative(root, path);
  return suffix === "" || (!isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${sep}`));
}

/** Directory grants are exact; wildcard/subpath exceptions are never widened into a mount. */
function directoryPattern(workspace: string, pattern: string): string {
  if (!pattern.endsWith("/**")) throw new Error("Linux shell write scopes require explicit directory/** patterns.");
  const path = pattern.slice(0, -3);
  if (/[\x00-\x1f\x7f*?\[\]{}\\]/.test(path) || isAbsolute(path)) throw new Error("Linux shell scopes require relative directory/** patterns without wildcard ancestors.");
  const resolved = resolve(workspace, path);
  if (!within(workspace, resolved)) throw new Error("Linux shell scopes cannot escape the selected workspace.");
  return resolved;
}

export function nativeShellSandboxPolicy(workspace: string, timeoutMs: number, signal?: AbortSignal, scrubValues?: readonly string[]): SandboxPolicy {
  const root = realpathSync(workspace);
  const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
  if (!snapshot.signatureValid || !snapshot.config || !snapshot.digestSha256) throw new Error("Linux shell requires a verifiable signed tools policy.");
  const definition = findToolDefinition(snapshot.config, "bash");
  if (!definition) throw new Error("Linux shell is absent from the signed tools policy.");
  // A bash grant is not borrowed from fs.write or fs.edit. Without its own
  // explicit paths, the shell has no host write grant at all.
  const writableRoots = (definition.allow?.paths ?? []).map(pattern => {
    const logical = directoryPattern(root, pattern);
    const real = realpathSync(logical);
    if (logical !== real || !within(root, real) || !statSync(real).isDirectory()) throw new Error("Linux shell write grants must name existing nonsymlink workspace directories.");
    if (within(resolve(root, ".amc"), real)) throw new Error("AMC authority paths cannot be granted to a shell.");
    return real;
  });
  for (const pattern of definition.deny?.paths ?? []) {
    const denied = directoryPattern(root, pattern);
    if (writableRoots.some(grant => within(grant, denied) || within(denied, grant))) {
      throw new Error("Linux shell cannot enforce path exceptions inside a writable mount; narrow the signed directory grants.");
    }
  }
  return { writableRoots: [...new Set(writableRoots)], timeoutMs, network: "deny", signal, scrubValues,
    sourcePolicySha256: snapshot.digestSha256 };
}
