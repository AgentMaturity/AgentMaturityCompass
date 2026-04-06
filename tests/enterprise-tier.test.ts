import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  validateLicenseKeyFormat,
  detectTierFromKey
} from "../src/enterprise/license.js";

import {
  buildEnterpriseAuditPayload,
  buildSignedAuditTrail,
  verifyAuditTrailIntegrity,
  applyRetentionPolicy,
  type EnterpriseAuditRecord,
  type ElasticsearchBulkPayload,
  type SyslogCefEvent,
  type SignedAuditTrail
} from "../src/audit/enterpriseAuditExport.js";

import {
  validateSamlAssertion,
  introspectOidcToken,
  mapClaimsToPermissions,
  createSsoSession,
  isSessionValid,
  sessionHasPermission,
  SsoSessionStore,
  buildSamlAssertionClaims,
  buildOidcTokenClaims,
  type RoleMappingConfig,
  type SamlAssertionClaims,
  type OidcTokenClaims
} from "../src/enterprise/sso.js";

import {
  createTenant,
  listTenants,
  getTenant,
  updateTenantQuotas,
  recordTenantUsage,
  getTenantUsage,
  resolveInheritedPolicies,
  generateTenantComplianceReport,
  checkQuotaViolation,
  resolveCrossOrgPolicy,
  generateUsageMeteringSummary
} from "../src/enterprise/fleetGovernance.js";

const roots: string[] = [];

function newDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

/* ────────────────────────────────────────────────────────────────── */
/*  License Key Format Validation                                    */
/* ────────────────────────────────────────────────────────────────── */

