/** Proposed tests/keys/configTicketSignerIdentity.test.ts. E-only test packet; not executed. */
import { createECDH, createPrivateKey, createPublicKey, randomUUID, verify, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { createWorkOrder, verifyWorkOrder } from "../../src/workorders/workorderEngine.js";
import { issueExecTicket, issueExecTicketAsync, verifyExecTicket } from "../../src/tickets/execTicketVerify.js";
import { transitionConfigSignatureProvider } from "../../src/keys/configProviderTransition.js";
import { getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { boundProviderKey } from "../../src/keys/keyset.js";
import { revokeKey } from "../../src/keys/purposeKeys.js";
import { assertKeyNotRevoked, readKeyRevocations } from "../../src/keys/keyRevocations.js";
import { signingKeyId, verifyWithKey } from "../../src/keys/algorithmPolicy.js";
import { lockVault } from "../../src/vault/vault.js";
import { builtInDistrust } from "../../src/trust/builtInDistrust.js";
import { sha256Hex } from "../../src/utils/hash.js";
import type { KmsCall } from "../../src/keys/providers/awsKms.js";
import { AWS_ARN, awsFake, fakeKey, publicPem, type FakeKey } from "./providerFakes.js";

const boundary = vi.hoisted(() => ({ call: undefined as KmsCall | undefined, distrustText: "", distrustReads: 0 }));
// Existing supported provider factory boundary; real provider normalization and cryptography remain in production.
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const real = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...real, awsKmsProvider: (call?: KmsCall) => real.awsKmsProvider(call ?? ((...args) => boundary.call!(...args))) };
});
// Same owned registry-data boundary as tests/trust/builtInDistrust.test.ts. No product file is written and no
// verifier, admission decision, history resolver, revocation resolver, or trust function is replaced.
vi.mock("node:fs", async importOriginal => {
  const real = await importOriginal<typeof import("node:fs")>();
  const readFileSync = ((path: unknown, ...args: unknown[]) => {
    if (boundary.distrustText && /[\\/]trust[\\/]amc-distrust\.json$/.test(String(path))) {
      boundary.distrustReads++; return boundary.distrustText;
    }
    return (real.readFileSync as (...values: unknown[]) => unknown)(path, ...args);
  }) as typeof real.readFileSync;
  return { ...real, readFileSync, default: { ...real, readFileSync } };
});
const PASS = "config-ticket-signer-identity-owner";
const roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  boundary.call = undefined; boundary.distrustText = ""; boundary.distrustReads = 0;
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.restoreAllMocks(); vi.unstubAllEnvs();
});

const ORDER = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
const mod = (value: bigint) => (value % ORDER + ORDER) % ORDER;
function inverse(value: bigint): bigint {
  let a = mod(value), b = ORDER, x = 1n, y = 0n;
  while (b !== 0n) { const q = a / b; [a, b] = [b, a - q * b]; [x, y] = [y, x - q * y]; }
  if (a !== 1n) throw new Error("owned test scalar has no inverse");
  return mod(x);
}
function wire(ticket: string) {
  const [body, sig, ...extra] = ticket.split(".");
  expect(extra).toHaveLength(0); expect(body).toBeTruthy(); expect(sig).toBeTruthy();
  return { bytes: Buffer.from(body!, "base64url"), signature: Buffer.from(sig!, "base64url") };
}
/** The actual provider-issued signature is unchanged; derive the second key using the prior catalog/session fixture. */
function anotherMatchingKey(ticket: string, primaryPrivate: KeyObject): FakeKey {
  const { bytes, signature } = wire(ticket); expect(signature).toHaveLength(64);
  const jwk = primaryPrivate.export({ format: "jwk" });
  if (!jwk.d) throw new Error("owned P-256 scalar missing");
  const d = BigInt(`0x${Buffer.from(jwk.d, "base64url").toString("hex")}`);
  const r = BigInt(`0x${signature.subarray(0, 32).toString("hex")}`), z = BigInt(`0x${sha256Hex(bytes)}`);
  const alternate = mod(-d - 2n * z * inverse(r)); expect(alternate).toBeGreaterThan(0n);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(alternate.toString(16).padStart(64, "0"), "hex"));
  const point = ecdh.getPublicKey();
  const privateKey = createPrivateKey({ key: { kty: "EC", crv: "P-256",
    x: point.subarray(1, 33).toString("base64url"), y: point.subarray(33, 65).toString("base64url"),
    d: Buffer.from(alternate.toString(16).padStart(64, "0"), "hex").toString("base64url") }, format: "jwk" });
  return { kind: "p256", privateKey, publicKey: createPublicKey(privateKey) };
}

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-ticket-signer-identity-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  // Current default public work-order producer runs before a provider is bound, with its real Ed25519 sidecar.
  const order = createWorkOrder({ workspace, agentId: "default", title: "Owned ticket identity approval", description: "Real stable signed work order",
    riskTier: "low", requestedMode: "EXECUTE", allowedActionClasses: ["WRITE_HIGH"] });
  const input = { workspace, agentId: "default", workOrderId: order.workOrder.workOrderId, actionClass: "WRITE_HIGH" as const, toolName: "fs.write", ttlMs: 15 * 60_000 };
  const legacy = issueExecTicket(input).ticket;
  expect(verifyExecTicket({ workspace, ticket: legacy }).ok).toBe(true);
  const a = AWS_ARN("identity-a-" + randomUUID()), b = AWS_ARN("identity-b-" + randomUUID());
  const primary = fakeKey("p256"), keys: Record<string, FakeKey> = { [a]: primary }, fake = awsFake(keys); boundary.call = fake.call;
  const candidate = (id: string) => {
    const config = YAML.parse(readFileSync(join(workspace, ".amc", "amc.config.yaml"), "utf8"));
    config.keys = { refs: { "config-signature": { provider: "aws-kms", id } } };
    return Buffer.from(YAML.stringify(config));
  };
  await transitionConfigSignatureProvider(workspace, candidate(a), { passphrase: PASS });
  const issued = await issueExecTicketAsync(input), original = issued.ticket, primaryPem = publicPem(primary), { bytes, signature } = wire(original);
  const alternate = anotherMatchingKey(original, primary.privateKey), alternatePem = publicPem(alternate);
  keys[b] = alternate;
  expect(signingKeyId(alternatePem)).not.toBe(signingKeyId(primaryPem));
  for (const pem of [primaryPem, alternatePem]) expect(verify("sha256", bytes, { key: pem, dsaEncoding: "ieee-p1363" }, signature)).toBe(true);
  // The derived owned private scalar lets the NORMAL owner transition prove B's PoP and admit its exact history.
  // No low-level import, history bytes, keyset commit, verifier, admission rule, or new API is substituted.
  await transitionConfigSignatureProvider(workspace, candidate(b), { passphrase: PASS });
  expect(boundProviderKey(workspace, "config-signature")!.binding.id).toBe(b);
  expect(fake.requests.some(row => row.operation === "Sign" && row.input.KeyId === b
    && Buffer.from(row.input.Message as Uint8Array).subarray(0, 15).toString("ascii") === "AMC_KEY_POP_V1\0")).toBe(true);
  expect(getPurposeKeyHistory(workspace, "session")).not.toContain(alternatePem);
  const matches = getPurposeKeyHistory(workspace, "config-signature").filter(pem => verifyWithKey(bytes, pem, signature));
  expect(new Set(matches.map(pem => signingKeyId(pem)))).toEqual(new Set([signingKeyId(primaryPem), signingKeyId(alternatePem)]));
  const params = { workspace, ticket: original, expectedAgentId: "default", expectedWorkOrderId: input.workOrderId,
    expectedActionClass: "WRITE_HIGH" as const, expectedToolName: "fs.write" };
  // Retired, unrevoked A is still valid. Neither rebind nor the new owned history invalidates this ticket.
  expect(verifyExecTicket(params).ok).toBe(true);
  expect(verifyWorkOrder({ workspace, workOrderId: input.workOrderId })).toMatchObject({ valid: true, expired: false });
  return { workspace, input, primaryPem, alternatePem, currentPem: alternatePem, original, bytes, signature, params, legacy };
}

