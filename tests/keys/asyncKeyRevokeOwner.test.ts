// Proposed destination: tests/keys/asyncKeyRevokeOwner.test.ts. Static proposal; no execution by reviewer.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { Command } from "commander";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { revokeKeyAsync, rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { registerKeysCommands } from "../../src/keys/keysCli.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { boundKeyset, commitKeyset } from "../../src/keys/keyset.js";
import { keyRevocationLocation, readKeyRevocations } from "../../src/keys/keyRevocations.js";
import { encodeSignedRevocationList, nextRevocationList, readAnchoredRevocationList, revocationListSha256, signRevocationList } from "../../src/keys/revocationList.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { type KeyProvider } from "../../src/keys/provider.js";
import { lockVault } from "../../src/vault/vault.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";

const roots: string[] = [], PASS = "async-revoke-owner-passphrase";
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) { lockVault(root); rmSync(root, { recursive: true, force: true }); } });
function workspace() {
  const root = mkdtempSync(join(tmpdir(), "amc-async-revoke-owner-")); roots.push(root);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_HOME", join(root, "home"));
  const ws = join(root, "workspace"); initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
  // Real public purpose rotations retire two receipt-only keys; the original monitor key remains active elsewhere.
  rotatePurposeKeys({ workspace: ws, purposes: ["receipt"], passphrase: PASS });
  const first = signingKeyId(getSigningPublicKeyPem(ws, "receipt"))!;
  rotatePurposeKeys({ workspace: ws, purposes: ["receipt"], passphrase: PASS });
  const second = signingKeyId(getSigningPublicKeyPem(ws, "receipt"))!;
  rotatePurposeKeys({ workspace: ws, purposes: ["receipt"], passphrase: PASS });
  return { ws, first, second };
}
async function providerFixture() {
  const f = workspace(), key = fakeKey("p256"), ref = { provider: "aws-kms" as const, id: AWS_ARN("revocation-owner") };
  const alias = AWS_ARN("same-public-key-alias"), fake = awsFake({ [ref.id]: key, [alias]: key }), provider = awsKmsProvider(fake.call), description = await provider.describe(ref);
  // Real owner commit API: fixture state names this provider key for the existing revocation-list purpose.
  // This is intentionally NOT a claim that current ledger-row-only bind CLI admits this purpose yet.
  const before = boundKeyset(f.ws)!;
  commitKeyset(f.ws, { keys: before.keys, providers: { ...before.providers, "revocation-list": { provider: ref.provider, id: ref.id,
    keyId: description.keyId, algorithm: description.algorithm, protection: description.protection, protectionBasis: description.protectionBasis } },
    writes: [{ path: join(f.ws, ".amc", "keys", "revocation-list-provider.pub"), bytes: description.publicKeyPem, mode: 0o644 }] });
  readKeyRevocations(f.ws, true); // warm the verified read before the first provider-signed publication
  return { ...f, key, ref, alias, fake, provider, description };
}
function paused(provider: KeyProvider) {
  let ready!: () => void, resume!: () => void, first = true;
  const entered = new Promise<void>(resolve => { ready = resolve; }), gate = new Promise<void>(resolve => { resume = resolve; });
  return { entered, resume, provider: { ...provider, sign: async (ref, bytes) => {
    if (first) { first = false; ready(); await gate; }
    return provider.sign(ref, bytes);
  } } satisfies KeyProvider };
}
const bytesOfList = (ws: string) => readFileSync(join(ws, ".amc", "keys", "revocations.signed.json"));

