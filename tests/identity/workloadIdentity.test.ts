import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSpiffeId } from "../../src/identity/workload/spiffe.js";
import { verifyWorkloadIdentity } from "../../src/identity/workload/workloadIdentity.js";
import { loadWorkloadTrustConfig, publishWorkloadTrustConfig, workloadTrustConfigSchema, type WorkloadTrustConfig } from "../../src/identity/workload/workloadTrust.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

/**
 * P2-25: a workload identity is `observed` only after its credential verifies against trust pinned in signed config
 * and that config binds the verified subject to the claimed agent id. Everything else is refused, and a run that
 * presents nothing is `amc-lease-only` and `self_reported`.
 */
const FIXTURES = join(import.meta.dirname, "..", "fixtures", "workload");
const pem = (name: string): string => readFileSync(join(FIXTURES, `${name}.pem`), "utf8");
const NOW = Date.parse("2027-01-15T00:00:00Z");
const SPIFFE = "spiffe://example.org/agent/payments";

function keyPair(): { privateKey: KeyObject; jwk: Record<string, unknown> } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return { privateKey, jwk: { ...publicKey.export({ format: "jwk" }), kid: "bundle-1", use: "sig", alg: "ES256" } };
}

function jwt(privateKey: KeyObject, claims: Record<string, unknown>, kid = "bundle-1"): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signingInput = `${encode({ alg: "ES256", kid, typ: "JWT" })}.${encode(claims)}`;
  const signature = sign("sha256", Buffer.from(signingInput), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${signature.toString("base64url")}`;
}

const bundle = keyPair();
const issuerKey = keyPair();
const ISSUER = "https://login.example.com/tenant/v2.0";
const trust: WorkloadTrustConfig = workloadTrustConfigSchema.parse({
  v: 1,
  spiffe: { trustDomains: [{ trustDomain: "example.org", x509Authorities: [pem("bundle-root")], jwtAuthorities: [bundle.jwk], audience: "amc" }] },
  oidcAgentIssuers: [{ issuer: ISSUER, audience: "api://amc", profile: "entra-agent-id", jwks: [issuerKey.jwk] }],
  services: ["svc-nightly"],
  bindings: [{ agentId: "payments", spiffeIds: [SPIFFE], oidcSubjects: [{ issuer: ISSUER, subject: "agent-object-id-1" }] }]
});
const svidClaims = (overrides: Record<string, unknown> = {}) => ({ sub: SPIFFE, aud: "amc", exp: NOW / 1000 + 300, ...overrides });

describe("JWT-SVID", () => {
  it("verifies against the pinned bundle as observed", async () => {
    const result = await verifyWorkloadIdentity({ kind: "jwt-svid", agentId: "payments", token: jwt(bundle.privateKey, svidClaims()) }, trust, { nowMs: NOW });
    expect(result).toMatchObject({ ok: true, identity: { attestor: "spiffe-jwt-svid", spiffeId: SPIFFE, trustDomain: "example.org", claimKind: "observed" } });
    if (result.ok) expect(result.identity.evidenceRef).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it.each([
    ["an unpinned key", () => jwt(keyPair().privateKey, svidClaims()), /jwt-svid: (no matching jwk|jwt signature invalid)/],
    ["an expired token", () => jwt(bundle.privateKey, svidClaims({ exp: NOW / 1000 - 600 })), /jwt expired/],
    ["the wrong audience", () => jwt(bundle.privateKey, svidClaims({ aud: "someone-else" })), /audience mismatch/],
    ["the wrong trust domain", () => jwt(bundle.privateKey, svidClaims({ sub: "spiffe://evil.org/agent/payments" })), /evil\.org has no pinned JWT authority/]
  ])("refuses %s", async (_name, token, reason) => {
    const result = await verifyWorkloadIdentity({ kind: "jwt-svid", agentId: "payments", token: token() }, trust, { nowMs: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(reason);
  });

  it("refuses a valid SVID bound to another agent: identity never names itself", async () => {
    const result = await verifyWorkloadIdentity({ kind: "jwt-svid", agentId: "treasury", token: jwt(bundle.privateKey, svidClaims()) }, trust, { nowMs: NOW });
    expect(result).toEqual({ ok: false, reason: `${SPIFFE} is not bound to agent treasury in the workload trust config` });
  });

  it("refuses every credential when no trust is pinned", async () => {
    const result = await verifyWorkloadIdentity({ kind: "jwt-svid", agentId: "payments", token: jwt(bundle.privateKey, svidClaims()) }, null, { nowMs: NOW });
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/no workload trust config is pinned/) });
  });
});

describe("X.509-SVID", () => {
  it("verifies a leaf chained to the bundle with a matching URI SAN", async () => {
    const result = await verifyWorkloadIdentity({ kind: "x509-svid", agentId: "payments",
      certificateChainPem: pem("leaf") + pem("intermediate") }, trust, { nowMs: NOW });
    expect(result).toMatchObject({ ok: true, identity: { attestor: "spiffe-x509-svid", spiffeId: SPIFFE, claimKind: "observed" } });
  });

  it.each([
    ["a self-signed leaf", () => pem("leaf-self-signed")],
    ["a leaf from an unpinned root", () => pem("leaf-untrusted") + pem("other-root")],
    ["a leaf whose SPIFFE ID leaves the bundle's trust domain", () => pem("leaf-other-domain") + pem("intermediate")],
    ["a leaf without its intermediate", () => pem("leaf")],
    ["a CA presented as the leaf", () => pem("intermediate") + pem("bundle-root")]
  ])("refuses %s", async (_name, chain) => {
    const result = await verifyWorkloadIdentity({ kind: "x509-svid", agentId: "payments", certificateChainPem: chain() }, trust, { nowMs: NOW });
    expect(result.ok).toBe(false);
  });

  it("refuses a chain outside its validity period", async () => {
    const result = await verifyWorkloadIdentity({ kind: "x509-svid", agentId: "payments",
      certificateChainPem: pem("leaf") + pem("intermediate") }, trust, { nowMs: Date.parse("2070-01-01T00:00:00Z") });
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/validity period/) });
  });
});

describe("OIDC agent token (Entra Agent ID, AgentCore)", () => {
  const claims = (overrides: Record<string, unknown> = {}) => ({ iss: ISSUER, sub: "agent-object-id-1", aud: "api://amc", exp: NOW / 1000 + 300, ...overrides });

  it("verifies a token from a pinned issuer and bound subject", async () => {
    const result = await verifyWorkloadIdentity({ kind: "oidc-agent-token", agentId: "payments", token: jwt(issuerKey.privateKey, claims()) }, trust, { nowMs: NOW });
    expect(result).toMatchObject({ ok: true, identity: { attestor: "oidc-agent-token", issuer: ISSUER, subject: "agent-object-id-1", spiffeId: null, claimKind: "observed" } });
  });

  it("refuses an unpinned issuer before any key is read", async () => {
    const result = await verifyWorkloadIdentity({ kind: "oidc-agent-token", agentId: "payments",
      token: jwt(issuerKey.privateKey, claims({ iss: "https://attacker.example/" })) }, trust, { nowMs: NOW });
    expect(result).toEqual({ ok: false, reason: "oidc-agent-token: the issuer is not pinned in the workload trust config" });
  });

  it("refuses the wrong audience", async () => {
    const result = await verifyWorkloadIdentity({ kind: "oidc-agent-token", agentId: "payments",
      token: jwt(issuerKey.privateKey, claims({ aud: "api://other" })) }, trust, { nowMs: NOW });
    expect(result).toMatchObject({ ok: false, reason: "oidc-agent-token: audience mismatch" });
  });
});

it("labels a run that presents nothing amc-lease-only and self_reported", async () => {
  const result = await verifyWorkloadIdentity({ kind: "none", agentId: "payments" }, null, { nowMs: NOW });
  expect(result).toEqual({ ok: true, identity: { agentId: "payments", spiffeId: null, trustDomain: null, attestor: "amc-lease-only", issuer: null,
    subject: null, verifiedAt: NOW, expiresAt: null, claimKind: "self_reported", evidenceRef: null } });
});

it.each([
  ["spiffe://example.org/agent/payments", true], ["spiffe://example.org", true], ["spiffe://Example.org/x", false],
  ["spiffe://example.org:8080/x", false], ["spiffe://example.org/a/../b", false], ["spiffe://example.org/a/", false],
  ["spiffe://example.org/x?q=1", false], ["https://example.org/x", false]
])("parses SPIFFE ID %s as %s", (raw, valid) => {
  expect(parseSpiffeId(raw) !== null).toBe(valid);
});

describe("the signed workload trust config", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
    vi.unstubAllEnvs();
  });

  it("loads only when the auditor signature verifies; a tampered config throws instead of reading as absent", async () => {
    const workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-workload-trust-")));
    roots.push(workspace);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "workload-trust-fixture-passphrase");
    initWorkspace({ workspacePath: workspace, agentId: "payments", trustBoundaryMode: "isolated" });
    expect(loadWorkloadTrustConfig(workspace)).toBeNull();
    const { path } = await publishWorkloadTrustConfig(workspace, trust);
    expect(loadWorkloadTrustConfig(workspace)?.services).toEqual(["svc-nightly"]);
    writeFileSync(path, readFileSync(path, "utf8").replace("svc-nightly", "svc-attacker"));
    expect(() => loadWorkloadTrustConfig(workspace)).toThrow(/signature does not verify/);
  });
});
