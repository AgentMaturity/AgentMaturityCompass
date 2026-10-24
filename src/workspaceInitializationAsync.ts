import { resolve } from "node:path";
import { captureMatureWorkspaceInitialization } from "./workspaceMatureInitialization.js";
import { initWorkspace, type InitWorkspaceOptions } from "./workspace.js";
import { keysetDeclared } from "./keys/keyset.js";
import { captureWorkspaceColdOrgPrerequisites } from "./workspaceColdOrgPrerequisites.js";
export { WorkspaceInitializationPartialError } from "./workspaceColdOrgPrerequisites.js";

/** Selected mature workspaces retain original inputs through cold/core/late signing stages.
 * Fresh, unsigned and unsupported tails keep their existing workspace spelling and entry recipe.
 */
export async function initWorkspaceAsync(input: InitWorkspaceOptions = {}): Promise<ReturnType<typeof initWorkspace>> {
  const options = structuredClone(input), workspace = options.workspacePath ?? process.cwd();
  options.workspacePath = workspace;
  const matureWorkspace = resolve(workspace);
  const mature = captureMatureWorkspaceInitialization(matureWorkspace, { ...options, workspacePath: matureWorkspace });
  if (mature !== null) return mature.initialize();
  return keysetDeclared(workspace) ? captureWorkspaceColdOrgPrerequisites(workspace, options.agentId).initializeWorkspace(options) : initWorkspace(options);
}
