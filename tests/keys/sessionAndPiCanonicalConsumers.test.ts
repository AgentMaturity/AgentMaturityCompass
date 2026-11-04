import { generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { issueSessionToken, verifySessionToken } from "../../src/auth/sessionTokens.js";
import { claimPairingCode, createPairingCode, verifyPairingToken } from "../../src/pairing/pairingCodes.js";
import { piControlAnswer, verifyPiRegistrationAnswer } from "../../src/adapters/pi/piControlClient.js";
import { addPublicKeyToHistory, getSigningKey } from "../../src/crypto/keys.js";
import { getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { lowS } from "../../src/keys/algorithmPolicy.js";
import { mintReceipt } from "../../src/receipts/receipt.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function workspace(): string {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "session-canonical-fixture-only");
  const root = mkdtempSync(join(tmpdir(), "amc-session-canonical-")); roots.push(root);
  initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" });
  return root;
}
const pemOf = (key: KeyObject) => key.export({ type: "spki", format: "pem" }).toString();
const signP256 = (bytes: Buffer, key: KeyObject) => lowS(sign("sha256", bytes, { key, dsaEncoding: "ieee-p1363" }));
function highS(signature: Buffer): Buffer {
  const n = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
  return Buffer.concat([signature.subarray(0, 32), Buffer.from((n - BigInt(`0x${signature.subarray(32).toString("hex")}`)).toString(16).padStart(64, "0"), "hex")]);
}
const wire = (bytes: Buffer, signature: Buffer) => `${bytes.toString("base64url")}.${signature.toString("base64url")}`;
const received = (token: string) => Buffer.from(token.split(".")[0]!, "base64url");

describe("session and pairing consumers accept canonical signatures in the session purpose only", () => {
  test.each(["session", "pairing"] as const)("%s verifies exact received bytes, inherited session history, and unchanged Ed25519 issuance", (kind) => {
    const ws = workspace();
    const token = kind === "session"
      ? issueSessionToken({ workspace: ws, userId: "fixture-user", username: "alice", roles: ["OWNER"] }).token
      : claimPairingCode({ workspace: ws, code: createPairingCode({ workspace: ws, ttlMs: 60_000 }).code }).token!;
    const check = (value: string) => kind === "session"
      ? verifySessionToken({ workspace: ws, token: value })
      : verifyPairingToken({ workspace: ws, token: value });
    const original = received(token);
    // Independent legacy signing control: current synchronous issuers keep exact Ed25519 token bytes.
    expect(token).toBe(wire(original, sign(null, original, getSigningKey(ws, "session"))));
    expect(check(token).ok).toBe(true);
    // JSON whitespace/order is part of this received payload. Verification must never reserialize it.
    const bytes = Buffer.from(JSON.stringify(JSON.parse(original.toString("utf8")), null, 2) + "\n", "utf8");
    expect(bytes.equals(original)).toBe(false);
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), pem = pemOf(keys.publicKey);
    const signature = signP256(bytes, keys.privateKey), presented = wire(bytes, signature);
    expect(verify("sha256", bytes, { key: keys.publicKey, dsaEncoding: "ieee-p1363" }, signature)).toBe(true);
    expect(check(presented).ok).toBe(false);
    // A key authorized for auditor artifacts is still not a session key.
    addPublicKeyToHistory(ws, "auditor", pem, "imported");
    expect(check(presented).ok).toBe(false);
    addPublicKeyToHistory(ws, "session", pem, "imported");
    expect(getPurposeKeyHistory(ws, "session")).toContain(pem);
    expect(check(presented).ok).toBe(true);
    const changed = Buffer.from(bytes.toString("utf8").replace("\n", "\n "));
    expect(check(wire(changed, signature)).ok).toBe(false);
    const high = highS(signature), der = sign("sha256", bytes, keys.privateKey);
    expect(verify("sha256", bytes, { key: keys.publicKey, dsaEncoding: "ieee-p1363" }, high)).toBe(true);
    expect(verify("sha256", bytes, keys.publicKey, der)).toBe(true);
    for (const bad of [high, der]) expect(check(wire(bytes, bad)).ok).toBe(false);
    const p384 = generateKeyPairSync("ec", { namedCurve: "secp384r1" });
    const unsupported = sign("sha256", bytes, { key: p384.privateKey, dsaEncoding: "ieee-p1363" });
    expect(verify("sha256", bytes, { key: p384.publicKey, dsaEncoding: "ieee-p1363" }, unsupported)).toBe(true);
    // Unsupported history entries cannot become authority by a local file append.
    const historyPath = join(ws, ".amc", "keys", "session_history.json");
    const history = JSON.parse(readFileSync(historyPath, "utf8"));
    writeFileSync(historyPath, JSON.stringify({ ...history, signature: "A".repeat(86) + "==" }));
    expect(getPurposeKeyHistory(ws, "session")).not.toContain(pem);
    expect(check(presented).ok).toBe(false);
    expect(check(wire(bytes, unsupported)).ok).toBe(false);
    // A corrupt historical admission never removes the current independent vault-key compatibility path.
    expect(check(token).ok).toBe(true);
  });
});

