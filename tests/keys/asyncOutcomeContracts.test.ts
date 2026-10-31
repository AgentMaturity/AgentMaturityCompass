import { randomUUID, sign } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { initOutcomeContract, initOutcomeContractAsync, loadOutcomeContract, outcomeContractPath, OutcomeContractPublicationError,
  signOutcomeContractAsync, upsertOutcomeContract, upsertOutcomeContractAsync, verifyOutcomeContractSignature } from "../../src/outcomes/outcomeContractEngine.js";
import type { OutcomeContract } from "../../src/outcomes/outcomeContractSchema.js";
import { outcomesInitCliAsync } from "../../src/outcomes/outcomeCli.js";
import { getPurposeKeyHistory, getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { getPublicKeyHistory, verifyHexDigestAny } from "../../src/crypto/keys.js";
import { transitionConfigSignatureProvider } from "../../src/keys/configProviderTransition.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { signingKeyId, verifyCanonical } from "../../src/keys/algorithmPolicy.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { readTransparencyEntries, verifyTransparencyLog } from "../../src/transparency/logChain.js";
import { lockVault } from "../../src/vault/vault.js";
import { sha256Hex } from "../../src/utils/hash.js";
import type { KmsCall } from "../../src/keys/providers/awsKms.js";
import { AWS_ARN, awsFake, fakeKey, publicPem } from "./providerFakes.js";

const boundary = vi.hoisted(() => ({ call: undefined as KmsCall | undefined, watchWorkspace: "", failLog: false, lockHeld: [] as boolean[] }));
vi.mock("../../src/keys/providers/awsKms.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../../src/keys/providers/awsKms.js")>();
  return { ...actual, awsKmsProvider: (call?: KmsCall) => actual.awsKmsProvider(call ?? ((...args) => boundary.call!(...args))) };
});
vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const appendFileSync: typeof actual.appendFileSync = (...args) => {
    if (boundary.watchWorkspace && String(args[0]) === join(boundary.watchWorkspace, ".amc", "transparency", "log.jsonl")
      && String(args[1]).includes('"OUTCOME_CONTRACT_SIGNED"')) {
      boundary.lockHeld.push(actual.existsSync(join(dirname(outcomeContractPath(boundary.watchWorkspace, "default")), ".outcome-contract.lock")));
      if (boundary.failLog) throw new Error("owned log failure https://private.invalid PIN=not-for-output");
    }
    return actual.appendFileSync(...args);
  };
  return { ...actual, appendFileSync, default: { ...actual, appendFileSync } };
});
const PASS = "outcome-contract-owner-passphrase", roots: Array<{ root: string; workspace: string }> = [];
afterEach(() => {
  boundary.watchWorkspace = ""; boundary.failLog = false; boundary.lockHeld = []; boundary.call = undefined;
  vi.restoreAllMocks();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture(baseline = false) {
  const root = mkdtempSync(join(tmpdir(), "amc-async-contract-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  if (baseline) initOutcomeContract(workspace, "default");
  return { root, workspace, path: outcomeContractPath(workspace, "default") };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function bind(f: ReturnType<typeof fixture>) {
  const a = AWS_ARN("contract-a-" + randomUUID()), b = AWS_ARN("contract-b-" + randomUUID()), key = fakeKey("p256"), next = fakeKey("p256");
  const fake = awsFake({ [a]: key, [b]: next }), control: { unavailable: boolean; afterSign?: () => Promise<void> } = { unavailable: false };
  boundary.call = async (operation, input, region) => {
    if (operation === "Sign" && control.unavailable) throw Object.assign(new Error("secret https://private.invalid PIN=never-output"), { name: "ServiceUnavailableException" });
    const answer = await fake.call(operation, input, region);
    if (operation === "Sign") await control.afterSign?.();
    return answer;
  };
  const candidate = (id = a) => {
    const config = YAML.parse(readFileSync(join(f.workspace, ".amc", "amc.config.yaml"), "utf8"));
    config.keys = { refs: { "config-signature": { provider: "aws-kms", id } } }; return Buffer.from(YAML.stringify(config));
  };
  await transitionConfigSignatureProvider(f.workspace, candidate(), { passphrase: PASS });
  const pause = () => { const entered = deferred(), gate = deferred(); control.afterSign = async () => { control.afterSign = undefined; entered.resolve(); await gate.promise; }; return { entered, gate }; };
  return { ...f, a, b, key, next, fake, control, candidate, pause, pem: publicPem(key) };
}
function pair(f: ReturnType<typeof fixture>) { return { body: existsSync(f.path) ? readFileSync(f.path) : null, signature: existsSync(f.path + ".sig") ? readFileSync(f.path + ".sig") : null }; }
function records(workspace: string) { const ledger = openLedger(workspace); try { return ledger.listOutcomeContracts("default"); } finally { ledger.close(); } }
function expectP256(f: ReturnType<typeof fixture>, pem: string) {
  const sidecar = JSON.parse(readFileSync(f.path + ".sig", "utf8")); expect(sidecar.digestSha256).toBe(sha256Hex(readFileSync(f.path)));
  expect(Buffer.from(sidecar.signature, "base64").length).toBe(64);
  expect(verifyCanonical("ecdsa-p256-sha256", Buffer.from(sidecar.digestSha256, "hex"), pem, Buffer.from(sidecar.signature, "base64"))).toBe(true);
  expect(verifyOutcomeContractSignature(f.workspace, "default").valid).toBe(true);
}

describe("actual async outcome-contract config-purpose publication", () => {
  test("default async init and re-sign preserve legacy exact Ed25519 bytes and immutable first-publication metadata", async () => {
    const f = fixture(), now = Date.now(), privateKey = getSigningKey(f.workspace, "config-signature"); vi.spyOn(Date, "now").mockReturnValue(now);
    const legacy = initOutcomeContract(f.workspace, "default"), before = pair(f), originalRows = records(f.workspace);
    expect(await initOutcomeContractAsync(f.workspace, "default")).toEqual(legacy); expect(pair(f)).toEqual(before);
    expect(await signOutcomeContractAsync(f.workspace, "default")).toBe(legacy.sigPath); expect(pair(f)).toEqual(before);
    const expectedSignature = sign(null, Buffer.from(sha256Hex(before.body!), "hex"), privateKey).toString("base64");
    // Independent original sidecar wire contract: field order, formatting, fixed role and no added algorithm/provider fields.
    expect(before.signature!.toString("utf8")).toBe([
      "{", `  "digestSha256": "${sha256Hex(before.body!)}",`, `  "signature": "${expectedSignature}",`,
      `  "signedTs": ${now},`, '  "signer": "auditor"', "}"
    ].join("\n"));
    expect(records(f.workspace)).toEqual(originalRows); expect(verifyOutcomeContractSignature(f.workspace, "default").valid).toBe(true);
  });

  test("the actual async CLI helper publishes canonical provider P256, current signer metadata, modes and verified transparency after unlocking", async () => {
    const f = await bind(fixture()), before = f.fake.requests.filter(row => row.operation === "Sign").length; boundary.watchWorkspace = f.workspace;
    const out = await outcomesInitCliAsync({ workspace: f.workspace, agentId: "default" }); expect(out).toEqual({ path: f.path, sigPath: f.path + ".sig" });
    expectP256(f, f.pem); expect(statSync(f.path).mode & 0o777).toBe(0o644); expect(statSync(out.sigPath).mode & 0o777).toBe(0o644);
    expect(records(f.workspace)).toEqual([expect.objectContaining({ sha256: sha256Hex(readFileSync(f.path)), sig_valid: 1, signer_fpr: signingKeyId(f.pem)!.slice(0, 16) })]);
    const calls = f.fake.requests.filter(row => row.operation === "Sign").slice(before); expect(calls).toHaveLength(1);
    expect(Buffer.from(calls[0]!.input.Message as Uint8Array)).toEqual(Buffer.from(sha256Hex(readFileSync(f.path)), "hex"));
    expect(boundary.lockHeld).toEqual([false]); expect(verifyTransparencyLog(f.workspace).ok).toBe(true);
    expect(readTransparencyEntries(f.workspace).at(-1)?.type).toBe("OUTCOME_CONTRACT_SIGNED");
    expect(() => getSigningKey(f.workspace, "config-signature")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
  });

  test("provider failure leaves an absent contract absent and an existing signed pair/metadata unchanged without file fallback", async () => {
    const f = await bind(fixture()), before = pair(f), rows = records(f.workspace); f.control.unavailable = true;
    await expect(initOutcomeContractAsync(f.workspace, "default")).rejects.toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE", status: 503 });
    expect(pair(f)).toEqual(before); expect(records(f.workspace)).toEqual(rows);
    f.control.unavailable = false; await initOutcomeContractAsync(f.workspace, "default"); const published = pair(f), publishedRows = records(f.workspace);
    const next = loadOutcomeContract(f.workspace, "default"); next.outcomeContract.title = "Must not publish"; f.control.unavailable = true;
    const error = await upsertOutcomeContractAsync(f.workspace, next, "default").catch(error => error);
    expect(error).toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE", status: 503 }); expect(String(error)).not.toMatch(/private\.invalid|PIN=|never-output/);
    expect(pair(f)).toEqual(published); expect(records(f.workspace)).toEqual(publishedRows); expectP256(f, f.pem);
  });

  test.each([false, true])("legacy sync init/upsert refuse provider-held authority before changing an absent or present pair (present=%s)", async present => {
    const f = await bind(fixture(present)), before = pair(f), rows = records(f.workspace);
    const candidate: OutcomeContract = present ? loadOutcomeContract(f.workspace, "default") : { outcomeContract: {
      version: 1, agentId: "default", title: "Owner candidate", description: "Actual schema fixture",
      windowDefaults: { reportingWindowDays: 14, minObservedRatioForClaims: 0.6 }, metrics: [{
        metricId: "functional.owned_ratio", category: "Functional", description: "Owned observed completion ratio", type: "ratio",
        numeratorSignal: "owned.completed", denominatorSignal: "owned.started", target: { level3: 0.7, level4: 0.85, level5: 0.95 },
        evidenceRules: { trustTierAtLeast: "OBSERVED" }
      }]
    } };
    candidate.outcomeContract.title = "Explicit async owner update";
    expect(() => initOutcomeContract(f.workspace, "default")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
    expect(pair(f)).toEqual(before); expect(records(f.workspace)).toEqual(rows);
    expect(() => upsertOutcomeContract(f.workspace, candidate, "default")).toThrow(expect.objectContaining({ code: "KEY_PROVIDER_HELD" }));
    expect(pair(f)).toEqual(before); expect(records(f.workspace)).toEqual(rows);
    await upsertOutcomeContractAsync(f.workspace, candidate, "default"); expectP256(f, f.pem);
  });

  test("upsert owns candidate bytes before await and a provider re-sign preserves the immutable original content record", async () => {
    const f = await bind(fixture(true)), oldRows = records(f.workspace); await signOutcomeContractAsync(f.workspace, "default");
    expectP256(f, f.pem); expect(records(f.workspace)).toEqual(oldRows);
    const candidate = loadOutcomeContract(f.workspace, "default"); candidate.outcomeContract.title = "Pinned owner candidate";
    const paused = f.pause(), pending = upsertOutcomeContractAsync(f.workspace, candidate, "default");
    try {
      expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
      candidate.outcomeContract.title = "Mutated after wait"; paused.gate.resolve(); await pending;
    } finally { paused.gate.resolve(); await pending.catch(() => {}); }
    expect(loadOutcomeContract(f.workspace, "default").outcomeContract.title).toBe("Pinned owner candidate"); expectP256(f, f.pem);
    expect(records(f.workspace)).toHaveLength(oldRows.length + 1);
    expect(records(f.workspace).find(row => row.sha256 === sha256Hex(readFileSync(f.path)))?.signer_fpr).toBe(signingKeyId(f.pem)!.slice(0, 16));
  });

  test("two actual async writers sign outside the lock and the second refuses its stale complete predecessor without overwriting the first", async () => {
    const f = await bind(fixture(true)), one = loadOutcomeContract(f.workspace, "default"), two = loadOutcomeContract(f.workspace, "default");
    one.outcomeContract.title = "First actual publisher"; two.outcomeContract.title = "Second actual publisher";
    const entered = [deferred(), deferred()], gates = [deferred(), deferred()]; let calls = 0;
    f.control.afterSign = async () => { const index = calls++; expect(existsSync(join(dirname(f.path), ".outcome-contract.lock"))).toBe(false); entered[index]!.resolve(); await gates[index]!.promise; };
    const first = upsertOutcomeContractAsync(f.workspace, one, "default"), second = upsertOutcomeContractAsync(f.workspace, two, "default");
    try {
      expect(await Promise.race([entered[0]!.promise.then(() => "signed"), first.then(() => "returned", () => "rejected")])).toBe("signed");
      expect(await Promise.race([entered[1]!.promise.then(() => "signed"), second.then(() => "returned", () => "rejected")])).toBe("signed");
      gates[0]!.resolve(); await first; const current = pair(f); gates[1]!.resolve();
      await expect(second).rejects.toThrow("outcome contract or signature changed while signing was prepared; retry");
      expect(pair(f)).toEqual(current); expect(loadOutcomeContract(f.workspace, "default").outcomeContract.title).toBe("First actual publisher"); expectP256(f, f.pem);
    } finally { gates.forEach(gate => gate.resolve()); f.control.afterSign = undefined; await Promise.allSettled([first, second]); }
  });

  test("a real backing-key rebind during the await refuses before publishing and the next committed provider remains usable", async () => {
    const f = await bind(fixture(true)), candidate = loadOutcomeContract(f.workspace, "default"), before = pair(f), rows = records(f.workspace);
    candidate.outcomeContract.title = "Prepared under retired authority"; const paused = f.pause(), pending = upsertOutcomeContractAsync(f.workspace, candidate, "default");
    try {
      expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "rejected")])).toBe("signed");
      await transitionConfigSignatureProvider(f.workspace, f.candidate(f.b), { passphrase: PASS }); paused.gate.resolve();
      await expect(pending).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    } finally { paused.gate.resolve(); await pending.catch(() => {}); }
    expect(pair(f)).toEqual(before); expect(records(f.workspace)).toEqual(rows);
    await upsertOutcomeContractAsync(f.workspace, candidate, "default"); expectP256(f, publicPem(f.next));
  });

  test("exact config-purpose verification refuses a mathematically valid owner-split artifact signature with a restored positive", () => {
    const f = fixture(true), before = pair(f); rotatePurposeKeys({ workspace: f.workspace, purposes: ["config-signature"], passphrase: PASS });
    rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS });
    const artifact = getSigningPublicKeyPem(f.workspace, "artifact-seal"); expect(getPublicKeyHistory(f.workspace, "auditor")).toContain(artifact);
    expect(getPurposeKeyHistory(f.workspace, "config-signature")).not.toContain(artifact);
    const sidecar = JSON.parse(before.signature!.toString()); sidecar.signature = sign(null, Buffer.from(sidecar.digestSha256, "hex"), getSigningKey(f.workspace, "artifact-seal")).toString("base64");
    expect(verifyHexDigestAny(sidecar.digestSha256, sidecar.signature, getPublicKeyHistory(f.workspace, "auditor"))).toBe(true);
    writeFileSync(f.path + ".sig", JSON.stringify(sidecar, null, 2)); expect(verifyOutcomeContractSignature(f.workspace, "default").valid).toBe(false);
    writeFileSync(f.path + ".sig", before.signature!); expect(verifyOutcomeContractSignature(f.workspace, "default").valid).toBe(true);
  });

  test("postcommit transparency failure reports published files and metadata truth, keeps raw error private and releases the publication lock", async () => {
    const f = await bind(fixture()); boundary.watchWorkspace = f.workspace; boundary.failLog = true;
    const error = await initOutcomeContractAsync(f.workspace, "default").catch(error => error);
    expect(error).toBeInstanceOf(OutcomeContractPublicationError);
    expect(error).toMatchObject({ code: "OUTCOME_CONTRACT_PUBLICATION_INCOMPLETE", stage: "transparency", published: { path: f.path, sigPath: f.path + ".sig" } });
    expect(String(error)).not.toMatch(/private\.invalid|PIN=|not-for-output/); expectP256(f, f.pem);
    expect(records(f.workspace).find(row => row.sha256 === sha256Hex(readFileSync(f.path)))?.signer_fpr).toBe(signingKeyId(f.pem)!.slice(0, 16));
    expect(boundary.lockHeld).toEqual([false]); expect(existsSync(join(dirname(f.path), ".outcome-contract.lock"))).toBe(false);
    boundary.failLog = false; await signOutcomeContractAsync(f.workspace, "default"); expectP256(f, f.pem); expect(verifyTransparencyLog(f.workspace).ok).toBe(true);
  });

  test("an actual owned SQLite insert refusal reports the valid published files before ledger metadata, without claiming its log landed", async () => {
    const f = await bind(fixture()), beforeLog = readTransparencyEntries(f.workspace), database = openLedger(f.workspace);
    try { database.db.exec("CREATE TRIGGER owned_contract_insert_refusal BEFORE INSERT ON outcome_contracts BEGIN SELECT RAISE(ABORT, 'owned database refusal https://private.invalid PIN=not-for-output'); END"); }
    finally { database.close(); }
    const error = await initOutcomeContractAsync(f.workspace, "default").catch(error => error);
    expect(error).toBeInstanceOf(OutcomeContractPublicationError);
    expect(error).toMatchObject({ code: "OUTCOME_CONTRACT_PUBLICATION_INCOMPLETE", stage: "ledger", published: { path: f.path, sigPath: f.path + ".sig" } });
    expect(String(error)).not.toMatch(/private\.invalid|PIN=|not-for-output/); expectP256(f, f.pem);
    expect(records(f.workspace)).toEqual([]); expect(readTransparencyEntries(f.workspace)).toEqual(beforeLog);
    expect(existsSync(join(dirname(f.path), ".outcome-contract.lock"))).toBe(false);
    const restored = openLedger(f.workspace);
    try { restored.db.exec("DROP TRIGGER owned_contract_insert_refusal"); } finally { restored.close(); }
    await signOutcomeContractAsync(f.workspace, "default"); expectP256(f, f.pem);
    expect(records(f.workspace)).toEqual([expect.objectContaining({ sha256: sha256Hex(readFileSync(f.path)), signer_fpr: signingKeyId(f.pem)!.slice(0, 16) })]);
    expect(readTransparencyEntries(f.workspace).at(-1)?.type).toBe("OUTCOME_CONTRACT_SIGNED"); expect(verifyTransparencyLog(f.workspace).ok).toBe(true);
  });
});
