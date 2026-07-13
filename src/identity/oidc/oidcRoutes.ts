import { buildOidcAuthStart, exchangeOidcCode, resolveProviderEndpoints } from "./oidcClient.js";
import { verifyJwtIdToken } from "./jwtVerify.js";
import type { IdentityConfig, IdentityProvider } from "../identityConfig.js";
import { resolveIdentitySecretRef } from "../identityConfig.js";
import { evaluateRoleMapping } from "../roleMapping.js";
import { applyMembershipRolesFromSource, appendHostAudit, upsertIdentityUser } from "../../workspaces/hostDb.js";
import { createIdentitySession } from "../sessionStore.js";

interface PendingOidcState {
  providerId: string;
  verifier: string;
  nonce: string;
  createdTs: number;
}

const pendingStates = new Map<string, PendingOidcState>();

type OidcProvider = Extract<IdentityProvider, { type: "OIDC" }>;

function stateKey(hostDir: string, state: string): string {
  return `${hostDir}::${state}`;
}

function findProvider(config: IdentityConfig, providerId: string): OidcProvider {
  const provider = config.identity.providers.find((item) => item.id === providerId);
  if (!provider || !provider.enabled || provider.type !== "OIDC") {
    throw new Error(`OIDC provider not enabled: ${providerId}`);
  }
  return provider;
}

export async function startOidcLogin(params: {
  hostDir: string;
  config: IdentityConfig;
  providerId: string;
}): Promise<{ redirectUrl: string; state: string }> {
  const provider = findProvider(params.config, params.providerId);
  const start = await buildOidcAuthStart({ provider });
  pendingStates.set(stateKey(params.hostDir, start.state), {
    providerId: provider.id,
    verifier: start.verifier,
    nonce: start.nonce,
    createdTs: Date.now()
  });
  appendHostAudit(params.hostDir, "OIDC_LOGIN_STARTED", null, {
    providerId: provider.id
  });
  return {
    redirectUrl: start.authorizationUrl,
    state: start.state
  };
}

export async function completeOidcCallback(params: {
  hostDir: string;
  config: IdentityConfig;
  providerId: string;
  code: string;
  state: string;
}): Promise<{ token: string; sessionId: string; userId: string; username: string }> {
  const provider = findProvider(params.config, params.providerId);
  const key = stateKey(params.hostDir, params.state);
  const pending = pendingStates.get(key);
  if (!pending || pending.providerId !== provider.id) {
    throw new Error("OIDC state mismatch");
  }
  pendingStates.delete(key);
  if (Date.now() - pending.createdTs > 10 * 60_000) {
    throw new Error("OIDC state expired");
  }
  const clientSecret = resolveIdentitySecretRef(params.hostDir, provider.oidc.clientSecretRef);
  const exchanged = await exchangeOidcCode({
    provider,
    code: params.code,
    verifier: pending.verifier,
    clientSecret
  });
  const endpoints = await resolveProviderEndpoints(provider);
  const verified = await verifyJwtIdToken({
    token: exchanged.idToken,
    issuer: provider.oidc.issuer,
    audience: provider.oidc.clientId,
    jwksUri: endpoints.jwksUri,
    nonce: pending.nonce
  });
  if (!verified.ok) {
    throw new Error(`OIDC id_token verification failed: ${verified.error}`);
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
    throw new Error("OIDC email_verified must be true");
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
}
