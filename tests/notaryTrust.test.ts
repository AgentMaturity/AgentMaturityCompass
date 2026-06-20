import { createServer as createHttpServer, request as httpRequest } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { notaryAttestCli, notaryInitCli, notaryVerifyAttestCli } from "../src/notary/notaryCli.js";
import { loadNotaryConfig, saveNotaryConfig } from "../src/notary/notaryConfigStore.js";
import { startNotaryServer } from "../src/notary/notaryServer.js";
import { buildNotaryAuthSignature } from "../src/notary/notaryAuth.js";
import { verifyNotarySignResponse } from "../src/notary/notaryVerify.js";
import { checkNotaryTrust, enableNotaryTrust } from "../src/trust/trustConfig.js";
import { tailNotaryLog } from "../src/notary/notaryLog.js";

function newWorkspace(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  initWorkspace({ workspacePath: dir, agentId: "default" });
  return dir;
}

function newNotaryDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-notary-`));
}

function setEnv(key: string, value: string | undefined): string | undefined {
  const prior = process.env[key];
  if (typeof value === "undefined") {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  return prior;
}

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T> | T): Promise<T> {
  const before = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(vars)) {
    before.set(k, setEnv(k, v));
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of before) {
      setEnv(k, v);
    }
  }
}

async function availablePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createHttpServer((_req, res) => {
      res.statusCode = 200;
      res.end("ok");
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to allocate port")));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePort(port);
      });
    });
  });
}

async function httpGetJson(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolveResult, reject) => {
    const req = httpRequest(url, { method: "GET" }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        resolveResult({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => {
      req.destroy(new Error("http get timeout"));
    });
    req.end();
  });
}

async function httpPostJson(params: {
  url: string;
  body: string;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolveResult, reject) => {
    const req = httpRequest(params.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(params.body)),
        ...(params.headers ?? {})
      }
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        resolveResult({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => {
      req.destroy(new Error("http post timeout"));
    });
    req.write(params.body);
    req.end();
  });
}

describe("notary + trust hard mode", () => {
  it("file-sealed notary mode starts and emits verifiable attestations", async () => {
    const workspace = newWorkspace("amc-notary-file");
    const notaryDir = newNotaryDir("amc-notary-file");
    const port = await availablePort();

    await withEnv(
      {
        AMC_NOTARY_PASSPHRASE: "notary-passphrase-test",
        AMC_NOTARY_AUTH_SECRET: "notary-auth-secret-test"
      },
      async () => {
        await notaryInitCli({ notaryDir });
        const config = loadNotaryConfig(notaryDir);
        config.notary.bindHost = "127.0.0.1";
        config.notary.port = port;
        saveNotaryConfig(notaryDir, config);

        const runtime = await startNotaryServer({ notaryDir, workspace });
        try {
          const pub = await httpGetJson(`http://127.0.0.1:${port}/pubkey`);
          expect(pub.status).toBe(200);
          const pubBody = JSON.parse(pub.body) as { fingerprint?: string };
          expect(typeof pubBody.fingerprint).toBe("string");
          expect(pubBody.fingerprint?.length).toBe(64);

          const attest = await httpGetJson(`http://127.0.0.1:${port}/attest/current`);
          expect(attest.status).toBe(200);
          const attBody = JSON.parse(attest.body) as { attestation?: { notary?: { attestationLevel?: string } } };
          expect(attBody.attestation?.notary?.attestationLevel).toBe("SOFTWARE");

          const bundlePath = join(workspace, ".amc", "notary-test.amcattest");
          notaryAttestCli({
            notaryDir,
            workspace,
            outFile: bundlePath
          });
          const verified = notaryVerifyAttestCli(bundlePath);
          expect(verified.ok).toBe(true);
        } finally {
          await runtime.close();
        }
      }
    );

    rmSync(workspace, { recursive: true, force: true });
    rmSync(notaryDir, { recursive: true, force: true });
  });

  it("external signer mode returns HARDWARE attestation and valid signatures", async () => {
    const workspace = newWorkspace("amc-notary-external");
    const notaryDir = newNotaryDir("amc-notary-external");
    const port = await availablePort();
    const signerKeyPath = join(notaryDir, "fake-signer.key");
    const signerPubPath = join(notaryDir, "fake-signer.pub");
    const scriptPath = resolve(process.cwd(), "scripts", "fake-external-signer.mjs");

    await withEnv(
      {
        AMC_FAKE_SIGNER_PRIVATE_KEY_FILE: signerKeyPath,
        AMC_NOTARY_AUTH_SECRET: "external-notary-auth-secret"
      },
      async () => {
        // Generate keypair via the shipped fake signer utility.
        const { spawnSync } = await import("node:child_process");
        const generated = spawnSync(process.execPath, [scriptPath, "keygen", "--private", signerKeyPath, "--public", signerPubPath], {
          encoding: "utf8"
        });
        expect(generated.status).toBe(0);

        await notaryInitCli({
          notaryDir,
          externalSignerCommand: process.execPath,
          externalSignerArgs: [scriptPath]
        });
        const config = loadNotaryConfig(notaryDir);
        config.notary.bindHost = "127.0.0.1";
        config.notary.port = port;
        saveNotaryConfig(notaryDir, config);

        const runtime = await startNotaryServer({ notaryDir, workspace });
        try {
          const att = await httpGetJson(`http://127.0.0.1:${port}/attest/current`);
          expect(att.status).toBe(200);
          const attBody = JSON.parse(att.body) as { attestation?: { notary?: { attestationLevel?: string } } };
          expect(attBody.attestation?.notary?.attestationLevel).toBe("HARDWARE");

          const payloadBytes = Buffer.from("notary-sign-payload", "utf8");
          const body = JSON.stringify({
            kind: "MERKLE_ROOT",
            payloadB64: payloadBytes.toString("base64"),
            payloadSha256: (await import("node:crypto")).createHash("sha256").update(payloadBytes).digest("hex")
          });
          const ts = Date.now();
          const auth = buildNotaryAuthSignature({
            secret: "external-notary-auth-secret",
            ts,
            method: "POST",
            path: "/sign",
            bodyBytes: Buffer.from(body, "utf8")
          });
          const signed = await httpPostJson({
            url: `http://127.0.0.1:${port}/sign`,
            body,
            headers: {
              "x-amc-notary-ts": String(ts),
              "x-amc-notary-auth": auth
            }
          });
          expect(signed.status).toBe(200);
          const parsed = JSON.parse(signed.body) as unknown;
          const verified = verifyNotarySignResponse(parsed, payloadBytes);
          expect(verified.ok).toBe(true);
          expect(verified.parsed?.attestationLevel).toBe("HARDWARE");
        } finally {
          await runtime.close();
        }
      }
    );

    rmSync(workspace, { recursive: true, force: true });
    rmSync(notaryDir, { recursive: true, force: true });
  });

  it("trust checks fail closed when NOTARY mode is required and notary is down", async () => {
    const workspace = newWorkspace("amc-notary-studio");
    const notaryDir = newNotaryDir("amc-notary-studio");
    const notaryPort = await availablePort();

    await withEnv(
      {
        AMC_NOTARY_PASSPHRASE: "studio-notary-passphrase",
        AMC_NOTARY_AUTH_SECRET: "studio-notary-auth-secret"
      },
      async () => {
        const init = await notaryInitCli({ notaryDir });
        const config = loadNotaryConfig(notaryDir);
        config.notary.bindHost = "127.0.0.1";
        config.notary.port = notaryPort;
        saveNotaryConfig(notaryDir, config);

        const notary = await startNotaryServer({ notaryDir, workspace });
        const trust = await enableNotaryTrust({
          workspace,
          baseUrl: `http://127.0.0.1:${notaryPort}`,
          pinPubkeyPath: init.publicKeyPath,
          requiredAttestationLevel: "SOFTWARE"
        });
        expect(trust.fingerprint.length).toBe(64);
        const up = await checkNotaryTrust(workspace);
        expect(up.ok).toBe(true);
        await notary.close();
        const down = await checkNotaryTrust(workspace);
        expect(down.ok).toBe(false);
        expect(down.reasons.some((reason) => reason.includes("NOTARY_UNREACHABLE"))).toBe(true);
      }
    );

    rmSync(workspace, { recursive: true, force: true });
    rmSync(notaryDir, { recursive: true, force: true });
  });

  it("rejects unauthenticated /sign requests and records NOTARY_AUTH_FAILED", async () => {
    const workspace = newWorkspace("amc-notary-auth");
    const notaryDir = newNotaryDir("amc-notary-auth");
    const port = await availablePort();

    await withEnv(
      {
        AMC_NOTARY_PASSPHRASE: "auth-notary-passphrase",
        AMC_NOTARY_AUTH_SECRET: "auth-notary-secret"
      },
      async () => {
        await notaryInitCli({ notaryDir });
        const config = loadNotaryConfig(notaryDir);
        config.notary.bindHost = "127.0.0.1";
        config.notary.port = port;
        saveNotaryConfig(notaryDir, config);

        const runtime = await startNotaryServer({ notaryDir, workspace });
        try {
          const payload = JSON.stringify({
            kind: "CERT",
            payloadB64: Buffer.from("unauthorized", "utf8").toString("base64")
          });
          const response = await httpPostJson({
            url: `http://127.0.0.1:${port}/sign`,
            body: payload
          });
          expect(response.status).toBe(401);
          const tail = tailNotaryLog(notaryDir, 20);
          expect(tail.some((entry) => entry.kind === "NOTARY_AUTH_FAILED")).toBe(true);
        } finally {
          await runtime.close();
        }
      }
    );

    rmSync(workspace, { recursive: true, force: true });
    rmSync(notaryDir, { recursive: true, force: true });
  });
});
