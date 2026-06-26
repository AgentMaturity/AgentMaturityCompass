import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createAMCMobileFetchBridge } from "../src/sdk/mobileFetch.js";

function headersObject(headers: HeadersInit | undefined): Record<string, string> {
  const headersObj = new Headers(headers);
  const out: Record<string, string> = {};
  headersObj.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

describe("AMC mobile fetch bridge", () => {
  test("rewrites React Native-style OpenAI fetch calls to AMC Bridge and strips provider auth", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "x-amc-receipt": "receipt-1" }
      });
    }) as typeof fetch;

    const amcFetch = createAMCMobileFetchBridge({
      bridgeUrl: "https://amc.example.com",
      token: "amc-token",
      agentId: "mobile-agent",
      workspaceId: "workspace-1",
      fetchImpl,
      correlationIdFactory: () => "corr-mobile-1"
    });

    const response = await amcFetch("https://api.openai.com/v1/chat/completions?trace=1", {
      method: "POST",
      headers: {
        authorization: "Bearer provider-key",
        "content-type": "application/json"
      },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hello" }] })
    });

    expect(response.status).toBe(200);
    expect(calls[0]?.url).toBe("https://amc.example.com/bridge/openai/v1/chat/completions?trace=1");
    const headers = headersObject(calls[0]?.init?.headers);
    expect(headers.authorization).toBe("Bearer amc-token");
    expect(headers["x-amc-agent-id"]).toBe("mobile-agent");
    expect(headers["x-amc-workspace-id"]).toBe("workspace-1");
    expect(headers["x-amc-correlation-id"]).toBe("corr-mobile-1");
    expect(headers["x-amc-sdk-name"]).toBe("amc-mobile-fetch");
  });

  test("infers non-OpenAI providers from host names", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const amcFetch = createAMCMobileFetchBridge({
      bridgeUrl: "https://amc.example.com/root/",
      agentId: "mobile-agent",
      fetchImpl,
      correlationIdFactory: () => "corr-mobile-2"
    });

    await amcFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      body: JSON.stringify({ model: "claude-3-5-sonnet", messages: [] })
    });
    await amcFetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent", {
      method: "POST",
      body: JSON.stringify({ contents: [] })
    });

    expect(urls).toEqual([
      "https://amc.example.com/root/bridge/anthropic/v1/messages",
      "https://amc.example.com/root/bridge/gemini/v1beta/models/gemini-pro:generateContent"
    ]);
  });

  test("blocks self-scoring fields before the mobile request leaves the app", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    const amcFetch = createAMCMobileFetchBridge({
      bridgeUrl: "https://amc.example.com",
      agentId: "mobile-agent",
      fetchImpl
    });

    await expect(
      amcFetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "hello" }],
          metadata: { maturityScore: 5 }
        })
      })
    ).rejects.toMatchObject({ code: "SELF_SCORING_BLOCKED" });
  });

  test("mobile wrapper stays free of Node-only imports and process env reads", () => {
    const source = readFileSync(join(process.cwd(), "src/sdk/mobileFetch.ts"), "utf8");
    expect(source).not.toContain("node:");
    expect(source).not.toContain("process.env");
    expect(source).not.toContain("Buffer.");
  });
});
