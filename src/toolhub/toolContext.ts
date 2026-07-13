import { canonicalize } from "../utils/json.js";
import { sha256Hex } from "../utils/hash.js";
import type { ToolDefinition } from "./toolsSchema.js";
import { loadVerifiedToolsConfigSnapshot } from "./toolhubValidators.js";

export const TOOL_CONTEXT_SCHEMA_VERSION = "2026-07-13" as const;

export type ToolContextIntegrityReasonCode =
  | "TOOL_CONTEXT_CONFIG_MISSING"
  | "TOOL_CONTEXT_SIGNATURE_MISSING"
  | "TOOL_CONTEXT_SIGNATURE_INVALID"
  | "TOOL_CONTEXT_SCHEMA_INVALID"
  | "TOOL_CONTEXT_DUPLICATE_TOOL_NAME"
  | "TOOL_CONTEXT_DUPLICATE_IDENTITY"
  | "TOOL_CONTEXT_SERVER_METADATA_CONFLICT";

export interface ToolContextServer {
  serverIdentity: string;
  id: string;
  name: string;
  version: string | null;
  transport: "stdio" | "streamable-http" | "sse" | "http" | null;
}

export interface ToolContextTool {
  toolIdentity: string;
  name: string;
  kind: "native" | "mcp";
  actionClass: ToolDefinition["actionClass"];
  requireExecTicket: boolean;
  serverIdentity: string | null;
}

export interface ToolContextGroup {
  groupIdentity: string;
  kind: "native" | "mcp-server";
  label: string;
  server: ToolContextServer | null;
  tools: ToolContextTool[];
}

export interface ToolHubContextProjection {
  schemaVersion: typeof TOOL_CONTEXT_SCHEMA_VERSION;
  authority: {
    kind: "signed-toolhub-config";
    configSha256: string | null;
  };
  integrity: {
    status: "trusted" | "untrusted";
    signatureValid: boolean;
    reasonCodes: ToolContextIntegrityReasonCode[];
  };
  groups: ToolContextGroup[];
  tools: ToolContextTool[];
  total: number;
  derivedView: true;
  recorded: false;
  proofEligible: false;
  claimBoundary: string;
}

const CLAIM_BOUNDARY = "This read-only view proves only the declared context in the currently signed ToolHub allowlist. It does not discover a live server, prove availability, verify an MCP attestation, or prove an invocation.";

function identity(kind: "native-tool" | "mcp-tool" | "mcp-server", value: unknown): string {
  const hash = sha256Hex(canonicalize({
    domain: `amc.toolhub.${kind}.identity.v1`,
    value
  }));
  if (kind === "mcp-server") return `mcp-server:${hash}`;
  return `tool:${kind === "native-tool" ? "native" : "mcp"}:${hash}`;
}

function untrusted(
  reasonCode: ToolContextIntegrityReasonCode,
  signatureValid: boolean,
  configSha256: string | null
): ToolHubContextProjection {
  return {
    schemaVersion: TOOL_CONTEXT_SCHEMA_VERSION,
    authority: {
      kind: "signed-toolhub-config",
      configSha256
    },
    integrity: {
      status: "untrusted",
      signatureValid,
      reasonCodes: [reasonCode]
    },
    groups: [],
    tools: [],
    total: 0,
    derivedView: true,
    recorded: false,
    proofEligible: false,
    claimBoundary: CLAIM_BOUNDARY
  };
}

function snapshotReason(reason: string | null): ToolContextIntegrityReasonCode {
  if (reason === "tools config missing") return "TOOL_CONTEXT_CONFIG_MISSING";
  if (reason === "tools config signature missing") return "TOOL_CONTEXT_SIGNATURE_MISSING";
  if (reason === "tools config schema invalid") return "TOOL_CONTEXT_SCHEMA_INVALID";
  return "TOOL_CONTEXT_SIGNATURE_INVALID";
}

function compareTools(left: ToolContextTool, right: ToolContextTool): number {
  return left.name.localeCompare(right.name) || left.toolIdentity.localeCompare(right.toolIdentity);
}

