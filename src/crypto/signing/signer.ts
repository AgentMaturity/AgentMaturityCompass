import { spawnSync } from "node:child_process";
import { pathExists } from "../../utils/fs.js";
import { signDigestWithVault } from "./signerVault.js";
import { signDigestWithPurpose } from "./signerPurpose.js";
import { verifyHexDigestAny, getPublicKeyHistory, getAuthenticatedKeyHistory, getSigningPublicKeyPem, assertSha256HexDigest } from "../keys.js";
import { signingPurposeForKind, type SignKind, type SignedDigest } from "./signerTypes.js";
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
import type { SignatureEnvelope } from "./signerTypes.js";
import * as http from "node:http";
import * as https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { canonicalHost, resolveAndCheck } from "../../enforce/egressAllowlist.js";
import { checkScopedEgress } from "../../residency/checkEgress.js";
import { assertKeyNotRevoked, KeyRevokedError } from "../../keys/keyRevocations.js";
import { boundProviderKey, keysetDeclared } from "../../keys/keyset.js";
import { loadTrustContext } from "../../trust/trustContext.js";
import { distrustAt } from "../../trust/admissionRule.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalSigningKey } from "../../keys/algorithmPolicy.js";
import { inCheckPass } from "../../utils/checkPass.js";

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
    env: process.env, timeout: 30_000, maxBuffer: 1_048_576, stdio: ["ignore", "pipe", "ignore"]
  });
  if (out.status !== 0 || out.error || out.signal) {
    throw new Error("notary bridge failed");
  }
  try {
    const result = JSON.parse((out.stdout ?? "").trim()) as { status?: unknown; body?: unknown };
    if (!Number.isInteger(result.status) || typeof result.body !== "string") throw new Error();
    return { status: result.status as number, body: result.body };
  } catch { throw new Error("notary bridge failed"); }
}

interface PolicySignInput {
  workspace: string;
  kind: SignKind;
  digestHex: string;
  expectedSigner?: PolicySignerDescriptor;
}

type NotaryRequest = Parameters<typeof postNotarySync>[0];
/** Native DNS is not cancellable; consume either late outcome without allowing it to resume the transport. */
function notaryWithinDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    const finish = (callback: () => void) => { if (settled) return; settled = true; signal.removeEventListener("abort", aborted); callback(); };
    const aborted = () => finish(() => reject(new Error("notary transport deadline exceeded")));
    signal.addEventListener("abort", aborted, { once: true });
    work.then(value => { if (signal.aborted) aborted(); else finish(() => resolvePromise(value)); },
      () => finish(() => reject(new Error(signal.aborted ? "notary transport deadline exceeded" : "notary transport egress failed"))));
    if (signal.aborted) aborted();
  });
}

/** Native asynchronous transport; a fixed total deadline also bounds a slow/truncated body. */
async function postNotaryAsync(workspace: string, params: NotaryRequest, beforeRequest: () => void): Promise<{ status: number; body: string }> {
  const controller = new AbortController(), deadlineAt = performance.now() + 30_000;
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
  let url: URL;
  try { url = new URL(params.path, params.baseUrl); } catch { throw new Error("notary transport destination invalid"); }
  let lookup: LookupFunction | undefined;
  if (params.unixSocketPath === null) {
    // The exact operator-signed notary destination supplies the allowed host. A DNS name does not implicitly
    // grant a private/loopback address; those require an explicitly configured IP literal, as decideEgress requires.
    checkScopedEgress(workspace, "bridge", url.href, { dataClasses: null, purpose: null });
    if (controller.signal.aborted || performance.now() >= deadlineAt) throw new Error("notary transport deadline exceeded");
    const host = canonicalHost(url.hostname), checked = await notaryWithinDeadline(resolveAndCheck(host, { allowHosts: [host] }), controller.signal);
    const address = checked.addresses[0];
    if (!checked.decision.allowed || address === undefined) throw new Error("notary transport egress refused");
    const family = isIP(address);
    lookup = (_name, options, callback) => {
      if (options.all) callback(null, [{ address, family }]); else callback(null, address, family);
    };
    // Recheck native policy immediately before creating the socket, after DNS may have yielded.
    checkScopedEgress(workspace, "bridge", url.href, { dataClasses: null, purpose: null });
  }
  // The genuine original producer/policy negative runs after DNS and before entering native request creation.
  // Keep it outside the transport catch so its actual refusal cause survives without opening a socket.
  beforeRequest();
  // Unix-domain sockets are a local configured IPC transport: no DNS, TCP, URL destination, or redirect is followed.
  if (controller.signal.aborted || performance.now() >= deadlineAt) throw new Error("notary transport deadline exceeded");
  return await new Promise((resolvePromise, reject) => {
    let settled = false;
    const fail = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error(controller.signal.aborted ? "notary transport deadline exceeded" : "notary transport failed")); } };
    let request: http.ClientRequest | undefined;
    try {
      if (url.protocol !== "http:" && url.protocol !== "https:") { fail(); return; }
      const send = params.unixSocketPath || url.protocol === "http:" ? http.request : https.request;
      request = send(params.unixSocketPath ? { method: "POST", socketPath: params.unixSocketPath, path: params.path, signal: controller.signal,
        headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(params.body)), ...params.headers } }
        : { method: "POST", hostname: url.hostname, port: url.port || (url.protocol === "https:" ? 443 : 80), agent: false, lookup, signal: controller.signal,
          path: url.pathname + url.search,
          headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(params.body)), ...params.headers } }, res => {
        const chunks: Buffer[] = []; let size = 0;
        res.on("error", fail); res.on("aborted", fail);
        res.on("data", (part: Buffer | string) => {
          if (settled) return;
          const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part);
          size += bytes.length;
          if (size > 1_048_576) { fail(); request?.destroy(); res.destroy(); return; }
          chunks.push(bytes);
        });
        res.on("end", () => {
          if (settled) return;
          settled = true; clearTimeout(timer);
          resolvePromise({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      });
      request.on("error", fail); request.end(params.body);
    } catch { fail(); request?.destroy(); }
  });
  } finally { clearTimeout(timer); }
}

