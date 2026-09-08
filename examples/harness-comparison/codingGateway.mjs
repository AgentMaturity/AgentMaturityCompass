import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { loopbackOrigin, sha256 } from "./codingCommon.mjs";

/** One serial, bounded forwarding endpoint shared by each harness binding.
 * It never generates a model response, follows redirects, or forwards ambient auth.
 * This observes only calls routed here; it is not a machine-wide network sandbox.
 */
export async function codingGateway(lane, signal) {
  const upstream = loopbackOrigin(lane.settings.baseURL);
  const token = randomBytes(24).toString("base64url");
  const requests = [], controllers = new Set();
  let active = false, inputTokens = 0, outputTokens = 0, missingUsage = false;
  const maxRequests = lane.settings.maxRequests, maxOutput = lane.settings.maxOutputTokens;
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 100 || !Number.isInteger(maxOutput) || maxOutput < 1 || maxOutput > lane.budgets.maxTokens) throw new Error("Coding lane requires finite request and per-response output limits");
  if (!Number.isFinite(lane.settings.temperature) || lane.settings.temperature < 0 || lane.settings.temperature > 2) throw new Error("Coding lane requires an explicit temperature");
  const server = createServer(async (req, res) => {
    const refuse = (status, message) => { if (res.destroyed) return; if (!res.headersSent) res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { message } })); };
    if (req.method !== "POST" || req.url !== "/v1/chat/completions" || req.headers.authorization !== `Bearer ${token}`) { refuse(403, "Unapproved coding endpoint"); return; }
    if (active || missingUsage || requests.length >= maxRequests || inputTokens + outputTokens >= lane.budgets.maxTokens || signal?.aborted) { refuse(429, "Coding request/usage bound reached or accounting unavailable"); return; }
    active = true;
    const controller = new AbortController(); controllers.add(controller);
    const abort = () => { controller.abort(); if (!req.complete) req.destroy(); }; signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, Math.min(lane.budgets.timeoutMs, 120000));
    res.on("close", () => { if (!res.writableEnded) abort(); });
    const record = { index: requests.length, forwarded: false, complete: false, requestSha256: null, responseSha256: null, usage: null };
    try {
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 1048576) throw new Error("Request exceeds one MiB"); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!Array.isArray(body.messages) || body.model !== lane.model) throw new Error("Model or message contract mismatch");
      record.toolNames = Array.isArray(body.tools) ? body.tools.slice(0, 128).map(tool => typeof tool?.function?.name === "string" ? tool.function.name.slice(0, 256) : "unknown") : [];
      body.model = lane.model;
      body.temperature = lane.settings.temperature;
      body.max_tokens = Math.min(maxOutput, lane.budgets.maxTokens - inputTokens - outputTokens);
      delete body.max_completion_tokens;
      if (body.stream) body.stream_options = { include_usage: true };
      const encoded = JSON.stringify(body); record.requestSha256 = sha256(encoded);
      requests.push(record); record.forwarded = true;
      const response = await fetch(`${upstream}/v1/chat/completions`, { method: "POST", redirect: "error", signal: controller.signal,
        headers: { "content-type": "application/json", authorization: "Bearer amc-local-comparison" }, body: encoded });
      record.status = response.status;
      const result = []; let resultBytes = 0;
      for await (const chunk of response.body ?? []) { resultBytes += chunk.length; if (resultBytes > 2097152) throw new Error("Model response exceeds two MiB"); result.push(Buffer.from(chunk)); }
      const raw = Buffer.concat(result); record.responseSha256 = sha256(raw); record.complete = true;
      let usage;
      if ((response.headers.get("content-type") ?? "").includes("text/event-stream")) {
        for (const line of raw.toString("utf8").split(/\r?\n/)) {
          if (!line.startsWith("data:") || line.slice(5).trim() === "[DONE]") continue;
          try { const event = JSON.parse(line.slice(5)); if (event.usage) usage = event.usage; } catch { /* Invalid protocol remains visible to the actual harness. */ }
        }
      } else { try { usage = JSON.parse(raw.toString("utf8")).usage; } catch { /* No invented accounting. */ } }
      if (response.ok && Number.isSafeInteger(usage?.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isSafeInteger(usage?.completion_tokens) && usage.completion_tokens >= 0) {
        record.usage = { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens };
        inputTokens += usage.prompt_tokens; outputTokens += usage.completion_tokens;
      } else missingUsage = true;
      res.writeHead(response.status, { "content-type": response.headers.get("content-type") ?? "application/json" }); res.end(raw);
    } catch (error) { record.error = error instanceof Error ? error.message : "Coding forwarding failed"; missingUsage = true; refuse(502, "Bounded local inference request did not complete"); }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); controllers.delete(controller); active = false; }
  });
  await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  return { origin: `http://127.0.0.1:${server.address().port}`, token, requests,
    observations() {
      return { schemaVersion: "2026-09-08", modelExecution: { modelCalled: requests.some(row => row.forwarded && row.complete && row.status >= 200 && row.status < 300), source: "adapter-observation", evidenceRef: "adapter stdout gateway requests with request/response SHA256; backend identity is operator-declared" },
        ...(!missingUsage && requests.some(row => row.usage) ? { usage: { inputTokens, outputTokens, cacheReadTokens: null, cacheWriteTokens: null, source: "provider-response", evidenceRef: "adapter stdout gateway.requests[].usage" } } : {}) };
    },
    async close() { for (const controller of controllers) controller.abort(); server.closeAllConnections(); await new Promise(done => server.close(done)); }
  };
}
