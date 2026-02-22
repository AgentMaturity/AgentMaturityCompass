import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import YAML from "yaml";
import { ensureDir, pathExists, readUtf8, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import {
  setHostVaultSecret,
  getHostVaultSecret,
  hostVaultExists,
  hostVaultPublicKeyPem,
  initHostVault,
  signHostPayload,
  unlockHostVault,
  verifyHostPayload
} from "./hostVault.js";

const providerBase = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  enabled: z.boolean().default(true)
});

const oidcProviderSchema = providerBase.extend({
  type: z.literal("OIDC"),
  oidc: z.object({
    issuer: z.string().min(1),
    clientId: z.string().min(1),
    clientSecretRef: z.string().startsWith("vault:"),
    redirectUri: z.string().min(1),
    scopes: z.array(z.string().min(1)).min(1),
    discovery: z.object({
      useWellKnown: z.boolean().default(true),
      authorizationEndpoint: z.string().optional(),
      tokenEndpoint: z.string().optional(),
      jwksUri: z.string().optional()
    }),
    claims: z.object({
      subject: z.string().default("sub"),
      email: z.string().default("email"),
      emailVerified: z.string().default("email_verified"),
      name: z.string().default("name"),
      groups: z.string().default("groups")
    })
  })
});

const samlProviderSchema = providerBase.extend({
  type: z.literal("SAML"),
  saml: z.object({
    sp: z.object({
      entityId: z.string().min(1),
      acsUrl: z.string().min(1)
    }),
    idp: z.object({
      entryPoint: z.string().min(1),
      issuer: z.string().min(1),
      certPemRef: z.string().startsWith("vault:")
    }),
    security: z.object({
      wantAssertionsSigned: z.boolean().default(true),
      wantResponseSigned: z.boolean().default(true),
      acceptedClockSkewMs: z.number().int().positive().default(120_000)
    }),
    claims: z
      .object({
        subject: z.string().default("subject"),
        email: z.string().default("email"),
        name: z.string().default("name"),
        groups: z.string().default("groups")
      })
      .default({
        subject: "subject",
        email: "email",
        name: "name",
        groups: "groups"
      })
  })
});

export const identityProviderSchema = z.discriminatedUnion("type", [oidcProviderSchema, samlProviderSchema]);
export type IdentityProvider = z.infer<typeof identityProviderSchema>;

const roleGrantSchema = z.object({
  hostAdmin: z.boolean().optional(),
  workspaceId: z.string().optional(),
  roles: z.array(z.enum(["OWNER", "OPERATOR", "AUDITOR", "VIEWER"])).optional()
});

const roleRuleSchema = z.object({
  match: z.object({
    providerId: z.string().optional(),
    groupsAny: z.array(z.string()).default([]),
    subjectEquals: z.string().optional(),
    emailDomain: z.string().optional()
  }),
  grant: roleGrantSchema
});

const scimSchema = z.object({
  enabled: z.boolean().default(false),
  basePath: z.string().default("/host/scim/v2"),
  auth: z.object({
    scheme: z.literal("BEARER_TOKEN").default("BEARER_TOKEN"),
    tokensRefPrefix: z.string().default("vault:scim/tokens/"),
    requireHttps: z.boolean().default(true)
  }),
  behavior: z.object({
    deleteDisablesUser: z.boolean().default(true),
    createUsersWithoutPassword: z.boolean().default(true),
    updateEmailChangesUsername: z.boolean().default(false),
    groupsDriveMembership: z.boolean().default(true)
  })
});

export const identityConfigSchema = z.object({
  identity: z.object({
    version: z.literal(1),
    localAuth: z.object({
      enabled: z.boolean().default(true),
      passwordLoginEnabled: z.boolean().default(true),
      requireAtLeastOneWorkingAuthMethod: z.boolean().default(true)
    }),
    session: z.object({
      cookieName: z.string().default("amc_session"),
      ttlMinutes: z.number().int().positive().default(480),
      rotateMinutes: z.number().int().positive().default(60),
      cookieSecure: z.boolean().default(false),
      cookieSameSite: z.enum(["Lax", "Strict"]).default("Strict"),
      cookiePath: z.string().default("/")
    }),
    providers: z.array(identityProviderSchema).default([]),
    roleMapping: z.object({
      version: z.literal(1),
      rules: z.array(roleRuleSchema).default([])
    }),
    scim: scimSchema.default({
      enabled: false,
      basePath: "/host/scim/v2",
      auth: {
        scheme: "BEARER_TOKEN",
        tokensRefPrefix: "vault:scim/tokens/",
        requireHttps: true
      },
      behavior: {
        deleteDisablesUser: true,
        createUsersWithoutPassword: true,
        updateEmailChangesUsername: false,
        groupsDriveMembership: true
      }
    })
  })
});