function prepareNotarySigning(params: {
  workspace: string;
  kind: SignKind;
  digestHex: string;
}) {
  assertSha256HexDigest(params.digestHex);
  const trust = trustConfigSchema.parse(loadTrustConfig(params.workspace));
  const secret = resolveNotaryAuthSecret(params.workspace, trust.trust.notary.auth.secretRef);
  const payloadBytes = Buffer.from(params.digestHex, "hex");
  const body = JSON.stringify({
    kind: params.kind,
    payloadB64: payloadBytes.toString("base64"),
    // This field checks the transport payload. The signature still covers the
    // original digest bytes, and SignedDigest retains the original digest.
    payloadSha256: sha256Hex(payloadBytes)
  });
  const ts = Date.now();
  const auth = buildNotaryAuthSignature({
    secret,
    ts,
    method: "POST",
    path: "/sign",
    bodyBytes: Buffer.from(body, "utf8")
  });
  const request: NotaryRequest = {
    baseUrl: trust.trust.notary.baseUrl,
    unixSocketPath: trust.trust.notary.unixSocketPath,
    path: "/sign",
    body,
    headers: {
      [trust.trust.notary.auth.headerName]: auth,
      "x-amc-notary-ts": String(ts)
    }
  };
  return { trust, payloadBytes, request };
}

function acceptNotarySigning(params: PolicySignInput, prepared: ReturnType<typeof prepareNotarySigning>, response: { status: number; body: string }): SignedDigest {
  const { trust, payloadBytes } = prepared;
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`notary sign failed (${response.status})`);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(response.body) as unknown; } catch { throw new Error("notary signature response invalid"); }
  const verified = verifyNotarySignResponse(parsed, payloadBytes);
  if (!verified.ok || !verified.parsed || verified.parsed.kind !== params.kind) {
    throw new Error("notary signature verification failed");
  }
  if (verified.parsed.pubkeyFingerprint !== trust.trust.notary.pinnedPubkeyFingerprint) {
    throw new Error("notary signer fingerprint does not match pinned trust config fingerprint");
  }
  const publicKey = canonicalSigningKey(verified.parsed.pubkeyPem);
  if (publicKey === null) throw new Error("notary signer has an unsupported public key");
  if (trust.trust.notary.requiredAttestationLevel === "HARDWARE" && verified.parsed.attestationLevel !== "HARDWARE") {
    throw new Error("notary attestation level below required HARDWARE");
  }
  const signedSkewMs = Math.abs(Date.now() - verified.parsed.signedTs);
  if (signedSkewMs > trust.trust.enforcement.notaryMaxClockSkewSeconds * 1000) {
    throw new Error("notary signed timestamp outside allowed clock skew");
  }
  return {
    digestSha256: params.digestHex,
    signature: verified.parsed.signatureB64,
    signedTs: verified.parsed.signedTs,
    signer: "auditor",
    envelope: {
      v: 1,
      alg: publicKey.algorithm,
      pubkeyB64: Buffer.from(verified.parsed.pubkeyPem, "utf8").toString("base64"),
      fingerprint: verified.parsed.pubkeyFingerprint,
      sigB64: verified.parsed.signatureB64,
      signedTs: verified.parsed.signedTs,
      signer: {
        type: "NOTARY",
        attestationLevel: verified.parsed.attestationLevel,
        ...(verified.parsed.attestationBasis === undefined ? {} : { attestationBasis: verified.parsed.attestationBasis }),
        notaryFingerprint: verified.parsed.pubkeyFingerprint
      }
    }
  };
}

