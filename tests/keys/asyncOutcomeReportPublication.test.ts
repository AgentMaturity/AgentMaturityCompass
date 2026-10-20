// The compiled CLI case requires the root-owned normal build; all other cases use actual source producers.
import { sign, verify } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as reports from "../../src/outcomes/outcomeReport.js";
import * as files from "../../src/utils/fs.js";
import { outcomesReportCliAsync } from "../../src/outcomes/outcomeCli.js";
import { initOutcomeContract, outcomeContractPath } from "../../src/outcomes/outcomeContractEngine.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { initWorkspace } from "../../src/workspace.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/keys/signingKeys.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { assertKeysetComplete } from "../../src/keys/keyset.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { initUsersConfig, addUser, createSession, revokeSessionByToken, setUserRoles, verifyTrackedSessionToken } from "../../src/auth/authApi.js";
import { startStudioApiServer } from "../../src/studio/studioServer.js";
import { transparencyLogPath, transparencySealPath } from "../../src/transparency/logChain.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { spawnOwnedNode } from "../helpers/ownedNodeGroup.js";

const boundary = vi.hoisted(() => ({ nonce: "" }));
vi.mock("node:crypto", async importOriginal => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  const randomUUID = () => boundary.nonce ? boundary.nonce as ReturnType<typeof actual.randomUUID> : actual.randomUUID();
  return { ...actual, randomUUID, default: { ...actual, randomUUID } };
});
const PASS = "owned-outcome-report-passphrase", SENTINEL = "owned previous output";
const roots: Array<{ root: string; workspace: string }> = [], servers: Array<Awaited<ReturnType<typeof startStudioApiServer>>> = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  boundary.nonce = ""; vi.restoreAllMocks();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function appendSignal(workspace: string) {
  const ledger = openLedger(workspace);
  try { ledger.appendOutcomeEvent({ agentId: "default", workOrderId: null, category: "Functional", metricId: "functional.success",
    value: 1, unit: null, trustTier: "SELF_REPORTED", source: "manual", meta: { owned: true } }); }
  finally { ledger.close(); }
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-async-outcome-report-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined); vi.stubEnv("AMC_SESSION_STORE", "sqlite");
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); initOutcomeContract(workspace, "default"); appendSignal(workspace);
  const seed = reports.runOutcomeReport({ workspace, agentId: "default", window: "1d" });
  const pem = getSigningPublicKeyPem(workspace, "artifact-seal"), key = getSigningKey(workspace, "artifact-seal");
  return { root, workspace, seed, dir: dirname(seed.jsonPath), jsonPath: join(workspace, "owned-report.json"), mdPath: join(workspace, "owned-report.md"), pem, key,
    provider: loadKeyProvider(workspace, "file"), params: { workspace, agentId: "default", window: "1d", outFile: "owned-report.json" } };
}
function verified(f: ReturnType<typeof fixture>, jsonPath = f.jsonPath) {
  const report = JSON.parse(readFileSync(jsonPath, "utf8")) as ReturnType<typeof reports.runOutcomeReport>["report"];
  const { reportJsonSha256, reportSealSig, ...base } = report;
  expect(reportJsonSha256).toBe(sha256Hex(canonicalize(base)));
  expect(verify(null, Buffer.from(reportJsonSha256, "hex"), f.pem, Buffer.from(reportSealSig, "base64"))).toBe(true);
  expect(Object.keys(base)).toEqual(["reportId", "agentId", "ts", "windowStartTs", "windowEndTs", "contractId", "contractSignatureValid", "trustLabel",
    "valueScore", "categoryScores", "economicSignificanceIndex", "valueRegressionRisk", "observedCoverageRatio", "metrics", "nonClaims"]);
  expect(report).not.toHaveProperty("envelope"); expect(report).not.toHaveProperty("publicKeyPem");
  expect(report.nonClaims).toEqual(["This is not legal advice.", "Value signals are deterministic and evidence-backed only.", "This report cannot infer value controls that are not evidenced."]);
  return report;
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pauseSign(f: ReturnType<typeof fixture>) {
  const entered = deferred(), release = deferred(), actual = f.provider.sign.bind(f.provider);
  const spy = vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, bytes) => { const signature = await actual(ref, bytes); entered.resolve(); await release.promise; return signature; });
  return { entered, release, spy };
}
async function atPause(paused: ReturnType<typeof pauseSign>, pending: Promise<unknown>) {
  expect(await Promise.race([paused.entered.promise.then(() => "signed"), pending.then(() => "returned", () => "refused")])).toBe("signed");
}
function seedOutputs(f: ReturnType<typeof fixture>) { writeFileSync(f.jsonPath, SENTINEL); writeFileSync(f.mdPath, SENTINEL); }
function intactOutputs(f: ReturnType<typeof fixture>) { expect(readFileSync(f.jsonPath, "utf8")).toBe(SENTINEL); expect(readFileSync(f.mdPath, "utf8")).toBe(SENTINEL); }
async function positive(f: ReturnType<typeof fixture>) { const out = await reports.runOutcomeReportAsync(f.params); verified(f); expect(readFileSync(out.mdPath, "utf8")).toBe(reports.renderOutcomeReportMarkdown(out.report)); return out; }

