import { generateKeyPairSync, sign, verify } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { closeSqlitePool } from "../../src/storage/sqlitePool.js";
import { appendHumanActionEvent, appendHumanActionEventAsync, verifyHumanActionLog, HumanLogPublicationError } from "../../src/auth/humanLog.js";
import { getSigningKey, getSigningPublicKeyPem, getPurposeKeyHistory } from "../../src/keys/signingKeys.js";
import { addPublicKeyToHistory } from "../../src/crypto/keys.js";
import * as purposeProviders from "../../src/keys/purposeProviders.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { assertKeysetComplete } from "../../src/keys/keyset.js";
import { lowS, verifyWithKey } from "../../src/keys/algorithmPolicy.js";
import { lockVault, unlockVault, vaultStatus } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { canonicalize } from "../../src/utils/json.js";

const PASS = "owned-human-log-passphrase", roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  vi.restoreAllMocks(); syncBuiltinESMExports();
  for (const f of roots.splice(0)) { closeSqlitePool("ledger:" + resolve(f.workspace) + ":" + join(f.workspace, ".amc/evidence.sqlite")); lockVault(f.workspace); fs.rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = fs.mkdtempSync(join(tmpdir(), "amc-human-log-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "controls"));
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const dir = join(workspace, ".amc", "studio", "audit"), names = { log: join(dir, "human.log"), seal: join(dir, "human.seal.json"), signature: join(dir, "human.seal.sig") };
  const snapshot = () => Object.fromEntries(Object.entries(names).map(([name, path]) => [name, fs.existsSync(path) ? fs.readFileSync(path) : null])) as Record<keyof typeof names, Buffer | null>;
  return { root, workspace, names, snapshot, provider: purposeProviders.loadKeyProvider(workspace, "file") };
}
function healthy(f: ReturnType<typeof fixture>) {
  expect(verifyHumanActionLog(f.workspace)).toMatchObject({ ok: true, errors: [] });
  const seal = JSON.parse(fs.readFileSync(f.names.seal, "utf8")), signed = JSON.parse(fs.readFileSync(f.names.signature, "utf8"));
  const digest = sha256Hex(Buffer.from(JSON.stringify(seal)));
  expect(signed.digestSha256).toBe(digest);
  expect(getPurposeKeyHistory(f.workspace, "artifact-seal").some(pem => verifyWithKey(Buffer.from(digest, "hex"), pem, Buffer.from(signed.signature, "base64")))).toBe(true);
  return { seal, signed };
}
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
function pause(f: ReturnType<typeof fixture>) {
  const entered = deferred(), gate = deferred(), original = f.provider.sign.bind(f.provider);
  const spy = vi.spyOn(f.provider, "sign").mockImplementationOnce(async (...args) => {
    const answer = await original(...args); entered.resolve(); await gate.promise; return answer;
  });
  return { entered, gate, spy };
}
async function reached(wait: ReturnType<typeof pause>, pending: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("owned human Sign admission did not reach its controlled pause within 2000ms")), 2_000); });
  try {
    expect(await Promise.race([wait.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected"), timeout])).toBe("signed");
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
function input(f: ReturnType<typeof fixture>, type = "OWNED_HUMAN") { return { workspace: f.workspace, type, username: "owned", payload: { nested: { value: "original" } } }; }

test("default first aggregate preserves independent compact digest, pretty bytes and raw four-field Ed25519 wire with one Sign before effects", async () => {
  const f = fixture(), now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
  expect(f.snapshot()).toEqual({ log: null, seal: null, signature: null });
  const base = { v: 1, ts: now, type: "OWNED_HUMAN", agentId: null, username: "owned", payload: { nested: { value: "original" } }, prev: null };
  const entry = { ...base, hash: sha256Hex(canonicalize(base)) }, pem = getSigningPublicKeyPem(f.workspace, "artifact-seal");
  const seal = { v: 1, ts: now, lastHash: entry.hash, entryCount: 1, signerFingerprint: sha256Hex(Buffer.from(pem)) };
  const digest = sha256Hex(Buffer.from(JSON.stringify(seal))), signature = sign(null, Buffer.from(digest, "hex"), getSigningKey(f.workspace, "artifact-seal")).toString("base64");
  const real = f.provider.sign.bind(f.provider), calls = vi.spyOn(f.provider, "sign").mockImplementation(async (...args) => {
    expect(f.snapshot()).toEqual({ log: null, seal: null, signature: null });
    expect(fs.existsSync(join(f.workspace, ".amc", ".human-action-log.lock"))).toBe(false); return real(...args);
  });
  expect(await appendHumanActionEventAsync(input(f))).toEqual(entry);
  expect(fs.readFileSync(f.names.log, "utf8")).toBe(JSON.stringify(entry) + "\n");
  expect(fs.readFileSync(f.names.seal, "utf8")).toBe(JSON.stringify(seal, null, 2));
  expect(fs.readFileSync(f.names.signature, "utf8")).toBe(JSON.stringify({ digestSha256: digest, signature, signedTs: now, signer: "auditor" }, null, 2));
  expect(calls.mock.calls.map(([ref, bytes]) => ({ ref, bytes: Buffer.from(bytes).toString("hex") }))).toEqual([{ ref: { provider: "file", id: "artifact-seal" }, bytes: digest }]);
  healthy(f);
});

test("sync and async consecutive entries verify, and complete-triplet reads neither initialize nor Sign", async () => {
  const f = fixture(), first = appendHumanActionEvent(input(f, "FIRST")), calls = vi.spyOn(f.provider, "sign");
  const second = await appendHumanActionEventAsync(input(f, "SECOND")); expect(second.prev).toBe(first.hash); healthy(f);
  const before = f.snapshot(), key = vi.spyOn(purposeProviders, "signWithPurposeKey");
  expect(verifyHumanActionLog(f.workspace)).toEqual({ ok: true, errors: [], entryCount: 2 });
  expect(f.snapshot()).toEqual(before); expect(key).not.toHaveBeenCalled(); expect(calls).toHaveBeenCalledTimes(1);
});

test("checked async refuses AMC_NO_SIGN set during Sign while sync stays compatible and an unavailable or ephemeral locked key cannot publish", async () => {
  // Signed run-hash authority refuses no-sign mode, including a flag set while the checked Sign is pending.
  const f = fixture(); appendHumanActionEvent(input(f)); const signedBefore = f.snapshot(), wait = pause(f), pending = appendHumanActionEventAsync(input(f, "UNLOCKED_FLAG"));
  try { await reached(wait, pending); vi.stubEnv("AMC_NO_SIGN", "1"); wait.gate.resolve(); await expect(pending).rejects.toThrow("no-sign mode does not authorize policy signing"); expect(f.snapshot()).toEqual(signedBefore); healthy(f); }
  finally { wait.gate.resolve(); await Promise.allSettled([pending]); }
  appendHumanActionEvent(input(f, "UNLOCKED_SYNC_FLAG")); healthy(f);
  const before = f.snapshot(); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace);
  await expect(appendHumanActionEventAsync(input(f, "UNAVAILABLE"))).rejects.toThrow();
  expect(() => appendHumanActionEvent(input(f, "UNAVAILABLE_SYNC"))).toThrow();
  expect(f.snapshot()).toEqual(before); expect(verifyHumanActionLog(f.workspace).ok).toBe(true);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); vi.stubEnv("AMC_NO_SIGN", "0"); await appendHumanActionEventAsync(input(f, "FRESH")); healthy(f);
});

test("only all-absent public verification lazily initializes, then an actual append verifies", async () => {
  const f = fixture(); expect(verifyHumanActionLog(f.workspace)).toEqual({ ok: true, errors: [], entryCount: 0 });
  expect(JSON.parse(fs.readFileSync(f.names.seal, "utf8"))).toMatchObject({ lastHash: null, entryCount: 0 });
  await appendHumanActionEventAsync(input(f)); expect(verifyHumanActionLog(f.workspace).entryCount).toBe(1); healthy(f);
});

test.each(["log", "seal", "signature"] as const)("partial %s absence refuses without auto-reseal or Sign", async name => {
  const f = fixture(); appendHumanActionEvent(input(f)); fs.unlinkSync(f.names[name]); const before = f.snapshot(), calls = vi.spyOn(f.provider, "sign");
  expect(verifyHumanActionLog(f.workspace).ok).toBe(false);
  await expect(appendHumanActionEventAsync(input(f))).rejects.toThrow("predecessor refused");
  expect(f.snapshot()).toEqual(before); expect(calls).not.toHaveBeenCalled();
});

test("an invalid signed-prefix relation refuses without resealing raw appended lines", async () => {
  const f = fixture(); appendHumanActionEvent(input(f)); fs.appendFileSync(f.names.log, fs.readFileSync(f.names.log));
  const before = f.snapshot(), calls = vi.spyOn(f.provider, "sign");
  await expect(appendHumanActionEventAsync(input(f))).rejects.toThrow("predecessor refused");
  expect(verifyHumanActionLog(f.workspace).ok).toBe(false); expect(f.snapshot()).toEqual(before); expect(calls).not.toHaveBeenCalled();
});

test("arguments are detached before real Sign and cannot redirect or rewrite a prepared entry", async () => {
  const f = fixture(); appendHumanActionEvent(input(f)); const params = input(f, "CAPTURED"), wait = pause(f), pending = appendHumanActionEventAsync(params);
  try {
    await reached(wait, pending); params.type = "MUTATED"; params.workspace = join(f.root, "other"); params.payload.nested.value = "mutated";
    wait.gate.resolve(); const result = await pending; expect(result).toMatchObject({ type: "CAPTURED", payload: { nested: { value: "original" } } });
    expect(fs.existsSync(join(f.root, "other"))).toBe(false); healthy(f);
  } finally { wait.gate.resolve(); await Promise.allSettled([pending]); }
});

test("actual sync append wins while async Sign waits and exact triplet CAS preserves the winner", async () => {
  const f = fixture(); appendHumanActionEvent(input(f)); const wait = pause(f), pending = appendHumanActionEventAsync(input(f, "LOSER"));
  try {
    await reached(wait, pending); const winner = appendHumanActionEvent(input(f, "SYNC_WINNER")), before = f.snapshot(); healthy(f);
    wait.gate.resolve(); await expect(pending).rejects.toThrow("predecessor changed"); expect(f.snapshot()).toEqual(before);
    const next = await appendHumanActionEventAsync(input(f, "FRESH")); expect(next.prev).toBe(winner.hash); healthy(f);
  } finally { wait.gate.resolve(); await Promise.allSettled([pending]); }
});

test.each(["log", "seal", "signature", "mode"] as const)("late exact %s preimage drift refuses after actual crypto", async target => {
  const f = fixture(); appendHumanActionEvent(input(f)); const original = f.snapshot(), wait = pause(f), pending = appendHumanActionEventAsync(input(f, "CONFLICT"));
  try {
    await reached(wait, pending);
    if (target === "mode") { if (process.platform === "win32") fs.appendFileSync(f.names.log, "\n"); else fs.chmodSync(f.names.log, 0o600); }
    else fs.appendFileSync(f.names[target], "\n");
    const changed = f.snapshot(); wait.gate.resolve(); await expect(pending).rejects.toThrow("predecessor changed"); expect(f.snapshot()).toEqual(changed);
  } finally {
    wait.gate.resolve(); await Promise.allSettled([pending]);
    for (const name of ["log", "seal", "signature"] as const) { fs.writeFileSync(f.names[name], original[name]!); fs.chmodSync(f.names[name], 0o644); }
  }
  await appendHumanActionEventAsync(input(f, "FRESH")); healthy(f);
});

test.each(["generation", "lock"] as const)("final producer %s gate runs after the checked purpose signer has returned", async change => {
  const f = fixture(); appendHumanActionEvent(input(f)); const before = f.snapshot(), original = purposeProviders.signWithPurposeKey;
  const proof: Buffer[] = [], originalGeneration = assertKeysetComplete(f.workspace)!.generation;
  let rotatedGeneration: number | null = null, changeFinished = false;
  vi.spyOn(purposeProviders, "signWithPurposeKey").mockImplementationOnce(async (...args) => {
    const signed = await original(...args); proof.push(Buffer.from(signed.signature));
    if (change === "generation") rotatedGeneration = rotatePurposeKeys({ workspace: f.workspace, purposes: ["config-signature"], passphrase: PASS }).generation;
    else { vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace); }
    changeFinished = true; return signed;
  });
  await expect(appendHumanActionEventAsync(input(f, "LATE_GATE"))).rejects.toThrow();
  expect(proof).toHaveLength(1); expect(proof[0]).toHaveLength(64); expect(changeFinished).toBe(true);
  if (change === "generation") { expect(rotatedGeneration).not.toBeNull(); expect(rotatedGeneration!).toBeGreaterThan(originalGeneration); expect(assertKeysetComplete(f.workspace)!.generation).toBe(rotatedGeneration); }
  else expect(vaultStatus(f.workspace).unlocked).toBe(false);
  expect(f.snapshot()).toEqual(before);
  vi.restoreAllMocks(); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS);
  await appendHumanActionEventAsync(input(f, "FRESH")); healthy(f);
});

