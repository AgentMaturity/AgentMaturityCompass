import { generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as composition from "../../src/fleet/trustComposition.js";
import type { DiagnosticReport } from "../../src/types.js";
import { getSigningKey, getSigningPublicKeyPem } from "../../src/crypto/keys.js";
import { loadKeyProvider } from "../../src/keys/purposeProviders.js";
import { rotatePurposeKeys } from "../../src/keys/purposeKeys.js";
import { assertKeysetComplete } from "../../src/keys/keyset.js";
import { KeyProviderError } from "../../src/keys/provider.js";
import { initWorkspace } from "../../src/workspace.js";
import { lockVault, unlockVault } from "../../src/vault/vault.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";

const PASS = "owned-trust-composition-passphrase", roots: Array<{ root: string; workspace: string }> = [];
type Options = { noSign?: boolean; markdownFile?: string };
type Generate = (workspace: string, reports: DiagnosticReport[], options?: Options) => Promise<{ report: composition.TrustCompositionReport; reportPath: string }>;
function generate(workspace: string, reports: DiagnosticReport[], options?: Options) {
  const producer = Reflect.get(composition, "generateTrustCompositionReportAsync") as Generate | undefined;
  expect(producer, "the maintained async composition producer must exist").toBeTypeOf("function");
  return producer!(workspace, reports, options);
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const f of roots.splice(0)) { lockVault(f.workspace); rmSync(f.root, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "amc-async-composition-")), workspace = join(root, "workspace"); roots.push({ root, workspace });
  vi.stubEnv("AMC_HOME", join(root, "home")); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); vi.stubEnv("AMC_NO_SIGN", "0");
  vi.stubEnv("AMC_SESSION_STORE", "sqlite"); vi.stubEnv("AMC_EXPECTED_MONITOR_FINGERPRINT", undefined);
  initWorkspace({ workspacePath: workspace, trustBoundaryMode: "isolated" }); composition.initTrustComposition(workspace);
  return { root, workspace, provider: loadKeyProvider(workspace, "file"), markdown: join(workspace, "trust.md"),
    privateKey: getSigningKey(workspace, "artifact-seal"), publicKey: getSigningPublicKeyPem(workspace, "artifact-seal") };
}
/** Explicit precomputed input data, not a claim that the diagnostic pipeline ran or authenticated these values. */
function input(): DiagnosticReport {
  return { agentId: "default", runId: "owned_precomputed_input", ts: 1, windowStartTs: 0, windowEndTs: 1,
    status: "UNSIGNED", verificationPassed: false, trustBoundaryViolated: false, trustBoundaryMessage: null,
    integrityIndex: 0, trustLabel: "UNRELIABLE — DO NOT USE FOR CLAIMS", targetProfileId: null,
    layerScores: [{ layerName: "Skills", avgFinalLevel: 1.25, confidenceWeightedFinalLevel: 1.25 }], questionScores: [],
    inflationAttempts: [], unsupportedClaimCount: 0, contradictionCount: 0, correlationRatio: 0, invalidReceiptsCount: 0,
    correlationWarnings: ["owned precomputed input only"], evidenceCoverage: 0,
    evidenceTrustCoverage: { observed: 0, attested: 0, selfReported: 0 }, targetDiff: [], prioritizedUpgradeActions: [],
    evidenceToCollectNext: [], runSealSig: "unsigned", reportJsonSha256: "" };
}
function published(f: ReturnType<typeof fixture>) {
  const directory = join(f.workspace, ".amc", "reports");
  return existsSync(directory) ? readdirSync(directory).filter(name => name.startsWith("trust-composition-")).sort()
    .map(name => ({ name, bytes: readFileSync(join(directory, name), "utf8") })) : [];
}
function verifyReport(f: ReturnType<typeof fixture>, result: Awaited<ReturnType<Generate>>) {
  const { reportJsonSha256, reportSealSig, ...body } = result.report;
  const hash = sha256Hex(Buffer.from(canonicalize(body), "utf8")), bytes = Buffer.from(hash, "hex");
  expect(reportJsonSha256).toBe(hash); expect(Object.keys(result.report)).toEqual([
    "reportId", "ts", "agentResults", "contradictions", "dagValid", "dagCycles", "fleetCompositeScore", "fleetWeakestLink", "reportJsonSha256", "reportSealSig"]);
  expect(reportSealSig).toBe(sign(null, bytes, f.privateKey).toString("base64"));
  expect(verify(null, bytes, f.publicKey, Buffer.from(reportSealSig, "base64"))).toBe(true);
  expect(verify(null, bytes, generateKeyPairSync("ed25519").publicKey, Buffer.from(reportSealSig, "base64"))).toBe(false);
  expect(readFileSync(result.reportPath, "utf8")).toBe(JSON.stringify(result.report, null, 2));
  expect(readFileSync(f.markdown, "utf8")).toBe(composition.renderTrustCompositionMarkdown(result.report)); return bytes;
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function pauseSign(f: ReturnType<typeof fixture>) {
  const entered = deferred(), release = deferred(), original = f.provider.sign.bind(f.provider);
  const spy = vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, bytes) => {
    const signature = await original(ref, bytes); entered.resolve(); await release.promise; return signature;
  }); return { entered, release, spy };
}
async function atPause(paused: ReturnType<typeof pauseSign>, pending: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([paused.entered.promise, pending.then(() => { throw new Error("composition settled before real provider Sign"); }, error => { throw error; }),
    new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("composition did not enter real provider Sign")), 5_000); })]);
  } finally { clearTimeout(timer); }
}
async function fresh(f: ReturnType<typeof fixture>) {
  const result = await generate(f.workspace, [input()], { markdownFile: "trust.md" }); verifyReport(f, result); return result;
}