describe("actual awaitable outcome-report artifact publication", () => {
  test("preserves the retained default Ed25519 JSON/Markdown bytes, legacy field order and raw digest signature", async () => {
    const f = fixture(), now = Date.now(); boundary.nonce = "cb645b1e-33dd-4ad1-8fde-a5e27127b7b1"; vi.spyOn(Date, "now").mockReturnValue(now);
    const legacy = reports.runOutcomeReport(f.params), before = { json: readFileSync(legacy.jsonPath), markdown: readFileSync(legacy.mdPath) };
    const { reportJsonSha256, reportSealSig, ...base } = legacy.report;
    expect(reportSealSig).toBe(sign(null, Buffer.from(sha256Hex(canonicalize(base)), "hex"), f.key).toString("base64"));
    expect(reportJsonSha256).toBe(sha256Hex(canonicalize(base))); verified(f);
    const expected = { reportId: base.reportId, agentId: "default", ts: now, windowStartTs: now - 86_400_000, windowEndTs: now,
      contractId: base.contractId, contractSignatureValid: true, trustLabel: "TRUSTED", valueScore: base.valueScore, categoryScores: base.categoryScores,
      economicSignificanceIndex: base.economicSignificanceIndex, valueRegressionRisk: base.valueRegressionRisk, observedCoverageRatio: base.observedCoverageRatio,
      metrics: base.metrics, nonClaims: base.nonClaims, reportJsonSha256, reportSealSig };
    expect(before.json.toString()).toBe(JSON.stringify(expected, null, 2));
    const spy = vi.spyOn(f.provider, "sign"), out = await positive(f);
    expect(readFileSync(out.jsonPath)).toEqual(before.json); expect(readFileSync(out.mdPath)).toEqual(before.markdown); expect(spy).toHaveBeenCalledTimes(1);
    expect(Buffer.from(spy.mock.calls[0]![1])).toEqual(Buffer.from(reportJsonSha256, "hex"));
  });

  test("uses the public default report loader and awaits real file signing outside the report lock with captured caller inputs", async () => {
    const f = fixture(), paused = pauseSign(f), input = { ...f.params }, pending = reports.runOutcomeReportAsync(input);
    try {
      await atPause(paused, pending); expect(existsSync(join(f.workspace, ".outcome-report.lock"))).toBe(false); expect(existsSync(f.jsonPath)).toBe(false);
      const ledger = openLedger(f.workspace); try { expect(ledger.getAllOutcomeEvents().length).toBeGreaterThan(0); } finally { ledger.close(); }
      input.outFile = "changed-caller.json"; input.window = "2d"; paused.release.resolve(); const out = await pending;
      expect(out.jsonPath).toBe(f.jsonPath); expect(existsSync(join(f.workspace, input.outFile))).toBe(false); verified(f);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
    const out = await reports.runOutcomeReportAsync({ ...f.params, outFile: undefined });
    expect(reports.loadOutcomeReport(f.workspace, "default", out.report.reportId)).toEqual(out.report); verified(f, out.jsonPath);
    const cli = await outcomesReportCliAsync(f.params); expect(cli.jsonPath).toBe(f.jsonPath); verified(f);
  });

  test.each(["json", "markdown"] as const)("refuses concurrent %s destination bytes without overwriting the competing output", async changed => {
    const f = fixture(), paused = pauseSign(f); seedOutputs(f); const beforeLog = readFileSync(transparencyLogPath(f.workspace));
    const pending = reports.runOutcomeReportAsync(f.params), outcome = pending.then(() => null, error => error), path = changed === "json" ? f.jsonPath : f.mdPath;
    try {
      await atPause(paused, pending); writeFileSync(path, "owned competing report bytes"); paused.release.resolve();
      expect(await outcome).toMatchObject({ message: "Outcome report destinations changed while signing was prepared" });
      expect(readFileSync(path, "utf8")).toBe("owned competing report bytes"); expect(readFileSync(changed === "json" ? f.mdPath : f.jsonPath, "utf8")).toBe(SENTINEL);
      expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(beforeLog);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
    await positive(f);
  });

  test.each(["contract", "previous report", "ledger row"] as const)("rechecks actual %s input after the final trusted callback before writing either report file", async changed => {
    const f = fixture(), contract = outcomeContractPath(f.workspace, "default"), previous = f.seed.jsonPath;
    const contractBytes = readFileSync(contract), previousBytes = readFileSync(previous); seedOutputs(f); let callbacks = 0;
    const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      await expect(reports.runOutcomeReportAsync(f.params, { beforePublish: () => {
        if (++callbacks !== 2) return;
        if (changed === "contract") { const value = YAML.parse(contractBytes.toString()); value.outcomeContract.title = "Owned newer contract"; writeFileSync(contract, YAML.stringify(value)); }
        if (changed === "previous report") { const value = JSON.parse(previousBytes.toString()); value.nonClaims.push("Owned newer baseline bytes"); writeFileSync(previous, JSON.stringify(value)); }
        if (changed === "ledger row") appendSignal(f.workspace);
      } })).rejects.toThrow(/^Outcome report inputs changed while signing was prepared$/);
      expect(callbacks).toBe(2); intactOutputs(f);
    } finally { writeFileSync(contract, contractBytes); writeFileSync(previous, previousBytes); }
    await positive(f);
  });

  test("rejects a genuinely newer committed session generation after the checked artifact signer returned", async () => {
    const f = fixture(), generation = assertKeysetComplete(f.workspace)!.generation; seedOutputs(f); let callbacks = 0;
    await expect(reports.runOutcomeReportAsync(f.params, { beforePublish: () => {
      if (++callbacks === 2) rotatePurposeKeys({ workspace: f.workspace, purposes: ["session"], passphrase: PASS });
    } })).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED", message: expect.stringContaining("the committed purpose authority changed while signing was prepared") });
    expect(callbacks).toBe(2); expect(assertKeysetComplete(f.workspace)!.generation).toBeGreaterThan(generation);
    expect(getSigningPublicKeyPem(f.workspace, "artifact-seal")).toBe(f.pem); intactOutputs(f); await positive(f);
  });

  test("initial no-sign refuses the async outcome report before any real provider Sign and restoration permits publication", async () => {
    const f = fixture(), spy = vi.spyOn(f.provider, "sign"), log = readFileSync(transparencyLogPath(f.workspace)); seedOutputs(f);
    vi.stubEnv("AMC_NO_SIGN", "1");
    try {
      await expect(reports.runOutcomeReportAsync(f.params)).rejects.toThrow(/^no-sign mode does not authorize outcome report signing$/);
      expect(spy).not.toHaveBeenCalled(); intactOutputs(f); expect(readFileSync(transparencyLogPath(f.workspace))).toEqual(log);
    } finally { vi.stubEnv("AMC_NO_SIGN", "0"); }
    await positive(f);
  });

  test.each(["lock", "policy", "no-sign"] as const)("refuses a real current %s change during Sign without report publication", async changed => {
    const f = fixture(), paused = pauseSign(f), configPath = join(f.workspace, ".amc", "amc.config.yaml"), configBefore = readFileSync(configPath); seedOutputs(f);
    const pending = reports.runOutcomeReportAsync(f.params), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending);
      if (changed === "lock") { lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); }
      if (changed === "policy") { const config = YAML.parse(configBefore.toString()); config.keys = { requireNonExportable: true }; writeFileSync(configPath, YAML.stringify(config)); }
      if (changed === "no-sign") vi.stubEnv("AMC_NO_SIGN", "1");
      paused.release.resolve(); expect(await outcome).toBeInstanceOf(Error); intactOutputs(f);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); writeFileSync(configPath, configBefore); vi.stubEnv("AMC_NO_SIGN", "0");
      vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    await positive(f);
  });

  test("refuses initial trusted-actor failure before any provider call and corrupt real provider crypto before publication", async () => {
    const f = fixture(), actual = f.provider.sign.bind(f.provider), spy = vi.spyOn(f.provider, "sign"); seedOutputs(f);
    await expect(reports.runOutcomeReportAsync(f.params, { beforePublish: () => { throw new Error("owned actor refused"); } })).rejects.toThrow(/^owned actor refused$/);
    expect(spy).not.toHaveBeenCalled(); intactOutputs(f);
    spy.mockImplementationOnce(async (ref, bytes) => { const signature = Buffer.from(await actual(ref, bytes)); signature[0] = signature[0]! ^ 1; return signature; });
    await expect(reports.runOutcomeReportAsync(f.params)).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" }); intactOutputs(f); await positive(f);
  });

  test("retains the actually written JSON and original cause if the Markdown atomic writer then fails", async () => {
    const f = fixture(), actualWrite = files.writeFileAtomic, cause = new Error("owned Markdown writer refused"); seedOutputs(f);
    const spy = vi.spyOn(files, "writeFileAtomic").mockImplementation((path, bytes, mode) => { if (path === f.mdPath) throw cause; actualWrite(path, bytes, mode); });
    try {
      await expect(reports.runOutcomeReportAsync(f.params)).rejects.toMatchObject({ code: "OUTCOME_REPORT_PUBLICATION_INCOMPLETE", publishedFiles: [f.jsonPath], cause });
      verified(f); expect(readFileSync(f.mdPath, "utf8")).toBe(SENTINEL);
    } finally { spy.mockRestore(); }
    await positive(f);
  });

  test("retains both published files and native cause when synchronous transparency fails after releasing the report lock", async () => {
    const f = fixture(), actualWrite = files.writeFileAtomic; let logLock: boolean | undefined;
    const spy = vi.spyOn(files, "writeFileAtomic").mockImplementation((path, bytes, mode) => {
      if (path === transparencySealPath(f.workspace)) logLock = existsSync(join(f.workspace, ".outcome-report.lock"));
      actualWrite(path, bytes, mode); if (path === f.mdPath) { lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); }
    });
    try {
      await expect(reports.runOutcomeReportAsync(f.params)).rejects.toMatchObject({ code: "OUTCOME_REPORT_PUBLICATION_INCOMPLETE", publishedFiles: [f.jsonPath, f.mdPath], cause: expect.any(Error) });
      verified(f); expect(readFileSync(f.mdPath, "utf8")).toBe(reports.renderOutcomeReportMarkdown(verified(f)));
      expect(logLock).toBe(false); expect(existsSync(join(f.workspace, ".outcome-report.lock"))).toBe(false);
    } finally { spy.mockRestore(); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
  });

  test.each(["revoked token", "changed roles"] as const)("the real Studio viewer report caller rechecks a %s after Sign and before publication", async changed => {
    const f = fixture(); initUsersConfig({ workspace: f.workspace, username: "report-owner", password: "report-owner-password" });
    const viewer = addUser({ workspace: f.workspace, username: "report-viewer", roles: ["VIEWER"], password: "report-viewer-password" });
    const session = createSession({ workspace: f.workspace, user: viewer }), api = await startStudioApiServer({ workspace: f.workspace, host: "127.0.0.1", port: 0, token: "report-admin" }); servers.push(api);
    const get = (admin = false) => fetch(api.url + "/outcomes/report?window=1d", { headers: admin ? { "x-amc-admin-token": "report-admin" } : { cookie: `amc_session=${encodeURIComponent(session.token)}` } });
    const first = await get(), firstBody = await first.json() as { jsonPath: string }; expect(first.status).toBe(200); verified(f, firstBody.jsonPath);
    const before = readdirSync(f.dir).sort(), paused = pauseSign(f), pending = get();
    try {
      await atPause(paused, pending);
      if (changed === "revoked token") revokeSessionByToken({ workspace: f.workspace, token: session.token });
      else setUserRoles({ workspace: f.workspace, username: "report-viewer", roles: ["AGENT"] });
      expect(verifyTrackedSessionToken({ workspace: f.workspace, token: session.token }).ok).toBe(false); paused.release.resolve();
      const denied = await pending, text = await denied.text(); expect(denied.status).toBe(401); expect(text).toContain("authenticated authority changed while signing");
      expect(text).not.toContain('"reportSealSig"'); expect(readdirSync(f.dir).sort()).toEqual(before);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
    const fresh = await get(true), body = await fresh.json() as { jsonPath: string }; expect(fresh.status).toBe(200); verified(f, body.jsonPath);
  });
});