test("a distinct actual config-purpose key cannot authenticate the aggregate despite raw-valid crypto", async () => {
  const f = fixture();
  rotatePurposeKeys({ workspace: f.workspace, purposes: ["config-signature"], passphrase: PASS });
  rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS });
  appendHumanActionEvent(input(f)); const before = f.snapshot(), record = healthy(f).signed, pem = getSigningPublicKeyPem(f.workspace, "config-signature");
  expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(pem);
  record.signature = sign(null, Buffer.from(record.digestSha256, "hex"), getSigningKey(f.workspace, "config-signature")).toString("base64");
  expect(verify(null, Buffer.from(record.digestSha256, "hex"), pem, Buffer.from(record.signature, "base64"))).toBe(true);
  fs.writeFileSync(f.names.signature, JSON.stringify(record, null, 2));
  const denied = verifyHumanActionLog(f.workspace), append = await appendHumanActionEventAsync(input(f)).then(() => "accepted", () => "refused");
  expect(denied.ok).toBe(false); expect(append).toBe("refused");
  fs.writeFileSync(f.names.signature, before.signature!); healthy(f); await appendHumanActionEventAsync(input(f, "FRESH")); healthy(f);
});

test.each(["VAULT", "NOTARY"] as const)("a carried %s envelope never extends the human raw-sidecar protocol", async type => {
  const f = fixture(); appendHumanActionEvent(input(f)); const before = f.snapshot(), { signed } = healthy(f), pem = getSigningPublicKeyPem(f.workspace, "artifact-seal");
  const envelope = { v: 1, alg: "ed25519", pubkeyB64: Buffer.from(pem).toString("base64"), fingerprint: sha256Hex(Buffer.from(pem)),
    sigB64: signed.signature, signedTs: signed.signedTs, signer: { type, attestationLevel: "SOFTWARE" } };
  expect(verify(null, Buffer.from(signed.digestSha256, "hex"), pem, Buffer.from(envelope.sigB64, "base64"))).toBe(true);
  fs.writeFileSync(f.names.signature, JSON.stringify({ ...signed, envelope }, null, 2));
  expect(verifyHumanActionLog(f.workspace)).toMatchObject({ ok: false, errors: ["human audit signature must use its existing raw format"] });
  await expect(appendHumanActionEventAsync(input(f))).rejects.toThrow("raw format");
  fs.writeFileSync(f.names.signature, before.signature!); healthy(f);
});

