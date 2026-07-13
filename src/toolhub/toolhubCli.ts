import { initToolsConfig, verifyToolsConfigSignature } from "./toolhubValidators.js";
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
  lines.push("", projection.claimBoundary);
  return lines.join("\n");
}
