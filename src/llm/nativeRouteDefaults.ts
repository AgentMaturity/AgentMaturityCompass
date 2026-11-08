/**
 * Endpoint and credential defaults for a native route: the OpenAI-compatible inventory first, then the gateway
 * catalog's shared defaults (`lookupProviderCatalog`). Every surface that picks a credential reference for a native
 * route (`agent-loop run`, `acp`, the first-use guide, chat) applies the same rule here: a default reference goes only
 * to the provider's own documented origin, never to an override, so an operator who points a route elsewhere names the
 * reference explicitly.
 */
import { lookupProviderCatalog } from "./providerCatalog.js";
import { openaiCompatibleRouteFor } from "./providers/openaiCompatibleRoutes.js";

/** The provider's documented origin (null: the operator supplies one) and default credential reference name (never a value). */
export function nativeRouteDefaults(providerId: string): { readonly defaultBaseUrl: string | null; readonly defaultCredentialRef: string | null } | null {
  return openaiCompatibleRouteFor(providerId) ?? lookupProviderCatalog(providerId);
}

/** The default reference when `baseUrl` is absent or on the provider's own origin; null otherwise. */
export function defaultCredentialRefFor(providerId: string, baseUrl: string | undefined): string | null {
  const defaults = nativeRouteDefaults(providerId);
  if (defaults === null || defaults.defaultCredentialRef === null || defaults.defaultBaseUrl === null) return null;
  if (baseUrl === undefined) return defaults.defaultCredentialRef;
  try { return new URL(baseUrl).origin === new URL(defaults.defaultBaseUrl).origin ? defaults.defaultCredentialRef : null; }
  catch { return null; }
}
