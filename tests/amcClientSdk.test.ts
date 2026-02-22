import { describe, expect, test } from "vitest";
import { AMCClient, createAMCClientFromEnv } from "../src/sdk/amcClient.js";
import { createOpenAIFetchTransport, instrumentOpenAIClient } from "../src/sdk/integrations/openai.js";

describe("AMCClient SDK ergonomics", () => {
  test("uses environment defaults when config is omitted", () => {
    const prevUrl = process.env.AMC_BRIDGE_URL;
    const prevToken = process.env.AMC_TOKEN;
    process.env.AMC_BRIDGE_URL = "http://env-bridge:7777";
    process.env.AMC_TOKEN = "env-token";

    try {
      const client = new AMCClient({});
      expect(client.bridgeUrl).toBe("http://env-bridge:7777");
      expect(client.token).toBe("env-token");
    } finally {
      process.env.AMC_BRIDGE_URL = prevUrl;
      process.env.AMC_TOKEN = prevToken;
    }
  });

  test("createAMCClientFromEnv builds a usable client", () => {
    const prevUrl = process.env.AMC_BRIDGE_URL;
    process.env.AMC_BRIDGE_URL = "http://localhost:3212/";

    try {
      const client = createAMCClientFromEnv();
      expect(client.bridgeUrl).toBe("http://localhost:3212");
    } finally {
      process.env.AMC_BRIDGE_URL = prevUrl;
    }
  });
});

describe("OpenAI SDK instrumentation", () => {
  test("routes chat/responses/embeddings/images/audio calls through AMC bridge methods", async () => {
    const calls: string[] = [];
    const amc = {
      openaiChat: async () => {
        calls.push("chat");
        return { body: { kind: "chat" }, status: 200 };
      },
      openaiResponses: async () => {
        calls.push("responses");
        return { body: { kind: "responses" }, status: 200 };
      },
      openaiEmbeddings: async () => {
        calls.push("embeddings");
        return { body: { kind: "embeddings" }, status: 200 };
      },
      openaiImages: async () => {
        calls.push("images");
        return { body: { kind: "images" }, status: 200 };
      },
      openaiAudioSpeech: async () => {
        calls.push("audio");
        return { body: { kind: "audio" }, status: 200 };
      }
    } as unknown as AMCClient;
    const rawClient = {
      chat: { completions: { create: async () => ({ raw: true }) } },
      responses: { create: async () => ({ raw: true }) },
      embeddings: { create: async () => ({ raw: true }) },
      images: { generate: async () => ({ raw: true }) },
      audio: { speech: { create: async () => ({ raw: true }) } }
    };

    const instrumented = instrumentOpenAIClient(rawClient, amc);
    const chat = await instrumented.chat.completions.create({ model: "gpt-4o-mini", messages: [] });
    const responses = await instrumented.responses.create({ model: "gpt-4o-mini", input: [] });
    const embeddings = await instrumented.embeddings.create({ model: "text-embedding-3-small", input: "hello" });
    const images = await instrumented.images.generate({ model: "gpt-image-1", prompt: "sunset" });
    const audio = await instrumented.audio.speech.create({ model: "gpt-4o-mini-tts", voice: "alloy", input: "hello" });

    expect((chat as Record<string, unknown>).kind).toBe("chat");
    expect((responses as Record<string, unknown>).kind).toBe("responses");
    expect((embeddings as Record<string, unknown>).kind).toBe("embeddings");
    expect((images as Record<string, unknown>).kind).toBe("images");
    expect((audio as Record<string, unknown>).kind).toBe("audio");
    expect(calls).toEqual(["chat", "responses", "embeddings", "images", "audio"]);
  });

  test("fetch transport routes embeddings/images/audio paths through AMC bridge methods", async () => {
    const amc = {
      openaiChat: async () => ({ body: { path: "chat" }, status: 200, requestId: null, correlationId: null, receipt: null }),
      openaiResponses: async () => ({ body: { path: "responses" }, status: 200, requestId: null, correlationId: null, receipt: null }),
      openaiEmbeddings: async () => ({ body: { path: "embeddings" }, status: 200, requestId: null, correlationId: null, receipt: null }),
      openaiImages: async () => ({ body: { path: "images" }, status: 200, requestId: null, correlationId: null, receipt: null }),
      openaiAudioSpeech: async () => ({ body: { path: "audio" }, status: 200, requestId: null, correlationId: null, receipt: null })
    } as unknown as AMCClient;
    const transport = createOpenAIFetchTransport(amc);

    const embeddingResp = await transport("https://api.openai.com/v1/embeddings", {
      method: "POST",
      body: JSON.stringify({ model: "text-embedding-3-small", input: "hello" })
    });
    const imageResp = await transport("https://api.openai.com/v1/images/generations", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-image-1", prompt: "hello" })
    });
    const audioResp = await transport("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "alloy", input: "hello" })
    });

    expect((await embeddingResp.json()).path).toBe("embeddings");
    expect((await imageResp.json()).path).toBe("images");
    expect((await audioResp.json()).path).toBe("audio");
  });
});
