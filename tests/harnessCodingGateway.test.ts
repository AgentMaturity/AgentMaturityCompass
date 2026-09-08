import { createServer, request as httpRequest, type RequestListener, type Server } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";

const { codingGateway } = await import(pathToFileURL(resolve("examples/harness-comparison/codingGateway.mjs")).href);
const servers: Server[] = [];
const gateways: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  for (const gateway of gateways.splice(0)) await gateway.close();
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
});
async function upstream(handler: RequestListener) {
  const server = createServer(handler); servers.push(server);
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No test listener");
  return `http://127.0.0.1:${address.port}`;
}
function lane(baseURL: string) {
  return { model: "synthetic-protocol-only", settings: { baseURL, temperature: 0.2, maxRequests: 3, maxOutputTokens: 25 }, budgets: { maxTokens: 100, timeoutMs: 1000 } };
}
async function request(gateway: { origin: string; token: string }, token = gateway.token) {
  return fetch(`${gateway.origin}/v1/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "synthetic-protocol-only", messages: [{ role: "user", content: "Protocol fixture" }], stream: true, max_tokens: 9999, temperature: 1.9 }) });
}
test("the shared local coding forwarder applies matched settings and records actual provider usage without inventing price", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const baseURL = await upstream(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    bodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end('data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":5}}\n\ndata: [DONE]\n\n');
  });
  const gateway = await codingGateway(lane(baseURL)); gateways.push(gateway);
  expect((await request(gateway, "wrong-token")).status).toBe(403); expect(bodies).toHaveLength(0);
  const response = await request(gateway); expect(response.status).toBe(200); await response.text();
  expect(bodies[0]).toMatchObject({ max_tokens: 25, temperature: 0.2, stream_options: { include_usage: true } });
  expect(gateway.observations()).toMatchObject({ modelExecution: { modelCalled: true }, usage: { inputTokens: 12, outputTokens: 5, cacheReadTokens: null, cacheWriteTokens: null } });
  expect(gateway.observations()).not.toHaveProperty("cost");
  expect(gateway.requests[0]).toMatchObject({ forwarded: true, complete: true, requestSha256: expect.stringMatching(/^[a-f0-9]{64}$/), responseSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
});
test("missing local usage stays unknown and stops subsequent model calls", async () => {
  let calls = 0;
  const baseURL = await upstream((_req, res) => { calls++; res.writeHead(200, { "content-type": "text/event-stream" }); res.end('data: {"choices":[]}\n\ndata: [DONE]\n\n'); });
  const gateway = await codingGateway(lane(baseURL)); gateways.push(gateway);
  await (await request(gateway)).text();
  expect(gateway.observations().modelExecution.modelCalled).toBe(true);
  expect(gateway.observations()).not.toHaveProperty("usage");
  expect((await request(gateway)).status).toBe(429); expect(calls).toBe(1);
});
test("local coding inference refuses redirects and non-loopback origins", async () => {
  let traps = 0;
  const trap = await upstream((_req, res) => { traps++; res.end("must not forward"); });
  const baseURL = await upstream((_req, res) => { res.writeHead(307, { location: `${trap}/v1/chat/completions` }); res.end(); });
  const gateway = await codingGateway(lane(baseURL)); gateways.push(gateway);
  expect((await request(gateway)).status).toBe(502); expect(traps).toBe(0);
  expect(gateway.observations().modelExecution.modelCalled).toBe(false);
  await expect(codingGateway(lane("https://example.invalid"))).rejects.toThrow("loopback");
  await expect(codingGateway(lane("http://127.1:8080"))).rejects.toThrow("loopback");
  await expect(codingGateway(lane("http://127.0.0.1:0"))).rejects.toThrow("loopback");
});
test("the local deadline also terminates an authenticated upload that never finishes", async () => {
  let calls = 0;
  const baseURL = await upstream((_req, res) => { calls++; res.end("unexpected upstream call"); });
  const configuration = lane(baseURL); configuration.budgets.timeoutMs = 100;
  const gateway = await codingGateway(configuration); gateways.push(gateway);
  await new Promise<void>((done, reject) => {
    const request = httpRequest(`${gateway.origin}/v1/chat/completions`, { method: "POST", headers: { authorization: `Bearer ${gateway.token}`, "content-type": "application/json", "content-length": "10000" } });
    const timeout = setTimeout(() => { request.destroy(); reject(new Error("Stalled upload exceeded the local gateway deadline")); }, 2000);
    request.on("error", () => {});
    request.once("close", () => { clearTimeout(timeout); done(); });
    request.write('{"model":');
  });
  expect(calls).toBe(0); expect(gateway.observations().modelExecution.modelCalled).toBe(false);
});
