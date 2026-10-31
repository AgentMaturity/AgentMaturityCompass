import { z } from "zod";
import { isNativeMcpProtocolVersion, MCP_STATELESS_PROTOCOL_VERSION } from "./protocol/version.js";

/**
 * The public projection of a mounted MCP server: the fields `/mcp` shows in chat, and
 * the only ones `_amc/session/mcp` returns to an SDK caller. zod objects drop unknown
 * keys, so env values, header or OAuth secrets and config bytes on a future mount or
 * status object never cross; a value outside these bounds is refused, never echoed.
 */
export const NATIVE_MCP_STATUS_FORMAT = "amc-mcp-status-v1";
const text = (max: number) => z.string().min(1).max(max);
const protocol = z.object({
  negotiatedVersion: text(32).refine(isNativeMcpProtocolVersion),
  mode: z.enum(["stateless", "legacy"]),
  serverInfo: z.object({ name: z.string().max(256), version: z.string().max(256) }).nullable()
}).refine(value => value.mode === (value.negotiatedVersion === MCP_STATELESS_PROTOCOL_VERSION ? "stateless" : "legacy"));
export const nativeMcpReceiptProjection = z.object({
  serverId: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  catalogDigest: z.string().regex(/^[a-f0-9]{64}$/),
  protocol,
  auth: z.object({ issuer: text(2_048), scopes: z.array(text(256)).max(256), tokenExpiresAt: text(128).nullable() }).nullable()
});
export const nativeMcpToolNamesProjection = z.array(z.string().regex(/^mcp_[A-Za-z0-9_-]{1,32}_[a-f0-9]{16}$/)).min(1).max(256);
const serverStatus = nativeMcpReceiptProjection.extend({
  toolNames: nativeMcpToolNamesProjection,
  /** Local registration of this mount's grants, not remote health or execution approval. */
  state: z.enum(["registered", "unavailable"]),
  execution: z.literal("not-evaluated")
});
type NativeMcpServerStatus = z.infer<typeof serverStatus>;
const statusReply = z.object({
  format: z.literal(NATIVE_MCP_STATUS_FORMAT),
  /** Null: this session has no MCP binding. */
  servers: z.array(serverStatus).nullable(),
  /** Entries that failed the projection; their state is unavailable, never guessed. */
  refused: z.number().int().min(0)
}).strict();
export type NativeMcpStatus = z.infer<typeof statusReply>;

/** Runtime side: project the session's bound status; a malformed entry is counted, not shown. */
export function projectNativeMcpStatus(mcp: readonly unknown[] | null): NativeMcpStatus {
  if (mcp === null) return { format: NATIVE_MCP_STATUS_FORMAT, servers: null, refused: 0 };
  const servers: NativeMcpServerStatus[] = [];
  let refused = 0;
  for (const entry of mcp) {
    const parsed = serverStatus.safeParse(entry);
    if (parsed.success) servers.push(parsed.data); else refused++;
  }
  return { format: NATIVE_MCP_STATUS_FORMAT, servers, refused };
}

/** SDK side: the peer's reply is untrusted; admit only the projected fields, or undefined. */
export function admitNativeMcpStatus(value: unknown): NativeMcpStatus | undefined {
  const parsed = statusReply.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