export function inspectToolhubContext(workspace: string): ToolHubContextProjection {
  const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
  if (!snapshot.config) {
    return untrusted(snapshotReason(snapshot.reason), snapshot.signatureValid, snapshot.digestSha256);
  }

  const normalizedNames = new Set<string>();
  const toolIdentities = new Set<string>();
  const servers = new Map<string, ToolContextServer>();
  const tools: ToolContextTool[] = [];

  for (const tool of snapshot.config.tools.allowedTools) {
    const normalizedName = tool.name.trim().toLowerCase();
    if (normalizedNames.has(normalizedName)) {
      return untrusted("TOOL_CONTEXT_DUPLICATE_TOOL_NAME", true, snapshot.digestSha256);
    }
    normalizedNames.add(normalizedName);

    const kind = tool.context?.kind ?? "native";
    let serverIdentity: string | null = null;
    if (kind === "mcp") {
      const server = tool.context?.kind === "mcp" ? tool.context.server : null;
      if (!server) {
        return untrusted("TOOL_CONTEXT_SCHEMA_INVALID", true, snapshot.digestSha256);
      }
      serverIdentity = identity("mcp-server", { id: server.id });
      const projectedServer: ToolContextServer = {
        serverIdentity,
        id: server.id,
        name: server.name,
        version: server.version ?? null,
        transport: server.transport ?? null
      };
      const previous = servers.get(server.id);
      if (previous && canonicalize(previous) !== canonicalize(projectedServer)) {
        return untrusted("TOOL_CONTEXT_SERVER_METADATA_CONFLICT", true, snapshot.digestSha256);
      }
      servers.set(server.id, projectedServer);
    }

    const toolIdentity = identity(kind === "mcp" ? "mcp-tool" : "native-tool", {
      name: normalizedName,
      serverId: kind === "mcp" && tool.context?.kind === "mcp" ? tool.context.server.id : null
    });
    if (toolIdentities.has(toolIdentity)) {
      return untrusted("TOOL_CONTEXT_DUPLICATE_IDENTITY", true, snapshot.digestSha256);
    }
    toolIdentities.add(toolIdentity);
    tools.push({
      toolIdentity,
      name: tool.name,
      kind,
      actionClass: tool.actionClass,
      requireExecTicket: tool.requireExecTicket === true,
      serverIdentity
    });
  }

  const nativeTools = tools.filter((tool) => tool.kind === "native").sort(compareTools);
  const groups: ToolContextGroup[] = nativeTools.length === 0 ? [] : [{
    groupIdentity: "tool-group:native",
    kind: "native",
    label: "Native tools",
    server: null,
    tools: nativeTools
  }];

  const serverRows = [...servers.values()].sort((left, right) => (
    left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  ));
  for (const server of serverRows) {
    groups.push({
      groupIdentity: server.serverIdentity,
      kind: "mcp-server",
      label: server.name,
      server,
      tools: tools.filter((tool) => tool.serverIdentity === server.serverIdentity).sort(compareTools)
    });
  }

  const orderedTools = groups.flatMap((group) => group.tools);
  return {
    schemaVersion: TOOL_CONTEXT_SCHEMA_VERSION,
    authority: {
      kind: "signed-toolhub-config",
      configSha256: snapshot.digestSha256
    },
    integrity: {
      status: "trusted",
      signatureValid: true,
      reasonCodes: []
    },
    groups,
    tools: orderedTools,
    total: orderedTools.length,
    derivedView: true,
    recorded: false,
    proofEligible: false,
    claimBoundary: CLAIM_BOUNDARY
  };
}

export class ToolContextIntegrityError extends Error {
  readonly reasonCodes: ToolContextIntegrityReasonCode[];

  constructor(reasonCodes: ToolContextIntegrityReasonCode[]) {
    super(`Tool context integrity failed: ${reasonCodes.join(",")}`);
    this.name = "ToolContextIntegrityError";
    this.reasonCodes = reasonCodes;
  }
}

export function requireTrustedToolhubContext(workspace: string): ToolHubContextProjection {
  const projection = inspectToolhubContext(workspace);
  if (projection.integrity.status !== "trusted") {
    throw new ToolContextIntegrityError(projection.integrity.reasonCodes);
  }
  return projection;
}
