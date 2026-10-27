import * as fs from "node:fs";
import { verify, sign } from "node:crypto";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { closeAllSqlitePools } from "../../src/storage/sqlitePool.js";
import { openSessionEventStore } from "../../src/persistence/openSessionEventStore.js";
import { jsonlEventsPath } from "../../src/persistence/jsonl/jsonlEventLog.js";
import { planVerifyRepair, prepareVerifyRepairAsync, archivedStores, RepairRefused, RepairPublicationError, type HoldState, type RepairPlan } from "../../src/ledger/verifyRepair.js";
import { prepareFileSignatureWithAuditor } from "../../src/org/orgSigner.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { KeyProviderError } from "../../src/keys/provider.js";
import { registerTenant, resetDataResidencyState } from "../../src/compliance/dataResidency.js";
import { holdVerdict, withLegalHoldLock, initLegalHoldRegistry, issueScopedLegalHold, releaseScopedLegalHold, legalHoldRegistryRoot } from "../../src/residency/legalHoldRegistry.js";
import { loadTrustConfig, trustConfigPath, trustConfigSigPath, verifyTrustConfigSignature, type TrustConfig } from "../../src/trust/trustConfig.js";
import { signDigestWithVault } from "../../src/crypto/signing/signerVault.js";
import { verifySignatureEnvelope } from "../../src/crypto/signing/signatureEnvelope.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { amcVersion } from "../../src/version.js";
import { ownedAsyncWorkspaceLogNotary } from "../helpers/ownedAsyncWorkspaceLogNotary.js";

const faults = vi.hoisted(() => ({ target: "", failMove: 0, moveCount: 0, rollback: false, afterMove: undefined as undefined | ((to: string) => void),
  cause: new Error("owned private IO failure"), rollbackCause: new Error("owned rollback IO failure") }));
vi.mock("node:fs", async original => { const actual = await original<typeof import("node:fs")>(); return { ...actual,
  renameSync(from: Parameters<typeof actual.renameSync>[0], to: Parameters<typeof actual.renameSync>[1]) {
    const source = String(from), target = String(to), forward = target.includes("/quarantine/") && !source.includes("/quarantine/") && !source.endsWith(".tmp");
    if (target === faults.target || (forward && ++faults.moveCount === faults.failMove)) throw faults.cause;
    if (faults.rollback && source.includes("/quarantine/") && !target.includes("/quarantine/")) throw faults.rollbackCause;
    actual.renameSync(from, to); if (forward) faults.afterMove?.(target);
  } }; });
