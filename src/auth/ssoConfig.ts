export const ENTERPRISE_ROLES = [
  "admin",
  "auditor",
  "developer",
  "viewer"
] as const;

export type EnterpriseRole = (typeof ENTERPRISE_ROLES)[number];

export interface OidcSsoConfig {
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecretRef: string;
  redirectUri: string;
  scopes: string[];
  claims: {
    subject: string;
    email: string;
    groups: string;
  };
}

export interface SamlSsoConfig {
  enabled: boolean;
  issuer: string;
  entryPoint: string;
  audience: string;
  acsUrl: string;
  certificateRef: string;
  attributes: {
    subject: string;
    email: string;
    groups: string;
  };
}

export interface SsoRoleMappingRule {
  externalGroup: string;
  role: EnterpriseRole;
}

export interface SsoRoleMapping {
  defaultRole: EnterpriseRole;
  rules: SsoRoleMappingRule[];
}

export interface SsoConfig {
  enabled: boolean;
  oidc?: OidcSsoConfig;
  saml?: SamlSsoConfig;
  roleMapping: SsoRoleMapping;
}

const ROLE_PRIORITY: Record<EnterpriseRole, number> = {
  viewer: 1,
  developer: 2,
  auditor: 3,
  admin: 4
};

function roleHigherPriority(a: EnterpriseRole, b: EnterpriseRole): EnterpriseRole {
  return ROLE_PRIORITY[a] >= ROLE_PRIORITY[b] ? a : b;
}

export function normalizeEnterpriseRole(raw: string): EnterpriseRole | null {
  const normalized = raw.trim().toLowerCase();
  if ((ENTERPRISE_ROLES as readonly string[]).includes(normalized)) {
    return normalized as EnterpriseRole;
  }
  return null;
}

export function mapSsoGroupsToRole(groups: readonly string[], mapping: SsoRoleMapping): EnterpriseRole {
  const groupSet = new Set(groups.map((group) => group.trim().toLowerCase()).filter((group) => group.length > 0));
  let resolved: EnterpriseRole = mapping.defaultRole;
  for (const rule of mapping.rules) {
    if (groupSet.has(rule.externalGroup.trim().toLowerCase())) {
      resolved = roleHigherPriority(resolved, rule.role);
    }
  }
  return resolved;
}

export function resolveSsoRole(params: {
  groups?: readonly string[];
  explicitRoles?: readonly string[];
  mapping: SsoRoleMapping;
}): EnterpriseRole {
  let resolved: EnterpriseRole = params.mapping.defaultRole;

  for (const value of params.explicitRoles ?? []) {
    const parsed = normalizeEnterpriseRole(value);
    if (parsed) {
      resolved = roleHigherPriority(resolved, parsed);
    }
  }

  return mapSsoGroupsToRole(params.groups ?? [], {
    defaultRole: resolved,
    rules: params.mapping.rules
  });
}

export function defaultSsoConfig(): SsoConfig {
  return {
    enabled: true,
    oidc: {
      enabled: true,
      issuer: "https://idp.example.com",
      clientId: "amc-enterprise",
      clientSecretRef: "vault:identity/oidc/clientSecret",
      redirectUri: "https://amc.example.com/auth/callback",
      scopes: ["openid", "email", "profile", "groups"],
      claims: {
        subject: "sub",
        email: "email",
        groups: "groups"
      }
    },
    saml: {
      enabled: false,
      issuer: "https://amc.example.com/saml",
      entryPoint: "https://idp.example.com/saml/login",
      audience: "amc-enterprise",
      acsUrl: "https://amc.example.com/saml/acs",
      certificateRef: "vault:identity/saml/idpCertificate",
      attributes: {
        subject: "subject",
        email: "email",
        groups: "groups"
      }
    },
    roleMapping: {
      defaultRole: "viewer",
      rules: [
        { externalGroup: "amc-admins", role: "admin" },
        { externalGroup: "amc-auditors", role: "auditor" },
        { externalGroup: "amc-developers", role: "developer" },
        { externalGroup: "amc-viewers", role: "viewer" }
      ]
    }
  };
}
