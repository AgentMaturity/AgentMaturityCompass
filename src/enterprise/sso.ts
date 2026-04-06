import { createHash, createHmac, randomUUID } from "node:crypto";

export type SsoProtocol = "SAML" | "OIDC";

export interface SamlAssertionClaims {
  readonly issuer: string;
  readonly subject: string;
  readonly audience: string;
  readonly notBefore: string;
  readonly notOnOrAfter: string;
  readonly attributes: Record<string, string | string[]>;
  readonly sessionIndex?: string;
}

export interface SamlValidationResult {
  readonly valid: boolean;
  readonly claims: SamlAssertionClaims | null;
  readonly errors: readonly string[];
}

export function validateSamlAssertion(params: {
  assertion: SamlAssertionClaims;
  expectedAudience: string;
  expectedIssuer: string;
  clockSkewMs?: number;
  now?: Date;
}): SamlValidationResult {
  const now = params.now ?? new Date();
  const clockSkew = params.clockSkewMs ?? 120_000;
  const errors: string[] = [];
  const assertion = params.assertion;

  if (assertion.issuer !== params.expectedIssuer) {
    errors.push(`issuer mismatch: expected ${params.expectedIssuer}, got ${assertion.issuer}`);
  }

  if (assertion.audience !== params.expectedAudience) {
    errors.push(`audience mismatch: expected ${params.expectedAudience}, got ${assertion.audience}`);
  }

  const notBefore = new Date(assertion.notBefore).getTime();
  const notOnOrAfter = new Date(assertion.notOnOrAfter).getTime();
  const nowMs = now.getTime();

  if (nowMs < notBefore - clockSkew) {
    errors.push("assertion not yet valid (notBefore)");
  }

  if (nowMs >= notOnOrAfter + clockSkew) {
    errors.push("assertion expired (notOnOrAfter)");
  }

  if (!assertion.subject || assertion.subject.trim().length === 0) {
    errors.push("subject is empty");
  }

  return {
    valid: errors.length === 0,
    claims: errors.length === 0 ? assertion : null,
    errors
  };
}

export interface OidcTokenClaims {
  readonly iss: string;
  readonly sub: string;
  readonly aud: string | string[];
  readonly exp: number;
  readonly iat: number;
  readonly email?: string;
  readonly email_verified?: boolean;
  readonly name?: string;
  readonly groups?: string[];
  readonly nonce?: string;
}

export interface OidcIntrospectionResult {
  readonly active: boolean;
  readonly claims: OidcTokenClaims | null;
  readonly errors: readonly string[];
}

export function introspectOidcToken(params: {
  claims: OidcTokenClaims;
  expectedIssuer: string;
  expectedAudience: string;
  now?: Date;
}): OidcIntrospectionResult {
  const now = params.now ?? new Date();
  const nowSec = Math.floor(now.getTime() / 1000);
  const errors: string[] = [];
  const claims = params.claims;

  if (claims.iss !== params.expectedIssuer) {
    errors.push(`issuer mismatch: expected ${params.expectedIssuer}, got ${claims.iss}`);
  }

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(params.expectedAudience)) {
    errors.push(`audience mismatch: ${params.expectedAudience} not in [${audiences.join(", ")}]`);
  }

  if (nowSec >= claims.exp) {
    errors.push("token expired");
  }

  if (claims.iat > nowSec + 60) {
    errors.push("token issued in the future");
  }

  return {
    active: errors.length === 0,
    claims: errors.length === 0 ? claims : null,
    errors
  };
}

export type AmcPermission =
  | "read"
  | "write"
  | "admin"
  | "audit:read"
  | "audit:export"
  | "fleet:manage"
  | "fleet:read"
  | "identity:manage"
  | "diagnostic:run"
  | "report:generate";

export interface RoleMappingRule {
  readonly groupPattern: string;
  readonly permissions: readonly AmcPermission[];
}

export interface RoleMappingConfig {
  readonly rules: readonly RoleMappingRule[];
  readonly defaultPermissions: readonly AmcPermission[];
}

export function mapClaimsToPermissions(params: {
  groups: readonly string[];
  config: RoleMappingConfig;
}): readonly AmcPermission[] {
  const permissions = new Set<AmcPermission>(params.config.defaultPermissions);

  for (const rule of params.config.rules) {
    const pattern = rule.groupPattern.toLowerCase();
    const matches = params.groups.some((g) => {
      const group = g.toLowerCase();
      if (pattern.endsWith("*")) {
        return group.startsWith(pattern.slice(0, -1));
      }
      return group === pattern;
    });
    if (matches) {
      for (const perm of rule.permissions) {
        permissions.add(perm);
      }
    }
  }

  return Array.from(permissions).sort();
}

