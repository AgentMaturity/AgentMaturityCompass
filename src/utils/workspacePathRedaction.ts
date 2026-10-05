import { resolve } from "node:path";

/** Preserve native path resolution and return outside-workspace paths unchanged. */
export function redactWorkspacePath(path: string, workspace: string): string {
  const root = resolve(workspace);
  const full = resolve(path);
  if (full === root) return "$WORKSPACE";
  if (full.startsWith(`${root}/`)) return `$WORKSPACE/${full.slice(root.length + 1)}`;
  return path;
}

/** Preserve the existing falsy-path behavior before resolving the workspace. */
export function redactNullableWorkspacePath(path: string | null, workspace: string): string | null {
  if (!path) return null;
  return redactWorkspacePath(path, workspace);
}