describe("async owner key revocation plans and publishes without awaiting inside the lock", () => {
  test("file provider preserves the v1 synchronous signature bytes for the same planned list", async () => {
    const { ws, first } = workspace(), location = keyRevocationLocation(ws), current = readAnchoredRevocationList(location)!;
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
    const list = nextRevocationList(location.listId, { sequence: current.list.sequence, sha256: revocationListSha256(current.list) },
      [...current.list.revoked, { id: first, kind: "key", revokedAt: new Date().toISOString(), reason: "superseded: receipt" }], 0);
    const expected = signRevocationList(list, getSigningKey(ws, "revocation-list"));
    await expect(revokeKeyAsync(ws, "receipt", first, "superseded", PASS)).resolves.toMatchObject({ listId: location.listId, sequence: list.sequence });
    const actual = readAnchoredRevocationList(keyRevocationLocation(ws))!;
    expect(encodeSignedRevocationList({ ...actual, anchor: null })).toEqual(encodeSignedRevocationList(expected));
  });

  test("a second actor revokes while the first provider waits; both rows survive in chained published sequences", async () => {
    const f = await providerFixture(), before = readAnchoredRevocationList(keyRevocationLocation(f.ws))!, slow = paused(f.provider);
    const firstOperation = revokeKeyAsync(f.ws, "receipt", f.first, "superseded", PASS, { provider: slow.provider });
    try {
      await slow.entered;
      const second = await revokeKeyAsync(f.ws, "receipt", f.second, "superseded", PASS, { provider: f.provider });
      expect(second.sequence).toBe(before.list.sequence + 1);
      slow.resume();
      await expect(firstOperation).resolves.toMatchObject({ sequence: before.list.sequence + 2 });
      const final = readAnchoredRevocationList(keyRevocationLocation(f.ws))!;
      expect(final.list.revoked.map(row => row.id).sort()).toEqual([f.first, f.second].sort());
      expect(readKeyRevocations(f.ws, true).map(row => row.keyId).sort()).toEqual([f.first, f.second].sort());
      // A missing committed-provider candidate in keyRevocations.ts would brick this next ordinary key use.
      expect(getSigningKey(f.ws, "receipt")).toContain("PRIVATE KEY");
    } finally { slow.resume(); await firstOperation.catch(() => {}); }
  });

  test("tightening policy during a provider wait refuses before staging, logging or final publication", async () => {
    const f = await providerFixture(), original = bytesOfList(f.ws), logPath = join(f.ws, ".amc", "transparency", "log.jsonl");
    const originalLog = readFileSync(logPath), slow = paused(f.provider);
    const operation = revokeKeyAsync(f.ws, "receipt", f.first, "superseded", PASS, { provider: slow.provider });
    const refused = expect(operation).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    try {
      await slow.entered;
      const path = join(f.ws, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8"));
      config.keys = { ...(config.keys ?? {}), algorithmPolicy: { allowed: ["ed25519"] } };
      writeFileSync(path, YAML.stringify(config)); // unsigned config may refuse; it never authorizes a new provider key
      slow.resume(); await refused;
      expect(bytesOfList(f.ws)).toEqual(original); expect(readFileSync(logPath)).toEqual(originalLog);
      expect(existsSync(join(f.ws, ".amc", "keys", "revocations.signed.json.pending"))).toBe(false);
    } finally { slow.resume(); await operation.catch(() => {}); }
  });

  test("a description naming an unbound alias of the same public key cannot publish for the active ref", async () => {
    const f = await providerFixture(), original = bytesOfList(f.ws);
    const alias: KeyProvider = { ...f.provider, describe: async () => ({ ...f.description, ref: { ...f.ref, id: f.alias } }) };
    await expect(revokeKeyAsync(f.ws, "receipt", f.first, "superseded", PASS, { provider: alias })).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    expect(bytesOfList(f.ws)).toEqual(original);
    expect(existsSync(join(f.ws, ".amc", "keys", "revocations.signed.json.pending"))).toBe(false);
  });

  test("the registered keys revoke CLI awaits the actual owner result and prints its final sequence", async () => {
    const { ws, first } = workspace(), before = readAnchoredRevocationList(keyRevocationLocation(ws))!, printed: string[] = [];
    vi.spyOn(process, "cwd").mockReturnValue(ws); vi.spyOn(console, "log").mockImplementation(line => { printed.push(String(line)); });
    const program = new Command().exitOverride(); registerKeysCommands(program);
    await program.parseAsync(["node", "amc", "keys", "revoke", "--purpose", "receipt", "--key-id", first, "--reason", "superseded"]);
    expect(JSON.parse(printed.pop()!)).toMatchObject({ listId: before.list.listId, sequence: before.list.sequence + 1 });
    expect(readKeyRevocations(ws, true).map(row => row.keyId)).toContain(first);
  });
});
