import type { LlmRouteConfig } from "../adapter/adapterRegistry.js";
import { ollamaAdapter } from "./ollamaAdapter.js";
import { OLLAMA_DEFAULT_BASE_URL, ollamaOrigin, ollamaText } from "./ollamaContract.js";

export interface OllamaRouteOptions {
  readonly model: string;
  readonly providerId?: string;
  readonly baseUrl?: string;
  readonly credentialRef?: LlmRouteConfig["credentialRef"];
  readonly headers?: LlmRouteConfig["headers"];
  readonly retry?: LlmRouteConfig["retry"];
}

/** Local native protocol route, no discovery request, model pull, SDK, gateway
 * or environment credential read. Register this in the existing AdapterRegistry.
 * Alternate origins are explicit configuration, not proof of local execution.
 */
export function createOllamaRoute(options: OllamaRouteOptions): LlmRouteConfig {
  return Object.freeze({ providerId: options.providerId ?? "ollama", adapter: ollamaAdapter,
    baseUrl: ollamaOrigin(options.baseUrl ?? OLLAMA_DEFAULT_BASE_URL),
    credentialRef: options.credentialRef ?? null, models: Object.freeze([ollamaText(options.model, "model", true)]),
    ...(options.headers === undefined ? {} : { headers: Object.freeze({ ...options.headers }) }),
    ...(options.retry === undefined ? {} : { retry: options.retry }) });
}