function signWithNotary(params: PolicySignInput): SignedDigest {
  const prepared = prepareNotarySigning(params);
  return acceptNotarySigning(params, prepared, postNotarySync(prepared.request));
}

/** Who signs `kind` under the workspace's trust config; throws when that config's signature is invalid. */
export function signingRoute(workspace: string, kind: SignKind): "vault" | "notary" {
  const trustSig = verifyTrustConfigSignature(workspace);
  if (!trustSig.valid) {
    const trustPath = trustConfigPath(workspace);
    if (!pathExists(trustPath)) {
      return "vault";
    }
    const trust = loadTrustConfig(workspace);
    // Bootstrap path: allow initial signing while trust mode is local and signature is not yet created.
    if (!trustSig.signatureExists && trust.trust.mode === "LOCAL_VAULT") {
      return "vault";
    }
    throw new Error(`trust config signature invalid: ${trustSig.reason ?? "unknown"}`);
  }
  const trust = loadTrustConfig(workspace);
  if (trust.trust.mode !== "NOTARY") {
    return "vault";
  }
  const requireNotary = trust.trust.enforcement.requireNotaryFor.includes(kind);
  return requireNotary || trust.trust.enforcement.denyLocalVaultSigningIfNotaryEnabled ? "notary" : "vault";
}

export interface PolicySignerDescriptor {
  kind: SignKind;
  mode: "VAULT" | "NOTARY";
  algorithm: SignatureEnvelope["alg"];
  publicKeyPem: string;
  /** Canonical key identity, not an untrusted label or a different PEM spelling. */
  fingerprint: string;
}

/** Current synchronous policy seam only: authenticated public metadata, with no signing probe or private-key read. */
export const describePolicySigner = inCheckPass(function describePolicySigner(workspace: string, kind: SignKind): PolicySignerDescriptor {
  const route = signingRoute(workspace, kind);
  let publicKeyPem: string;
  if (route === "vault") {
    const purpose = signingPurposeForKind(kind);
    publicKeyPem = boundProviderKey(workspace, purpose)?.publicKeyPem ?? getSigningPublicKeyPem(workspace, purpose);
  } else {
    const trust = trustConfigSchema.parse(loadTrustConfig(workspace));
    const history = getAuthenticatedKeyHistory(workspace, "auditor");
    if (history === null) throw new Error("notary signing key history is not authenticated");
    const pinned = trust.trust.notary.pinnedPubkeyFingerprint;
    const entry = history.entries.find(row => row.fingerprint === pinned && sha256Hex(Buffer.from(row.publicKeyPem, "utf8")) === pinned);
    if (entry === undefined) throw new Error("pinned notary signing key is absent from authenticated history");
    publicKeyPem = entry.publicKeyPem;
  }
  const key = canonicalSigningKey(publicKeyPem);
  if (key === null) throw new Error("policy signer has an unsupported public key");
  return { kind, mode: route === "vault" ? "VAULT" : "NOTARY", algorithm: key.algorithm, publicKeyPem: key.pem,
    fingerprint: sha256Hex(Buffer.from(key.pem, "utf8")) };
});

export function signDigestWithPolicy(params: {
  workspace: string;
  kind: SignKind;
  digestHex: string;
  /** Bind metadata already hashed into the payload to the signer that actually returns the signature. */
  expectedSigner?: PolicySignerDescriptor;
}): SignedDigest {
  assertSha256HexDigest(params.digestHex);
  const signed = signingRoute(params.workspace, params.kind) === "notary" ? signWithNotary(params) : signDigestWithVault(params);
  return assertPolicySignerResponse(params, signed);
}

function assertPolicySignerResponse(params: PolicySignInput, signed: SignedDigest): SignedDigest {
  if (params.expectedSigner !== undefined) {
    const expected = params.expectedSigner, envelope = signed.envelope;
    const pem = envelope === undefined ? "" : Buffer.from(envelope.pubkeyB64, "base64").toString("utf8");
    const key = canonicalSigningKey(pem);
    if (expected.kind !== params.kind || envelope === undefined || envelope.signer.type !== expected.mode
      || key?.pem !== expected.publicKeyPem || key.algorithm !== expected.algorithm || envelope.alg !== expected.algorithm
      || sha256Hex(Buffer.from(expected.publicKeyPem, "utf8")) !== expected.fingerprint || signed.signature !== envelope.sigB64
      || !verifySignatureEnvelope(params.digestHex, envelope, { trustedPublicKeys: [pem], requireTrustedKey: true })) {
      throw new Error("policy signing response does not match the signer described in signed metadata");
    }
  }
  return signed;
}

