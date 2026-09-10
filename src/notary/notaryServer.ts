import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { URL } from "node:url";
import { randomUUID } from "node:crypto";
import { isIP, type Socket } from "node:net";
import { loadNotaryConfig, resolveNotaryDir } from "./notaryConfigStore.js";
import { loadNotarySigner } from "./notarySigner.js";
import { createNotaryReplayGuard, verifyNotaryRequestAuth } from "./notaryAuth.js";
import { notarySignRequestSchema } from "./notaryApiTypes.js";
import { sha256Hex } from "../utils/hash.js";
import { appendNotaryLogEntry, initNotaryLog, tailNotaryLog } from "./notaryLog.js";
import { signNotaryAttestation } from "./notaryAttestation.js";
import { verifyNotarySignResponse } from "./notaryVerify.js";

interface NotaryStartOptions {
  notaryDir?: string;
  workspace?: string | null;
  /** An explicit TCP-only runtime override; never persisted to notary.yaml. */
  bindHost?: string;
}

export function resolveNotaryBindHost(override: string | undefined, savedHost: string, unixSocketPath: string | null): string {
  if (override === undefined) return savedHost;
  if (unixSocketPath !== null) throw new Error("Notary --bind cannot be combined with a configured Unix socket.");
  const hostname = override.length <= 253 && override.split(".").every(label =>
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
  if (!isIP(override) && !hostname) throw new Error("Notary --bind requires an IP address or hostname without a port or URL scheme.");
  return override;
}

interface NotaryRuntimeState {
  ok: boolean;
  reasons: string[];
  notaryDir: string;
  fingerprint: string | null;
  attestationLevel: "SOFTWARE" | "HARDWARE" | null;
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage, limit = 1_048_576): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > limit) {
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function resolveAuthSecret(): string | null {
  const fromFile = process.env.AMC_NOTARY_AUTH_SECRET_FILE;
  if (fromFile && fromFile.trim().length > 0) {
    try {
      const value = readFileSync(resolve(fromFile.trim()), "utf8").trim();
      if (value.length > 0) {
        return value;
      }
    } catch (err) {
      throw new Error(`AMC_NOTARY_AUTH_SECRET_FILE is set but cannot be read: ${(err as Error).message}`);
    }
  }
  const direct = process.env.AMC_NOTARY_AUTH_SECRET;
  if (direct && direct.trim().length > 0) {
    return direct.trim();
  }
  return null;
}

function rateLimiter(limit: number): (key: string) => boolean {
  const map = new Map<string, { count: number; resetTs: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    const current = map.get(key);
    if (!current || current.resetTs < now) {
      map.set(key, {
        count: 1,
        resetTs: now + 60_000
      });
      return true;
    }
    current.count += 1;
    return current.count <= limit;
  };
}

export async function startNotaryServer(options: NotaryStartOptions = {}): Promise<{
  url: string;
  close: () => Promise<void>;
  state: NotaryRuntimeState;
}> {
  const notaryDir = resolveNotaryDir(options.notaryDir);
  const config = loadNotaryConfig(notaryDir);
  // Refuse invalid/conflicting transport arguments before signer or log writes.
  const bindHost = resolveNotaryBindHost(options.bindHost, config.notary.bindHost, config.notary.unixSocketPath);
  let signer: ReturnType<typeof loadNotarySigner> | null = null;
  const reasons: string[] = [];
  try {
    signer = loadNotarySigner({
      notaryDir,
      backend: config.notary.backend
    });
  } catch (error) {
    reasons.push(`SIGNER_INIT_FAILED: ${String(error)}`);
  }
  if (signer) {
    try {
      initNotaryLog(notaryDir, signer);
    } catch (error) {
      reasons.push(`NOTARY_LOG_INIT_FAILED: ${String(error)}`);
    }
  }
  const authSecret = resolveAuthSecret();
  if (config.notary.auth.enabled && (!authSecret || authSecret.length === 0)) {
    reasons.push("NOTARY_AUTH_SECRET_MISSING");
  }
  const state: NotaryRuntimeState = {
    ok: reasons.length === 0,
    reasons: [...reasons],
    notaryDir,
    fingerprint: signer ? signer.pubkeyFingerprint() : null,
    attestationLevel: signer ? signer.attestationLevel() : null
  };
  const limiter = rateLimiter(config.notary.rateLimitPerMinute);
  const markAuthReplay = createNotaryReplayGuard();
  const sockets = new Set<Socket>();

    const server = createServer(async (req, res) => {
    try {
      const requestId = randomUUID();
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const pathname = url.pathname;
      const method = (req.method ?? "GET").toUpperCase();

      if (pathname === "/healthz") {
        json(res, 200, { ok: true });
        return;
      }

      if (pathname === "/readyz") {
        json(res, state.ok ? 200 : 503, {
          status: state.ok ? "READY" : "NOT_READY",
          reasons: state.reasons,
          backend: config.notary.backend.type,
          fingerprint: state.fingerprint,
          attestationLevel: state.attestationLevel
        });
        return;
      }

      if (pathname === "/pubkey" && method === "GET") {
        if (!signer) {
          json(res, 503, { error: "notary signer unavailable" });
          return;
        }
        json(res, 200, {
          pubkeyPem: signer.pubkeyPem(),
          fingerprint: signer.pubkeyFingerprint(),
          backend: signer.backendType(),
          attestationLevel: signer.attestationLevel(),
          claims: signer.claims()
        });
        return;
      }

      if (pathname === "/attest/current" && method === "GET") {
        if (!signer) {
          json(res, 503, { error: "notary signer unavailable" });
          return;
        }
        const attestation = signNotaryAttestation({
          signer,
          workspace: options.workspace
        });
        json(res, 200, attestation);
        return;
      }

      if (pathname === "/sign" && method === "POST") {
        if (!signer) {
          json(res, 503, { error: "notary signer unavailable" });
          return;
        }
        if (!config.notary.allowedSignKinds.includes(String(url.searchParams.get("kind") ?? "")) && !limiter("sign-global")) {
          json(res, 429, { error: "rate limited" });
          return;
        }
        const body = await readBody(req);
        if (!limiter(`sign:${req.socket.remoteAddress ?? "unknown"}`)) {
          json(res, 429, { error: "rate limited" });
          return;
        }
        if (config.notary.auth.enabled) {
          if (!authSecret) {
            json(res, 503, { error: "notary auth secret missing" });
            return;
          }
          const auth = verifyNotaryRequestAuth({
            req,
            bodyBytes: body,
            secret: authSecret,
            headerName: config.notary.auth.headerName,
            tsHeaderName: config.notary.auth.tsHeaderName,
            maxClockSkewSeconds: config.notary.auth.maxClockSkewSeconds,
            path: pathname
          });
          if (!auth.ok) {
            appendNotaryLogEntry({
              notaryDir,
              signer,
              requestId,
              kind: "NOTARY_AUTH_FAILED",
              payloadSha256: sha256Hex(body)
            });
            json(res, 401, { error: "unauthorized", reason: auth.reason });
            return;
          }
          const replay = markAuthReplay(auth);
          if (!replay.ok) {
            appendNotaryLogEntry({
              notaryDir,
              signer,
              requestId,
              kind: "NOTARY_AUTH_FAILED",
              payloadSha256: sha256Hex(body)
            });
            json(res, 401, { error: "unauthorized", reason: replay.reason });
            return;
          }
        }
        const parsed = notarySignRequestSchema.parse(JSON.parse(body.toString("utf8")) as unknown);
        if (!config.notary.allowedSignKinds.includes(parsed.kind)) {
          json(res, 403, { error: `sign kind not allowed: ${parsed.kind}` });
          return;
        }
        const payloadBytes = Buffer.from(parsed.payloadB64, "base64");
        const payloadSha = sha256Hex(payloadBytes);
        if (parsed.payloadSha256 && parsed.payloadSha256 !== payloadSha) {
          json(res, 400, { error: "payloadSha256 mismatch" });
          return;
        }
        const signed = signer.sign(parsed.kind, payloadBytes);
        const out = {
          v: 1 as const,
          kind: parsed.kind,
          payloadSha256: payloadSha,
          signatureB64: signed.signatureB64,
          pubkeyPem: signed.pubkeyPem,
          pubkeyFingerprint: signed.pubkeyFingerprint,
          signedTs: signed.signedTs,
          backend: signed.backend,
          attestationLevel: signed.attestationLevel,
          claims: signed.claims
        };
        const verified = verifyNotarySignResponse(out, payloadBytes);
        if (!verified.ok) {
          json(res, 500, { error: verified.error ?? "sign verification failed" });
          return;
        }
        appendNotaryLogEntry({
          notaryDir,
          signer,
          requestId,
          kind: parsed.kind,
          payloadSha256: payloadSha
        });
        json(res, 200, out);
        return;
      }

      if (pathname === "/log/tail" && method === "GET") {
        if (!signer) {
          json(res, 503, { error: "notary signer unavailable" });
          return;
        }
        if (config.notary.auth.enabled) {
          if (!authSecret) {
            json(res, 503, { error: "notary auth secret missing" });
            return;
          }
          const auth = verifyNotaryRequestAuth({
            req,
            bodyBytes: Buffer.alloc(0),
            secret: authSecret,
            headerName: config.notary.auth.headerName,
            tsHeaderName: config.notary.auth.tsHeaderName,
            maxClockSkewSeconds: config.notary.auth.maxClockSkewSeconds,
            path: pathname
          });
          if (!auth.ok) {
            appendNotaryLogEntry({
              notaryDir,
              signer,
              requestId,
              kind: "NOTARY_AUTH_FAILED",
              payloadSha256: sha256Hex(`${pathname}:${auth.reason}`)
            });
            json(res, 401, { error: "unauthorized", reason: auth.reason });
            return;
          }
          const replay = markAuthReplay(auth);
          if (!replay.ok) {
            appendNotaryLogEntry({
              notaryDir,
              signer,
              requestId,
              kind: "NOTARY_AUTH_FAILED",
              payloadSha256: sha256Hex(`${pathname}:replay`)
            });
            json(res, 401, { error: "unauthorized", reason: replay.reason });
            return;
          }
        }
        const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? "50")));
        json(res, 200, {
          entries: tailNotaryLog(notaryDir, limit)
        });
        return;
      }

      json(res, 404, { error: "not found" });
    } catch (error) {
      console.error("[AMC Notary] Internal error:", error);
      json(res, 500, { error: "Internal server error" });
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => {
      sockets.delete(socket);
    });
  });

  const listenTarget = config.notary.unixSocketPath;
  server.timeout = 30000; // 30s request timeout
  server.keepAliveTimeout = 15000; // 15s keep-alive timeout
  await new Promise<void>((resolvePromise, rejectPromise) => {
    if (listenTarget) {
      try {
        rmSync(listenTarget, { force: true });
      } catch {
        // ignore if path does not exist
      }
      server.listen(listenTarget, () => resolvePromise());
      server.once("error", rejectPromise);
      return;
    }
    server.listen(config.notary.port, bindHost, () => resolvePromise());
    server.once("error", rejectPromise);
  });

  const url = listenTarget
    ? `unix://${listenTarget}`
    : `http://${isIP(bindHost) === 6 ? `[${bindHost}]` : bindHost}:${(server.address() as { port: number }).port}`;

  return {
    url,
    state,
    close: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolvePromise) => {
        server.close(() => resolvePromise());
      });
      if (listenTarget) {
        try {
          rmSync(listenTarget, { force: true });
        } catch {
          // ignore cleanup errors
        }
      }
    }
  };
}
