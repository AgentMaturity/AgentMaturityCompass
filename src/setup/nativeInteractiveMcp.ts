import { z } from "zod";
import type { MountedNativeMcpServer } from "../mcp/nativeMcpClient.js";
import { isNativeMcpProtocolVersion, MCP_STATELESS_PROTOCOL_VERSION } from "../mcp/protocol/version.js";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";

const RECEIPT = "amc/native-chat-mcp-receipt";
const text = (max: number) => z.string().min(1).max(max);
const protocol = z.object({
  negotiatedVersion: text(32).refine(isNativeMcpProtocolVersion),
  mode: z.enum(["stateless", "legacy"]),
  serverInfo: z.object({ name: z.string().max(256), version: z.string().max(256) }).nullable()
}).refine(value => value.mode === (value.negotiatedVersion === MCP_STATELESS_PROTOCOL_VERSION ? "stateless" : "legacy"));
// Pick the receipt's known public fields. Unknown nested fields (including
// accidental credentials on a future mount object) never cross the channel.
const receiptMessage = z.object({
  type: z.literal(RECEIPT), v: z.literal(1),
  receipt: z.object({
    serverId: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
    catalogDigest: z.string().regex(/^[a-f0-9]{64}$/),
    protocol,
    auth: z.object({ issuer: text(2_048), scopes: z.array(text(256)).max(256), tokenExpiresAt: text(128).nullable() }).nullable()
  }),
  toolNames: z.array(z.string().regex(/^mcp_[A-Za-z0-9_-]{1,32}_[a-f0-9]{16}$/)).min(1).max(256)
});
type ReceiptMessage = z.infer<typeof receiptMessage>;

/** Presentation of an actual mount, never a second discovery or authorization path. */
export function reportNativeInteractiveMcpMount(mount: Pick<MountedNativeMcpServer, "receipt" | "toolNames">,
  progress: (text: string) => void): void {
  const parsed = receiptMessage.safeParse({ type: RECEIPT, v: 1, receipt: mount.receipt, toolNames: mount.toolNames });
  if (!parsed.success) return;
  try {
    progress(`Mounted reviewed MCP tools for this run: ${parsed.data.toolNames.join(", ")}. Signed allowlist, approval gate and budgets remain in force.`);
  } catch { /* A lost presentation sink cannot change execution. */ }
  try {
    if (process.connected && typeof process.send === "function") process.send(parsed.data, () => {});
  } catch { /* A lost chat channel cannot change the mounted grant or its recorded outcome. */ }
}

/** One child's last observed mount receipt. Closing a child cannot be undone by late traffic. */
export function createNativeInteractiveMcpView(): { accept(value: unknown): void; settled(): void; render(): string[] } {
  let current: ReceiptMessage | null = null;
  let closed = false;
  let refused = false;
  return {
    accept(value) {
      if (closed || value === null || typeof value !== "object" || (value as { type?: unknown }).type !== RECEIPT) return;
      const parsed = receiptMessage.safeParse(value);
      current = parsed.success ? parsed.data : null;
      refused = !parsed.success;
    },
    settled() { closed = true; },
    render() {
      if (refused) return ["MCP mount receipt refused: malformed or oversized child receipt. Mounted state is unavailable."];
      if (!current) return ["No MCP mount receipt has been received from this child; mounted state is unavailable."];
      const { receipt, toolNames } = current;
      const lines = [
        `MCP mount receipt · server ${receipt.serverId} · state ${closed ? "closed (child settled)" : "active at mount"}. This view does not probe current connection health.`,
        `Protocol: ${receipt.protocol.negotiatedVersion} (${receipt.protocol.mode}); catalog digest ${receipt.catalogDigest}.`
      ];
      if (receipt.protocol.serverInfo) lines.push(`Server information (self-reported): ${escapeTerminalControls(receipt.protocol.serverInfo.name)} ${escapeTerminalControls(receipt.protocol.serverInfo.version)}.`);
      if (receipt.auth) {
        lines.push(`Auth receipt at mount: issuer ${escapeTerminalControls(receipt.auth.issuer)}; scopes ${receipt.auth.scopes.map(escapeTerminalControls).join(", ") || "none"}; token expiry ${escapeTerminalControls(receipt.auth.tokenExpiresAt ?? "not reported")}. This is not a current authentication check.`);
      } else lines.push("Auth receipt: none reported for this mount; no authentication claim is inferred.");
      lines.push(`Granted tools: ${toolNames.join(", ")}. Enable or disable tools through an explicit reviewed configuration change.`);
      return lines;
    }
  };
}
