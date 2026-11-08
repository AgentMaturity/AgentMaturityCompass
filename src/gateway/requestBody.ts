import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Gateway body reads (LIVE-RUNTIME-01, D-R1). Request bodies are capped: an agent's request is the one thing a client
 * controls, and an uncapped read let any client that reached the port exhaust memory. Upstream responses are read whole
 * as before, because large legitimate non-streaming answers (embedding batches, base64 images) must keep working.
 */

/** The cap when `startGateway` gets none: long LLM contexts exceed Studio's 1 MiB. */
export const DEFAULT_GATEWAY_MAX_REQUEST_BYTES = 8 * 1024 * 1024;

/** An upstream response, read whole. */
export async function readAll(stream: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * The request body, or null once it passes `maxBytes`. Reading stops at that chunk and nothing past the cap is kept;
 * the caller answers with `refuseOversizedRequest`, which closes the connection after the 413.
 */
export function readBoundedBody(req: IncomingMessage, maxBytes: number): Promise<Buffer | null> {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const onData = (chunk: Buffer | string): void => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        req.off("data", onData);
        req.off("end", onEnd);
        req.pause();
        resolvePromise(null);
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = (): void => resolvePromise(Buffer.concat(chunks));
    req.on("data", onData);
    req.once("end", onEnd);
    req.once("error", rejectPromise);
  });
}

/**
 * Audit an oversized request (GATEWAY_PAYLOAD_TOO_LARGE, severity MED) and answer 413 with the fixed body; the connection
 * closes after it, so the rest of the body is never read and nothing is forwarded.
 */
export function refuseOversizedRequest(req: IncomingMessage, res: ServerResponse, input: {
  requestId: string;
  agentId: string | null;
  maxBytes: number;
  append: (row: Record<string, unknown>) => void;
}): void {
  input.append({ auditType: "GATEWAY_PAYLOAD_TOO_LARGE", severity: "MED", request_id: input.requestId, agentId: input.agentId, maxRequestBytes: input.maxBytes });
  res.statusCode = 413;
  res.setHeader("content-type", "application/json");
  res.setHeader("connection", "close");
  res.end(JSON.stringify({ error: "payload too large" }), () => req.destroy());
}
