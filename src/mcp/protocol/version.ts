/**
 * MCP protocol eras (spec 2026-07-28, basic/versioning). "Stateless" is the
 * 2026-07-28 per-request-metadata protocol; "legacy" is the initialize-handshake
 * protocol of 2025-11-25 and earlier, still spoken through the installed SDK.
 * Section references are to https://modelcontextprotocol.io/specification/2026-07-28.
 */
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";

export const MCP_STATELESS_PROTOCOL_VERSION = "2026-07-28";
export const MCP_LEGACY_PROTOCOL_VERSIONS: readonly string[] = Object.freeze([...SUPPORTED_PROTOCOL_VERSIONS]);
export const MCP_CLIENT_INFO = Object.freeze({ name: "amc-governed-native-tools", version: "1.0.0" });
export const MCP_PROTOCOL_VERSION_META = "io.modelcontextprotocol/protocolVersion";

export type NativeMcpProtocolMode = "stateless" | "legacy";
export interface NativeMcpServerInfo { readonly name: string; readonly version: string }
export interface NativeMcpProtocolReceipt {
  readonly negotiatedVersion: string;
  readonly mode: NativeMcpProtocolMode;
  /** Self-reported by the server and unverified (basic/index §_meta); recorded, never used for a decision. */
  readonly serverInfo: NativeMcpServerInfo | null;
}

/** Fixed local diagnostics for a protocol refusal; never server text. */
export class NativeMcpProtocolRefused extends Error {
  constructor(message: string) { super(message); this.name = "NativeMcpProtocolRefused"; }
}

export function isNativeMcpProtocolVersion(value: unknown): value is string {
  return typeof value === "string" && (value === MCP_STATELESS_PROTOCOL_VERSION || MCP_LEGACY_PROTOCOL_VERSIONS.includes(value));
}

/** basic/index §_meta: version and capabilities are required on every request; AMC declares no client capabilities. */
export function statelessRequestMeta(): Record<string, unknown> {
  return { [MCP_PROTOCOL_VERSION_META]: MCP_STATELESS_PROTOCOL_VERSION,
    "io.modelcontextprotocol/clientInfo": { ...MCP_CLIENT_INFO },
    "io.modelcontextprotocol/clientCapabilities": {} };
}

/** basic/index §Error Codes: HeaderMismatch, MissingRequiredClientCapability, UnsupportedProtocolVersion. */
export function isModernMcpErrorCode(code: unknown): boolean {
  return code === -32020 || code === -32021 || code === -32022;
}

export function nativeMcpServerInfo(value: unknown): NativeMcpServerInfo | null {
  if (!value || typeof value !== "object") return null;
  const { name, version } = value as Record<string, unknown>;
  const safe = (text: unknown) => typeof text === "string" && text.length <= 256 && !/[\x00-\x1f\x7f]/.test(text);
  return safe(name) && safe(version) ? { name: name as string, version: version as string } : null;
}

/**
 * basic/index §ResultType: an absent resultType from an earlier server means
 * complete; any other value than complete or input_required is invalid.
 */
export function nativeMcpResultType(result: Record<string, unknown>): "complete" | "input_required" {
  const type = result.resultType;
  if (type === undefined || type === "complete") return "complete";
  if (type === "input_required") return "input_required";
  throw new NativeMcpProtocolRefused("MCP result has an unrecognized resultType; it was refused.");
}

export type NativeMcpDiscoverOutcome =
  | { readonly kind: "stateless"; readonly serverInfo: NativeMcpServerInfo | null }
  | { readonly kind: "legacy" }
  | { readonly kind: "refused"; readonly reason: string };

/**
 * server/discover and transports/stdio §Backward Compatibility: a DiscoverResult
 * or a recognized modern error identifies a modern server; anything else is
 * legacy. A result without supportedVersions is not a DiscoverResult.
 */
export function classifyNativeMcpDiscover(response: { readonly result?: Record<string, unknown>; readonly errorCode?: number }): NativeMcpDiscoverOutcome {
  if (response.errorCode !== undefined) {
    return isModernMcpErrorCode(response.errorCode)
      ? { kind: "refused", reason: `MCP server speaks a modern protocol but not ${MCP_STATELESS_PROTOCOL_VERSION}; no compatible version was negotiated.` }
      : { kind: "legacy" };
  }
  const result = response.result ?? {};
  const versions = result.supportedVersions;
  if (!Array.isArray(versions)) return { kind: "legacy" };
  if (versions.length > 32 || versions.some(version => typeof version !== "string") || nativeMcpResultType(result) !== "complete") {
    return { kind: "refused", reason: "MCP server/discover returned an invalid result; it was refused." };
  }
  if (!versions.includes(MCP_STATELESS_PROTOCOL_VERSION)) {
    return { kind: "refused", reason: `MCP server does not support ${MCP_STATELESS_PROTOCOL_VERSION}; no compatible version was negotiated.` };
  }
  const meta = result._meta as Record<string, unknown> | undefined;
  return { kind: "stateless", serverInfo: nativeMcpServerInfo(meta?.["io.modelcontextprotocol/serverInfo"]) };
}
