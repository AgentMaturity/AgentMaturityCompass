import type { IncomingMessage, ServerResponse } from "node:http";

/** Relay an upstream body while retaining the bytes needed for the gateway receipt. */
export async function relayGatewayResponse(
  upstream: IncomingMessage,
  downstream: ServerResponse,
  receipt: { requestId: string; requestReceipt: string; monitorPubFingerprint: string }
): Promise<Buffer> {
  if (downstream.destroyed || downstream.writableEnded) {
    upstream.destroy();
    throw new Error("Gateway downstream closed before response relay");
  }
  downstream.statusCode = upstream.statusCode ?? 500;
  for (const [key, value] of Object.entries(upstream.headers)) {
    if (value !== undefined && key.toLowerCase() !== "content-length") downstream.setHeader(key, value);
  }
  const trailer = upstream.headers["trailer"];
  downstream.setHeader("Trailer", typeof trailer === "string" && trailer.trim() ? `${trailer}, x-amc-receipt-trailer` : "x-amc-receipt-trailer");
  downstream.setHeader("x-amc-request-id", receipt.requestId);
  downstream.setHeader("x-amc-request-receipt", receipt.requestReceipt);
  downstream.setHeader("x-amc-monitor-pub-fpr", receipt.monitorPubFingerprint);
  downstream.setHeader("x-amc-receipt-mode", "trailer");

  const cancelUpstream = (): void => {
    if (!downstream.writableFinished && !upstream.readableEnded) {
      upstream.destroy(new Error("Gateway downstream closed during response relay"));
    }
  };
  downstream.once("close", cancelUpstream);
  try {
    const chunks: Buffer[] = [];
    // Async iteration rejects premature stream closure and owns its error listeners.
    for await (const chunk of upstream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
      chunks.push(bytes);
      downstream.write(bytes);
    }
    if (downstream.destroyed || downstream.writableEnded) throw new Error("Gateway downstream closed before response settlement");
    return Buffer.concat(chunks);
  } finally {
    downstream.off("close", cancelUpstream);
  }
}
