import { z } from "zod";
import type { MountedNativeMcpServer } from "../mcp/nativeMcpClient.js";
import { nativeMcpReceiptProjection, nativeMcpToolNamesProjection } from "../mcp/nativeMcpStatus.js";
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";

const RECEIPT = "amc/native-chat-mcp-receipt";
// Pick the receipt's known public fields (the same projection `_amc/session/mcp` serves).
// Unknown nested fields (including accidental credentials on a future mount object) never cross the channel.
const receiptMessage = z.object({
  type: z.literal(RECEIPT), v: z.literal(1),
  receipt: nativeMcpReceiptProjection,
  toolNames: nativeMcpToolNamesProjection
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

/** One child's observed mount receipts, one per server. Closing a child cannot be undone by late traffic. */
export function createNativeInteractiveMcpView(): { accept(value: unknown): void; settled(): void; render(): string[] } {
  const mounts = new Map<string, ReceiptMessage>();
  const conflicted = new Set<string>();
  let closed = false;
  let refused = 0;
  return {
    accept(value) {
      if (closed || value === null || typeof value !== "object" || (value as { type?: unknown }).type !== RECEIPT) return;
      const parsed = receiptMessage.safeParse(value);
      // A second receipt for one server is not a newer truth; neither copy is shown as mounted.
      if (!parsed.success || mounts.has(parsed.data.receipt.serverId) || conflicted.has(parsed.data.receipt.serverId)) {
        refused++;
        if (parsed.success) { conflicted.add(parsed.data.receipt.serverId); mounts.delete(parsed.data.receipt.serverId); }
        return;
      }
      mounts.set(parsed.data.receipt.serverId, parsed.data);
    },
    settled() { closed = true; },
    render() {
      const lines = refused ? [`MCP mount receipt refused (${refused}): malformed, oversized or duplicate child receipt. That mount's state is unavailable.`] : [];
      if (!mounts.size) return refused ? lines : ["No MCP mount receipt has been received from this child; mounted state is unavailable."];
      for (const { receipt, toolNames } of mounts.values()) {
        lines.push(
          `MCP mount receipt · server ${receipt.serverId} · state ${closed ? "closed (child settled)" : "active at mount"}. This view does not probe current connection health.`,
          `Protocol: ${receipt.protocol.negotiatedVersion} (${receipt.protocol.mode}); catalog digest ${receipt.catalogDigest}.`);
        if (receipt.protocol.serverInfo) lines.push(`Server information (self-reported): ${escapeTerminalControls(receipt.protocol.serverInfo.name)} ${escapeTerminalControls(receipt.protocol.serverInfo.version)}.`);
        if (receipt.auth) {
          lines.push(`Auth receipt at mount: issuer ${escapeTerminalControls(receipt.auth.issuer)}; scopes ${receipt.auth.scopes.map(escapeTerminalControls).join(", ") || "none"}; token expiry ${escapeTerminalControls(receipt.auth.tokenExpiresAt ?? "not reported")}. This is not a current authentication check.`);
        } else lines.push("Auth receipt: none reported for this mount; no authentication claim is inferred.");
        lines.push(`Granted tools: ${toolNames.join(", ")}. Enable or disable tools through an explicit reviewed configuration change.`);
      }
      return lines;
    }
  };
}