const PASS = "owned-verify-repair-passphrase", roots: Array<{ root: string; workspace: string }> = [], closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  faults.target = ""; faults.failMove = 0; faults.moveCount = 0; faults.rollback = false; faults.afterMove = undefined;
  vi.restoreAllMocks(); for (const close of closers.splice(0)) await close(); closeAllSqlitePools(); resetDataResidencyState();
  for (const f of roots.splice(0)) { lockVault(f.workspace); fs.rmSync(f.root, { recursive: true, force: true }); } vi.unstubAllEnvs();
});
function fixture(backend: "sqlite" | "jsonl" = "sqlite") {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "amc-async-repair-"))), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_CONTROL_CHECKPOINT_DIR", join(root, "control-checkpoints")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_SESSION_STORE", backend); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  if (backend === "sqlite") {
    const ledger = openLedger(workspace); try { ledger.startSession({ sessionId: "repair", runtime: "unknown", binaryPath: "owned", binarySha256: "0".repeat(64) });
      ledger.appendEvidence({ sessionId: "repair", runtime: "unknown", eventType: "stdout", payload: "owned original evidence", inline: false }); ledger.sealSession("repair");
    } finally { ledger.close(); closeAllSqlitePools(); }
    const blob = fs.readdirSync(join(workspace, ".amc", "blobs")).find(name => name.endsWith(".blob"))!;
    const path = join(workspace, ".amc", "blobs", blob), bytes = fs.readFileSync(path); bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1; fs.writeFileSync(path, bytes);
  } else {
    const store = openSessionEventStore(workspace, "jsonl"); try { store.startSession({ sessionId: "repair", runtime: "unknown", binaryPath: "owned", binarySha256: "0".repeat(64) });
      store.appendSessionEvent({ sessionId: "repair", runtime: "unknown", eventType: "stdout", payload: "owned JSONL original", meta: {} }); store.sealSession("repair");
    } finally { store.close(); closeAllSqlitePools(); }
    const path = jsonlEventsPath(workspace), rows = fs.readFileSync(path, "utf8").trim().split("\n").map(line => JSON.parse(line));
    rows[0].writer_sig = Buffer.alloc(64).toString("base64"); fs.writeFileSync(path, rows.map(row => JSON.stringify(row)).join("\n") + "\n");
  }
  const report = join(workspace, ".amc", "reports", "repair-keeps.md"); fs.writeFileSync(report, "# original report\n");
  return { root, workspace, report, provider: loadKeyProvider(workspace, "file"), clock: Date.now() };
}
type Fixture = ReturnType<typeof fixture>;
function holds(workspace: string): HoldState {
  const verdict = holdVerdict({ workspace });
  return verdict.verdict === "clear" ? { state: "none" } : verdict.verdict === "held" ? { state: "active", holdIds: [...verdict.holdIds] } : { state: "unknown", reason: verdict.reason };
}
function plan(f: Fixture) { const value = planVerifyRepair(f.workspace); expect(value.action).toBe("archive_evidence_store"); return value; }
function storeBytes(f: Fixture, input: RepairPlan) { return new Map(input.files.map(row => [row.path, fs.readFileSync(join(f.workspace, row.path))])); }
function unchanged(f: Fixture, before: Map<string, Buffer>) { for (const [path, bytes] of before) { expect(fs.existsSync(join(f.workspace, path)), path).toBe(true); expect(fs.readFileSync(join(f.workspace, path)), path).toEqual(bytes); } expect(fs.existsSync(join(f.workspace, ".amc", "quarantine"))).toBe(false); }
const prepare = (f: Fixture, input = plan(f), override?: (path: string, bytes: Buffer) => ReturnType<typeof prepareFileSignatureWithAuditor>) =>
  prepareVerifyRepairAsync(f.workspace, input, { legalHolds: () => holds(f.workspace), now: () => new Date(f.clock),
    prepareSignature: override ?? ((path, bytes) => prepareFileSignatureWithAuditor(f.workspace, path, bytes, "REPAIR_RECEIPT")) });
const apply = (f: Fixture, ready: Awaited<ReturnType<typeof prepare>>) => withLegalHoldLock(f.workspace, () => ready.apply());
function receiptMath(f: Fixture, result: ReturnType<typeof apply>, pem = getSigningPublicKeyPem(f.workspace, "artifact-seal")) {
  const bytes = fs.readFileSync(join(result.quarantineDir, "repair-receipt.json")), signed = JSON.parse(fs.readFileSync(join(result.quarantineDir, "repair-receipt.json.sig"), "utf8"));
  expect(JSON.parse(bytes.toString())).toEqual(result.receipt); expect(signed.digestSha256).toBe(sha256Hex(bytes));
  expect(verifySignatureEnvelope(signed.digestSha256, signed.envelope, { trustedPublicKeys: [pem], requireTrustedKey: true })).toBe(true);
  for (const row of result.receipt.moved) { expect(fs.existsSync(join(f.workspace, row.from))).toBe(false); expect(sha256Hex(fs.readFileSync(join(f.workspace, row.to)))).toBe(row.sha256); }
  expect(fs.readFileSync(f.report, "utf8")).toBe("# original report\n"); return { bytes, signed };
}
function gate() { let done!: () => void; const promise = new Promise<void>(resolve => { done = resolve; }); return { promise, done }; }
function pause(f: Fixture, phase: number) {
  const entered = gate(), release = gate(), real = f.provider.sign.bind(f.provider); let calls = 0;
  const spy = vi.spyOn(f.provider, "sign").mockImplementation(async (ref, bytes) => { const answer = await real(ref, bytes); if (++calls === phase) { entered.done(); await release.promise; } return answer; });
  return { entered, release, spy };
}
async function reached(p: ReturnType<typeof pause>, pending: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([p.entered.promise, pending.then(() => { throw new Error("repair settled before real Sign pause"); }, error => { throw error; }),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("repair did not reach actual Sign")), 5_000); })]); } finally { clearTimeout(timer); }
}
function savePolicy(f: Fixture, policy: TrustConfig) {
  const bytes = Buffer.from(YAML.stringify(policy)), signed = signDigestWithVault({ workspace: f.workspace, kind: "BUNDLE", digestHex: sha256Hex(bytes) });
  fs.writeFileSync(trustConfigPath(f.workspace), bytes); fs.writeFileSync(trustConfigSigPath(f.workspace), JSON.stringify(signed, null, 2)); expect(verifyTrustConfigSignature(f.workspace).valid).toBe(true);
}

