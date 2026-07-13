import { createServer, type IncomingMessage, type ServerResponse, request as httpRequest } from "node:http";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { canonicalize } from "../src/utils/json.js";
import { createHostUser, createWorkspaceRecord, findHostUserById, initHostDb, rolesForUserIdInWorkspace } from "../src/workspaces/hostDb.js";
import { hostWorkspaceDir } from "../src/workspaces/workspacePaths.js";
import { startWorkspaceRouter } from "../src/workspaces/workspaceRouter.js";
import {
  identityInitCli,
  identityMappingAddCli,
  identityProviderAddOidcCli,
  identityProviderAddSamlCli,
  scimInitCli,
  scimTokenCreateCli
} from "../src/identity/identityCli.js";
import { issueLeaseForCli } from "../src/leases/leaseCli.js";
import { loadIdentityConfig, saveIdentityConfig } from "../src/identity/identityConfig.js";

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

function b64url(input: Buffer | string): string {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function parseSetCookie(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers["set-cookie"];
  if (Array.isArray(raw)) {
    return raw[0] ?? "";
  }
  return String(raw ?? "");
}

async function pickPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", () => resolvePromise()));
  const addr = server.address();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
  if (!addr || typeof addr === "string") {
    throw new Error("failed to allocate port");
  }
  return addr.port;
}

async function httpCall(params: {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  const rawBody = params.body ?? "";
  return new Promise((resolvePromise, rejectPromise) => {
    const req = httpRequest(
      params.url,
      {
        method: params.method,
        headers: {
          connection: "close",
          ...(rawBody
            ? {
                "content-length": String(Buffer.byteLength(rawBody))
              }
            : {}),
          ...(params.headers ?? {})
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    req.on("error", rejectPromise);
    if (rawBody) {
      req.write(rawBody);
    }
    req.end();
  });
}

function initHostWorkspace(prefix: string): { hostDir: string; workspaceDir: string } {
  const hostDir = newDir(prefix);
  process.env.AMC_HOST_VAULT_PASSPHRASE = "identity-host-passphrase";
  process.env.AMC_VAULT_PASSPHRASE = "identity-workspace-passphrase";
  initHostDb(hostDir);
  createWorkspaceRecord({
    hostDir,
    workspaceId: "default",
    name: "Default Workspace"
  });
  const workspaceDir = hostWorkspaceDir(hostDir, "default");
  initWorkspace({
    workspacePath: workspaceDir,
    trustBoundaryMode: "isolated"
  });
  return { hostDir, workspaceDir };
}

function jwtSignEdDsa(params: {
  privateKeyPem: string;
  kid: string;
  payload: Record<string, unknown>;
}): string {
  const header = {
    alg: "EdDSA",
    typ: "JWT",
    kid: params.kid
  };
  const encodedHeader = b64url(JSON.stringify(header));
  const encodedPayload = b64url(JSON.stringify(params.payload));
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(null, Buffer.from(input, "utf8"), params.privateKeyPem);
  return `${input}.${b64url(signature)}`;
}

function createFakeOidcProvider(params: {
  issuerBase: string;
  clientId: string;
  clientSecret: string;
  kid?: string;
  emailVerified?: boolean | "missing";
}): {
  server: ReturnType<typeof createServer>;
  close: () => Promise<void>;
} {
  const kid = params.kid ?? "oidc-test-kid";
  const keyPair = generateKeyPairSync("ed25519");
  const privateKeyPem = keyPair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicJwk = keyPair.publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  const codeNonce = new Map<string, string>();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", params.issuerBase);
    if (url.pathname === "/.well-known/openid-configuration") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          issuer: params.issuerBase,
          authorization_endpoint: `${params.issuerBase}/authorize`,
          token_endpoint: `${params.issuerBase}/token`,
          jwks_uri: `${params.issuerBase}/jwks`
        })
      );
      return;
    }
    if (url.pathname === "/jwks") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          keys: [
            {
              ...publicJwk,
              kid,
              alg: "EdDSA",
              use: "sig"
            }
          ]
        })
      );
      return;
    }
    if (url.pathname === "/authorize") {
      const state = url.searchParams.get("state") ?? "";
      const nonce = url.searchParams.get("nonce") ?? "";
      const redirectUri = url.searchParams.get("redirect_uri") ?? "";
      const code = `code_${randomUUID().replace(/-/g, "")}`;
      codeNonce.set(code, nonce);
      const next = new URL(redirectUri);
      next.searchParams.set("code", code);
      next.searchParams.set("state", state);
      res.statusCode = 302;
      res.setHeader("location", next.toString());
      res.end();
      return;
    }
    if (url.pathname === "/token") {
      const body = await new Promise<string>((resolvePromise) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
      });
      const form = new URLSearchParams(body);
      if (form.get("client_id") !== params.clientId || form.get("client_secret") !== params.clientSecret) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "invalid_client" }));
        return;
      }
      const code = form.get("code") ?? "";
      const nonce = codeNonce.get(code) ?? "missing";
      const now = Math.floor(Date.now() / 1000);
      const payload: Record<string, unknown> = {
        iss: params.issuerBase,
        aud: params.clientId,
        iat: now,
        exp: now + 600,
        sub: "oidc-user-1",
        name: "OIDC User",
        nonce,
        groups: ["amc-ws-default-owner"]
      };
      if (params.emailVerified !== "missing") {
        payload.email_verified = params.emailVerified ?? true;
      }
      if (code === "badnonce") {
        payload.nonce = "wrong-nonce";
      }
      if (code !== "noemail") {
        payload.email = "sso-user@example.com";
      }
      const idToken = jwtSignEdDsa({
        privateKeyPem,
        kid,
        payload
      });
      const finalToken =
        code === "badsig"
          ? `${idToken.slice(0, idToken.lastIndexOf(".") + 1)}${b64url(Buffer.from("tampered", "utf8"))}`
          : idToken;
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          access_token: "fake-access-token",
          token_type: "Bearer",
          id_token: finalToken
        })
      );
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  return {
    server,
    close: async () => {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
  };
}