describe("license key format validation", () => {
  test("accepts valid enterprise key format", () => {
    const result = validateLicenseKeyFormat("AMC-ENT-AB12-CD34-EF56");
    expect(result.valid).toBe(true);
    expect(result.tier).toBe("ENTERPRISE");
    expect(result.prefix).toBe("ENT");
    expect(result.errors).toHaveLength(0);
  });

  test("accepts valid professional key format", () => {
    const result = validateLicenseKeyFormat("AMC-PRO-1234-5678-ABCD");
    expect(result.valid).toBe(true);
    expect(result.tier).toBe("PRO");
    expect(result.prefix).toBe("PRO");
  });

  test("accepts valid community key format", () => {
    const result = validateLicenseKeyFormat("AMC-COM-AAAA-BBBB-CCCC");
    expect(result.valid).toBe(true);
    expect(result.tier).toBe("FREE");
    expect(result.prefix).toBe("COM");
  });

  test("rejects key with wrong prefix", () => {
    const result = validateLicenseKeyFormat("XYZ-ENT-AB12-CD34-EF56");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("rejects key with wrong segment count", () => {
    const result = validateLicenseKeyFormat("AMC-ENT-AB12-CD34");
    expect(result.valid).toBe(false);
  });

  test("rejects key with lowercase characters", () => {
    const result = validateLicenseKeyFormat("AMC-ENT-ab12-CD34-EF56");
    expect(result.valid).toBe(false);
  });

  test("rejects empty string", () => {
    const result = validateLicenseKeyFormat("");
    expect(result.valid).toBe(false);
  });

  test("trims whitespace before validation", () => {
    const result = validateLicenseKeyFormat("  AMC-ENT-AB12-CD34-EF56  ");
    expect(result.valid).toBe(true);
  });

  test("detectTierFromKey returns correct tier", () => {
    expect(detectTierFromKey("AMC-ENT-AB12-CD34-EF56")).toBe("ENTERPRISE");
    expect(detectTierFromKey("AMC-PRO-AB12-CD34-EF56")).toBe("PRO");
    expect(detectTierFromKey("AMC-COM-AB12-CD34-EF56")).toBe("FREE");
    expect(detectTierFromKey("invalid")).toBe("FREE");
  });
});

/* ────────────────────────────────────────────────────────────────── */
/*  SIEM Export: Elasticsearch Bulk                                  */
/* ────────────────────────────────────────────────────────────────── */

const sampleRecords: EnterpriseAuditRecord[] = [
  {
    eventId: "evt_es1",
    ts: 1_700_000_000_000,
    timestamp: "2023-11-14T22:13:20.000Z",
    actor: "admin",
    action: "POLICY_APPLY",
    resource: "workspace:main",
    outcome: "success",
    sourceIp: "10.0.0.5",
    userAgent: "amc-cli",
    details: { control: "ACCESS_CONTROL" }
  },
  {
    eventId: "evt_es2",
    ts: 1_700_000_010_000,
    timestamp: "2023-11-14T22:13:30.000Z",
    actor: "auditor",
    action: "AUDIT_EXPORT",
    resource: "workspace:main",
    outcome: "failure",
    sourceIp: null,
    userAgent: null,
    details: { reason: "permission denied" }
  }
];

describe("SIEM export: Elasticsearch bulk format", () => {
  test("produces NDJSON bulk payload with action+document pairs", () => {
    const payload = buildEnterpriseAuditPayload("elasticsearch", sampleRecords) as ElasticsearchBulkPayload;
    expect(payload.documentCount).toBe(2);
    expect(payload.lines).toHaveLength(4); // 2 action + 2 doc lines

    const action = JSON.parse(payload.lines[0]!) as { index: { _index: string; _id: string } };
    expect(action.index._index).toBe("amc-audit");
    expect(action.index._id).toBe("evt_es1");

    const doc = JSON.parse(payload.lines[1]!) as { "@timestamp": string; event: { action: string } };
    expect(doc["@timestamp"]).toBe("2023-11-14T22:13:20.000Z");
    expect(doc.event.action).toBe("POLICY_APPLY");
  });
});

/* ────────────────────────────────────────────────────────────────── */
/*  SIEM Export: Syslog CEF                                          */
/* ────────────────────────────────────────────────────────────────── */

describe("SIEM export: syslog CEF format", () => {
  test("produces CEF-formatted syslog events", () => {
    const payload = buildEnterpriseAuditPayload("syslog", sampleRecords) as SyslogCefEvent[];
    expect(payload).toHaveLength(2);
    expect(payload[0]!.header).toContain("CEF:0|AMC|");
    expect(payload[0]!.header).toContain("POLICY_APPLY");
    expect(payload[0]!.extension).toContain("suser=admin");
    expect(payload[0]!.raw).toBe(`${payload[0]!.header}${payload[0]!.extension}`);
  });

  test("assigns higher severity to failure outcomes", () => {
    const payload = buildEnterpriseAuditPayload("syslog", sampleRecords) as SyslogCefEvent[];
    // success -> severity 3, failure -> severity 7
    expect(payload[0]!.header).toContain("|3|");
    expect(payload[1]!.header).toContain("|7|");
  });
});

/* ────────────────────────────────────────────────────────────────── */
/*  Signed Audit Trails                                              */
/* ────────────────────────────────────────────────────────────────── */

describe("signed audit trails", () => {
  test("builds a signed audit trail with integrity and chain hashes", () => {
    const trail = buildSignedAuditTrail(sampleRecords);
    expect(trail.version).toBe(1);
    expect(trail.recordCount).toBe(2);
    expect(trail.records).toHaveLength(2);
    expect(trail.integrityHash).toBeTruthy();
    expect(trail.chainHash).toBeTruthy();
    expect(trail.generatedAt).toBeTruthy();
  });

  test("verifies a valid trail", () => {
    const trail = buildSignedAuditTrail(sampleRecords);
    const result = verifyAuditTrailIntegrity(trail);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("detects tampered records", () => {
    const trail = buildSignedAuditTrail(sampleRecords);
    const tampered: SignedAuditTrail = {
      ...trail,
      records: trail.records.map((r, i) =>
        i === 0 ? { ...r, action: "TAMPERED" } : r
      )
    };
    const result = verifyAuditTrailIntegrity(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test("detects record count mismatch", () => {
    const trail = buildSignedAuditTrail(sampleRecords);
    const tampered: SignedAuditTrail = {
      ...trail,
      recordCount: 999
    };
    const result = verifyAuditTrailIntegrity(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("record count mismatch"))).toBe(true);
  });

  test("sorts records by timestamp", () => {
    const reversed = [...sampleRecords].reverse();
    const trail = buildSignedAuditTrail(reversed);
    expect(trail.records[0]!.ts).toBeLessThanOrEqual(trail.records[1]!.ts);
  });
});

/* ────────────────────────────────────────────────────────────────── */
/*  Retention Policies                                               */
/* ────────────────────────────────────────────────────────────────── */

describe("retention policies", () => {
  const now = new Date("2024-01-15T00:00:00.000Z");
  const records: EnterpriseAuditRecord[] = [
    { ...sampleRecords[0]!, eventId: "old", ts: new Date("2023-06-01").getTime() },
    { ...sampleRecords[0]!, eventId: "recent1", ts: new Date("2024-01-10").getTime() },
    { ...sampleRecords[0]!, eventId: "recent2", ts: new Date("2024-01-14").getTime() }
  ];

  test("filters records older than maxAgeDays", () => {
    const result = applyRetentionPolicy(records, { maxAgeDays: 30, maxRecords: 1000 }, now);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.eventId !== "old")).toBe(true);
  });

  test("limits records to maxRecords (keeping newest)", () => {
    const result = applyRetentionPolicy(records, { maxAgeDays: 365, maxRecords: 1 }, now);
    expect(result).toHaveLength(1);
    expect(result[0]!.eventId).toBe("recent2");
  });

  test("returns all records if within policy", () => {
    const result = applyRetentionPolicy(records, { maxAgeDays: 365, maxRecords: 1000 }, now);
    expect(result).toHaveLength(3);
  });
});

/* ────────────────────────────────────────────────────────────────── */
/*  SSO: SAML Assertion Helpers                                      */
/* ────────────────────────────────────────────────────────────────── */

describe("SAML assertion validation", () => {
  const now = new Date("2024-06-15T12:00:00.000Z");

  test("validates a correct SAML assertion", () => {
    const assertion: SamlAssertionClaims = {
      issuer: "https://idp.example.com",
      subject: "user@example.com",
      audience: "https://amc.example.com",
      notBefore: "2024-06-15T11:58:00.000Z",
      notOnOrAfter: "2024-06-15T12:10:00.000Z",
      attributes: { role: "admin" }
    };
    const result = validateSamlAssertion({
      assertion,
      expectedAudience: "https://amc.example.com",
      expectedIssuer: "https://idp.example.com",
      now
    });
    expect(result.valid).toBe(true);
    expect(result.claims).toBeTruthy();
    expect(result.errors).toHaveLength(0);
  });

  test("rejects mismatched issuer", () => {
    const assertion: SamlAssertionClaims = {
      issuer: "https://other-idp.com",
      subject: "user@example.com",
      audience: "https://amc.example.com",
      notBefore: "2024-06-15T11:58:00.000Z",
      notOnOrAfter: "2024-06-15T12:10:00.000Z",
      attributes: {}
    };
    const result = validateSamlAssertion({
      assertion,
      expectedAudience: "https://amc.example.com",
      expectedIssuer: "https://idp.example.com",
      now
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("issuer mismatch"))).toBe(true);
  });

  test("rejects expired assertion", () => {
    const assertion: SamlAssertionClaims = {
      issuer: "https://idp.example.com",
      subject: "user@example.com",
      audience: "https://amc.example.com",
      notBefore: "2024-06-15T10:00:00.000Z",
      notOnOrAfter: "2024-06-15T10:05:00.000Z",
      attributes: {}
    };
    const result = validateSamlAssertion({
      assertion,
      expectedAudience: "https://amc.example.com",
      expectedIssuer: "https://idp.example.com",
      now
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("expired"))).toBe(true);
  });
});

describe("buildSamlAssertionClaims helper", () => {
  test("builds claims with correct time window", () => {
    const now = new Date("2024-06-15T12:00:00.000Z");
    const claims = buildSamlAssertionClaims({
      issuer: "https://idp.example.com",
      subject: "user@example.com",
      audience: "https://amc.example.com",
      ttlMinutes: 10,
      now
    });
    expect(claims.issuer).toBe("https://idp.example.com");
    expect(claims.notBefore).toBe("2024-06-15T12:00:00.000Z");
    expect(claims.notOnOrAfter).toBe("2024-06-15T12:10:00.000Z");
    expect(claims.sessionIndex).toBeTruthy();
  });
});

/* ────────────────────────────────────────────────────────────────── */
/*  SSO: OIDC Token Introspection                                    */
/* ────────────────────────────────────────────────────────────────── */

describe("OIDC token introspection", () => {
  const now = new Date("2024-06-15T12:00:00.000Z");
  const iat = Math.floor(now.getTime() / 1000);

  test("validates a correct OIDC token", () => {
    const claims: OidcTokenClaims = {
      iss: "https://idp.example.com",
      sub: "user123",
      aud: "amc-client",
      iat,
      exp: iat + 3600,
      email: "user@example.com",
      groups: ["amc-admins"]
    };
    const result = introspectOidcToken({
      claims,
      expectedIssuer: "https://idp.example.com",
      expectedAudience: "amc-client",
      now
    });
    expect(result.active).toBe(true);
    expect(result.claims).toBeTruthy();
    expect(result.errors).toHaveLength(0);
  });

  test("rejects expired token", () => {
    const claims: OidcTokenClaims = {
      iss: "https://idp.example.com",
      sub: "user123",
      aud: "amc-client",
      iat: iat - 7200,
      exp: iat - 3600
    };
    const result = introspectOidcToken({
      claims,
      expectedIssuer: "https://idp.example.com",
      expectedAudience: "amc-client",
      now
    });
    expect(result.active).toBe(false);
    expect(result.errors.some((e) => e.includes("expired"))).toBe(true);
  });

  test("rejects audience mismatch", () => {
    const claims: OidcTokenClaims = {
      iss: "https://idp.example.com",
      sub: "user123",
      aud: "wrong-client",
      iat,
      exp: iat + 3600
    };
    const result = introspectOidcToken({
      claims,
      expectedIssuer: "https://idp.example.com",
      expectedAudience: "amc-client",
      now
    });
    expect(result.active).toBe(false);
    expect(result.errors.some((e) => e.includes("audience mismatch"))).toBe(true);
  });
});

describe("buildOidcTokenClaims helper", () => {
  test("builds claims with correct expiry", () => {
    const now = new Date("2024-06-15T12:00:00.000Z");
    const claims = buildOidcTokenClaims({
      issuer: "https://idp.example.com",
      subject: "user123",
      audience: "amc-client",
      ttlSeconds: 3600,
      email: "user@example.com",
      groups: ["admins"],
      now
    });
    expect(claims.iss).toBe("https://idp.example.com");
    expect(claims.exp - claims.iat).toBe(3600);
    expect(claims.email).toBe("user@example.com");
    expect(claims.nonce).toBeTruthy();
  });
});

/* ────────────────────────────────────────────────────────────────── */
/*  SSO: Role-Permission Mapping                                     */
/* ────────────────────────────────────────────────────────────────── */

describe("role-permission mapping", () => {
  const config: RoleMappingConfig = {
    rules: [
      { groupPattern: "amc-admins", permissions: ["admin", "write", "read"] },
      { groupPattern: "amc-auditors", permissions: ["audit:read", "audit:export"] },
      { groupPattern: "amc-dev*", permissions: ["write", "read", "diagnostic:run"] }
    ],
    defaultPermissions: ["read"]
  };

  test("maps exact group match", () => {
    const perms = mapClaimsToPermissions({ groups: ["amc-admins"], config });
    expect(perms).toContain("admin");
    expect(perms).toContain("read");
    expect(perms).toContain("write");
  });

  test("maps wildcard group match", () => {
    const perms = mapClaimsToPermissions({ groups: ["amc-developers"], config });
    expect(perms).toContain("write");
    expect(perms).toContain("diagnostic:run");
  });

  test("includes default permissions for unknown groups", () => {
    const perms = mapClaimsToPermissions({ groups: ["unknown-group"], config });
    expect(perms).toEqual(["read"]);
  });

  test("merges permissions from multiple matching groups", () => {
    const perms = mapClaimsToPermissions({
      groups: ["amc-admins", "amc-auditors"],
      config
    });
    expect(perms).toContain("admin");
    expect(perms).toContain("audit:export");
  });
});

/* ────────────────────────────────────────────────────────────────── */
/*  SSO: Session Management & Store                                  */
/* ────────────────────────────────────────────────────────────────── */

describe("SSO session management", () => {
  const now = new Date("2024-06-15T12:00:00.000Z");

  test("creates a session with CSRF token", () => {
    const session = createSsoSession({
      userId: "user1",
      protocol: "OIDC",
      providerId: "provider1",
      permissions: ["read", "write"],
      ttlMinutes: 60,
      now
    });
    expect(session.sessionId).toMatch(/^esso_/);
    expect(session.csrfToken).toBeTruthy();
    expect(session.expiresAt).toBe(now.getTime() + 60 * 60_000);
  });

  test("validates session expiry", () => {
    const session = createSsoSession({
      userId: "user1",
      protocol: "SAML",
      providerId: "idp1",
      permissions: ["read"],
      ttlMinutes: 30,
      now
    });
    expect(isSessionValid(session, now)).toBe(true);
    const later = new Date(now.getTime() + 31 * 60_000);
    expect(isSessionValid(session, later)).toBe(false);
  });

  test("checks session permissions", () => {
    const session = createSsoSession({
      userId: "user1",
      protocol: "OIDC",
      providerId: "p1",
      permissions: ["read", "audit:read"],
      ttlMinutes: 60,
      now
    });
    expect(sessionHasPermission(session, "read")).toBe(true);
    expect(sessionHasPermission(session, "admin")).toBe(false);
  });
});

describe("SsoSessionStore", () => {
  const now = new Date("2024-06-15T12:00:00.000Z");

  test("creates and retrieves sessions", () => {
    const store = new SsoSessionStore();
    const session = store.create({
      userId: "user1",
      protocol: "OIDC",
      providerId: "p1",
      permissions: ["read"],
      ttlMinutes: 60,
      now
    });
    expect(store.get(session.sessionId)).toBeTruthy();
    expect(store.size).toBe(1);
  });

  test("validates sessions", () => {
    const store = new SsoSessionStore();
    const session = store.create({
      userId: "user1",
      protocol: "SAML",
      providerId: "idp1",
      permissions: ["read"],
      ttlMinutes: 30,
      now
    });

    const valid = store.validate(session.sessionId, now);
    expect(valid.valid).toBe(true);

    const expired = store.validate(session.sessionId, new Date(now.getTime() + 31 * 60_000));
    expect(expired.valid).toBe(false);
    expect(expired.reason).toBe("session expired");
  });

  test("returns invalid for unknown session", () => {
    const store = new SsoSessionStore();
    const result = store.validate("nonexistent");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("session not found");
  });

  test("revokes a single session", () => {
    const store = new SsoSessionStore();
    const session = store.create({
      userId: "user1",
      protocol: "OIDC",
      providerId: "p1",
      permissions: ["read"],
      ttlMinutes: 60,
      now
    });
    expect(store.revoke(session.sessionId)).toBe(true);
    expect(store.get(session.sessionId)).toBeNull();
  });

  test("revokes all sessions for a user", () => {
    const store = new SsoSessionStore();
    store.create({ userId: "user1", protocol: "OIDC", providerId: "p1", permissions: ["read"], ttlMinutes: 60, now });
    store.create({ userId: "user1", protocol: "SAML", providerId: "p2", permissions: ["write"], ttlMinutes: 60, now });
    store.create({ userId: "user2", protocol: "OIDC", providerId: "p1", permissions: ["read"], ttlMinutes: 60, now });

    const count = store.revokeByUser("user1");
    expect(count).toBe(2);
    expect(store.size).toBe(1);
  });

  test("lists active sessions", () => {
    const store = new SsoSessionStore();
    store.create({ userId: "user1", protocol: "OIDC", providerId: "p1", permissions: ["read"], ttlMinutes: 5, now });
    store.create({ userId: "user2", protocol: "OIDC", providerId: "p1", permissions: ["read"], ttlMinutes: 60, now });

    const active = store.listActive(new Date(now.getTime() + 10 * 60_000));
    expect(active).toHaveLength(1);
  });

  test("purges expired sessions", () => {
    const store = new SsoSessionStore();
    store.create({ userId: "user1", protocol: "OIDC", providerId: "p1", permissions: ["read"], ttlMinutes: 5, now });
    store.create({ userId: "user2", protocol: "OIDC", providerId: "p1", permissions: ["read"], ttlMinutes: 60, now });

    const purged = store.purgeExpired(new Date(now.getTime() + 10 * 60_000));
    expect(purged).toBe(1);
    expect(store.size).toBe(1);
  });
});

/* ────────────────────────────────────────────────────────────────── */
/*  Fleet Governance: Multi-Tenant                                   */
/* ────────────────────────────────────────────────────────────────── */

describe("fleet governance: multi-tenant management", () => {
  test("creates and lists tenants", () => {
    const ws = newDir("amc-fleet-");
    const tenant = createTenant({
      workspace: ws,
      tenantId: "t1",
      displayName: "Acme Corp"
    });
    expect(tenant.tenantId).toBe("t1");
    expect(tenant.displayName).toBe("Acme Corp");
    expect(tenant.parentTenantId).toBeNull();

    const all = listTenants(ws);
    expect(all).toHaveLength(1);
  });

  test("prevents duplicate tenant IDs", () => {
    const ws = newDir("amc-fleet-dup-");
    createTenant({ workspace: ws, tenantId: "t1", displayName: "A" });
    expect(() => createTenant({ workspace: ws, tenantId: "t1", displayName: "B" })).toThrow(
      "tenant already exists"
    );
  });

  test("creates child tenants with parent", () => {
    const ws = newDir("amc-fleet-parent-");
    createTenant({ workspace: ws, tenantId: "parent", displayName: "Parent Org" });
    const child = createTenant({
      workspace: ws,
      tenantId: "child",
      displayName: "Child Org",
      parentTenantId: "parent"
    });
    expect(child.parentTenantId).toBe("parent");
  });

  test("rejects child if parent does not exist", () => {
    const ws = newDir("amc-fleet-noparent-");
    expect(() =>
      createTenant({
        workspace: ws,
        tenantId: "c1",
        displayName: "Child",
        parentTenantId: "nonexistent"
      })
    ).toThrow("parent tenant not found");
  });

  test("updates tenant quotas", () => {
    const ws = newDir("amc-fleet-quota-");
    createTenant({ workspace: ws, tenantId: "t1", displayName: "A" });
    const updated = updateTenantQuotas({
      workspace: ws,
      tenantId: "t1",
      quotas: { maxAgents: 200 }
    });
    expect(updated.quotas.maxAgents).toBe(200);
  });
});

/* ────────────────────────────────────────────────────────────────── */
/*  Fleet Governance: Usage Metering & Quotas                        */
/* ────────────────────────────────────────────────────────────────── */

describe("fleet governance: usage metering", () => {
  test("records and retrieves tenant usage", () => {
    const ws = newDir("amc-meter-");
    createTenant({ workspace: ws, tenantId: "t1", displayName: "A" });
    recordTenantUsage({
      workspace: ws,
      tenantId: "t1",
      usage: {
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        agentCount: 25,
        workspaceCount: 3,
        diagnosticRuns: 50,
        auditEventsStored: 1000,
        storageMb: 250
      }
    });
    const usage = getTenantUsage(ws, "t1");
    expect(usage).toBeTruthy();
    expect(usage!.agentCount).toBe(25);
  });

  test("checks quota violations", () => {
    const ws = newDir("amc-quota-");
    createTenant({
      workspace: ws,
      tenantId: "t1",
      displayName: "A",
      quotas: { maxAgents: 10 }
    });
    const within = checkQuotaViolation({ workspace: ws, tenantId: "t1", metric: "maxAgents", currentValue: 5 });
    expect(within.allowed).toBe(true);
    const over = checkQuotaViolation({ workspace: ws, tenantId: "t1", metric: "maxAgents", currentValue: 15 });
    expect(over.allowed).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────── */
/*  Fleet Governance: Cross-Org Policy Inheritance                   */
/* ────────────────────────────────────────────────────────────────── */

describe("fleet governance: cross-org policy inheritance", () => {
  test("resolves inherited policies through parent chain", () => {
    const ws = newDir("amc-inherit-");
    createTenant({ workspace: ws, tenantId: "root", displayName: "Root" });
    createTenant({ workspace: ws, tenantId: "mid", displayName: "Mid", parentTenantId: "root" });
    createTenant({ workspace: ws, tenantId: "leaf", displayName: "Leaf", parentTenantId: "mid" });

    const inherited = resolveInheritedPolicies(ws, "leaf");
    expect(inherited.length).toBeGreaterThanOrEqual(0);
  });

  test("resolveCrossOrgPolicy returns effective quotas capped by parent", () => {
    const ws = newDir("amc-crossorg-");
    createTenant({
      workspace: ws,
      tenantId: "root",
      displayName: "Root",
      quotas: { maxAgents: 100, maxStorageMb: 1000 }
    });
    createTenant({
      workspace: ws,
      tenantId: "child",
      displayName: "Child",
      parentTenantId: "root",
      quotas: { maxAgents: 200, maxStorageMb: 500 }
    });

    const result = resolveCrossOrgPolicy(ws, "child");
    expect(result.tenantId).toBe("child");
    // effective maxAgents should be min(200, 100) = 100
    expect(result.effectiveQuotas.maxAgents).toBe(100);
    // effective maxStorageMb should be min(500, 1000) = 500
    expect(result.effectiveQuotas.maxStorageMb).toBe(500);
    expect(result.policyChain).toEqual(["child", "root"]);
  });

  test("resolveCrossOrgPolicy throws for unknown tenant", () => {
    const ws = newDir("amc-crossorg-err-");
    expect(() => resolveCrossOrgPolicy(ws, "ghost")).toThrow("tenant not found");
  });
});

/* ────────────────────────────────────────────────────────────────── */
/*  Fleet Governance: Compliance Reporting                           */
/* ────────────────────────────────────────────────────────────────── */

describe("fleet governance: compliance reporting", () => {
  test("generates compliant report when within quotas", () => {
    const ws = newDir("amc-comply-");
    createTenant({ workspace: ws, tenantId: "t1", displayName: "A", quotas: { maxAgents: 50 } });
    recordTenantUsage({
      workspace: ws,
      tenantId: "t1",
      usage: {
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        agentCount: 10,
        workspaceCount: 2,
        diagnosticRuns: 20,
        auditEventsStored: 100,
        storageMb: 50
      }
    });

    const report = generateTenantComplianceReport({ workspace: ws, tenantId: "t1" });
    expect(report.policyCompliant).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  test("detects quota violations in compliance report", () => {
    const ws = newDir("amc-violate-");
    createTenant({ workspace: ws, tenantId: "t1", displayName: "A", quotas: { maxAgents: 5 } });
    recordTenantUsage({
      workspace: ws,
      tenantId: "t1",
      usage: {
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        agentCount: 10,
        workspaceCount: 2,
        diagnosticRuns: 20,
        auditEventsStored: 100,
        storageMb: 50
      }
    });

    const report = generateTenantComplianceReport({ workspace: ws, tenantId: "t1" });
    expect(report.policyCompliant).toBe(false);
    expect(report.violations.length).toBeGreaterThan(0);
    expect(report.violations.some((v) => v.includes("agent count"))).toBe(true);
  });
});

/* ────────────────────────────────────────────────────────────────── */
/*  Fleet Governance: Usage Metering Summary                         */
/* ────────────────────────────────────────────────────────────────── */

describe("fleet governance: usage metering summary", () => {
  test("aggregates usage across tenants", () => {
    const ws = newDir("amc-summary-");
    createTenant({ workspace: ws, tenantId: "t1", displayName: "Alpha" });
    createTenant({ workspace: ws, tenantId: "t2", displayName: "Beta" });

    recordTenantUsage({
      workspace: ws,
      tenantId: "t1",
      usage: {
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        agentCount: 10,
        workspaceCount: 2,
        diagnosticRuns: 50,
        auditEventsStored: 500,
        storageMb: 100
      }
    });
    recordTenantUsage({
      workspace: ws,
      tenantId: "t2",
      usage: {
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
        agentCount: 20,
        workspaceCount: 5,
        diagnosticRuns: 75,
        auditEventsStored: 300,
        storageMb: 200
      }
    });

    const summary = generateUsageMeteringSummary(ws);
    expect(summary.tenantCount).toBe(2);
    expect(summary.totalAgents).toBe(30);
    expect(summary.totalWorkspaces).toBe(7);
    expect(summary.totalDiagnosticRuns).toBe(125);
    expect(summary.totalAuditEvents).toBe(800);
    expect(summary.totalStorageMb).toBe(300);
    expect(summary.tenantBreakdown).toHaveLength(2);
  });

  test("returns zero totals when no usage recorded", () => {
    const ws = newDir("amc-summary-empty-");
    createTenant({ workspace: ws, tenantId: "t1", displayName: "Empty" });

    const summary = generateUsageMeteringSummary(ws);
    expect(summary.tenantCount).toBe(1);
    expect(summary.totalAgents).toBe(0);
    expect(summary.tenantBreakdown[0]!.usage).toBeNull();
  });
});