function piFixtures() {
  const ed = generateKeyPairSync("ed25519");
  const privateKeyPem = ed.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const expected = { agentId: "fixture-agent", actionId: "pi.action", toolCallId: "pi.call", requestSha256: "a".repeat(64) };
  const providerResponse = { block: false, requestSha256: expected.requestSha256 };
  const providerResponseSha256 = sha256Hex(Buffer.from(canonicalize(providerResponse), "utf8"));
  const controlled = mintReceipt({ kind: "action_state", ts: Date.now(), agentId: expected.agentId, providerId: "hook-control:pi", model: null,
    eventHash: "b".repeat(64), bodySha256: providerResponseSha256, sessionId: "fixture-session", privateKeyPem,
    action: { executionId: expected.actionId, idempotencyKey: expected.toolCallId, authorizationRecordDigest: null,
      enforcement: { level: "enforced", boundary: "pi:tool_call" }, state: "authorized" } });
  const answer = { controlled: true, provider: "pi", actionId: expected.actionId, decision: "allow", providerResponse, providerResponseSha256, receipt: controlled.receipt };
  const registrationExpected = { agentId: expected.agentId, piSessionSha256: "c".repeat(64), piVersion: "1.0.4", extensionSha256: "d".repeat(64), requestSha256: "e".repeat(64) };
  const record = { kind: "amc.pi-session-registration/v1", ...registrationExpected, piInstallSha256: "1".repeat(64), manifestSha256: "2".repeat(64), mode: "print", qualified: true };
  const registered = mintReceipt({ kind: "work_accepted", ts: Date.now(), agentId: expected.agentId, providerId: "hook-registration:pi", model: null,
    eventHash: "f".repeat(64), bodySha256: sha256Hex(Buffer.from(canonicalize(record), "utf8")), sessionId: "fixture-session", privateKeyPem });
  return { ed, answer, expected, registration: { registered: true, provider: "pi", record, receipt: registered.receipt }, registrationExpected };
}

describe("Pi verifies only install-pinned receipt keys over exact received payload bytes", () => {
  test.each(["control", "registration"] as const)("%s accepts canonical P-256 and rejects encoding, key, byte and decision substitutions", (kind) => {
    const fixture = piFixtures();
    const answer = kind === "control" ? fixture.answer : fixture.registration;
    const check = (receipt: string, keys: readonly string[]) => {
      if (kind === "control") return piControlAnswer({ ...fixture.answer, receipt }, fixture.expected, keys);
      return verifyPiRegistrationAnswer({ ...fixture.registration, receipt }, fixture.registrationExpected, keys);
    };
    expect(() => check(answer.receipt, [pemOf(fixture.ed.publicKey)])).not.toThrow();
    const bytes = Buffer.from(JSON.stringify(JSON.parse(received(answer.receipt).toString("utf8")), null, 2) + "\n", "utf8");
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), pem = pemOf(keys.publicKey);
    const signature = signP256(bytes, keys.privateKey);
    expect(verify("sha256", bytes, { key: keys.publicKey, dsaEncoding: "ieee-p1363" }, signature)).toBe(true);
    expect(() => check(wire(bytes, signature), ["malformed key", pem])).not.toThrow();
    if (kind === "control") expect(check(wire(bytes, signature), [pem])).toEqual({ block: false });
    expect(() => check(wire(bytes, signature), [pemOf(fixture.ed.publicKey)])).toThrow(/signature does not verify/);
    for (const bad of [highS(signature), sign("sha256", bytes, keys.privateKey)]) expect(() => check(wire(bytes, bad), [pem])).toThrow(/signature does not verify/);
    const changed = Buffer.from(bytes.toString("utf8").replace("\n", "\n "));
    expect(() => check(wire(changed, signature), [pem])).toThrow(/signature does not verify/);
    const altered = { ...JSON.parse(bytes.toString("utf8")), body_sha256: "0".repeat(64) };
    const wrongBody = Buffer.from(JSON.stringify(altered), "utf8");
    expect(() => check(wire(wrongBody, signP256(wrongBody, keys.privateKey)), [pem])).toThrow(/not bound/);
    const p384 = generateKeyPairSync("ec", { namedCurve: "secp384r1" });
    expect(() => check(wire(bytes, sign("sha256", bytes, { key: p384.privateKey, dsaEncoding: "ieee-p1363" })), [pemOf(p384.publicKey)])).toThrow(/signature does not verify/);
  });
});
