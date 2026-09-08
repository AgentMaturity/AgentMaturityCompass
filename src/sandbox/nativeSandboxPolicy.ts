import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { findToolDefinition, loadVerifiedToolsConfigSnapshot } from "../toolhub/toolhubValidators.js";
import type { SandboxPolicy } from "./sandboxTypes.js";

function within(root: string, path: string): boolean {
  const suffix = relative(root, path);
  return suffix === "" || (!isAbsolute(suffix) && suffix !== ".." && !suffix.startsWith(`..${sep}`));
}

/** Exact relative directories only; path globs keep their separate per-call meaning. */
function writableDirectory(workspace: string, path: string): string {
  if (/[\x00-\x1f\x7f*?\[\]{}\\]/.test(path) || isAbsolute(path)) throw new Error("Linux shell writableDirectories require exact relative directories without wildcards.");
  const resolved = resolve(workspace, path);
  if (!within(workspace, resolved)) throw new Error("Linux shell scopes cannot escape the selected workspace.");
  return resolved;
}

export function nativeShellSandboxPolicy(workspace: string, timeoutMs: number, signal?: AbortSignal, scrubValues?: readonly string[], expectedPolicySha256?: string): SandboxPolicy {
  let root: string;
  try { root = realpathSync(workspace); }
  catch { throw new Error("Linux shell requires an existing selected workspace."); }
  const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
  if (!snapshot.signatureValid || !snapshot.config || !snapshot.digestSha256) throw new Error("Linux shell requires a verifiable signed tools policy.");
  if (expectedPolicySha256 !== undefined && snapshot.digestSha256 !== expectedPolicySha256) throw new Error("Signed tools policy changed after shell admission; review and retry the call.");
  const definition = findToolDefinition(snapshot.config, "bash");
  if (!definition) throw new Error("Linux shell is absent from the signed tools policy.");
  // Never migrate allow.paths into mounts. The generic validator still
  // requires actual path arguments whenever ordinary path rules are declared.
  const writableRoots = (definition.nativeSandbox?.writableDirectories ?? []).map(path => {
    const logical = writableDirectory(root, path);
    let real: string;
    try {
      real = realpathSync(logical);
      if (logical !== real || !within(root, real) || !statSync(real).isDirectory()) throw new Error("invalid directory");
    } catch { throw new Error("Linux shell write grants must name existing nonsymlink workspace directories."); }
    if (within(resolve(root, ".amc"), real)) throw new Error("AMC authority paths cannot be granted to a shell.");
    return real;
  });
  return { writableRoots: [...new Set(writableRoots)], timeoutMs, network: "deny", signal, scrubValues,
    sourcePolicySha256: snapshot.digestSha256 };
}
