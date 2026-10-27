/** Proposed tests/keys/providerInterprocessExclusion.test.ts. Requires a current root-owned pnpm build. Not executed here. */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import { initWorkspace, signAmcConfig } from "../../src/workspace.js";
import { bindPurposeProviderKey } from "../../src/keys/purposeProviders.js";
import { awsKmsProvider } from "../../src/keys/providers/awsKms.js";
import { boundProviderKey } from "../../src/keys/keyset.js";
import { signingKeyId } from "../../src/keys/algorithmPolicy.js";
import { delegationUsageKey } from "../../src/keys/delegationUsage.js";
import { readHighWater } from "../../src/keys/highWater.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { jsonlEventsPath, readEventRows } from "../../src/persistence/jsonl/jsonlEventLog.js";
import { verifyStoredSessionEventMetadata } from "../../src/persistence/sessionStoreVerification.js";
import { createPairingCode, claimPairingCodeAsync, verifyPairingToken } from "../../src/pairing/pairingCodes.js";
import { withPins } from "../../src/trust/trustContext.js";
import { workspaceKeyTrust } from "../helpers/trustContext.js";
import { lockVault } from "../../src/vault/vault.js";
import { AWS_ARN, awsFake, fakeKey } from "./providerFakes.js";
const PASS = "p208-interprocess-owned-fixture";
const CHILD = fileURLToPath(new URL("../fixtures/p208InterprocessChild.mjs", import.meta.url));
const REPO = fileURLToPath(new URL("../../", import.meta.url));
type Result = { ok: boolean; code?: string; message?: string; token?: string; error?: string; generation?: number };
type Worker = { child: ChildProcess; exited: Promise<number | null>; stderr(): string };
const fixtures: Array<{ root: string; workspace: string; barriers: string; children: Worker[] }> = [];
const pause = (ms: number) => new Promise<void>(done => setTimeout(done, ms));
afterEach(async () => {
  const errors: unknown[] = [];
  for (const f of fixtures.splice(0).reverse()) {
    writeFileSync(join(f.barriers, "abort.json"), "{}");
    let stopped = true;
    for (const worker of f.children) {
      if (worker.child.exitCode === null && worker.child.signalCode === null) worker.child.kill("SIGTERM");
      const gone = await Promise.race([worker.exited.then(() => true), pause(1_000).then(() => false)]);
      if (!gone) {
        worker.child.kill("SIGKILL");
        const killed = await Promise.race([worker.exited.then(() => true), pause(2_000).then(() => false)]);
        if (!killed) { stopped = false; errors.push(new Error("owned child did not exit; temp fixture preserved")); }
      }
    }
    if (stopped) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  }
  vi.unstubAllEnvs();
  if (errors.length) throw new AggregateError(errors, "owned interprocess fixture cleanup failed");
});
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p208-process-"))), workspace = join(root, "workspace"), home = join(root, "home"), barriers = join(root, "barriers");
  mkdirSync(home); mkdirSync(barriers); vi.stubEnv("AMC_HOME", home); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS);
  vi.stubEnv("AMC_NO_SIGN", "0"); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", ""); vi.stubEnv("AMC_LEDGER_SQLITE_SYNCHRONOUS", "FULL");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" });
  const f = { root, workspace, home, barriers, children: [] as Worker[] }; fixtures.push(f);
  const key = fakeKey("p256"), arn = AWS_ARN("owned-process-issuer"), fake = awsFake({ [arn]: key });
  const pem = key.publicKey.export({ format: "pem", type: "spki" }).toString();
  const trust = withPins(workspaceKeyTrust(workspace), [{ keyId: signingKeyId(pem)!, purposes: ["ledger-row"], origin: "owned independent process operator" }]);
  return { ...f, key, arn, fake, trust };
}
function configure(f: ReturnType<typeof fixture>) {
  const path = join(f.workspace, ".amc", "amc.config.yaml"), config = YAML.parse(readFileSync(path, "utf8"));
  config.keys = { refs: { "ledger-row": { provider: "aws-kms", id: f.arn } } };
  writeFileSync(path, YAML.stringify(config)); signAmcConfig(f.workspace);
}
function start(f: ReturnType<typeof fixture>, role: string, mode: string, extra: Record<string, unknown> = {}) {
  const path = join(f.root, `child-${role}.json`);
  writeFileSync(path, JSON.stringify({ role, mode, workspace: f.workspace, home: f.home, barriers: f.barriers, repo: REPO,
    passphrase: PASS, sessionId: `owned-process-${role}`, eventsPath: jsonlEventsPath(f.workspace), ...extra }), { mode: 0o600 });
  const child = spawn(process.execPath, [CHILD, path], { stdio: ["ignore", "ignore", "pipe"], env: { ...process.env } });
  let stderr = ""; child.stderr?.on("data", chunk => { stderr = (stderr + String(chunk)).slice(-4_000); });
  const exited = new Promise<number | null>(done => {
    child.once("error", error => { stderr = `${stderr}\n${String(error)}`.slice(-4_000); done(-1); });
    child.once("exit", code => done(code));
  });
  const worker = { child, exited, stderr: () => stderr }; f.children.push(worker); return worker;
}
function marker(f: ReturnType<typeof fixture>, role: string, name: string) { return join(f.barriers, `${role}.${name}.json`); }
function release(f: ReturnType<typeof fixture>, role: string, name: string) { writeFileSync(marker(f, role, name), "{}"); }
async function waitOne(f: ReturnType<typeof fixture>, choices: Array<[string, string]>): Promise<[string, string]> {
  const until = Date.now() + 12_000;
  while (Date.now() < until) {
    for (const choice of choices) if (existsSync(marker(f, ...choice))) return choice;
    await pause(5);
  }
  throw new Error("owned barrier did not arrive; fixture failure, never a mutation kill");
}
async function result(f: ReturnType<typeof fixture>, role: string, worker: Worker): Promise<Result> {
  await waitOne(f, [[role, "result"]]);
  const value = JSON.parse(readFileSync(marker(f, role, "result"), "utf8")) as Result;
  const code = await Promise.race([worker.exited, pause(5_000).then(() => { throw new Error("owned child did not cleanly exit"); })]);
  expect(code, worker.stderr()).toBe(0); return value;
}
function wholeRows(f: ReturnType<typeof fixture>) {
  const ledger = openLedger(f.workspace);
  try { return { sql: ledger.getAllEvents(), jsonl: readEventRows(f.workspace) }; } finally { ledger.close(); }
}