test("authenticated imported-only P256 raw history preserves unbound historical math and refuses a forged source envelope", async () => {
  const f = fixture(), pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), pem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  addPublicKeyToHistory(f.workspace, "auditor", pem, "imported"); appendHumanActionEvent(input(f));
  expect(getPurposeKeyHistory(f.workspace, "artifact-seal")).not.toContain(pem);
  const { signed } = healthy(f); signed.signature = lowS(sign("sha256", Buffer.from(signed.digestSha256, "hex"), { key: pair.privateKey, dsaEncoding: "ieee-p1363" })).toString("base64");
  expect(verifyWithKey(Buffer.from(signed.digestSha256, "hex"), pem, Buffer.from(signed.signature, "base64"))).toBe(true);
  fs.writeFileSync(f.names.signature, JSON.stringify(signed, null, 2)); expect(verifyHumanActionLog(f.workspace).ok).toBe(true);
  const historyPath = join(f.workspace, ".amc", "keys", "auditor_history.json"), original = fs.readFileSync(historyPath), forged = JSON.parse(original.toString("utf8"));
  const entry = forged.entries.find((row: { publicKeyPem: string }) => row.publicKeyPem === pem); expect(entry.source).toBe("imported");
  entry.source = "local"; fs.writeFileSync(historyPath, JSON.stringify(forged));
  expect(verifyHumanActionLog(f.workspace).ok).toBe(false); fs.writeFileSync(historyPath, original);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); lockVault(f.workspace); expect(verifyHumanActionLog(f.workspace).ok).toBe(true);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); await appendHumanActionEventAsync(input(f, "FRESH")); healthy(f);
});

