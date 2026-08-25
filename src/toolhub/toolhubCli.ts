import { initToolsConfig, verifyToolsConfigSignature } from "./toolhubValidators.js";
import { PROTECTED_WORKSPACE_PATHS } from "./protectedPaths.js";
import {
  inspectToolhubContext,
  requireTrustedToolhubContext,
  type ToolContextTool,
  type ToolHubContextProjection
} from "./toolContext.js";

export function initToolhubConfig(workspace: string): { configPath: string; sigPath: string } {
  return initToolsConfig(workspace);
}

export function verifyToolhubConfig(workspace: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  return verifyToolsConfigSignature(workspace);
}

export function inspectToolhubContextForCli(workspace: string): ToolHubContextProjection {
  return inspectToolhubContext(workspace);
}

export function listToolhubTools(workspace: string): ToolContextTool[] {
  return requireTrustedToolhubContext(workspace).tools;
}

export function formatToolhubContextText(projection: ToolHubContextProjection): string {
  if (projection.integrity.status !== "trusted") {
    return [
      "Tool context integrity: untrusted",
      `Reasons: ${projection.integrity.reasonCodes.join(",")}`,
      projection.claimBoundary
    ].join("\n");
  }
  const lines = [`Tool context integrity: trusted (${projection.total} tools)`];
  for (const group of projection.groups) {
    const heading = group.kind === "native"
      ? "Native tools"
      : `MCP server: ${group.server?.name ?? group.label} (${group.server?.id ?? "unknown"})`;
    lines.push("", heading);
    for (const tool of group.tools) {
      lines.push(`- ${tool.name} (${tool.actionClass}) execTicket=${tool.requireExecTicket ? "required" : "no"} id=${tool.toolIdentity}`);
    }
  }
  // The floor, printed alongside the configured policy.
  //
  // These paths are refused before any allow or deny list is consulted, so
  // they are not visible anywhere in `tools.yaml` as the thing doing the work.
  // An operator auditing their configuration was previously reading a complete
  // list of the rules they control and an incomplete list of the rules in
  // force.
  lines.push("", "Always denied, whatever the signed config says:");
  for (const entry of PROTECTED_WORKSPACE_PATHS) {
    lines.push(`- ${entry.glob} — ${entry.reason}`);
  }

  lines.push("", projection.claimBoundary);
  return lines.join("\n");
}