/** Awaitable policy signing used by asynchronous artifact producers. Existing synchronous SDK API remains. */
function assertPolicySignerNotRefused(workspace: string, kind: SignKind, keyId: string): void {
  try { assertKeyNotRevoked(workspace, keysetDeclared(workspace), keyId, signingPurposeForKind(kind)); }
  catch (error) { if (error instanceof KeyRevokedError) throw error; throw new Error("policy signer current revocation state invalid"); }
  // This is only a refusal gate. The existing authenticated route/descriptor still supplies authority; no workspace
  // purpose binding or independent trust-list admission is invented for a transport notary key.
  try {
    const operator = loadTrustContext(), now = Date.now();
    if (distrustAt(operator.distrust, keyId, now) || operator.lists.some(list => list.entries.some(entry =>
      entry.keyId === keyId && entry.revocationReason === "key-compromise"))) throw new Error("distrusted");
  } catch { throw new Error("policy signer current distrust state refused"); }
}

const samePolicySigner = (a: PolicySignerDescriptor, b: PolicySignerDescriptor) => a.kind === b.kind && a.mode === b.mode
  && a.algorithm === b.algorithm && a.publicKeyPem === b.publicKeyPem && a.fingerprint === b.fingerprint;

/** Internal final publication gate for producers that prepare more than one policy signature. No remote probe. */
export const assertPolicySignerCurrent = inCheckPass(function assertPolicySignerCurrent(workspace: string, expected: PolicySignerDescriptor): void {
  if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
  if (!samePolicySigner(expected, describePolicySigner(workspace, expected.kind))) throw new Error("policy signing state changed while signing");
  assertPolicySignerNotRefused(workspace, expected.kind, expected.fingerprint);
});

export async function signDigestWithPolicyAsync(input: PolicySignInput & { beforeSign?: () => void }): Promise<SignedDigest> {
  if (process.env.AMC_NO_SIGN === "1") throw new Error("no-sign mode does not authorize policy signing");
  const beforeSign = input.beforeSign; beforeSign?.();
  const params = { workspace: input.workspace, kind: input.kind, digestHex: input.digestHex,
    ...(input.expectedSigner === undefined ? {} : { expectedSigner: { ...input.expectedSigner } }) };
  assertSha256HexDigest(params.digestHex);
  const selected = describePolicySigner(params.workspace, params.kind);
  assertPolicySignerNotRefused(params.workspace, params.kind, selected.fingerprint);
  if (params.expectedSigner !== undefined && !samePolicySigner(selected, params.expectedSigner)) {
    throw new Error("policy signing response does not match the signer described in signed metadata");
  }
  const policy = JSON.stringify(loadTrustConfig(params.workspace));
  const current = () => {
    beforeSign?.(); assertPolicySignerCurrent(params.workspace, selected);
    if (JSON.stringify(loadTrustConfig(params.workspace)) !== policy) throw new Error("policy signing state changed before Sign");
  };
  const signed = selected.mode === "VAULT" ? await signDigestWithPurpose({ ...params, beforeSign: current }) : await (async () => {
    const prepared = prepareNotarySigning(params); current();
    return acceptNotarySigning(params, prepared, await postNotaryAsync(params.workspace, prepared.request, current));
  })();
  // The original descriptor and complete enforcement policy remain authoritative after the remote wait.
  assertPolicySignerCurrent(params.workspace, selected);
  if (JSON.stringify(loadTrustConfig(params.workspace)) !== policy) {
    throw new Error("policy signing state changed while signing");
  }
  return assertPolicySignerResponse({ ...params, expectedSigner: selected }, signed);
}

export function verifySignedDigest(params: {
  workspace: string;
  digestHex: string;
  signed: { signature: string; envelope?: unknown };
}): boolean {
  const trustedAuditorKeys = getPublicKeyHistory(params.workspace, "auditor");
  if (params.signed.envelope !== undefined) {
    try {
      const envelope = params.signed.envelope as { sigB64?: unknown };
      if (typeof envelope.sigB64 === "string" && envelope.sigB64 !== params.signed.signature) {
        return false;
      }
      return verifySignatureEnvelope(params.digestHex, params.signed.envelope as SignatureEnvelope, {
        trustedPublicKeys: trustedAuditorKeys,
        requireTrustedKey: true
      });
    } catch {
      return false;
    }
  }
  return verifyHexDigestAny(params.digestHex, params.signed.signature, trustedAuditorKeys);
}
