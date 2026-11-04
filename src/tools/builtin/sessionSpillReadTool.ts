import { z } from "zod";
import { readNativeSessionEvents } from "../../session/readNativeSessionEvents.js";
import { MAX_SPILL_READ_BYTES, readSessionSpillRange } from "../../session/spill/spillRead.js";
import { DEFAULT_SPILL_POLICY, extractSpillRef } from "../../session/spill/spillTypes.js";
import { defineTool } from "../toolRegistry.js";
import type { ToolDefinition } from "../toolTypes.js";
import { sessionIdResolver, type SessionIdSource } from "./nativeToolBreadth/signedSessionRecords.js";

const argsSchema = z.object({
  locator: z.string().min(1),
  offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  limit: z.number().int().min(1).max(MAX_SPILL_READ_BYTES).default(4_096)
}).strict();
const UTF8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Read authenticated retained bytes owned by the session bound at call time. */
export function sessionSpillReadTool(options: {
  readonly workspace: string;
  readonly agentId: string;
  readonly sessionId: SessionIdSource;
}): ToolDefinition {
  const currentSession = sessionIdResolver(options.sessionId);
  return defineTool({
    name: "session.spill_read",
    actionClass: "READ_ONLY",
    description: "Read a byte range from retained output committed by the current session. Returns readable UTF-8 content, or base64 when the range is not valid UTF-8. Offset and limit count bytes.",
    parameters: {
      type: "object",
      properties: {
        locator: { type: "string", minLength: 1, description: "complete amc-spill locator from this session's retained-output preview" },
        offset: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER, description: "zero-based byte offset (default 0)" },
        limit: { type: "integer", minimum: 1, maximum: MAX_SPILL_READ_BYTES, description: "maximum bytes to return (default 4096); reduce if JSON encoding exceeds the inline cap" }
      },
      required: ["locator"],
      additionalProperties: false
    },
    body: async execution => {
      const args = argsSchema.parse(execution.arguments);
      if (execution.workspace !== options.workspace || execution.agentId !== options.agentId) {
        throw new Error("Spill read execution does not match the composed workspace and agent identity.");
      }
      const sessionId = currentSession();
      const events = readNativeSessionEvents(options.workspace, sessionId);
      if (!events.some(row => row.event_type === "tool/spill-commitment" && row.session_id === sessionId
        && extractSpillRef(row.meta_json)?.locator === args.locator)) {
        throw new Error("No tool/spill-commitment in the current session names this locator.");
      }
      // The complete current history reaches the existing verifier, so selecting
      // a commitment cannot hide a conflicting or unauthentic result reference.
      const { contentBase64, ...range } = readSessionSpillRange({ workspace: options.workspace, events, ...args });
      const raw = Buffer.from(contentBase64, "base64");
      let content = contentBase64;
      let encoding: "utf8" | "base64" = "base64";
      try {
        content = UTF8.decode(raw);
        encoding = "utf8";
      } catch {
        // A byte range can split a UTF-8 character; base64 preserves exact bytes.
      } finally { raw.fill(0); }
      const output = JSON.stringify({ ...range, content, encoding });
      if (Buffer.byteLength(output) > DEFAULT_SPILL_POLICY.maxInlineBytes) {
        throw new Error("Spill read response exceeds the inline cap; request a smaller limit.");
      }
      return { ok: true, output };
    }
  });
}
