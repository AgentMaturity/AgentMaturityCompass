/** Shared endpoint/auth defaults only. Gateway metadata does not grant native protocol or model support. */
import { listProviderTemplates, type AuthStrategy } from "../providers/providerTemplates.js";

export interface ProviderCatalogEntry {
  readonly templateId: string;
  readonly defaultBaseUrl: string | null;
  readonly defaultCredentialRef: string | null;
  readonly authStrategy: AuthStrategy;
}

/** Explicit naming aliases, never a fallback to a different provider. */
export function lookupProviderCatalog(providerId: string): ProviderCatalogEntry | null {
  let templateId = providerId;
  switch (providerId) {
    case "openai-responses": templateId = "openai"; break;
    case "gemini-audio": case "google": templateId = "gemini"; break;
    case "xai": templateId = "xai_grok"; break;
    case "local": templateId = "local_openai"; break;
  }
  const template = listProviderTemplates().find(candidate => candidate.id === templateId);
  if (template === undefined) return null;
  return Object.freeze({
    templateId: template.id,
    defaultBaseUrl: template.defaultBaseUrl || null,
    defaultCredentialRef: template.defaultAuthStrategy === "none" ? null : template.defaultAuthEnv || null,
    authStrategy: template.defaultAuthStrategy
  });
}
