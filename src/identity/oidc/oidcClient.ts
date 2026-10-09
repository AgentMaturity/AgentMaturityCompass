import { randomUUID } from "node:crypto";
import type { IdentityProvider } from "../identityConfig.js";
import { discoverOidcWellKnown, oidcFetchJson, validateOidcUrl } from "./jwtVerify.js";
import { generatePkceVerifier, pkceChallengeS256 } from "./pkce.js";

export interface OidcAuthStart {
  state: string;
  nonce: string;
  verifier: string;
  authorizationUrl: string;
}

export async function buildOidcAuthStart(params: {
  provider: IdentityProvider;
}): Promise<OidcAuthStart> {
  if (params.provider.type !== "OIDC") {
    throw new Error("provider is not OIDC");
  }
  const state = randomUUID().replace(/-/g, "");
  const nonce = randomUUID().replace(/-/g, "");
  const verifier = generatePkceVerifier();
  const challenge = pkceChallengeS256(verifier);

  const endpoints = await resolveProviderEndpoints(params.provider);
  if (!endpoints.authorizationEndpoint) {
    throw new Error(`missing authorization endpoint for provider ${params.provider.id}`);
  }
  const authUrl = new URL(endpoints.authorizationEndpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", params.provider.oidc.clientId);
  authUrl.searchParams.set("redirect_uri", params.provider.oidc.redirectUri);
  authUrl.searchParams.set("scope", params.provider.oidc.scopes.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return {
    state,
    nonce,
    verifier,
    authorizationUrl: authUrl.toString()
  };
}

export async function exchangeOidcCode(params: {
  provider: IdentityProvider;
  code: string;
  verifier: string;
  clientSecret: string;
  tokenEndpoint?: string;
}): Promise<{ idToken: string; accessToken: string | null }> {
  if (params.provider.type !== "OIDC") {
    throw new Error("provider is not OIDC");
  }
  const tokenEndpoint = params.tokenEndpoint ?? (await resolveProviderEndpoints(params.provider)).tokenEndpoint;
  validateOidcUrl(tokenEndpoint);
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", params.code);
  body.set("redirect_uri", params.provider.oidc.redirectUri);
  body.set("client_id", params.provider.oidc.clientId);
  body.set("client_secret", params.clientSecret);
  body.set("code_verifier", params.verifier);

  let parsed: Record<string, unknown>;
  try { parsed = await oidcFetchJson(tokenEndpoint, { method: "POST", form: body }); }
  catch { throw new Error("OIDC token exchange failed"); }
  const idToken = typeof parsed.id_token === "string" ? parsed.id_token : "";
  if (!idToken) {
    throw new Error("OIDC token response missing id_token");
  }
  return {
    idToken,
    accessToken: typeof parsed.access_token === "string" ? parsed.access_token : null
  };
}

export async function resolveProviderEndpoints(provider: IdentityProvider): Promise<{
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}> {
  if (provider.type !== "OIDC") {
    throw new Error("provider is not OIDC");
  }
  validateOidcUrl(provider.oidc.issuer);
  if (provider.oidc.discovery.useWellKnown) {
    return discoverOidcWellKnown(provider.oidc.issuer);
  }
  const authorizationEndpoint = provider.oidc.discovery.authorizationEndpoint ?? "";
  const tokenEndpoint = provider.oidc.discovery.tokenEndpoint ?? "";
  const jwksUri = provider.oidc.discovery.jwksUri ?? "";
  if (!authorizationEndpoint || !tokenEndpoint || !jwksUri) {
    throw new Error("OIDC discovery disabled but endpoints incomplete");
  }
  for (const endpoint of [authorizationEndpoint, tokenEndpoint, jwksUri]) validateOidcUrl(endpoint);
  return { authorizationEndpoint, tokenEndpoint, jwksUri };
}
