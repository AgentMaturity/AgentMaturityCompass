import { dirname, resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createScimToken,
  initIdentityConfig,
  identityProviderSchema,
  loadIdentityConfig,
  saveIdentityConfig,
  verifyIdentityConfigSignature,
  type IdentityConfig
} from "./identityConfig.js";
import { ensureDir } from "../utils/fs.js";
import { hostVaultExists, initHostVault, setHostVaultSecret, unlockHostVault } from "./hostVault.js";

function nextConfig(hostDir: string, mutate: (config: IdentityConfig) => void): { path: string; sigPath: string } {
  const config = loadIdentityConfig(hostDir);
  mutate(config);
  return saveIdentityConfig(hostDir, config);
}

export function identityInitCli(hostDir: string): { path: string; sigPath: string } {
  if (!hostVaultExists(hostDir)) {
    initHostVault(hostDir);
  } else {
    unlockHostVault(hostDir);
  }
  return initIdentityConfig(hostDir);
}

export function identityVerifyCli(hostDir: string): {
  valid: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  const verified = verifyIdentityConfigSignature(hostDir);
  return {
    valid: verified.valid,
    reason: verified.reason,
    path: verified.path,
    sigPath: verified.sigPath
  };
}

export function identityProviderAddOidcCli(params: {
  hostDir: string;
  providerId: string;
  displayName?: string;
  issuer: string;
  clientId: string;
  clientSecretFile: string;
  redirectUri: string;
  scopes?: string[];
  useWellKnown?: boolean;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwksUri?: string;
}): { path: string; sigPath: string } {
  if (!hostVaultExists(params.hostDir)) {
    initHostVault(params.hostDir);
  } else {
    unlockHostVault(params.hostDir);
  }
  const clientSecret = readFileSync(resolve(params.clientSecretFile), "utf8").trim();
  if (!clientSecret) {
    throw new Error("OIDC client secret file is empty.");
  }
  setHostVaultSecret(params.hostDir, `identity/${params.providerId}/oidc/clientSecret`, clientSecret);
  return nextConfig(params.hostDir, (config) => {
    const providers = config.identity.providers.filter((provider) => provider.id !== params.providerId);
    providers.push(
      identityProviderSchema.parse({
        id: params.providerId,
        type: "OIDC",
        displayName: params.displayName ?? params.providerId,
        enabled: true,
        oidc: {
          issuer: params.issuer,
          clientId: params.clientId,
          clientSecretRef: `vault:identity/${params.providerId}/oidc/clientSecret`,
          redirectUri: params.redirectUri,
          scopes: params.scopes && params.scopes.length > 0 ? params.scopes : ["openid", "email", "profile", "groups"],
          discovery: {
            useWellKnown: params.useWellKnown ?? true,
            authorizationEndpoint: params.authorizationEndpoint,
            tokenEndpoint: params.tokenEndpoint,
            jwksUri: params.jwksUri
          },
          claims: {
            subject: "sub",
            email: "email",
            emailVerified: "email_verified",
            name: "name",
            groups: "groups"
          }
        }
      })
    );
    config.identity.providers = providers;
  });
}

export function identityProviderAddSamlCli(params: {
  hostDir: string;
  providerId: string;
  displayName?: string;
  entryPoint: string;
  issuer: string;
  idpCertFile: string;
  spEntityId: string;
  acsUrl: string;
}): { path: string; sigPath: string } {
  if (!hostVaultExists(params.hostDir)) {
    initHostVault(params.hostDir);
  } else {
    unlockHostVault(params.hostDir);
  }
  const certPem = readFileSync(resolve(params.idpCertFile), "utf8").trim();
  if (!certPem) {
    throw new Error("SAML IdP cert file is empty.");
  }
  setHostVaultSecret(params.hostDir, `identity/${params.providerId}/saml/idpCertPem`, certPem);
  return nextConfig(params.hostDir, (config) => {
    const providers = config.identity.providers.filter((provider) => provider.id !== params.providerId);
    providers.push(
      identityProviderSchema.parse({
        id: params.providerId,
        type: "SAML",
        displayName: params.displayName ?? params.providerId,
        enabled: true,
        saml: {
          sp: {
            entityId: params.spEntityId,
            acsUrl: params.acsUrl
          },
          idp: {
            entryPoint: params.entryPoint,
            issuer: params.issuer,
            certPemRef: `vault:identity/${params.providerId}/saml/idpCertPem`
          },
          security: {
            wantAssertionsSigned: true,
            wantResponseSigned: true,
            acceptedClockSkewMs: 120_000
          },
          claims: {
            subject: "subject",
            email: "email",
            name: "name",
            groups: "groups"
          }
        }
      })
    );
    config.identity.providers = providers;
  });
}

export function identityMappingAddCli(params: {
  hostDir: string;
  group: string;
  workspaceId?: string;
  roles?: Array<"OWNER" | "OPERATOR" | "AUDITOR" | "VIEWER">;
  providerId?: string;
  hostAdmin?: boolean;
}): { path: string; sigPath: string } {
  return nextConfig(params.hostDir, (config) => {
    config.identity.roleMapping.rules.push({
      match: {
        providerId: params.providerId,
        groupsAny: [params.group]
      },
      grant: {
        hostAdmin: params.hostAdmin,
        workspaceId: params.workspaceId,
        roles: params.roles
      }
    });
  });
}

export function scimTokenCreateCli(params: {
  hostDir: string;
  name: string;
  outFile?: string;
}): {
  tokenId: string;
  token: string;
  tokenHash: string;
} {
  unlockHostVault(params.hostDir);
  const created = createScimToken(params.hostDir, params.name);
  if (params.outFile) {
    const outPath = resolve(params.outFile);
    ensureDir(dirname(outPath));
    writeFileSync(outPath, `${created.token}\n`, { mode: 0o600 });
  }
  return created;
}

export function scimInitCli(params: {
  hostDir: string;
  requireHttps?: boolean;
  tokenName?: string;
  outFile?: string;
}): {
  path: string;
  sigPath: string;
  enabled: true;
  requireHttps: boolean;
  token?: {
    tokenId: string;
    token: string;
    tokenHash: string;
  };
} {
  if (!hostVaultExists(params.hostDir)) {
    initHostVault(params.hostDir);
  } else {
    unlockHostVault(params.hostDir);
  }
  const saved = nextConfig(params.hostDir, (config) => {
    config.identity.scim.enabled = true;
    config.identity.scim.auth.requireHttps = params.requireHttps ?? true;
  });
  const token = params.tokenName
    ? scimTokenCreateCli({
        hostDir: params.hostDir,
        name: params.tokenName,
        outFile: params.outFile
      })
    : undefined;
  return {
    ...saved,
    enabled: true,
    requireHttps: params.requireHttps ?? true,
    token
  };
}