test("same-read seal parsing verifies captured genuine bytes, including added signed fields, with explicit whitespace semantics", async () => {
  const f = fixture(); appendHumanActionEvent(input(f)); const { seal, signed } = healthy(f);
  const extended = { ...seal, ownedExtra: { meaningful: true } }, digest = sha256Hex(Buffer.from(JSON.stringify(extended)));
  signed.digestSha256 = digest; signed.signature = sign(null, Buffer.from(digest, "hex"), getSigningKey(f.workspace, "artifact-seal")).toString("base64");
  fs.writeFileSync(f.names.seal, JSON.stringify(extended, null, 4)); fs.writeFileSync(f.names.signature, JSON.stringify(signed, null, 2));
  expect(verifyHumanActionLog(f.workspace).ok).toBe(true);
  const originalSeal = fs.readFileSync(f.names.seal), originalRead = fs.readFileSync; let armed = true;
  vi.spyOn(fs, "readFileSync").mockImplementation((...args: Parameters<typeof fs.readFileSync>) => {
    const result = originalRead(...args);
    if (armed && String(args[0]) === f.names.signature) { armed = false; fs.writeFileSync(f.names.seal, JSON.stringify({ ...extended, ownedExtra: { meaningful: false } }, null, 2)); }
    return result;
  });
  syncBuiltinESMExports();
  try { expect(verifyHumanActionLog(f.workspace).ok).toBe(true); expect(armed).toBe(false); }
  finally { vi.restoreAllMocks(); syncBuiltinESMExports(); }
  expect(verifyHumanActionLog(f.workspace).ok).toBe(false); fs.writeFileSync(f.names.seal, originalSeal);
  healthy(f); await appendHumanActionEventAsync(input(f, "FRESH")); healthy(f);
});