describe("real process exclusion for delegated row use/publication and pairing finalization", () => {
  for (const cap of [1, 2]) test(`two actual SQL/JSONL processes share cap ${cap} and unique durable indices`, async () => {
    const f = fixture(); configure(f);
    const binding = await bindPurposeProviderKey(f.workspace, "ledger-row", { passphrase: PASS, provider: awsKmsProvider(f.fake.call), delegation: { maxEvents: cap } });
    mkdirSync(dirname(jsonlEventsPath(f.workspace)), { recursive: true }); writeFileSync(jsonlEventsPath(f.workspace), "", { flag: "wx" });
    const a = start(f, "a", "quota-jsonl"); await waitOne(f, [["a", "floor-ready"], ["a", "result"]]);
    expect(existsSync(marker(f, "a", "floor-ready"))).toBe(true);
    expect(JSON.parse(readFileSync(marker(f, "a", "floor-ready"), "utf8")).bytes).toBe(0);
    const b = start(f, "b", "quota-sql");
    // Normal B hits actual EEXIST. A lock-free mutant instead completes B before A's captured empty floor returns.
    await waitOne(f, [["b", "contended"], ["b", "result"]]);
    release(f, "a", "floor-release");
    const observed = { a: await result(f, "a", a), b: await result(f, "b", b), rows: wholeRows(f) };
    expect(observed.a.ok).toBe(true);
    expect(observed.b).toMatchObject(cap === 1 ? { ok: false, code: "KEY_DELEGATION_INVALID" } : { ok: true });
    const rows = [...observed.rows.sql, ...observed.rows.jsonl];
    const indices = rows.map(row => JSON.parse(row.meta_json).amcKeyDelegation.useSequence).sort();
    expect(indices, JSON.stringify(observed)).toEqual(cap === 1 ? [1] : [1, 2]);
    expect(readHighWater(delegationUsageKey(f.workspace, binding.delegationSha256!))?.sequence).toBe(cap);
    expect(verifyStoredSessionEventMetadata(f.workspace, observed.rows.jsonl, { trust: { ...f.trust, asOf: new Date() } })).toMatchObject({ ok: true, errors: [] });
  }, 60_000);

  test("actual owner binding cannot publish a prepared zero-row cutover across another process's signed JSONL append", async () => {
    const f = fixture();
    const a = start(f, "a", "publication-jsonl"); await waitOne(f, [["a", "raw-write-ready"], ["a", "result"]]);
    expect(existsSync(marker(f, "a", "raw-write-ready"))).toBe(true);
    expect(JSON.parse(readFileSync(marker(f, "a", "raw-write-ready"), "utf8")).marker).toBeNull();
    // A's exact legacy row is already signed. Only now does the owner select the first provider key.
    configure(f);
    const issuerPrivatePem = f.key.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const b = start(f, "b", "bind", { arn: f.arn, issuerPrivatePem });
    await waitOne(f, [["b", "contended"], ["b", "result"]]);
    release(f, "a", "write-release");
    const first = { a: await result(f, "a", a), b: await result(f, "b", b) };
    const rows = readEventRows(f.workspace);
    const verified = verifyStoredSessionEventMetadata(f.workspace, rows, { trust: { ...f.trust, asOf: new Date() } });
    expect(first.a.ok).toBe(true);
    expect(first.b, JSON.stringify({ first, verified })).toMatchObject({ ok: false, message: expect.stringMatching(/head changed while the delegation was prepared/) });
    expect(boundProviderKey(f.workspace, "ledger-row")).toBeNull();
    expect(rows).toHaveLength(1); expect(verified).toMatchObject({ ok: true, errors: [] });
    // Positive control: a fresh actual owner preparation after the append binds successfully and preserves that prefix.
    const c = start(f, "c", "bind", { arn: f.arn, issuerPrivatePem });
    expect(await result(f, "c", c)).toMatchObject({ ok: true });
    expect(boundProviderKey(f.workspace, "ledger-row")).not.toBeNull();
    expect(verifyStoredSessionEventMetadata(f.workspace, readEventRows(f.workspace), { trust: { ...f.trust, asOf: new Date() } })).toMatchObject({ ok: true, errors: [] });
  }, 60_000);

  test("two actual async pairing claim processes publish exactly one valid token and preserve one used code", async () => {
    const f = fixture(), created = createPairingCode({ workspace: f.workspace, ttlMs: 300_000 });
    const pairingStore = join(f.workspace, ".amc", "studio", "pairing.codes.json");
    const extra = { code: created.code, pairingId: created.id, pairingStore };
    const a = start(f, "a", "pairing", extra); await waitOne(f, [["a", "sign-ready"], ["a", "result"]]);
    const b = start(f, "b", "pairing", extra); await waitOne(f, [["b", "sign-ready"], ["b", "result"]]);
    expect(existsSync(marker(f, "a", "sign-ready"))).toBe(true); expect(existsSync(marker(f, "b", "sign-ready"))).toBe(true);
    release(f, "a", "sign-release"); await waitOne(f, [["a", "final-read"], ["a", "result"]]);
    expect(existsSync(marker(f, "a", "final-read"))).toBe(true);
    expect(JSON.parse(readFileSync(marker(f, "a", "final-read"), "utf8")).usedTs).toBeNull();
    release(f, "b", "sign-release");
    const progress = await waitOne(f, [["b", "contended"], ["b", "final-read"], ["b", "result"]]);
    let outcomeA: Result, outcomeB: Result;
    if (progress[1] === "final-read") {
      // Lock removal lets B publish from the same unused snapshot while A remains paused.
      release(f, "b", "final-release"); outcomeB = await result(f, "b", b);
      release(f, "a", "final-release"); outcomeA = await result(f, "a", a);
    } else {
      expect(progress[1]).toBe("contended"); release(f, "a", "final-release"); outcomeA = await result(f, "a", a);
      await waitOne(f, [["b", "final-read"], ["b", "result"]]);
      expect(existsSync(marker(f, "b", "final-read"))).toBe(true);
      expect(JSON.parse(readFileSync(marker(f, "b", "final-read"), "utf8")).usedTs).toEqual(expect.any(Number));
      release(f, "b", "final-release"); outcomeB = await result(f, "b", b);
    }
    const outcomes = [outcomeA, outcomeB], accepted = outcomes.filter(row => row.ok);
    // Establish each returned credential's actual validity before asserting exclusive consumption.
    for (const outcome of accepted) expect(verifyPairingToken({ workspace: f.workspace, token: outcome.token! }).ok).toBe(true);
    expect(accepted, JSON.stringify(outcomes)).toHaveLength(1);
    expect(outcomes.filter(row => !row.ok)).toMatchObject([{ error: "pairing code already used" }]);
    expect(verifyPairingToken({ workspace: f.workspace, token: accepted[0]!.token! }).ok).toBe(true);
    const store = JSON.parse(readFileSync(pairingStore, "utf8"));
    expect(store.codes.filter((row: { id: string; usedTs?: number }) => row.id === created.id)).toEqual([expect.objectContaining({ usedTs: expect.any(Number) })]);
    const fresh = createPairingCode({ workspace: f.workspace, ttlMs: 300_000 });
    const control = await claimPairingCodeAsync({ workspace: f.workspace, code: fresh.code });
    expect(control.ok).toBe(true); expect(verifyPairingToken({ workspace: f.workspace, token: control.token! }).ok).toBe(true);
  }, 60_000);
});
