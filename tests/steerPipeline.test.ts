import { createServer } from "node:http";
import { afterEach, describe, expect, test } from "vitest";
import { createSteerPipeline, type SteerRequestContext, type SteerResponseContext } from "../src/steer/index.js";
import { wrapFetch } from "../src/runtime/wrapFetch.js";

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (!server) continue;
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  }
});

async function startJsonServer(handler: Parameters<typeof createServer>[0]): Promise<number> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("bad server address");
  }
  return address.port;
}

describe("createSteerPipeline", () => {
  test("runs request stages in order and skips disabled stages", async () => {
    const order: string[] = [];
    const pipeline = createSteerPipeline({
      stages: [
        {
          id: "first",
          enabled: true,
          onRequest(context) {
            order.push("first");
            return {
              ...context,
              init: {
                ...context.init,
                headers: {
                  ...(context.init.headers as Record<string, string> | undefined),
                  "x-stage-first": "1",
                },
              },
            };
          },
        },
        {
          id: "disabled",
          enabled: false,
          onRequest(context) {
            order.push("disabled");
            return context;
          },
        },
        {
          id: "second",
          enabled: true,
          onRequest(context) {
            order.push("second");
            return {
              ...context,
              metadata: { ...context.metadata, seenSecond: true },
            };
          },
        },
      ],
    });

    const result = await pipeline.runRequest({
      agentId: "agent-1",
      providerId: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      init: { method: "POST", headers: { "content-type": "application/json" } },
      metadata: {},
    });

    expect(order).toEqual(["first", "second"]);
    expect((result.init.headers as Record<string, string>)["x-stage-first"]).toBe("1");
    expect(result.metadata.seenSecond).toBe(true);
  });

  test("runs response stages in order and can replace the response", async () => {
    const order: string[] = [];
    const pipeline = createSteerPipeline({
      stages: [
        {
          id: "observe",
          enabled: true,
          async onResponse(context) {
            order.push("observe");
            return context;
          },
        },
        {
          id: "replace",
          enabled: true,
          async onResponse(context) {
            order.push("replace");
            return {
              ...context,
              response: new Response("rewritten", {
                status: 203,
                headers: { "content-type": "text/plain", "x-steered": "yes" },
              }),
            };
          },
        },
      ],
    });

    const result = await pipeline.runResponse({
      agentId: "agent-1",
      providerId: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      init: { method: "POST" },
      metadata: {},
      response: new Response("original", { status: 200 }),
    });

    expect(order).toEqual(["observe", "replace"]);
    expect(result.response.status).toBe(203);
    expect(await result.response.text()).toBe("rewritten");
    expect(result.response.headers.get("x-steered")).toBe("yes");
  });
});

describe("wrapFetch + steer pipeline", () => {
  test("applies request and response steering while preserving AMC runtime behavior", async () => {
    const hits: Array<{ path: string; agentId: string | undefined; stageHeader: string | undefined }> = [];
    const port = await startJsonServer((req, res) => {
      hits.push({
        path: req.url ?? "",
        agentId: req.headers["x-amc-agent-id"] as string | undefined,
        stageHeader: req.headers["x-stage"] as string | undefined,
      });
      req.resume();
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });

    const pipeline = createSteerPipeline({
      stages: [
        {
          id: "request-header",
          enabled: true,
          onRequest(context: SteerRequestContext) {
            return {
              ...context,
              init: {
                ...context.init,
                headers: {
                  ...(context.init.headers as Record<string, string> | undefined),
                  "x-stage": "active",
                },
              },
            };
          },
        },
        {
          id: "response-header",
          enabled: true,
          onResponse(context: SteerResponseContext) {
            const headers = new Headers(context.response.headers);
            headers.set("x-amc-steer-stage", "response-header");
            return {
              ...context,
              response: new Response(context.response.body, {
                status: context.response.status,
                statusText: context.response.statusText,
                headers,
              }),
            };
          },
        },
      ],
    });

    const wrapped = wrapFetch(fetch, {
      agentId: "salesbot",
      gatewayBaseUrl: `http://127.0.0.1:${port}/openai`,
      forceBaseUrl: true,
      steerPipeline: pipeline,
    });

    const response = await wrapped("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-test" }),
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-amc-steer-stage")).toBe("response-header");
    expect(hits[0]?.path).toBe("/openai/v1/chat/completions");
    expect(hits[0]?.agentId).toBe("salesbot");
    expect(hits[0]?.stageHeader).toBe("active");
  });
});