test.each(["log", "seal", "signature"] as const)("native %s rename refusal retains exact per-member progress and cause", async target => {
  const f = fixture(); appendHumanActionEvent(input(f)); const before = f.snapshot(), original = fs.renameSync, fault = Object.assign(new Error("owned human audit EIO"), { code: "EIO" });
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => { if (String(to) === f.names[target]) throw fault; return original(from, to); }); syncBuiltinESMExports();
  let failure: unknown;
  try { await appendHumanActionEventAsync(input(f, "PARTIAL")); } catch (error) { failure = error; }
  finally { vi.restoreAllMocks(); syncBuiltinESMExports(); }
  expect(failure).toBeInstanceOf(HumanLogPublicationError);
  expect(failure).toMatchObject({ phase: target, completedMembers: target === "log" ? [] : target === "seal" ? ["log"] : ["log", "seal"], cause: fault });
  const after = f.snapshot();
  if (target === "log") { expect(after).toEqual(before); healthy(f); }
  else { expect(after.log).not.toEqual(before.log); expect(after.signature).toEqual(before.signature); expect(verifyHumanActionLog(f.workspace).ok).toBe(false);
    await expect(appendHumanActionEventAsync(input(f))).rejects.toThrow("predecessor refused"); }
});

test("a rename that succeeds then throws is attempted progress, never fabricated returned-write completion", async () => {
  const f = fixture(); appendHumanActionEvent(input(f)); const before = f.snapshot(), original = fs.renameSync, fault = new Error("owned post-rename error");
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => { original(from, to); if (String(to) === f.names.log) throw fault; }); syncBuiltinESMExports();
  let failure: unknown;
  try { await appendHumanActionEventAsync(input(f, "UNCERTAIN")); } catch (error) { failure = error; }
  finally { vi.restoreAllMocks(); syncBuiltinESMExports(); }
  expect(failure).toMatchObject({ phase: "log", completedMembers: [], cause: fault });
  expect(f.snapshot().log).not.toEqual(before.log); expect(f.snapshot().signature).toEqual(before.signature);
  expect(verifyHumanActionLog(f.workspace).ok).toBe(false);
});

