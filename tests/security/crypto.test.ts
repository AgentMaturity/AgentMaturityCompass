import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifySignedDigest, signDigestWithPolicy } from "../../src/crypto/signing/signer.js";
import { getPrivateKeyPem, signHexDigest } from "../../src/crypto/keys.js";
import { initWorkspace } from "../../src/workspace.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { openLedger, verifyLedgerIntegrity } from "../../src/ledger/ledger.js";
import { notaryInitCli } from "../../src/notary/notaryCli.js";
import { loadNotaryConfig, saveNotaryConfig } from "../../src/notary/notaryConfigStore.js";
import { startNotaryServer } from "../../src/notary/notaryServer.js";
import { buildNotaryAuthSignature } from "../../src/notary/notaryAuth.js";

function newWorkspace(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  initWorkspace({ workspacePath: dir, agentId: "default" });
  return dir;
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
  const { createServer } = await import("node:http");
  return new Promise((resolvePort, reject) => {
    const server = createServer((_req, res) => {
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

async function httpPostJson(params: {
  url: string;
  body: string;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolveResult, reject) => {
    const req = httpRequest(
      params.url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(params.body)),
          ...(params.headers ?? {})
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolveResult({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(3000, () => {
      req.destroy(new Error("http post timeout"));
    });
    req.write(params.body);
    req.end();
  });
}

describe("crypto trust chain hardening", () => {
  it("rejects envelope signatures from keys outside workspace trust anchors", () => {
    const workspace = newWorkspace("amc-crypto-envelope");
    try {
      const digest = sha256Hex(Buffer.from("critical-digest", "utf8"));
      const attacker = generateKeyPairSync("ed25519");
      const attackerPrivate = attacker.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
      const attackerPublic = attacker.publicKey.export({ format: "pem", type: "spki" }).toString();
      const attackerSig = signHexDigest(digest, attackerPrivate);
      const verified = verifySignedDigest({
        workspace,
        digestHex: digest,
        signed: {
          signature: attackerSig,
          envelope: {
            v: 1,
            alg: "ed25519",
            pubkeyB64: Buffer.from(attackerPublic, "utf8").toString("base64"),
            fingerprint: sha256Hex(Buffer.from(attackerPublic, "utf8")),
            sigB64: attackerSig,
            signedTs: Date.now(),
            signer: {
              type: "VAULT",
              attestationLevel: "SOFTWARE"
            }
          }
        }
      });
      expect(verified).toBe(false);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("fails verification when detached signature does not match envelope signature", () => {
    const workspace = newWorkspace("amc-crypto-envelope-mismatch");
    try {
      const digest = sha256Hex(Buffer.from("signed-payload", "utf8"));
      const signed = signDigestWithPolicy({
        workspace,
        kind: "BUNDLE",
        digestHex: digest
      });
      expect(
        verifySignedDigest({
          workspace,
          digestHex: digest,
          signed: {
            signature: signed.signature,
            envelope: signed.envelope
          }
        })
      ).toBe(true);
      expect(
        verifySignedDigest({
          workspace,
          digestHex: digest,
          signed: {
            signature: Buffer.from("tampered", "utf8").toString("base64"),
            envelope: signed.envelope
          }
        })
      ).toBe(false);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("rejects replayed authenticated notary /sign requests", async () => {
    const workspace = newWorkspace("amc-crypto-replay");
    const notaryDir = mkdtempSync(join(tmpdir(), "amc-crypto-replay-notary-"));
    const port = await availablePort();
    await withEnv(
      {
        AMC_NOTARY_PASSPHRASE: "crypto-notary-passphrase",
        AMC_NOTARY_AUTH_SECRET: "crypto-notary-auth-secret"
      },
      async () => {
        await notaryInitCli({ notaryDir });
        const config = loadNotaryConfig(notaryDir);
        config.notary.bindHost = "127.0.0.1";
        config.notary.port = port;
        saveNotaryConfig(notaryDir, config);

        const runtime = await startNotaryServer({ notaryDir, workspace });
        try {
          const payloadBytes = Buffer.from("replay-payload", "utf8");
          const body = JSON.stringify({
            kind: "MERKLE_ROOT",
            payloadB64: payloadBytes.toString("base64"),
            payloadSha256: sha256Hex(payloadBytes)
          });
          const ts = Date.now();
          const auth = buildNotaryAuthSignature({
            secret: "crypto-notary-auth-secret",
            ts,
            method: "POST",
            path: "/sign",
            bodyBytes: Buffer.from(body, "utf8")
          });
          const headers = {
            "x-amc-notary-ts": String(ts),
            "x-amc-notary-auth": auth
          };
          const first = await httpPostJson({
            url: `http://127.0.0.1:${port}/sign`,
            body,
            headers
          });
          expect(first.status).toBe(200);

          const replay = await httpPostJson({
            url: `http://127.0.0.1:${port}/sign`,
            body,
            headers
          });
          expect(replay.status).toBe(401);
          expect(replay.body).toContain("replay");
        } finally {
          await runtime.close();
        }
      }
    );
    rmSync(notaryDir, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  });

  it("detects session final hash tampering even when the seal signature is valid", async () => {
    const workspace = newWorkspace("amc-crypto-ledger");
    const ledger = openLedger(workspace);
    try {
      ledger.startSession({
        sessionId: "s1",
        runtime: "openclaw",
        binaryPath: "/bin/openclaw",
        binarySha256: "a".repeat(64)
      });
      ledger.appendEvidence({
        sessionId: "s1",
        runtime: "openclaw",
        eventType: "audit",
        payload: "ok",
        inline: true,
        meta: { agentId: "default" }
      });
      ledger.sealSession("s1");

      const tamperedFinalHash = sha256Hex(Buffer.from("tampered-session-final", "utf8"));
      const tamperedSeal = signHexDigest(tamperedFinalHash, getPrivateKeyPem(workspace, "monitor"));
      ledger.db
        .prepare(
          `INSERT INTO sessions
          (session_id, started_ts, ended_ts, runtime, binary_path, binary_sha256, session_final_event_hash, session_seal_sig)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "s2-tampered",
          Date.now(),
          Date.now(),
          "openclaw",
          "/bin/openclaw",
          "b".repeat(64),
          tamperedFinalHash,
          tamperedSeal
        );
    } finally {
      ledger.close();
    }

    const verified = await verifyLedgerIntegrity(workspace);
    expect(verified.ok).toBe(false);
    expect(verified.errors.some((entry) => entry.includes("Session s2-tampered final hash mismatch"))).toBe(true);
    rmSync(workspace, { recursive: true, force: true });
  });
});