describe("actual asynchronous verify-repair preparation and quarantine", () => {
  test.each(["sqlite", "jsonl"] as const)("%s preserves every original byte with exactly the plan and receipt raw32 signatures before effects", async backend => {
    const f = fixture(backend); fs.mkdirSync(join(f.workspace, ".amc", "blobs", "a")); fs.writeFileSync(join(f.workspace, ".amc", "blobs", "a", "extra"), "owned nested bytes"); fs.writeFileSync(join(f.workspace, ".amc", "blobs", "a.ext"), "owned sibling bytes");
    const input = plan(f), before = storeBytes(f, input), privateKey = getSigningKey(f.workspace, "artifact-seal"), pem = getSigningPublicKeyPem(f.workspace, "artifact-seal");
    vi.spyOn(Date, "now").mockReturnValue(f.clock); const real = f.provider.sign.bind(f.provider), calls: Buffer[] = [];
    vi.spyOn(f.provider, "sign").mockImplementation(async (ref, bytes) => { expect(ref).toEqual({ provider: "file", id: "artifact-seal" }); expect(fs.existsSync(join(f.workspace, ".amc", ".verify-repair.lock"))).toBe(false);
      expect(fs.existsSync(join(legalHoldRegistryRoot(f.workspace), ".holds.lock"))).toBe(false); unchanged(f, before); calls.push(Buffer.from(bytes)); return real(ref, bytes); });
    const ready = await prepare(f, input); unchanged(f, before); const result = apply(f, ready), { bytes, signed } = receiptMath(f, result);
    const expected = { v: 1, type: "amc.verify-repair", id: result.receipt.id, createdAt: new Date(f.clock).toISOString(), amcVersion,
      trigger: { errorCounts: input.errorCounts, errors: input.errors }, legalHold: { state: "none", checkedAt: new Date(f.clock).toISOString() },
      moved: input.files.map(row => ({ from: row.path, to: `.amc/quarantine/${result.receipt.id}/${relative(".amc", row.path).split("\\").join("/")}`, bytes: row.bytes, sha256: row.sha256 })), untouched: [".amc/reports"] };
    expect(bytes.toString()).toBe(JSON.stringify(expected, null, 2) + "\n"); const digest = sha256Hex(bytes), signature = sign(null, Buffer.from(digest, "hex"), privateKey).toString("base64");
    expect(signed.signature).toBe(signature); expect(verify(null, Buffer.from(digest, "hex"), pem, Buffer.from(signature, "base64"))).toBe(true);
    expect(fs.readFileSync(join(result.quarantineDir, "repair-receipt.json.sig"), "utf8")).toBe(JSON.stringify({ digestSha256: digest, signature, signedTs: f.clock, signer: "auditor",
      envelope: { v: 1, alg: "ed25519", pubkeyB64: Buffer.from(pem).toString("base64"), fingerprint: sha256Hex(pem), sigB64: signature, signedTs: f.clock, signer: { type: "VAULT", attestationLevel: "SOFTWARE" } } }, null, 2) + "\n");
    expect(calls).toEqual([Buffer.from(sha256Hex(JSON.stringify(input, null, 2) + "\n"), "hex"), Buffer.from(digest, "hex")]);
    expect(archivedStores(f.workspace)).toEqual({ receipts: [`.amc/quarantine/${result.receipt.id}/repair-receipt.json`], interrupted: [] });
  });
  test("the actual second Sign refusal cannot strand quarantined evidence and retains its typed cause", async () => {
    const f = fixture(), input = plan(f), before = storeBytes(f, input), real = f.provider.sign.bind(f.provider), cause = new KeyProviderError("KEY_PROVIDER_UNAVAILABLE", "file", "owned private provider refusal"); let calls = 0;
    vi.spyOn(f.provider, "sign").mockImplementation(async (ref, bytes) => { if (++calls === 2) throw cause; return real(ref, bytes); });
    await expect(prepare(f, input)).rejects.toBe(cause); expect(calls).toBe(2); unchanged(f, before); vi.restoreAllMocks(); receiptMath(f, apply(f, await prepare(f)));
  });
  test("the first actual signer remains authoritative when the second signature legitimately captures a new artifact key", async () => {
    const f = fixture(), input = plan(f), before = storeBytes(f, input); let calls = 0;
    // Preparation rechecks the first signer before the second Sign (P2-08), so the refusal precedes any apply handle.
    await expect(prepare(f, input, async (path, bytes) => { if (++calls === 2) rotatePurposeKeys({ workspace: f.workspace, purposes: ["artifact-seal"], passphrase: PASS });
      return prepareFileSignatureWithAuditor(f.workspace, path, bytes, "REPAIR_RECEIPT"); })).rejects.toThrow(/policy signing state changed|committed purpose authority changed/);
    expect(calls).toBe(2); unchanged(f, before); receiptMath(f, apply(f, await prepare(f)));
  });
  test.each(["lock", "no-sign", "policy"] as const)("late %s after both checked signatures refuses before quarantine with a restored positive", async change => {
    const f = fixture(), input = plan(f), before = storeBytes(f, input), ready = await prepare(f, input), original = loadTrustConfig(f.workspace);
    try { if (change === "lock") { lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); } else if (change === "no-sign") vi.stubEnv("AMC_NO_SIGN", "1");
      else { const policy = structuredClone(original); policy.trust.enforcement.notaryMaxClockSkewSeconds++; savePolicy(f, policy); }
      expect(() => apply(f, ready)).toThrow(); unchanged(f, before);
    } finally { vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); if (change === "policy") savePolicy(f, original); }
    receiptMath(f, apply(f, await prepare(f)));
  });
  test("snapshots the caller plan before its actual first Sign wait", async () => {
    const f = fixture(), input = plan(f), original = structuredClone(input), p = pause(f, 1), pending = prepare(f, input); const settled = pending.then(value => ({ value }), error => ({ error }));
    try { await reached(p, pending); input.errors.push("caller mutation"); input.files[0]!.path = "../must-not-move"; input.errorCounts.trust_root = 1; p.release.done();
      const result = await settled; if (!("value" in result)) throw result.error; let applied: ReturnType<typeof apply> | undefined;
      expect(() => { applied = apply(f, result.value); }).not.toThrow(); receiptMath(f, applied!);
      expect(applied!.receipt.trigger).toEqual({ errorCounts: original.errorCounts, errors: original.errors }); expect(applied!.receipt.moved.map(row => row.from)).toEqual(original.files.map(row => row.path));
    } finally { p.release.done(); await Promise.allSettled([pending]); }
  });
  test.each(["new-file", "changed-file", "marker", "destination"] as const)("refuses %s drift during receipt Sign and leaves the competing bytes intact", async change => {
    const f = fixture(), input = plan(f), before = storeBytes(f, input), p = pause(f, 2), paths: string[] = [];
    const pending = prepare(f, input, async (path, bytes) => { paths.push(path); return prepareFileSignatureWithAuditor(f.workspace, path, bytes, "REPAIR_RECEIPT"); });
    const settled = pending.then(value => ({ value }), error => ({ error })); let target = "", old: Buffer | undefined;
    try { await reached(p, pending);
      if (change === "new-file") { target = join(f.workspace, ".amc", "blobs", "competing.extra"); fs.writeFileSync(target, "competing writer"); }
      else if (change === "changed-file") { target = join(f.workspace, input.files.at(-1)!.path); old = fs.readFileSync(target); fs.writeFileSync(target, Buffer.concat([old, Buffer.from("extra")])); }
      else if (change === "marker") { target = join(f.workspace, ".amc", "session-store.json"); old = fs.existsSync(target) ? fs.readFileSync(target) : undefined; fs.writeFileSync(target, JSON.stringify({ backend: "jsonl" })); }
      else { target = join(paths[1]!, ".."); fs.mkdirSync(target, { recursive: true }); fs.writeFileSync(join(target, "owned-competitor"), "competing output"); }
      // The drift is refused when preparation rechecks its preconditions after the receipt Sign (P2-08), before any apply handle.
      p.release.done(); const ready = await settled; if (!("error" in ready)) throw new Error("repair preparation accepted drift during receipt Sign");
      expect(ready.error).toBeInstanceOf(RepairRefused);
      if (change === "destination") { expect(String(ready.error)).toContain("quarantine folder already exists"); expect(fs.readFileSync(join(target, "owned-competitor"), "utf8")).toBe("competing output"); }
      else { const competing = fs.readFileSync(target); expect(String(ready.error)).toContain("evidence changed since the plan"); expect(fs.readFileSync(target)).toEqual(competing);
        unchanged(f, new Map([...before].filter(([path]) => join(f.workspace, path) !== target))); }
    } finally { p.release.done(); await Promise.allSettled([pending]); if (target) { if (change === "destination") fs.rmSync(target, { recursive: true, force: true }); else if (old) fs.writeFileSync(target, old); else fs.rmSync(target); } }
    receiptMath(f, apply(f, await prepare(f)));
  });
  test("an actual authenticated legal-hold register corrupted after signing is unknown at the final boundary", async () => {
    const f = fixture(); initLegalHoldRegistry(f.workspace); closeAllSqlitePools(); const input = plan(f), before = storeBytes(f, input), ready = await prepare(f, input);
    const path = join(legalHoldRegistryRoot(f.workspace), "HEAD.json.sig"), original = fs.readFileSync(path); fs.writeFileSync(path, "{corrupt signature");
    try { expect(holdVerdict({ workspace: f.workspace }).verdict).toBe("unknown"); expect(() => apply(f, ready)).toThrow("legal hold state unknown"); unchanged(f, before); }
    finally { fs.writeFileSync(path, original); } expect(holdVerdict({ workspace: f.workspace }).verdict).toBe("clear"); receiptMath(f, apply(f, await prepare(f)));
  });
  test.each(["repair-receipt.json.sig", "repair-receipt.json"] as const)("post-move %s failure retains exact evidence, plan, phase and native cause", async member => {
    const f = fixture(), input = plan(f), before = storeBytes(f, input), paths: string[] = [];
    const ready = await prepare(f, input, async (path, bytes) => { paths.push(path); return prepareFileSignatureWithAuditor(f.workspace, path, bytes, "REPAIR_RECEIPT"); });
    const dir = join(paths[1]!, ".."); faults.target = join(dir, member); const error = (() => { try { apply(f, ready); } catch (error) { return error; } })();
    expect(error).toBeInstanceOf(RepairPublicationError); expect(error).toMatchObject({ code: "REPAIR_PARTIAL", phase: member.endsWith(".sig") ? "receipt-signature" : "receipt", cause: faults.cause });
    expect(String(error)).not.toContain(f.root); expect(fs.existsSync(join(dir, "repair-plan.json"))).toBe(true); expect(fs.existsSync(join(dir, "repair-receipt.json"))).toBe(false);
    for (const [path, bytes] of before) expect(fs.readFileSync(join(dir, relative(".amc", path)))).toEqual(bytes);
    expect(archivedStores(f.workspace).interrupted).toContain(relative(f.workspace, dir).split("\\").join("/")); expect(fs.readFileSync(f.report, "utf8")).toBe("# original report\n");
    if (member.endsWith(".sig")) expect(fs.existsSync(join(dir, member))).toBe(false); else expect(fs.existsSync(join(dir, "repair-receipt.json.sig"))).toBe(true);
  });
  test("a genuine late owner hold refuses before any quarantine and remains clear only after actual release", async () => {
    const f = fixture(); registerTenant({ tenantId: "repair-tenant", workspaceId: "repair-workspace", region: "eu-west-1" }, f.workspace); initLegalHoldRegistry(f.workspace); closeAllSqlitePools();
    const ready = await prepare(f), hold = issueScopedLegalHold({ workspace: f.workspace, scope: { tenantId: "repair-tenant", workspaceIds: [], sessionIds: [], dataKinds: [] }, reason: "owned litigation", issuedBy: "owned legal" });
    closeAllSqlitePools(); expect(holdVerdict({ workspace: f.workspace }).verdict).toBe("held"); const competing = storeBytes(f, plan(f));
    expect(() => apply(f, ready)).toThrow("legal hold active"); unchanged(f, competing);
    expect(releaseScopedLegalHold(f.workspace, hold.holdId)).toBe(true); closeAllSqlitePools(); expect(holdVerdict({ workspace: f.workspace }).verdict).toBe("clear"); receiptMath(f, apply(f, await prepare(f)));
  });
  test.each(["restored", "stuck"] as const)("a genuine rename/rollback %s outcome retains the exact reachable evidence and native causes", async outcome => {
    const f = fixture(), input = plan(f), before = storeBytes(f, input), paths: string[] = [], ready = await prepare(f, input, async (path, bytes) => {
      paths.push(path); return prepareFileSignatureWithAuditor(f.workspace, path, bytes, "REPAIR_RECEIPT"); });
    faults.failMove = 2; faults.rollback = outcome === "stuck"; const error = (() => { try { apply(f, ready); } catch (error) { return error; } })(), dir = join(paths[1]!, "..");
    if (outcome === "restored") { expect(error).toBeInstanceOf(RepairRefused); expect(error).toMatchObject({ cause: faults.cause }); expect(error).not.toBeInstanceOf(RepairPublicationError); unchanged(f, before); }
    else { expect(error).toBeInstanceOf(RepairPublicationError); expect(error).toMatchObject({ phase: "move" }); const cause = (error as RepairPublicationError).cause as AggregateError;
      expect(cause).toBeInstanceOf(AggregateError); expect(cause.errors[0]).toBe(faults.cause); expect(cause.errors[1]).toMatchObject({ cause: faults.rollbackCause });
      for (const [path, bytes] of before) { const at = fs.existsSync(join(f.workspace, path)) ? join(f.workspace, path) : join(dir, relative(".amc", path)); expect(fs.readFileSync(at)).toEqual(bytes); }
      expect(fs.existsSync(join(dir, "repair-plan.json"))).toBe(true); expect(fs.existsSync(join(dir, "repair-receipt.json"))).toBe(false); }
  });
  test("an observed post-move byte substitution cannot publish the prepared receipt", async () => {
    const f = fixture(), paths: string[] = [], ready = await prepare(f, plan(f), async (path, bytes) => { paths.push(path); return prepareFileSignatureWithAuditor(f.workspace, path, bytes, "REPAIR_RECEIPT"); });
    let changed = ""; faults.afterMove = path => { if (changed) return; changed = path; fs.appendFileSync(path, "owned adversarial post-move bytes"); };
    const error = (() => { try { apply(f, ready); } catch (error) { return error; } })(), dir = join(paths[1]!, "..");
    expect(error).toBeInstanceOf(RepairPublicationError); expect(error).toMatchObject({ phase: "moved-bytes" }); expect(fs.readFileSync(changed).subarray(-33).toString()).toContain("post-move");
    expect(fs.existsSync(join(dir, "repair-plan.json"))).toBe(true); expect(fs.existsSync(join(dir, "repair-receipt.json"))).toBe(false);
  });
  test("a malformed marker after the final real rename reports retained partial evidence rather than confirmed rollback", async () => {
    const f = fixture(), input = plan(f), before = storeBytes(f, input), paths: string[] = [];
    const ready = await prepare(f, input, async (path, bytes) => { paths.push(path); return prepareFileSignatureWithAuditor(f.workspace, path, bytes, "REPAIR_RECEIPT"); });
    const marker = join(f.workspace, ".amc", "session-store.json"), original = fs.existsSync(marker) ? fs.readFileSync(marker) : null;
    const dir = join(paths[1]!, ".."), relativeDir = relative(f.workspace, dir).split("\\").join("/"); let moved = 0;
    faults.afterMove = () => { if (++moved === input.files.length) fs.writeFileSync(marker, JSON.stringify({ backend: "owned-invalid" })); };
    try {
      const error = (() => { try { apply(f, ready); } catch (error) { return error; } })();
      expect(moved).toBe(input.files.length); expect(error).toBeInstanceOf(RepairPublicationError); expect(error).not.toBeInstanceOf(RepairRefused);
      const partial = error as RepairPublicationError;
      expect(partial).toMatchObject({ code: "REPAIR_PARTIAL", quarantineDir: relativeDir, phase: "moved-bytes" });
      expect(partial.cause).toBeInstanceOf(RepairRefused); expect((partial.cause as Error).message).toBe("session-store marker is invalid");
      expect(partial.publishedPaths).toEqual([`${relativeDir}/repair-plan.json`]);
      expect(partial.attemptedMoves).toEqual(input.files.map(row => ({ from: row.path, to: `${relativeDir}/${relative(".amc", row.path).split("\\").join("/")}`, bytes: row.bytes, sha256: row.sha256 })));
      for (const [path, bytes] of before) { expect(fs.existsSync(join(f.workspace, path))).toBe(false); expect(fs.readFileSync(join(dir, relative(".amc", path)))).toEqual(bytes); }
      expect(fs.existsSync(join(dir, "repair-plan.json"))).toBe(true); expect(fs.existsSync(join(dir, "repair-receipt.json.sig"))).toBe(false); expect(fs.existsSync(join(dir, "repair-receipt.json"))).toBe(false);
      expect(archivedStores(f.workspace).interrupted).toContain(relativeDir); expect(fs.readFileSync(f.report, "utf8")).toBe("# original report\n");
    } finally { faults.afterMove = undefined; if (original === null) fs.rmSync(marker); else fs.writeFileSync(marker, original); }
  });
  test("observed new live store bytes during the synchronous move phase refuse an incomplete archive", async () => {
    const f = fixture(), paths: string[] = [], ready = await prepare(f, plan(f), async (path, bytes) => { paths.push(path); return prepareFileSignatureWithAuditor(f.workspace, path, bytes, "REPAIR_RECEIPT"); });
    const live = join(f.workspace, ".amc", "blobs", "owned-live-after-check.extra"); let wrote = false;
    faults.afterMove = () => { if (!wrote) { wrote = true; fs.writeFileSync(live, "owned concurrent live bytes"); } };
    const error = (() => { try { apply(f, ready); } catch (error) { return error; } })(), dir = join(paths[1]!, "..");
    expect(error).toBeInstanceOf(RepairPublicationError); expect(error).toMatchObject({ phase: "moved-bytes" }); expect(fs.readFileSync(live, "utf8")).toBe("owned concurrent live bytes");
    expect(fs.existsSync(join(dir, "repair-plan.json"))).toBe(true); expect(fs.existsSync(join(dir, "repair-receipt.json"))).toBe(false);
  });
  test("native P256 notary prepares exactly two REPAIR_RECEIPT signatures outside both locks", async () => {
    const f = fixture(), native = await ownedAsyncWorkspaceLogNotary(f.workspace, f.root); closers.push(native.close);
    const policy = loadTrustConfig(f.workspace); policy.trust.enforcement.requireNotaryFor = ["REPAIR_RECEIPT"]; savePolicy(f, policy);
    const input = plan(f), before = storeBytes(f, input); native.setBeforeReply(kind => { expect(kind).toBe("REPAIR_RECEIPT"); unchanged(f, before);
      expect(fs.existsSync(join(f.workspace, ".amc", ".verify-repair.lock"))).toBe(false); expect(fs.existsSync(join(legalHoldRegistryRoot(f.workspace), ".holds.lock"))).toBe(false); });
    const result = apply(f, await prepare(f, input)), verified = receiptMath(f, result, native.publicKeyPem);
    expect(verified.signed.envelope.alg).toBe("ecdsa-p256-sha256");
    expect(native.requests).toEqual([{ kind: "REPAIR_RECEIPT", payload: Buffer.from(sha256Hex(JSON.stringify(input, null, 2) + "\n"), "hex") },
      { kind: "REPAIR_RECEIPT", payload: Buffer.from(sha256Hex(verified.bytes), "hex") }]);
  });
});