test("all-absent lazy verification retains initializer native cause and progress rather than hiding its publication failure", () => {
  const f = fixture(), original = fs.renameSync, fault = Object.assign(new Error("owned lazy initialization EIO"), { code: "EIO" });
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => { if (String(to) === f.names.seal) throw fault; return original(from, to); }); syncBuiltinESMExports();
  let failure: unknown;
  try { verifyHumanActionLog(f.workspace); } catch (error) { failure = error; }
  finally { vi.restoreAllMocks(); syncBuiltinESMExports(); }
  expect(failure).toBeInstanceOf(HumanLogPublicationError); expect(failure).toMatchObject({ phase: "seal", completedMembers: ["log"], entryHash: null, cause: fault });
  expect(f.snapshot()).toEqual({ log: Buffer.alloc(0), seal: null, signature: null });
  const before = f.snapshot(); expect(verifyHumanActionLog(f.workspace).ok).toBe(false); expect(f.snapshot()).toEqual(before);
});

test("a valid last line without LF gains only its required separator; unappendable trailing blank lines refuse before Sign", async () => {
  const f = fixture(); appendHumanActionEvent(input(f)); const original = fs.readFileSync(f.names.log);
  const withoutLf = original.subarray(0, original.length - 1); fs.writeFileSync(f.names.log, withoutLf); healthy(f);
  await appendHumanActionEventAsync(input(f, "NEXT")); expect(fs.readFileSync(f.names.log).subarray(0, original.length)).toEqual(original); healthy(f);
  fs.appendFileSync(f.names.log, "\n"); expect(verifyHumanActionLog(f.workspace).ok).toBe(true);
  const before = f.snapshot(), calls = vi.spyOn(f.provider, "sign");
  await expect(appendHumanActionEventAsync(input(f, "UNAPPENDABLE"))).rejects.toThrow(); expect(calls).not.toHaveBeenCalled(); expect(f.snapshot()).toEqual(before);
});