export type IdentityConfig = z.infer<typeof identityConfigSchema>;

interface IdentitySigEnvelope {
  v: 1;
  digestSha256: string;
  signature: string;
  pubkeyFingerprint: string;
  signedTs: number;
}

export function identityConfigPaths(hostDir: string): {
  dir: string;
  path: string;
  sigPath: string;
} {
  const dir = join(hostDir, "identity");
  return {
    dir,
    path: join(dir, "identity.yaml"),
    sigPath: join(dir, "identity.yaml.sig")
  };
}

export function defaultIdentityConfig(): IdentityConfig {
  return identityConfigSchema.parse({
    identity: {
      version: 1,
      localAuth: {
        enabled: true,
        passwordLoginEnabled: true,
        requireAtLeastOneWorkingAuthMethod: true
      },
      session: {
        cookieName: "amc_session",
        ttlMinutes: 480,
        rotateMinutes: 60,
        cookieSecure: false,
        cookieSameSite: "Strict",
        cookiePath: "/"
      },
      providers: [],
      roleMapping: {
        version: 1,
        rules: []
      },
      scim: {
        enabled: false,
        basePath: "/host/scim/v2",
        auth: {
          scheme: "BEARER_TOKEN",
          tokensRefPrefix: "vault:scim/tokens/",
          requireHttps: true
        },
        behavior: {
          deleteDisablesUser: true,
          createUsersWithoutPassword: true,
          updateEmailChangesUsername: false,
          groupsDriveMembership: true
        }
      }
    }
  });
}

export function loadIdentityConfig(hostDir: string): IdentityConfig {
  const paths = identityConfigPaths(hostDir);
  if (!pathExists(paths.path)) {
    return defaultIdentityConfig();
  }
  return identityConfigSchema.parse(YAML.parse(readUtf8(paths.path)) as unknown);
}

function signIdentityConfig(hostDir: string): string {
  const paths = identityConfigPaths(hostDir);
  const payloadBytes = Buffer.from(readUtf8(paths.path), "utf8");
  const digestSha256 = sha256Hex(payloadBytes);
  const signature = signHostPayload(hostDir, "auditor", payloadBytes);
  const pubPem = hostVaultPublicKeyPem(hostDir, "auditor");
  const envelope: IdentitySigEnvelope = {
    v: 1,
    digestSha256,
    signature,
    pubkeyFingerprint: sha256Hex(Buffer.from(pubPem, "utf8")),
    signedTs: Date.now()
  };
  writeFileAtomic(paths.sigPath, JSON.stringify(envelope, null, 2), 0o644);
  return paths.sigPath;
}

export function initIdentityConfig(hostDir: string): {
  path: string;
  sigPath: string;
} {
  if (!hostVaultExists(hostDir)) {
    initHostVault(hostDir);
  } else {
    unlockHostVault(hostDir);
  }
  const paths = identityConfigPaths(hostDir);
  ensureDir(paths.dir);
  writeFileAtomic(paths.path, YAML.stringify(defaultIdentityConfig()), 0o644);
  return {
    path: paths.path,
    sigPath: signIdentityConfig(hostDir)
  };
}

export function saveIdentityConfig(hostDir: string, config: IdentityConfig): {
  path: string;
  sigPath: string;
} {
  if (!hostVaultExists(hostDir)) {
    initHostVault(hostDir);
  } else {
    unlockHostVault(hostDir);
  }
  const paths = identityConfigPaths(hostDir);
  ensureDir(paths.dir);
  writeFileAtomic(paths.path, YAML.stringify(identityConfigSchema.parse(config)), 0o644);
  return {
    path: paths.path,
    sigPath: signIdentityConfig(hostDir)
  };
}

