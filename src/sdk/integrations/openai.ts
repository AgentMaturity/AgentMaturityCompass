import type { AMCClient } from "../amcClient.js";

type AnyRecord = Record<string, unknown>;
type OpenAIBridgeRoute = "chat_completions" | "responses" | "embeddings" | "images_generations" | "audio_speech";

function asRecord(value: unknown): AnyRecord {
  return typeof value === "object" && value !== null ? (value as AnyRecord) : {};
}

async function routeToBridge(amc: AMCClient, route: OpenAIBridgeRoute, payload: AnyRecord): Promise<unknown> {
  switch (route) {
    case "chat_completions":
      return (await amc.openaiChat(payload)).body;
    case "responses":
      return (await amc.openaiResponses(payload)).body;
    case "embeddings":
      return (await amc.openaiEmbeddings(payload)).body;
    case "images_generations":
      return (await amc.openaiImages(payload)).body;
    case "audio_speech":
      return (await amc.openaiAudioSpeech(payload)).body;
  }
}

function routeFromPath(path: string): OpenAIBridgeRoute {
  if (path.endsWith("/responses")) {
    return "responses";
  }
  if (path.endsWith("/embeddings")) {
    return "embeddings";
  }
  if (path.endsWith("/images/generations")) {
    return "images_generations";
  }
  if (path.endsWith("/audio/speech")) {
    return "audio_speech";
  }
  return "chat_completions";
}

function parseRequestBody(init?: RequestInit): AnyRecord {
  if (!init?.body) {
    return {};
  }
  if (typeof init.body === "string") {
    try {
      return asRecord(JSON.parse(init.body));
    } catch {
      return {};
    }
  }
  if (init.body instanceof URLSearchParams) {
    return Object.fromEntries(init.body.entries());
  }
  if (typeof FormData !== "undefined" && init.body instanceof FormData) {
    const out: AnyRecord = {};
    for (const [key, value] of init.body.entries()) {
      out[key] = typeof value === "string" ? value : `[binary:${value.name}]`;
    }
    return out;
  }
  return {};
}

export function instrumentOpenAIClient<T extends object>(client: T, amc: AMCClient): T {
  const root = client as unknown as Record<string, unknown>;
  return new Proxy(root, {
    get(target, prop, receiver) {
      if (prop === "chat") {
        const chat = Reflect.get(target, prop, receiver);
        if (typeof chat !== "object" || chat === null) {
          return chat;
        }
        return new Proxy(chat, {
          get(chatTarget, chatProp, chatReceiver) {
            if (chatProp === "completions") {
              const completions = Reflect.get(chatTarget, chatProp, chatReceiver);
              if (typeof completions !== "object" || completions === null) {
                return completions;
              }
              return new Proxy(completions, {
                get(compTarget, compProp, compReceiver) {
                  if (compProp === "create") {
                    return async (payload: unknown) => routeToBridge(amc, "chat_completions", asRecord(payload));
                  }
                  return Reflect.get(compTarget, compProp, compReceiver);
                }
              });
            }
            return Reflect.get(chatTarget, chatProp, chatReceiver);
          }
        });
      }
      if (prop === "responses") {
        const responses = Reflect.get(target, prop, receiver);
        if (typeof responses !== "object" || responses === null) {
          return responses;
        }
        return new Proxy(responses, {
          get(resTarget, resProp, resReceiver) {
            if (resProp === "create") {
              return async (payload: unknown) => routeToBridge(amc, "responses", asRecord(payload));
            }
            return Reflect.get(resTarget, resProp, resReceiver);
          }
        });
      }
      if (prop === "embeddings") {
        const embeddings = Reflect.get(target, prop, receiver);
        if (typeof embeddings !== "object" || embeddings === null) {
          return embeddings;
        }
        return new Proxy(embeddings, {
          get(embeddingsTarget, embeddingsProp, embeddingsReceiver) {
            if (embeddingsProp === "create") {
              return async (payload: unknown) => routeToBridge(amc, "embeddings", asRecord(payload));
            }
            return Reflect.get(embeddingsTarget, embeddingsProp, embeddingsReceiver);
          }
        });
      }
      if (prop === "images") {
        const images = Reflect.get(target, prop, receiver);
        if (typeof images !== "object" || images === null) {
          return images;
        }
        return new Proxy(images, {
          get(imagesTarget, imagesProp, imagesReceiver) {
            if (imagesProp === "generate") {
              return async (payload: unknown) => routeToBridge(amc, "images_generations", asRecord(payload));
            }
            return Reflect.get(imagesTarget, imagesProp, imagesReceiver);
          }
        });
      }
      if (prop === "audio") {
        const audio = Reflect.get(target, prop, receiver);
        if (typeof audio !== "object" || audio === null) {
          return audio;
        }
        return new Proxy(audio, {
          get(audioTarget, audioProp, audioReceiver) {
            if (audioProp === "speech") {
              const speech = Reflect.get(audioTarget, audioProp, audioReceiver);
              if (typeof speech !== "object" || speech === null) {
                return speech;
              }
              return new Proxy(speech, {
                get(speechTarget, speechProp, speechReceiver) {
                  if (speechProp === "create") {
                    return async (payload: unknown) => routeToBridge(amc, "audio_speech", asRecord(payload));
                  }
                  return Reflect.get(speechTarget, speechProp, speechReceiver);
                }
              });
            }
            return Reflect.get(audioTarget, audioProp, audioReceiver);
          }
        });
      }
      return Reflect.get(target, prop, receiver);
    }
  }) as unknown as T;
}

export function createOpenAIFetchTransport(amc: AMCClient): typeof fetch {
  return async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const path = (() => {
      try {
        return new URL(url).pathname;
      } catch {
        return url;
      }
    })();
    const payload = parseRequestBody(init);
    const route = routeFromPath(path);
    const out = await (() => {
      switch (route) {
        case "responses":
          return amc.openaiResponses(payload);
        case "embeddings":
          return amc.openaiEmbeddings(payload);
        case "images_generations":
          return amc.openaiImages(payload);
        case "audio_speech":
          return amc.openaiAudioSpeech(payload);
        case "chat_completions":
          return amc.openaiChat(payload);
      }
    })();
    return new Response(JSON.stringify(out.body), {
      status: out.status,
      headers: {
        "content-type": "application/json",
        "x-amc-bridge-request-id": out.requestId ?? "",
        "x-amc-correlation-id": out.correlationId ?? "",
        "x-amc-receipt": out.receipt ?? ""
      }
    });
  };
}
