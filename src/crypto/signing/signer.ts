import { spawnSync } from "node:child_process";
import { pathExists } from "../../utils/fs.js";
import { signDigestWithVault } from "./signerVault.js";
import { verifyHexDigestAny, getPublicKeyHistory, addPublicKeyToHistory } from "../keys.js";
import type { SignKind, SignedDigest } from "./signerTypes.js";
import {
  trustConfigSchema,
  verifyTrustConfigSignature,
  loadTrustConfig,
  resolveNotaryAuthSecret,
  trustConfigPath
} from "../../trust/trustConfig.js";
import { buildNotaryAuthSignature } from "../../notary/notaryAuth.js";
import { verifyNotarySignResponse } from "../../notary/notaryVerify.js";
import { verifySignatureEnvelope } from "./signatureEnvelope.js";

function postNotarySync(params: {
  baseUrl: string;
  unixSocketPath: string | null;
  path: string;
  body: string;
  headers: Record<string, string>;
}): { status: number; body: string } {
  const bridgeScript = `
const http = require("node:http");
const params = JSON.parse(process.argv[1]);
const finish = (status, body) => {
  process.stdout.write(JSON.stringify({ status, body }));
};
const bodyBytes = Buffer.from(params.body, "utf8");
if (params.unixSocketPath) {
  const req = http.request({
    method: "POST",
    socketPath: params.unixSocketPath,
    path: params.path,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(bodyBytes)),
      ...params.headers
    }
  }, (res) => {
    const chunks = [];
    res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    res.on("end", () => finish(res.statusCode || 0, Buffer.concat(chunks).toString("utf8")));
  });
  req.on("error", (error) => finish(0, String(error)));
  req.write(bodyBytes);
  req.end();
} else {
  const url = new URL(params.path, params.baseUrl);
  const req = http.request({
    method: "POST",
    hostname: url.hostname,
    port: Number(url.port || "80"),
    path: url.pathname + url.search,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(bodyBytes)),
      ...params.headers
    }
  }, (res) => {
    const chunks = [];
    res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    res.on("end", () => finish(res.statusCode || 0, Buffer.concat(chunks).toString("utf8")));
  });
  req.on("error", (error) => finish(0, String(error)));
  req.write(bodyBytes);
  req.end();
}
`;
  const out = spawnSync(process.execPath, ["-e", bridgeScript, JSON.stringify(params)], {
    encoding: "utf8",
    env: process.env
  });
  if (out.status !== 0) {
    throw new Error(`notary bridge failed: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
  return JSON.parse((out.stdout ?? "").trim() || "{}") as { status: number; body: string };
}

function signWithNotary(params: {
  workspace: string;
  kind: SignKind;
  digestHex: string;
}): SignedDigest {
  const trust = trustConfigSchema.parse(loadTrustConfig(params.workspace));
  const secret = resolveNotaryAuthSecret(params.workspace, trust.trust.notary.auth.secretRef);
  const payloadBytes = Buffer.from(params.digestHex, "hex");
  const body = JSON.stringify({
    kind: params.kind,
    payloadB64: payloadBytes.toString("base64"),
    payloadSha256: params.digestHex
  });
  const ts = Date.now();
  const auth = buildNotaryAuthSignature({
    secret,
    ts,
    method: "POST",
    path: "/sign",
    bodyBytes: Buffer.from(body, "utf8")
  });
  const response = postNotarySync({
    baseUrl: trust.trust.notary.baseUrl,
    unixSocketPath: trust.trust.notary.unixSocketPath,
    path: "/sign",
    body,
    headers: {
      [trust.trust.notary.auth.headerName]: auth,
      "x-amc-notary-ts": String(ts)
    }
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`notary sign failed (${response.status}): ${response.body}`);
  }
  const parsed = JSON.parse(response.body) as unknown;
  const verified = verifyNotarySignResponse(parsed, payloadBytes);
  if (!verified.ok || !verified.parsed) {
    throw new Error(`notary signature verification failed: ${verified.error ?? "unknown"}`);
  }
  if (verified.parsed.pubkeyFingerprint !== trust.trust.notary.pinnedPubkeyFingerprint) {
    throw new Error("notary signer fingerprint does not match pinned trust config fingerprint");
  }
  if (trust.trust.notary.requiredAttestationLevel === "HARDWARE" && verified.parsed.attestationLevel !== "HARDWARE") {
    throw new Error("notary attestation level below required HARDWARE");
  }
  const signedSkewMs = Math.abs(Date.now() - verified.parsed.signedTs);
  if (signedSkewMs > trust.trust.enforcement.notaryMaxClockSkewSeconds * 1000) {
    throw new Error("notary signed timestamp outside allowed clock skew");
  }
  addPublicKeyToHistory(params.workspace, "auditor", verified.parsed.pubkeyPem);
  return {
    digestSha256: params.digestHex,
    signature: verified.parsed.signatureB64,
    signedTs: verified.parsed.signedTs,
    signer: "auditor",
    envelope: {
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
    }
  };
}

export function signDigestWithPolicy(params: {
  workspace: string;
  kind: SignKind;
  digestHex: string;
}): SignedDigest {
  const trustSig = verifyTrustConfigSignature(params.workspace);
  if (!trustSig.valid) {
    const trustPath = trustConfigPath(params.workspace);
    if (!pathExists(trustPath)) {
      return signDigestWithVault(params);
    }
    const trust = loadTrustConfig(params.workspace);
    // Bootstrap path: allow initial signing while trust mode is local and signature is not yet created.
    if (!trustSig.signatureExists && trust.trust.mode === "LOCAL_VAULT") {
      return signDigestWithVault(params);
    }
    throw new Error(`trust config signature invalid: ${trustSig.reason ?? "unknown"}`);
  }
  const trust = loadTrustConfig(params.workspace);
  if (trust.trust.mode !== "NOTARY") {
    return signDigestWithVault(params);
  }
  const requireNotary = trust.trust.enforcement.requireNotaryFor.includes(params.kind);
  if (requireNotary || trust.trust.enforcement.denyLocalVaultSigningIfNotaryEnabled) {
    return signWithNotary(params);
  }
  return signDigestWithVault(params);
}

export function verifySignedDigest(params: {
  workspace: string;
  digestHex: string;
  signed: { signature: string; envelope?: unknown };
}): boolean {
  const trustedAuditorKeys = getPublicKeyHistory(params.workspace, "auditor");
  if (params.signed.envelope && typeof params.signed.envelope === "object") {
    try {
      const envelope = params.signed.envelope as { sigB64?: unknown };
      if (typeof envelope.sigB64 === "string" && envelope.sigB64 !== params.signed.signature) {
        return false;
      }
      return verifySignatureEnvelope(params.digestHex, params.signed.envelope as never, {
        trustedPublicKeys: trustedAuditorKeys,
        requireTrustedKey: true
      });
    } catch {
      return false;
    }
  }
  return verifyHexDigestAny(params.digestHex, params.signed.signature, trustedAuditorKeys);
}
