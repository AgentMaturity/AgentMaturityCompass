import { request as httpRequest } from "node:http";
import { addPublicKeyToHistory } from "../keys.js";
import type { SignKind, SignedDigest, SignatureEnvelope } from "./signerTypes.js";
import { buildNotaryAuthSignature } from "../../notary/notaryAuth.js";
import { verifyNotarySignResponse } from "../../notary/notaryVerify.js";
import { resolveNotaryAuthSecret, type TrustConfig } from "../../trust/trustConfig.js";

async function postJson(params: {
  baseUrl: string;
  unixSocketPath: string | null;
  path: string;
  body: Buffer;
  headers: Record<string, string>;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise) => {
    const url = new URL(params.path, params.baseUrl);
    const req = httpRequest(
      params.unixSocketPath
        ? {
            method: "POST",
            socketPath: params.unixSocketPath,
            path: params.path,
            headers: {
              "content-type": "application/json",
              "content-length": String(params.body.length),
              ...params.headers
            }
          }
        : {
            method: "POST",
            hostname: url.hostname,
            port: Number(url.port || "80"),
            path: `${url.pathname}${url.search}`,
            headers: {
              "content-type": "application/json",
              "content-length": String(params.body.length),
              ...params.headers
            }
          },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolvePromise({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );
    req.on("error", () => resolvePromise({ status: 0, body: "" }));
    req.write(params.body);
    req.end();
  });
}

export async function signDigestWithNotary(params: {
  workspace: string;
  trust: TrustConfig;
  kind: SignKind;
  digestHex: string;
}): Promise<SignedDigest> {
  const payloadBytes = Buffer.from(params.digestHex, "hex");
  const payload = Buffer.from(
    JSON.stringify({
      kind: params.kind,
      payloadB64: payloadBytes.toString("base64"),
      payloadSha256: params.digestHex
    }),
    "utf8"
  );
  const ts = Date.now();
  const secret = resolveNotaryAuthSecret(params.workspace, params.trust.trust.notary.auth.secretRef);
  const authSig = buildNotaryAuthSignature({
    secret,
    ts,
    method: "POST",
    path: "/sign",
    bodyBytes: payload
  });
  const res = await postJson({
    baseUrl: params.trust.trust.notary.baseUrl,
    unixSocketPath: params.trust.trust.notary.unixSocketPath,
    path: "/sign",
    body: payload,
    headers: {
      [params.trust.trust.notary.auth.headerName]: authSig,
      "x-amc-notary-ts": String(ts)
    }
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`notary signing failed (${res.status}): ${res.body}`);
  }
  const parsed = JSON.parse(res.body) as unknown;
  const verified = verifyNotarySignResponse(parsed, payloadBytes);
  if (!verified.ok || !verified.parsed) {
    throw new Error(`notary response verification failed: ${verified.error ?? "unknown"}`);
  }
  if (verified.parsed.pubkeyFingerprint !== params.trust.trust.notary.pinnedPubkeyFingerprint) {
    throw new Error("notary signer fingerprint does not match pinned trust config fingerprint");
  }
  if (
    params.trust.trust.notary.requiredAttestationLevel === "HARDWARE" &&
    verified.parsed.attestationLevel !== "HARDWARE"
  ) {
    throw new Error("notary attestation level below required HARDWARE");
  }
  const signedSkewMs = Math.abs(Date.now() - verified.parsed.signedTs);
  if (signedSkewMs > params.trust.trust.enforcement.notaryMaxClockSkewSeconds * 1000) {
    throw new Error("notary signed timestamp outside allowed clock skew");
  }
  addPublicKeyToHistory(params.workspace, "auditor", verified.parsed.pubkeyPem);
  const envelope: SignatureEnvelope = {
    v: 1,
    alg: "ed25519",
    pubkeyB64: Buffer.from(verified.parsed.pubkeyPem, "utf8").toString("base64"),
    fingerprint: verified.parsed.pubkeyFingerprint,
    sigB64: verified.parsed.signatureB64,
    signedTs: verified.parsed.signedTs,
    signer: {
      type: "NOTARY",
      attestationLevel: verified.parsed.attestationLevel,
      notaryFingerprint: verified.parsed.pubkeyFingerprint
    }
  };
  return {
    digestSha256: params.digestHex,
    signature: verified.parsed.signatureB64,
    signedTs: envelope.signedTs,
    signer: "auditor",
    envelope
  };
}