export interface EnterpriseSsoSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly protocol: SsoProtocol;
  readonly providerId: string;
  readonly permissions: readonly AmcPermission[];
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly csrfToken: string;
}

export function createSsoSession(params: {
  userId: string;
  protocol: SsoProtocol;
  providerId: string;
  permissions: readonly AmcPermission[];
  ttlMinutes: number;
  now?: Date;
}): EnterpriseSsoSession {
  const now = params.now ?? new Date();
  const ttl = Math.max(5, params.ttlMinutes);
  return {
    sessionId: `esso_${randomUUID().replace(/-/g, "")}`,
    userId: params.userId,
    protocol: params.protocol,
    providerId: params.providerId,
    permissions: [...params.permissions],
    issuedAt: now.getTime(),
    expiresAt: now.getTime() + ttl * 60_000,
    csrfToken: randomUUID().replace(/-/g, "")
  };
}

export function isSessionValid(session: EnterpriseSsoSession, now?: Date): boolean {
  const nowMs = (now ?? new Date()).getTime();
  return nowMs < session.expiresAt;
}

export function sessionHasPermission(
  session: EnterpriseSsoSession,
  permission: AmcPermission
): boolean {
  return session.permissions.includes(permission);
}

export class SsoSessionStore {
  private readonly sessions = new Map<string, EnterpriseSsoSession>();

  create(params: {
    userId: string;
    protocol: SsoProtocol;
    providerId: string;
    permissions: readonly AmcPermission[];
    ttlMinutes: number;
    now?: Date;
  }): EnterpriseSsoSession {
    const session = createSsoSession(params);
    this.sessions.set(session.sessionId, session);
    return session;
  }

  get(sessionId: string): EnterpriseSsoSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  validate(sessionId: string, now?: Date): {
    valid: boolean;
    session: EnterpriseSsoSession | null;
    reason?: string;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { valid: false, session: null, reason: "session not found" };
    }
    if (!isSessionValid(session, now)) {
      return { valid: false, session, reason: "session expired" };
    }
    return { valid: true, session };
  }

  revoke(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  revokeByUser(userId: string): number {
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (session.userId === userId) {
        this.sessions.delete(id);
        count += 1;
      }
    }
    return count;
  }

  listActive(now?: Date): readonly EnterpriseSsoSession[] {
    const result: EnterpriseSsoSession[] = [];
    for (const session of this.sessions.values()) {
      if (isSessionValid(session, now)) {
        result.push(session);
      }
    }
    return result;
  }

  purgeExpired(now?: Date): number {
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (!isSessionValid(session, now)) {
        this.sessions.delete(id);
        count += 1;
      }
    }
    return count;
  }

  get size(): number {
    return this.sessions.size;
  }
}

export function buildSamlAssertionClaims(params: {
  issuer: string;
  subject: string;
  audience: string;
  ttlMinutes: number;
  attributes?: Record<string, string | string[]>;
  now?: Date;
}): SamlAssertionClaims {
  const now = params.now ?? new Date();
  const notBefore = now.toISOString();
  const notOnOrAfter = new Date(now.getTime() + params.ttlMinutes * 60_000).toISOString();
  return {
    issuer: params.issuer,
    subject: params.subject,
    audience: params.audience,
    notBefore,
    notOnOrAfter,
    attributes: params.attributes ?? {},
    sessionIndex: `_${randomUUID().replace(/-/g, "")}`
  };
}

export function buildOidcTokenClaims(params: {
  issuer: string;
  subject: string;
  audience: string;
  ttlSeconds: number;
  email?: string;
  name?: string;
  groups?: string[];
  now?: Date;
}): OidcTokenClaims {
  const now = params.now ?? new Date();
  const iat = Math.floor(now.getTime() / 1000);
  return {
    iss: params.issuer,
    sub: params.subject,
    aud: params.audience,
    iat,
    exp: iat + params.ttlSeconds,
    email: params.email,
    name: params.name,
    groups: params.groups,
    nonce: randomUUID().replace(/-/g, "")
  };
}
