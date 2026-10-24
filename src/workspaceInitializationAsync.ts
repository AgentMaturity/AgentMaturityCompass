import { initWorkspace, type InitWorkspaceOptions } from "./workspace.js";
import { keysetDeclared } from "./keys/keyset.js";
import { captureWorkspaceColdOrgPrerequisites } from "./workspaceColdOrgPrerequisites.js";
export { WorkspaceInitializationPartialError } from "./workspaceColdOrgPrerequisites.js";

/** Missing mature prerequisites await checked signatures before the legacy initializer reaches their sync branches.
 * Fresh workspaces keep their existing key/bootstrap order. Published prerequisites remain on later failure.
 */
export async function initWorkspaceAsync(input: InitWorkspaceOptions = {}): Promise<ReturnType<typeof initWorkspace>> {
  const options = structuredClone(input), workspace = options.workspacePath ?? process.cwd();
  options.workspacePath = workspace;
  return keysetDeclared(workspace) ? captureWorkspaceColdOrgPrerequisites(workspace, options.agentId).initializeWorkspace(options) : initWorkspace(options);
}