function buildCompactSamlResponse(params: {
  idpIssuer: string;
  audience: string;
  inResponseTo: string;
  subject: string;
  email: string;
  groups: string[];
  privateKeyPem: string;
}): string {
  const base = {
    issuer: params.idpIssuer,
    audience: params.audience,
    inResponseTo: params.inResponseTo,
    subject: params.subject,
    email: params.email,
    name: "SAML User",
    groups: params.groups,
    notBefore: Date.now() - 60_000,
    notOnOrAfter: Date.now() + 5 * 60_000
  };
  const payloadBytes = Buffer.from(
    canonicalize({
      ...base,
      signature: undefined
    }),
    "utf8"
  );
  const signature = sign(null, payloadBytes, params.privateKeyPem);
  const assertion = {
    ...base,
    signature: b64url(signature)
  };
  return Buffer.from(JSON.stringify(assertion), "utf8").toString("base64");
}

describe("enterprise identity (OIDC/SAML/SCIM)", () => {
  test("OIDC provider add bootstraps host identity config on a fresh host", () => {
    const hostDir = newDir("amc-identity-oidc-fresh-");
    process.env.AMC_HOST_VAULT_PASSPHRASE = "identity-host-passphrase";
    const clientSecretFile = join(hostDir, "oidc-secret.txt");
    writeFileSync(clientSecretFile, "oidc-secret-value");

    const out = identityProviderAddOidcCli({
      hostDir,
      providerId: "okta",
      issuer: "https://okta.example.com/oauth2/default",
      clientId: "amc-client",
      clientSecretFile,
      redirectUri: "https://amc.example.com/host/api/auth/oidc/okta/callback"
    });
    const config = loadIdentityConfig(hostDir);

    expect(out.path).toContain("identity.yaml");
    expect(config.identity.providers.map((provider) => provider.id)).toContain("okta");
  });

  test("OIDC auth code + PKCE flow creates session and mapped workspace roles", async () => {
    const { hostDir } = initHostWorkspace("amc-identity-oidc-");
    const routerPort = await pickPort();
    const oidcPort = await pickPort();
    const issuer = `http://127.0.0.1:${oidcPort}`;
    const clientSecretFile = join(hostDir, "oidc-secret.txt");
    writeFileSync(clientSecretFile, "super-secret-client");

    identityInitCli(hostDir);
    identityProviderAddOidcCli({
      hostDir,
      providerId: "testoidc",
      displayName: "Test OIDC",
      issuer,
      clientId: "amc-client",
      clientSecretFile,
      redirectUri: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/testoidc/callback`
    });
    identityMappingAddCli({
      hostDir,
      group: "amc-ws-default-owner",
      workspaceId: "default",
      roles: ["OWNER", "AUDITOR"]
    });

    const provider = createFakeOidcProvider({
      issuerBase: issuer,
      clientId: "amc-client",
      clientSecret: "super-secret-client"
    });
    await new Promise<void>((resolvePromise) => provider.server.listen(oidcPort, "127.0.0.1", () => resolvePromise()));
    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port: routerPort,
      defaultWorkspaceId: "default"
    });

    try {
      const login = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/testoidc/login`,
        method: "GET"
      });
      expect(login.status).toBe(302);
      const providerRedirect = String(login.headers.location ?? "");
      expect(providerRedirect).toContain("/authorize");

      const authorize = await httpCall({
        url: providerRedirect,
        method: "GET"
      });
      expect(authorize.status).toBe(302);
      const callbackUrl = String(authorize.headers.location ?? "");
      expect(callbackUrl).toContain("/host/api/auth/oidc/testoidc/callback");

      const callback = await httpCall({
        url: callbackUrl,
        method: "GET"
      });
      expect(callback.status).toBe(302);
      const sessionCookie = parseSetCookie(callback.headers);
      expect(sessionCookie).toContain("amc_session=");

      const me = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/auth/me`,
        method: "GET",
        headers: {
          cookie: sessionCookie
        }
      });
      expect(me.status).toBe(200);
      expect(me.body).toContain("sso-user@example.com");

      const workspaces = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/workspaces`,
        method: "GET",
        headers: {
          cookie: sessionCookie
        }
      });
      expect(workspaces.status).toBe(200);
      expect(workspaces.body).toContain("\"workspaceId\":\"default\"");

      expect(callback.body.includes("super-secret-client")).toBe(false);
      expect(me.body.includes("super-secret-client")).toBe(false);
    } finally {
      await host.close();
      await provider.close();
    }
  }, 40_000);

  test("OIDC rejects identity tokens without an affirmative email_verified claim", async () => {
    const { hostDir } = initHostWorkspace("amc-identity-oidc-email-proof-");
    const routerPort = await pickPort();
    const oidcPort = await pickPort();
    const issuer = `http://127.0.0.1:${oidcPort}`;
    const clientSecretFile = join(hostDir, "oidc-secret.txt");
    writeFileSync(clientSecretFile, "oidc-email-proof-secret");

    identityInitCli(hostDir);
    identityProviderAddOidcCli({
      hostDir,
      providerId: "oidcemailproof",
      displayName: "OIDC Email Proof",
      issuer,
      clientId: "oidc-email-proof-client",
      clientSecretFile,
      redirectUri: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/oidcemailproof/callback`
    });

    const provider = createFakeOidcProvider({
      issuerBase: issuer,
      clientId: "oidc-email-proof-client",
      clientSecret: "oidc-email-proof-secret",
      emailVerified: "missing"
    });
    await new Promise<void>((resolvePromise) => provider.server.listen(oidcPort, "127.0.0.1", () => resolvePromise()));
    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port: routerPort,
      defaultWorkspaceId: "default"
    });

    try {
      const login = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/oidcemailproof/login`,
        method: "GET"
      });
      expect(login.status).toBe(302);
      const authorize = await httpCall({
        url: String(login.headers.location ?? ""),
        method: "GET"
      });
      expect(authorize.status).toBe(302);
      const callback = await httpCall({
        url: String(authorize.headers.location ?? ""),
        method: "GET"
      });
      expect(callback.status).toBe(401);
      expect(parseSetCookie(callback.headers)).not.toContain("amc_session=");
    } finally {
      await host.close();
      await provider.close();
    }
  }, 40_000);

  test("OIDC rejects bad state, bad nonce/signature, and missing email", async () => {
    const { hostDir } = initHostWorkspace("amc-identity-oidc-sec-");
    const routerPort = await pickPort();
    const oidcPort = await pickPort();
    const issuer = `http://127.0.0.1:${oidcPort}`;
    const clientSecretFile = join(hostDir, "oidc-secret.txt");
    writeFileSync(clientSecretFile, "oidc-sec-secret");

    identityInitCli(hostDir);
    identityProviderAddOidcCli({
      hostDir,
      providerId: "oidcsec",
      displayName: "OIDC Security",
      issuer,
      clientId: "oidc-sec-client",
      clientSecretFile,
      redirectUri: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/oidcsec/callback`
    });

    const provider = createFakeOidcProvider({
      issuerBase: issuer,
      clientId: "oidc-sec-client",
      clientSecret: "oidc-sec-secret"
    });
    await new Promise<void>((resolvePromise) => provider.server.listen(oidcPort, "127.0.0.1", () => resolvePromise()));
    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port: routerPort,
      defaultWorkspaceId: "default"
    });

    try {
      const login = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/oidcsec/login`,
        method: "GET"
      });
      expect(login.status).toBe(302);
      const state = new URL(String(login.headers.location ?? "")).searchParams.get("state") ?? "";
      expect(state.length).toBeGreaterThan(0);

      const wrongState = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/oidcsec/callback?code=badnonce&state=wrongstate`,
        method: "GET"
      });
      expect(wrongState.status).toBe(400);

      const badNonce = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/oidcsec/callback?code=badnonce&state=${encodeURIComponent(state)}`,
        method: "GET"
      });
      expect(badNonce.status).toBe(401);

      const login2 = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/oidcsec/login`,
        method: "GET"
      });
      const state2 = new URL(String(login2.headers.location ?? "")).searchParams.get("state") ?? "";
      const badSig = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/oidcsec/callback?code=badsig&state=${encodeURIComponent(state2)}`,
        method: "GET"
      });
      expect(badSig.status).toBe(401);

      const login3 = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/oidcsec/login`,
        method: "GET"
      });
      const state3 = new URL(String(login3.headers.location ?? "")).searchParams.get("state") ?? "";
      const noEmail = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/oidcsec/callback?code=noemail&state=${encodeURIComponent(state3)}`,
        method: "GET"
      });
      expect([401, 403]).toContain(noEmail.status);
    } finally {
      await host.close();
      await provider.close();
    }
  }, 40_000);

  test("SAML ACS path verifies signed compact assertion and grants mapped roles", async () => {
    const { hostDir } = initHostWorkspace("amc-identity-saml-");
    const routerPort = await pickPort();
    const idpPort = await pickPort();
    const idpIssuer = `http://127.0.0.1:${idpPort}`;
    const keyPair = generateKeyPairSync("ed25519");
    const idpPrivatePem = keyPair.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const idpPublicPem = keyPair.publicKey.export({ format: "pem", type: "spki" }).toString();
    const certPath = join(hostDir, "idp-cert.pem");
    writeFileSync(certPath, idpPublicPem);

    identityInitCli(hostDir);
    identityProviderAddSamlCli({
      hostDir,
      providerId: "samltest",
      displayName: "SAML Test",
      entryPoint: `${idpIssuer}/saml/login`,
      issuer: idpIssuer,
      idpCertFile: certPath,
      spEntityId: `http://127.0.0.1:${routerPort}/host/api/auth/saml/samltest/metadata`,
      acsUrl: `http://127.0.0.1:${routerPort}/host/api/auth/saml/samltest/acs`
    });
    identityMappingAddCli({
      hostDir,
      group: "amc-ws-default-owner",
      workspaceId: "default",
      roles: ["OWNER", "AUDITOR"]
    });

    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port: routerPort,
      defaultWorkspaceId: "default"
    });
    try {
      const login = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/auth/saml/samltest/login`,
        method: "GET"
      });
      expect(login.status).toBe(302);
      const redirectUrl = new URL(String(login.headers.location ?? ""));
      const relayState = redirectUrl.searchParams.get("RelayState") ?? "";
      const requestRaw = redirectUrl.searchParams.get("SAMLRequest") ?? "";
      const requestJson = JSON.parse(Buffer.from(requestRaw, "base64").toString("utf8")) as {
        requestId: string;
      };
      const samlResponse = buildCompactSamlResponse({
        idpIssuer,
        audience: `http://127.0.0.1:${routerPort}/host/api/auth/saml/samltest/metadata`,
        inResponseTo: requestJson.requestId,
        subject: "saml-user-1",
        email: "saml-user@example.com",
        groups: ["amc-ws-default-owner"],
        privateKeyPem: idpPrivatePem
      });
      const acs = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/auth/saml/samltest/acs`,
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: `SAMLResponse=${encodeURIComponent(samlResponse)}&RelayState=${encodeURIComponent(relayState)}`
      });
      expect(acs.status).toBe(302);
      const cookie = parseSetCookie(acs.headers);
      const me = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/auth/me`,
        method: "GET",
        headers: { cookie }
      });
      expect(me.status).toBe(200);
      expect(me.body).toContain("saml-user@example.com");
    } finally {
      await host.close();
    }
  }, 40_000);

  test("SCIM users/groups provisioning applies and revokes workspace memberships by group source", async () => {
    const { hostDir } = initHostWorkspace("amc-identity-scim-");
    const routerPort = await pickPort();

    identityInitCli(hostDir);
    identityMappingAddCli({
      hostDir,
      group: "amc-ws-default-viewer",
      workspaceId: "default",
      roles: ["VIEWER"]
    });
    const config = loadIdentityConfig(hostDir);
    config.identity.scim.enabled = true;
    config.identity.scim.auth.requireHttps = false;
    saveIdentityConfig(hostDir, config);
    const token = scimTokenCreateCli({
      hostDir,
      name: "scim-test"
    }).token;

    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port: routerPort,
      defaultWorkspaceId: "default"
    });
    try {
      const created = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/scim/v2/Users`,
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/scim+json"
        },
        body: JSON.stringify({
          userName: "provisioned@example.com",
          displayName: "Provisioned User",
          emails: [{ value: "provisioned@example.com", primary: true }]
        })
      });
      expect(created.status).toBe(201);
      const createdBody = JSON.parse(created.body) as { id: string };
      const userId = createdBody.id;
      expect(typeof userId).toBe("string");

      const groupCreate = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/scim/v2/Groups`,
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/scim+json"
        },
        body: JSON.stringify({
          displayName: "amc-ws-default-viewer",
          members: [{ value: userId }]
        })
      });
      expect(groupCreate.status).toBe(201);
      let roles = rolesForUserIdInWorkspace({
        hostDir,
        userId,
        workspaceId: "default"
      });
      expect(roles).toContain("VIEWER");

      const group = JSON.parse(groupCreate.body) as { id: string };
      const groupPatch = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/scim/v2/Groups/${encodeURIComponent(group.id)}`,
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/scim+json"
        },
        body: JSON.stringify({
          Operations: [{ op: "remove", path: "members", value: [{ value: userId }] }]
        })
      });
      expect(groupPatch.status).toBe(200);
      roles = rolesForUserIdInWorkspace({
        hostDir,
        userId,
        workspaceId: "default"
      });
      expect(roles).not.toContain("VIEWER");

      const deleteUser = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/scim/v2/Users/${encodeURIComponent(userId)}`,
        method: "DELETE",
        headers: {
          authorization: `Bearer ${token}`
        }
      });
      expect(deleteUser.status).toBe(204);
      const stored = findHostUserById(hostDir, userId);
      expect(stored?.disabled).toBe(true);
    } finally {
      await host.close();
    }
  }, 40_000);

  test("SCIM init enables provisioning without resetting existing SSO providers", () => {
    const { hostDir } = initHostWorkspace("amc-identity-scim-init-");
    const clientSecretFile = join(hostDir, "oidc-secret.txt");
    const tokenFile = join(hostDir, "scim-token.txt");
    writeFileSync(clientSecretFile, "oidc-secret-value");

    identityInitCli(hostDir);
    identityProviderAddOidcCli({
      hostDir,
      providerId: "okta",
      issuer: "https://okta.example.com/oauth2/default",
      clientId: "amc-client",
      clientSecretFile,
      redirectUri: "https://amc.example.com/host/api/auth/oidc/okta/callback"
    });

    const out = scimInitCli({
      hostDir,
      requireHttps: false,
      tokenName: "okta-scim",
      outFile: tokenFile
    });
    const config = loadIdentityConfig(hostDir);

    expect(out.enabled).toBe(true);
    expect(out.requireHttps).toBe(false);
    expect(out.token?.tokenId).toBeTruthy();
    expect(readFileSync(tokenFile, "utf8").trim()).toBe(out.token?.token);
    expect(config.identity.scim.enabled).toBe(true);
    expect(config.identity.scim.auth.requireHttps).toBe(false);
    expect(config.identity.providers.map((provider) => provider.id)).toContain("okta");
  });

  test("lease-auth cannot call host identity/scim endpoints and users without membership cannot access workspace routes", async () => {
    const { hostDir, workspaceDir } = initHostWorkspace("amc-identity-isolation-");
    createHostUser({
      hostDir,
      username: "nomember@example.com",
      password: "no-member-pass",
      isHostAdmin: false
    });
    identityInitCli(hostDir);
    const config = loadIdentityConfig(hostDir);
    config.identity.scim.enabled = true;
    config.identity.scim.auth.requireHttps = false;
    saveIdentityConfig(hostDir, config);

    const routerPort = await pickPort();
    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port: routerPort,
      defaultWorkspaceId: "default"
    });
    try {
      const lease = issueLeaseForCli({
        workspace: workspaceDir,
        workspaceId: "default",
        agentId: "default",
        ttl: "30m",
        scopes: "gateway:llm",
        routes: "/openai",
        models: "*",
        rpm: 60,
        tpm: 100000
      }).token;
      const blockedHost = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/auth/providers`,
        method: "GET",
        headers: {
          "x-amc-lease": lease
        }
      });
      expect(blockedHost.status).toBe(403);
      const blockedScim = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/scim/v2/Users`,
        method: "GET",
        headers: {
          "x-amc-lease": lease
        }
      });
      expect(blockedScim.status).toBe(403);

      const login = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/login`,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "nomember@example.com",
          password: "no-member-pass"
        })
      });
      expect(login.status).toBe(200);
      const cookie = parseSetCookie(login.headers);
      const workspaceAccess = await httpCall({
        url: `http://127.0.0.1:${routerPort}/w/default/api/status`,
        method: "GET",
        headers: {
          cookie
        }
      });
      expect(workspaceAccess.status).toBe(403);
    } finally {
      await host.close();
    }
  }, 40_000);

  test("tampered identity config signature fails closed for auth/scim endpoints", async () => {
    const { hostDir } = initHostWorkspace("amc-identity-tamper-");
    const routerPort = await pickPort();
    identityInitCli(hostDir);
    writeFileSync(
      join(hostDir, "identity", "identity.yaml"),
      `${readFileSync(join(hostDir, "identity", "identity.yaml"), "utf8")}\n# tampered\n`
    );

    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port: routerPort,
      defaultWorkspaceId: "default"
    });
    try {
      const authProviders = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/auth/providers`,
        method: "GET"
      });
      expect(authProviders.status).toBe(503);
      const scim = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/scim/v2/Users`,
        method: "GET"
      });
      expect(scim.status).toBe(503);
    } finally {
      await host.close();
    }
  }, 40_000);

  test("responses do not leak client secrets, SCIM token, or private key markers", async () => {
    const { hostDir } = initHostWorkspace("amc-identity-secrets-");
    const routerPort = await pickPort();
    const oidcPort = await pickPort();
    const issuer = `http://127.0.0.1:${oidcPort}`;
    const clientSecret = "ultra-secret-value";
    const clientSecretFile = join(hostDir, "oidc-secret.txt");
    writeFileSync(clientSecretFile, clientSecret);

    identityInitCli(hostDir);
    identityProviderAddOidcCli({
      hostDir,
      providerId: "secretcheck",
      issuer,
      clientId: "secret-client",
      clientSecretFile,
      redirectUri: `http://127.0.0.1:${routerPort}/host/api/auth/oidc/secretcheck/callback`
    });
    const cfg = loadIdentityConfig(hostDir);
    cfg.identity.scim.enabled = true;
    cfg.identity.scim.auth.requireHttps = false;
    saveIdentityConfig(hostDir, cfg);
    const scimToken = scimTokenCreateCli({
      hostDir,
      name: "secret-scim"
    }).token;
    const provider = createFakeOidcProvider({
      issuerBase: issuer,
      clientId: "secret-client",
      clientSecret
    });
    await new Promise<void>((resolvePromise) => provider.server.listen(oidcPort, "127.0.0.1", () => resolvePromise()));
    const host = await startWorkspaceRouter({
      hostDir,
      host: "127.0.0.1",
      port: routerPort,
      defaultWorkspaceId: "default"
    });
    try {
      const providers = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/api/auth/providers`,
        method: "GET"
      });
      const scimResp = await httpCall({
        url: `http://127.0.0.1:${routerPort}/host/scim/v2/ServiceProviderConfig`,
        method: "GET",
        headers: {
          authorization: `Bearer ${scimToken}`
        }
      });
      const combined = `${providers.body}\n${scimResp.body}`;
      expect(combined.includes(clientSecret)).toBe(false);
      expect(combined.includes(scimToken)).toBe(false);
      expect(combined.includes("BEGIN PRIVATE KEY")).toBe(false);
    } finally {
      await host.close();
      await provider.close();
    }
  }, 40_000);
});