export function verifyIdentityConfigSignature(hostDir: string): {
  valid: boolean;
  signatureExists: boolean;
  reason: string | null;
  path: string;
  sigPath: string;
} {
  const paths = identityConfigPaths(hostDir);
  if (!pathExists(paths.path)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "identity config missing",
      path: paths.path,
      sigPath: paths.sigPath
    };
  }
  if (!pathExists(paths.sigPath)) {
    return {
      valid: false,
      signatureExists: false,
      reason: "identity signature missing",
      path: paths.path,
      sigPath: paths.sigPath
    };
  }
  try {
    const raw = JSON.parse(readUtf8(paths.sigPath)) as IdentitySigEnvelope;
    if (raw.v !== 1 || typeof raw.signature !== "string" || typeof raw.digestSha256 !== "string") {
      return {
        valid: false,
        signatureExists: true,
        reason: "invalid signature envelope",
        path: paths.path,
        sigPath: paths.sigPath
      };
    }
    const payloadBytes = Buffer.from(readUtf8(paths.path), "utf8");
    const digest = sha256Hex(payloadBytes);
    if (digest !== raw.digestSha256) {
      return {
        valid: false,
        signatureExists: true,
        reason: "digest mismatch",
        path: paths.path,
        sigPath: paths.sigPath
      };
    }
    const pubPem = hostVaultPublicKeyPem(hostDir, "auditor");
    const fingerprint = sha256Hex(Buffer.from(pubPem, "utf8"));
    if (fingerprint !== raw.pubkeyFingerprint) {
      return {
        valid: false,
        signatureExists: true,
        reason: "auditor public key fingerprint mismatch",
        path: paths.path,
        sigPath: paths.sigPath
      };
    }
    const ok = verifyHostPayload(hostDir, "auditor", payloadBytes, raw.signature);
    return {
      valid: ok,
      signatureExists: true,
      reason: ok ? null : "signature verification failed",
      path: paths.path,
      sigPath: paths.sigPath
    };
  } catch (error) {
    return {
      valid: false,
      signatureExists: true,
      reason: String(error),
      path: paths.path,
      sigPath: paths.sigPath
    };
  }
}

export function resolveIdentitySecretRef(hostDir: string, ref: string): string {
  if (!ref.startsWith("vault:")) {
    throw new Error(`Unsupported secret ref: ${ref}`);
  }
  unlockHostVault(hostDir);
  const key = ref.replace(/^vault:/, "");
  const secret = getHostVaultSecret(hostDir, key);
  if (!secret || secret.length === 0) {
    throw new Error(`Missing secret for ref ${ref}`);
  }
  return secret;
}

const UNSAFE_SCIM_INDEX_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isSafeScimIndexKey(key: string): boolean {
  return key.length > 0 && !UNSAFE_SCIM_INDEX_KEYS.has(key);
}

function parseScimTokenIndex(raw: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return Object.create(null) as Record<string, string>;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return Object.create(null) as Record<string, string>;
  }
  const out = Object.create(null) as Record<string, string>;
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isSafeScimIndexKey(key) || typeof value !== "string" || value.length === 0) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function createScimToken(hostDir: string, tokenId: string): {
  tokenId: string;
  token: string;
  tokenHash: string;
} {
  const sanitized = tokenId.trim();
  if (!sanitized) {
    throw new Error("token id is required");
  }
  if (!isSafeScimIndexKey(sanitized)) {
    throw new Error("token id contains unsafe key name");
  }
  unlockHostVault(hostDir);
  const token = randomBytes(32).toString("base64url");
  const tokenHash = sha256Hex(Buffer.from(token, "utf8"));
  const secretKey = `scim/tokens/${sanitized}`;
  const manifestKey = "scim/tokens/_index";
  const existingRaw = getHostVaultSecret(hostDir, manifestKey);
  const existing = existingRaw ? parseScimTokenIndex(existingRaw) : (Object.create(null) as Record<string, string>);
  existing[sanitized] = tokenHash;
  // set secret index and hash in host vault
  // secret storage is keyed by ref suffix (without vault:)
  setHostVaultSecret(hostDir, secretKey, tokenHash);
  setHostVaultSecret(hostDir, manifestKey, JSON.stringify(existing));
  return {
    tokenId: sanitized,
    token,
    tokenHash
  };
}

export function listScimTokenIds(hostDir: string): string[] {
  unlockHostVault(hostDir);
  const raw = getHostVaultSecret(hostDir, "scim/tokens/_index");
  if (!raw) {
    return [];
  }
  const parsed = parseScimTokenIndex(raw);
  return Object.keys(parsed).sort((a, b) => a.localeCompare(b));
}

export function validateScimBearerToken(hostDir: string, token: string): { ok: boolean; tokenId: string | null } {
  if (!token || token.length < 8) {
    return { ok: false, tokenId: null };
  }
  unlockHostVault(hostDir);
  const raw = getHostVaultSecret(hostDir, "scim/tokens/_index");
  if (!raw) {
    return { ok: false, tokenId: null };
  }
  const digest = sha256Hex(Buffer.from(token, "utf8"));
  const parsed = parseScimTokenIndex(raw);
  const tokenId = Object.entries(parsed).find(([, hash]) => hash === digest)?.[0] ?? null;
  return {
    ok: tokenId !== null,
    tokenId
  };
}

export function canonicalIdentityConfigJson(hostDir: string): string {
  return canonicalize(loadIdentityConfig(hostDir));
}