test.skipIf(process.platform === "win32")("compiled outcomes report CLI awaits the actual file provider and never invokes the synchronous report API", async () => {
  const f = fixture(), repo = fileURLToPath(new URL("../../", import.meta.url)), requests = join(f.root, "cli-report-signatures.jsonl"); writeFileSync(requests, "");
  const reportUrl = pathToFileURL(join(repo, "dist/outcomes/outcomeReport.js")).href, fileUrl = pathToFileURL(join(repo, "dist/keys/providers/file.js")).href;
  const loader = join(f.root, "owned-outcome-report-loader.mjs");
  writeFileSync(loader, `export async function resolve(specifier, context, next) {
    if (["@aws-sdk/", "@google-cloud/", "@azure/", "pkcs11js", "agent-maturity-compass-key-provider-pkcs11"].some(prefix => specifier.startsWith(prefix))) throw new Error("owned report CLI refuses real SDK/native imports");
    return next(specifier, context);
  }
  export async function load(url, context, next) {
    const result = await next(url, context); if (url !== ${JSON.stringify(reportUrl)} && url !== ${JSON.stringify(fileUrl)}) return result;
    const source = typeof result.source === "string" ? result.source : Buffer.from(result.source).toString("utf8");
    const suffix = url === ${JSON.stringify(reportUrl)} ? '\\nrunOutcomeReport = () => { throw new Error("owned report CLI denies synchronous report producer"); };\\n'
      : '\\nconst ownedFile = fileKeyProvider; fileKeyProvider = (...args) => { const provider = ownedFile(...args), actual = provider.sign.bind(provider); provider.sign = async (ref, bytes) => { const signature = await actual(ref, bytes); const fs = await import("node:fs"); fs.appendFileSync(process.env.P208_REPORT_SIGN_CALLS, JSON.stringify({ref,hex:Buffer.from(bytes).toString("hex")}) + "\\\\n"); return signature; }; return provider; };\\n';
    return { ...result, source: source + suffix };
  }`);
  const env = { ...process.env, NO_COLOR: "1", NODE_OPTIONS: `--experimental-loader=${pathToFileURL(loader).href}`, P208_REPORT_SIGN_CALLS: requests };
  const denied = await spawnOwnedNode(["--input-type=module", "--eval", `import { runOutcomeReport } from ${JSON.stringify(reportUrl)}; runOutcomeReport({});`], { cwd: f.workspace, env }).wait(15_000);
  expect(denied.code).toBe(1); expect(denied.stderr).toContain("owned report CLI denies synchronous report producer"); expect(readFileSync(requests, "utf8")).toBe("");
  const result = await spawnOwnedNode([resolve(repo, "dist/cli.js"), "outcomes", "report", "--window", "1d", "--out", "cli-report.json"], { cwd: f.workspace, env }).wait(30_000);
  expect(result.error).toBeUndefined(); expect(result.signal).toBeNull(); expect(result.code, result.stderr).toBe(0);
  const match = /Outcome report generated: (.+)/.exec(result.stdout); expect(match).not.toBeNull(); const output = match![1]!.trim(), report = verified(f, output);
  const calls = readFileSync(requests, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  expect(calls).toEqual([{ ref: { provider: "file", id: "artifact-seal" }, hex: report.reportJsonSha256 }]);
}, 60_000);
