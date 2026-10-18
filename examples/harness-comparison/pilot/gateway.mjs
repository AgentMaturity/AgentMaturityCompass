// One loopback model endpoint per pilot trial, shared by every target's binding. It authenticates the harness with a
// per-trial token, serializes requests, enforces the lane's request and token limits and records request and response
// SHA-256 and the provider's own usage. In the scripted lane it answers from `respond` and calls no model at all.
// It observes only calls routed here; containment of the harness is the container's or the OS's, never this file's.
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const usageFrom = (raw, contentType) => {
  let usage;
  if (contentType.includes("text/event-stream")) {
    for (const line of raw.toString("utf8").split(/\r?\n/)) {
      if (!line.startsWith("data:") || line.slice(5).trim() === "[DONE]") continue;
      try { const event = JSON.parse(line.slice(5)); if (event.usage) usage = event.usage; } catch { /* the harness sees the raw stream */ }
    }
  } else { try { usage = JSON.parse(raw.toString("utf8")).usage; } catch { /* no invented accounting */ } }
  return Number.isSafeInteger(usage?.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isSafeInteger(usage?.completion_tokens) && usage.completion_tokens >= 0
    ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens } : null;
};

/**
 * @param lane the comparison lane (settings.maxRequests, settings.maxOutputTokens, settings.temperature, budgets)
 * @param upstream { chatUrl, headers } for live and local lanes; omitted for the scripted lane
 * @param respond (body) => { status, contentType, raw } for the scripted lane only
 * @param pricing { inputPerMillionUsd, outputPerMillionUsd, sourceUrl, asOf } from Sid's published rate, live lanes only
 */
export async function startGateway({ lane, upstream, respond, pricing, signal }) {
  const { maxRequests, maxOutputTokens, temperature } = lane.settings;
  const tokenLimit = lane.budgets.maxTokens ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 400 || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1) throw new Error("The pilot lane needs finite request and output limits");
  if (!respond && (!Number.isFinite(temperature) || !upstream?.chatUrl)) throw new Error("A model lane needs an upstream and an explicit temperature");
  const token = randomBytes(24).toString("base64url"), requests = [];
  let active = false, inputTokens = 0, outputTokens = 0, missingUsage = false;
  const server = createServer(async (req, res) => {
    const refuse = (status, message) => { if (!res.headersSent) res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { message } })); };
    if (req.method !== "POST" || !/^\/v1\/chat\/completions$/.test(req.url ?? "") || req.headers.authorization !== `Bearer ${token}`) { refuse(403, "Unapproved pilot endpoint"); return; }
    if (active || missingUsage || requests.length >= maxRequests || inputTokens + outputTokens >= tokenLimit || signal?.aborted) { refuse(429, "Pilot request or usage bound reached"); return; }
    active = true;
    const record = { index: requests.length, forwarded: false, complete: false, status: null, requestSha256: null, responseSha256: null, usage: null };
    try {
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 4 * 1024 * 1024) throw new Error("Request exceeds four MiB"); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!Array.isArray(body.messages) || body.model !== lane.model) throw new Error("Model or message contract mismatch");
      if (!respond) {
        body.temperature = temperature;
        body.max_tokens = Math.min(maxOutputTokens, tokenLimit - inputTokens - outputTokens);
        delete body.max_completion_tokens;
        if (body.stream) body.stream_options = { include_usage: true };
      }
      const encoded = JSON.stringify(body); record.requestSha256 = sha256(encoded);
      requests.push(record); record.forwarded = true;
      let status, contentType, raw;
      if (respond) ({ status, contentType, raw } = respond(body));
      else {
        const response = await fetch(upstream.chatUrl, { method: "POST", redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(Math.min(lane.budgets.timeoutMs, 180_000)), ...(signal ? [signal] : [])]),
          headers: { "content-type": "application/json", ...upstream.headers }, body: encoded });
        status = response.status; contentType = response.headers.get("content-type") ?? "application/json";
        const parts = []; let size = 0;
        for await (const chunk of response.body ?? []) { size += chunk.length; if (size > 8 * 1024 * 1024) throw new Error("Model response exceeds eight MiB"); parts.push(Buffer.from(chunk)); }
        raw = Buffer.concat(parts);
      }
      record.status = status; record.responseSha256 = sha256(raw); record.complete = true;
      if (!respond) {
        record.usage = status >= 200 && status < 300 ? usageFrom(raw, contentType) : null;
        if (record.usage) { inputTokens += record.usage.inputTokens; outputTokens += record.usage.outputTokens; } else missingUsage = true;
      }
      res.writeHead(status, { "content-type": contentType }); res.end(raw);
    } catch (error) {
      record.error = error instanceof Error ? error.message.slice(0, 200) : "forwarding failed"; missingUsage = true;
      refuse(502, "The bounded model request did not complete");
    } finally { active = false; }
  });
  await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  const port = server.address().port;
  return { port, origin: `http://127.0.0.1:${port}`, token, requests,
    observations() {
      const called = requests.some((row) => row.complete && row.status >= 200 && row.status < 300);
      const result = { schemaVersion: "2026-09-08", modelExecution: { modelCalled: called, source: "adapter-observation",
        evidenceRef: respond ? "adapter stdout gateway.requests: a scripted endpoint answered; no model was called" : "adapter stdout gateway.requests with request/response SHA-256; the backend identity is operator-declared" } };
      if (respond || missingUsage || !requests.some((row) => row.usage)) return result;
      result.usage = { inputTokens, outputTokens, cacheReadTokens: null, cacheWriteTokens: null, source: "provider-response", evidenceRef: "adapter stdout gateway.requests[].usage" };
      if (pricing) result.cost = { amountUsd: (inputTokens * pricing.inputPerMillionUsd + outputTokens * pricing.outputPerMillionUsd) / 1_000_000,
        source: "published-rate-calculation", sourceUrl: pricing.sourceUrl, asOf: pricing.asOf, evidenceRef: "provider-reported usage x the operator's dated published rate" };
      return result;
    },
    async close() { server.closeAllConnections(); await new Promise((done) => server.close(done)); } };
}