test.each(["owner-revocation", "built-in-distrust"] as const)("an actual config-purpose ticket cannot move its identical ECDSA signature to an unrefused matching key after %s", async refusal => {
  const f = await fixture(), primaryId = signingKeyId(f.primaryPem)!, alternateId = signingKeyId(f.alternatePem)!;
  if (refusal === "owner-revocation") {
    revokeKey(f.workspace, "config-signature", primaryId, "key-compromise", PASS);
    expect(readKeyRevocations(f.workspace, true)).toContainEqual(expect.objectContaining({ keyId: primaryId }));
    expect(() => assertKeyNotRevoked(f.workspace, true, primaryId, "config-signature")).toThrow(expect.objectContaining({ code: "KEY_REVOKED" }));
  } else {
    const shipped = builtInDistrust();
    boundary.distrustText = JSON.stringify({ distrust: [...shipped, { keyId: primaryId, distrustedFrom: null, reason: "key-compromise", note: "owned actual registry boundary", source: "amc-project" }] });
    expect(builtInDistrust()).toContainEqual(expect.objectContaining({ keyId: primaryId })); expect(boundary.distrustReads).toBeGreaterThan(0);
  }
  // B remains admitted, mathematically valid, unrevoked and not distrusted. The rejected match is only A.
  expect(getPurposeKeyHistory(f.workspace, "config-signature")).toEqual(expect.arrayContaining([f.primaryPem, f.alternatePem]));
  expect(() => assertKeyNotRevoked(f.workspace, true, alternateId, "config-signature")).not.toThrow();
  expect(builtInDistrust().some(row => row.keyId === alternateId)).toBe(false);
  expect(verify("sha256", f.bytes, { key: f.alternatePem, dsaEncoding: "ieee-p1363" }, f.signature)).toBe(true);
  expect(verifyExecTicket(f.params)).toMatchObject({ ok: false, error: "signature verification failed" });
  expect(f.params.ticket).toBe(f.original); // No signed keyId or envelope has been added to the unchanged raw wire.
  // A new raw ticket from current B and the original default Ed25519 ticket still authenticate the same work order.
  const fresh = await issueExecTicketAsync(f.input), freshWire = wire(fresh.ticket);
  expect(verifyWithKey(freshWire.bytes, f.currentPem, freshWire.signature)).toBe(true);
  expect(verifyExecTicket({ ...f.params, ticket: fresh.ticket }).ok).toBe(true);
  expect(verifyExecTicket({ ...f.params, ticket: f.legacy }).ok).toBe(true);
  expect(verifyWorkOrder({ workspace: f.workspace, workOrderId: f.input.workOrderId })).toMatchObject({ valid: true, expired: false });
});
