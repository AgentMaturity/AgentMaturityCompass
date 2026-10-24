import { initWorkspace, type InitWorkspaceOptions } from "./workspace.js";
import { adaptersConfigPath, initAdaptersConfigAsync } from "./adapters/adapterConfigStore.js";
import { keysetDeclared } from "./keys/keyset.js";
import { pathExists } from "./utils/fs.js";

/**
 * Maintained async callers prepare a missing adapter pair before the legacy initializer can reach its sync branch.
 * Fresh workspaces keep the original key/bootstrap order. This is not an atomic whole-workspace initializer:
 * a published adapter pair remains if a later legacy initializer phase refuses.
 */
export class WorkspaceInitializationPartialError extends Error {
  readonly code = "WORKSPACE_INITIALIZATION_PARTIAL";
  readonly publishedPaths = Object.freeze([".amc/adapters.yaml", ".amc/adapters.yaml.sig"]);
  constructor(cause: unknown) {
    super("adapters config was published before a later workspace initialization phase failed", { cause });
    this.name = "WorkspaceInitializationPartialError";
  }
}
export async function initWorkspaceAsync(input: InitWorkspaceOptions = {}): Promise<ReturnType<typeof initWorkspace>> {
  const options = structuredClone(input), workspace = options.workspacePath ?? process.cwd();
  options.workspacePath = workspace; // Pin the selected default directory before the first await.
  let adaptersPublished = false;
  if (keysetDeclared(workspace) && !pathExists(adaptersConfigPath(workspace))) { await initAdaptersConfigAsync(workspace); adaptersPublished = true; }
  try { return initWorkspace(options); }
  catch (error) { if (adaptersPublished) throw new WorkspaceInitializationPartialError(error); throw error; }
}