describe("trust composition checked async report publication", () => {
  test("preserves the existing report wire and exact raw-digest Ed25519 signature through the real file provider", async () => {
    const f = fixture(), spy = vi.spyOn(f.provider, "sign"), result = await fresh(f), bytes = verifyReport(f, result);
    expect(spy).toHaveBeenCalledTimes(1); expect(spy.mock.calls[0]![0]).toEqual({ provider: "file", id: "artifact-seal" });
    expect(Buffer.from(spy.mock.calls[0]![1])).toEqual(bytes); expect(bytes).toHaveLength(32);
    expect(result.report.agentResults[0]!.ownIntegrityIndex).toBe(0);
  });

  test("awaits real signing and snapshots nested reports and the Markdown destination before the await", async () => {
    const f = fixture(), paused = pauseSign(f), report = input(), reports = [report], options = { markdownFile: "trust.md" };
    const pending = generate(f.workspace, reports, options), outcome = pending.then(value => ({ value }), error => ({ error }));
    try {
      await atPause(paused, pending); expect(published(f)).toEqual([]); expect(existsSync(f.markdown)).toBe(false);
      report.integrityIndex = 1; report.layerScores[0]!.avgFinalLevel = 5; reports.push({ ...input(), agentId: "mutated" }); options.markdownFile = "mutated.md";
      paused.release.resolve(); const settled = await outcome; expect(settled).not.toHaveProperty("error");
      const result = (settled as { value: Awaited<ReturnType<Generate>> }).value; verifyReport(f, result);
      expect(result.report.agentResults).toHaveLength(1); expect(result.report.agentResults[0]!.ownIntegrityIndex).toBe(0);
      expect(result.report.agentResults[0]!.ownOverallScore).toBe(1.25);
      expect(existsSync(join(f.workspace, "mutated.md"))).toBe(false);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
  });

  test("propagates a typed provider refusal without publishing an unsigned replacement", async () => {
    const f = fixture(), error = new KeyProviderError("KEY_PROVIDER_UNAVAILABLE", "file", "owned fixed failure");
    vi.spyOn(f.provider, "sign").mockRejectedValueOnce(error);
    await expect(generate(f.workspace, [input()], { markdownFile: "trust.md" })).rejects.toMatchObject({ code: "KEY_PROVIDER_UNAVAILABLE" });
    expect(published(f)).toEqual([]); expect(existsSync(f.markdown)).toBe(false); await fresh(f);
  });

  test("rejects corrupted real returned signature bytes before publishing either report", async () => {
    const f = fixture(), original = f.provider.sign.bind(f.provider);
    vi.spyOn(f.provider, "sign").mockImplementationOnce(async (ref, bytes) => { const signature = Buffer.from(await original(ref, bytes)); signature[0] = signature[0]! ^ 1; return signature; });
    await expect(generate(f.workspace, [input()], { markdownFile: "trust.md" })).rejects.toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED" });
    expect(published(f)).toEqual([]); expect(existsSync(f.markdown)).toBe(false); await fresh(f);
  });

  test("refuses a lock after real Sign and leaves outputs absent before a fresh positive", async () => {
    const f = fixture(), paused = pauseSign(f), pending = generate(f.workspace, [input()], { markdownFile: "trust.md" }), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined); paused.release.resolve();
      expect(await outcome).toMatchObject({ message: expect.stringMatching(/Vault locked/i) }); expect(published(f)).toEqual([]); expect(existsSync(f.markdown)).toBe(false);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    await fresh(f);
  });

  test("refuses an unrelated committed generation change even when the artifact key and real signature remain valid", async () => {
    const f = fixture(), paused = pauseSign(f), generation = assertKeysetComplete(f.workspace)!.generation;
    const pending = generate(f.workspace, [input()], { markdownFile: "trust.md" }), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); rotatePurposeKeys({ workspace: f.workspace, purposes: ["session"], passphrase: PASS });
      expect(assertKeysetComplete(f.workspace)!.generation).toBeGreaterThan(generation); expect(getSigningPublicKeyPem(f.workspace, "artifact-seal")).toBe(f.publicKey);
      paused.release.resolve(); expect(await outcome).toMatchObject({ code: "KEY_PROVIDER_KEY_REFUSED",
        message: expect.stringContaining("the committed purpose authority changed while signing was prepared") });
      expect(published(f)).toEqual([]); expect(existsSync(f.markdown)).toBe(false);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
    await fresh(f);
  });

  test("refuses current composition configuration drift after signing instead of publishing the earlier policy result", async () => {
    const f = fixture(), paused = pauseSign(f), file = join(f.workspace, ".amc", "trust-composition.yaml"), original = readFileSync(file);
    const pending = generate(f.workspace, [input()], { markdownFile: "trust.md" }), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); const config = composition.loadTrustCompositionConfig(f.workspace); config.defaultWeight = 0.5;
      composition.saveTrustCompositionConfig(f.workspace, config); paused.release.resolve();
      expect(await outcome).toMatchObject({ message: "trust composition inputs changed while signing" }); expect(published(f)).toEqual([]); expect(existsSync(f.markdown)).toBe(false);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); writeFileSync(file, original); }
    await fresh(f);
  });

  test("preserves a concurrent Markdown replacement during real Sign and refuses both report writes", async () => {
    const f = fixture(), paused = pauseSign(f), original = Buffer.from("owned original Markdown"), concurrent = Buffer.from("owned concurrent Markdown");
    writeFileSync(f.markdown, original);
    const pending = generate(f.workspace, [input()], { markdownFile: "trust.md" }), outcome = pending.then(() => null, error => error);
    try {
      await atPause(paused, pending); writeFileSync(f.markdown, concurrent); paused.release.resolve();
      expect(await outcome).toMatchObject({ message: "trust composition output changed while signing" });
      expect(readFileSync(f.markdown)).toEqual(concurrent); expect(published(f)).toEqual([]);
    } finally { paused.release.resolve(); await Promise.allSettled([pending]); }
    await fresh(f);
  });

  test("preserves a concurrent JSON creation after checked signing and actual serialization before publication", async () => {
    const f = fixture(), directory = join(f.workspace, ".amc", "reports"), concurrent = Buffer.from("owned concurrent JSON target");
    mkdirSync(directory, { recursive: true }); const stringify = JSON.stringify; let target: string | undefined;
    const spy = vi.spyOn(JSON, "stringify").mockImplementation(((...args: unknown[]) => {
      const bytes = Reflect.apply(stringify, JSON, args) as string | undefined, value = args[0] as Record<string, unknown> | null;
      if (target === undefined && value !== null && typeof value === "object" && typeof value.reportId === "string" && value.reportId.startsWith("tcr_") && typeof value.reportSealSig === "string") {
        target = join(directory, `trust-composition-${value.reportId}.json`); writeFileSync(target, concurrent);
      } return bytes;
    }) as typeof JSON.stringify);
    try {
      await expect(generate(f.workspace, [input()], { markdownFile: "trust.md" })).rejects.toMatchObject({ message: "trust composition output changed while signing" });
      expect(target).toBeDefined(); expect(readFileSync(target!)).toEqual(concurrent); expect(existsSync(f.markdown)).toBe(false);
    } finally { spy.mockRestore(); }
    await fresh(f); expect(readFileSync(target!)).toEqual(concurrent);
  });

  test("refuses a Markdown alias of the exact composition config before provider Sign without overwriting its bytes", async () => {
    const f = fixture(), file = join(f.workspace, ".amc", "trust-composition.yaml"), before = readFileSync(file), spy = vi.spyOn(f.provider, "sign");
    await expect(generate(f.workspace, [input()], { markdownFile: file })).rejects.toMatchObject({ message: "trust composition output aliases protected report inputs" });
    expect(spy).not.toHaveBeenCalled(); expect(readFileSync(file)).toEqual(before); expect(published(f)).toEqual([]); await fresh(f);
  });

  test("rechecks the producer authority after checked signing and actual JSON serialization before the first output write", async () => {
    const f = fixture(), stringify = JSON.stringify; let reached = false;
    const spy = vi.spyOn(JSON, "stringify").mockImplementation(((...args: unknown[]) => {
      const bytes = Reflect.apply(stringify, JSON, args) as string | undefined, value = args[0] as Record<string, unknown> | null;
      if (!reached && value !== null && typeof value === "object" && typeof value.reportId === "string" && value.reportId.startsWith("tcr_") && typeof value.reportSealSig === "string") {
        reached = true; lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
      } return bytes;
    }) as typeof JSON.stringify);
    try {
      await expect(generate(f.workspace, [input()], { markdownFile: "trust.md" })).rejects.toMatchObject({ message: expect.stringMatching(/Vault locked/i) });
      expect(reached).toBe(true); expect(published(f)).toEqual([]); expect(existsSync(f.markdown)).toBe(false);
    } finally { spy.mockRestore(); vi.stubEnv("AMC_VAULT_PASSPHRASE", PASS); unlockVault(f.workspace, PASS); }
    await fresh(f);
  });

  test("preserves explicit unsigned publication with a locked vault and the original synchronous catch-to-unsigned API", async () => {
    const f = fixture(), spy = vi.spyOn(f.provider, "sign"); lockVault(f.workspace); vi.stubEnv("AMC_VAULT_PASSPHRASE", undefined);
    const legacy = composition.computeTrustComposition(f.workspace, [input()]); expect(legacy.reportSealSig).toBe("unsigned");
    const result = await generate(f.workspace, [input()], { noSign: true, markdownFile: "trust.md" });
    expect(result.report.reportSealSig).toBe("unsigned"); expect(spy).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(result.reportPath, "utf8"))).toEqual(result.report);
    expect(readFileSync(f.markdown, "utf8")).toBe(composition.renderTrustCompositionMarkdown(result.report));
  });
});
