import { buildOidcAuthStart, exchangeOidcCode, resolveProviderEndpoints } from "./oidcClient.js";
import { verifyJwtIdToken, validateOidcUrl } from "./jwtVerify.js";
import type { IdentityConfig, IdentityProvider } from "../identityConfig.js";
import { resolveIdentitySecretRef } from "../identityConfig.js";
import { evaluateRoleMapping } from "../roleMapping.js";
import { applyMembershipRolesFromSource, appendHostAudit, upsertIdentityUser } from "../../workspaces/hostDb.js";
import { createIdentitySession } from "../sessionStore.js";
import { consumePendingOidcLogin, savePendingOidcLogin } from "../pendingLoginStore.js";

type OidcProvider = Extract<IdentityProvider, { type: "OIDC" }>;

function findProvider(config: IdentityConfig, providerId: string): OidcProvider {
  const provider = config.identity.providers.find((item) => item.id === providerId);
  if (!provider || !provider.enabled || provider.type !== "OIDC") {
    throw new Error("OIDC provider not enabled");
  }
  validateOidcUrl(provider.oidc.issuer);
  validateOidcUrl(provider.oidc.redirectUri);
  return provider;
}

export async function startOidcLogin(params: {
  hostDir: string;
  config: IdentityConfig;
  providerId: string;
}): Promise<{ redirectUrl: string; state: string }> {
  try {
    const provider = findProvider(params.config, params.providerId);
    const start = await buildOidcAuthStart({ provider });
    savePendingOidcLogin({ hostDir: params.hostDir, state: start.state, providerId: provider.id,
      verifier: start.verifier, nonce: start.nonce });
    appendHostAudit(params.hostDir, "OIDC_LOGIN_STARTED", null, { providerId: provider.id });
    return { redirectUrl: start.authorizationUrl, state: start.state };
  } catch { throw new Error("OIDC login could not be started"); }
}

export async function completeOidcCallback(params: {
  hostDir: string;
  config: IdentityConfig;
  providerId: string;
  code: string;
  state: string;
}): Promise<{ token: string; sessionId: string; userId: string; username: string }> {
  try {
    const provider = findProvider(params.config, params.providerId);
    const pending = consumePendingOidcLogin({ hostDir: params.hostDir, state: params.state, providerId: provider.id });
    const endpoints = await resolveProviderEndpoints(provider);
    const clientSecret = resolveIdentitySecretRef(params.hostDir, provider.oidc.clientSecretRef);
    const exchanged = await exchangeOidcCode({
      provider,
      code: params.code,
      verifier: pending.verifier,
      clientSecret,
      tokenEndpoint: endpoints.tokenEndpoint
    });
    const verified = await verifyJwtIdToken({
      token: exchanged.idToken,
      issuer: provider.oidc.issuer,
      audience: provider.oidc.clientId,
      jwksUri: endpoints.jwksUri,
      nonce: pending.nonce
    });
    if (!verified.ok) {
      throw new Error(verified.error === "nonce mismatch" ? "OIDC nonce mismatch"
        : verified.error === "id_token signature invalid" ? "OIDC signature invalid" : "OIDC id_token verification failed");
    }
    const claims = verified.claims;
    const subjectClaim = provider.oidc.claims.subject;
    const emailClaim = provider.oidc.claims.email;
    const emailVerifiedClaim = provider.oidc.claims.emailVerified;
    const nameClaim = provider.oidc.claims.name;
    const groupsClaim = provider.oidc.claims.groups;

    const subject = typeof claims[subjectClaim] === "string" ? String(claims[subjectClaim]) : "";
    const email = typeof claims[emailClaim] === "string" ? String(claims[emailClaim]).toLowerCase() : "";
    const emailVerified = claims[emailVerifiedClaim];
    const name = typeof claims[nameClaim] === "string" ? String(claims[nameClaim]) : null;
    const groups = Array.isArray(claims[groupsClaim])
      ? claims[groupsClaim].filter((value): value is string => typeof value === "string")
      : typeof claims[groupsClaim] === "string"
        ? String(claims[groupsClaim])
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
        : [];
    if (!subject) {
      throw new Error("OIDC id_token missing subject");
    }
    if (!email) {
      throw new Error("OIDC id_token missing email");
    }
    if (emailVerified !== true) {
      throw new Error("OIDC email not verified");
    }

    const grants = evaluateRoleMapping(params.config, {
      providerId: provider.id,
      subject,
      email,
      groups
    });
    const user = upsertIdentityUser({
      hostDir: params.hostDir,
      username: email,
      email,
      displayName: name,
      authType: "OIDC",
      providerId: provider.id,
      subject,
      isHostAdmin: grants.hostAdmin
    });
    for (const workspaceGrant of grants.workspaceGrants) {
      applyMembershipRolesFromSource({
        hostDir: params.hostDir,
        userId: user.userId,
        workspaceId: workspaceGrant.workspaceId,
        roles: workspaceGrant.roles,
        sourceType: "SSO_GROUP",
        sourceId: workspaceGrant.sourceId
      });
    }
    const session = createIdentitySession({
      hostDir: params.hostDir,
      userId: user.userId,
      authType: "OIDC",
      providerId: provider.id,
      ttlMinutes: params.config.identity.session.ttlMinutes
    });
    appendHostAudit(params.hostDir, "OIDC_LOGIN_COMPLETED", user.username, {
      providerId: provider.id,
      workspaceGrantCount: grants.workspaceGrants.length
    });
    return {
      token: session.token,
      sessionId: session.payload.sessionId,
      userId: user.userId,
      username: user.username
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (["OIDC state mismatch", "OIDC state expired", "OIDC nonce mismatch", "OIDC signature invalid", "OIDC id_token missing email",
      "OIDC email not verified", "OIDC id_token missing subject", "OIDC id_token verification failed"].includes(message)) throw new Error(message);
    throw new Error("OIDC login failed");
  }
}
