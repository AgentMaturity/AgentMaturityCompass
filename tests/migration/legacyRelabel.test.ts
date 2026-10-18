import { createHash } from "node:crypto";
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { envelopeForExecutedTest } from "../../src/claims/eligibility/adapters/results.js";
import { verifyEvidenceBundle } from "../../src/bundles/bundle.js";
import { addPublicKeyToHistory, getPublicKeyPem, verifyKeyHistoryChain } from "../../src/crypto/keys.js";
import { verifySignedDigest } from "../../src/crypto/signing/signer.js";
import type { SignedDigest } from "../../src/crypto/signing/signerTypes.js";
import { openLedger, verifyLedgerIntegrity } from "../../src/ledger/ledger.js";
import { assuranceReportClaim, classifyLegacyArtifact } from "../../src/migration/legacy/classify.js";
import { CURRENT_LEGACY_NOTICE } from "../../src/migration/legacy/notices.js";
import { attestedLogHead, RECEIPTS_DIR, receiptNames } from "../../src/migration/legacy/receipt.js";
import { RELABEL_LOG, verifyRelabelLog } from "../../src/migration/legacy/relabelLog.js";
import { relabelLegacyArtifacts } from "../../src/migration/legacy/scan.js";
import { extractValidatedTarGzipArchive, inspectTarGzipArchive } from "../../src/security/safeTarArchive.js";
import { closeSqlitePool, sqlitePoolStats } from "../../src/storage/sqlitePool.js";
import { loadTrustContext, withPins } from "../../src/trust/trustContext.js";
import { ed25519KeyId } from "../../src/trust/trustList.js";
import type { AssuranceReport } from "../../src/types.js";
import { lockVault } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

const CHECKOUT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const NOW = Date.UTC(2026, 9, 16, 12);
type ErrorFact = { name: string; message: string; stack: string | null; causes?: ErrorFact[] };
type Snapshot = { relative: string; bytes: number; sha256: string }[];
type Owned = { root: string; facts: Record<string, unknown>; checks: Array<() => void> };
const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const environmentDigest = () => digest(JSON.stringify(Object.entries(process.env).sort(([a], [b]) => a.localeCompare(b))));
function errorFact(error: unknown): ErrorFact {
  const clean = (value: string) => value.replaceAll("amc-test-passphrase", "[owned-test-passphrase]")
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[private-key]");
  return { name: error instanceof Error ? error.name : typeof error,
    message: clean(error instanceof Error ? error.message : String(error)),
    stack: error instanceof Error && error.stack ? clean(error.stack) : null,
    ...(error instanceof AggregateError ? { causes: error.errors.map(errorFact) } : {}) };
}
function nativeIdentity() {
  const path = realpathSync(join(CHECKOUT, "node_modules/better-sqlite3/build/Release/better_sqlite3.node"));
  const stat = statSync(path);
  if (!stat.isFile()) throw new Error("Owned migration runtime native is not a regular file");
  return { path, bytes: stat.size, dev: stat.dev, inode: stat.ino, sha256: digest(readFileSync(path)) };
}
function snapshot(root: string, paths: readonly string[]): Snapshot {
  return paths.map(relative => {
    const bytes = readFileSync(join(root, relative));
    return { relative, bytes: bytes.length, sha256: digest(bytes) };
  });
}
function changed(before: Snapshot, after: Snapshot): string[] {
  return before.filter((row, index) => JSON.stringify(row) !== JSON.stringify(after[index])).map(row => row.relative);
}
async function owned(label: string, initialize: boolean, body: (f: Owned) => Promise<void> | void): Promise<void> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "amc-p135-legacy-")));
  const f: Owned = { root, facts: {}, checks: [] }, beforeEnvironment = environmentDigest();
  const cleanupErrors: unknown[] = [];
  let bodyFailed = false, bodyError: unknown, initialized = false, vaultLocked = false;
  let beforeNative: ReturnType<typeof nativeIdentity> | null = null, afterNative: ReturnType<typeof nativeIdentity> | null = null;
  try {
    beforeNative = nativeIdentity();
    if (initialize) { initWorkspace({ workspacePath: root, trustBoundaryMode: "isolated" }); initialized = true; }
    await body(f);
  } catch (error) { bodyFailed = true; bodyError = error; }
  finally {
    for (const check of f.checks) { try { check(); } catch (error) { cleanupErrors.push(error); } }
    try {
      const key = `ledger:${root}:${join(root, ".amc/evidence.sqlite")}`, pool = sqlitePoolStats(key);
      if (pool && pool.active !== 0) throw new Error("Owned migration pool still has an active lease");
      if (pool) closeSqlitePool(key);
      f.facts.ownedLedgerPoolClosed = sqlitePoolStats(key) === null;
    } catch (error) { cleanupErrors.push(error); }
    try { lockVault(root); vaultLocked = true; } catch (error) { cleanupErrors.push(error); }
    try {
      afterNative = nativeIdentity();
      if (beforeNative !== null && JSON.stringify(beforeNative) !== JSON.stringify(afterNative)) throw new Error("Owned migration runtime native changed");
    } catch (error) { cleanupErrors.push(error); }
    const environmentUnchanged = beforeEnvironment === environmentDigest();
    if (!environmentUnchanged) cleanupErrors.push(new Error("Owned migration fixture changed its environment"));
    try {
      const genuine = f.facts.genuineHistoricalFixture === true;
      const record = { schema: "amc-p135-legacy-relabel/1", label, origin: genuine ? "tag-generated-originals" : "synthetic-edge", genuineHistoricalFixture: genuine,
        checkout: CHECKOUT, retainedRoot: root, observations: f.facts, nativeBefore: beforeNative, nativeAfter: afterNative,
        lifecycle: { initialized, vaultLocked }, environmentUnchanged, childProcessCreatedByFixture: genuine ? null : false,
        delegatedTarAPIInvoked: f.facts.fixtureTarUsed === true,
        signalsSentByFixture: false, bodyFailed, bodyError: bodyFailed ? errorFact(bodyError) : null,
        cleanupErrors: cleanupErrors.map(errorFact), boundary: genuine
          ? "Exact tag-generated bytes; imported fixture trust proves only the actual reported integrity result, never historical provenance"
          : "Synthetic source-contract cohort; no genuine tag corpus or historical integrity qualification" };
      const path = join(root, "public-evidence.json");
      writeFileSync(path, JSON.stringify(record, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      console.log("AMC_P135_LEGACY_PUBLIC_EVIDENCE " + path);
    } catch (error) { cleanupErrors.push(error); console.log("AMC_P135_LEGACY_RETAINED_ROOT " + root); }
  }
  if (cleanupErrors.length) throw new AggregateError(bodyFailed ? [bodyError, ...cleanupErrors] : cleanupErrors, "Owned migration cleanup failed");
  if (bodyFailed) throw bodyError;
}
function currentEnvelope() {
  return envelopeForExecutedTest({ producer: "synthetic-current-observed-control", measured: 1,
    result: "pass", sealVerified: null, evidenceRefs: ["synthetic-control"], now: NOW });
}
function postfixReport(): AssuranceReport {
  return { assuranceRunId: "synthetic-postfix-assurance", agentId: "default", ts: NOW, mode: "sandbox",
    windowStartTs: NOW, windowEndTs: NOW, trustTier: "OBSERVED", status: "VALID", verificationPassed: true,
    packResults: [], overallScore0to100: 0, integrityIndex: 0, trustLabel: "HIGH TRUST", reportJsonSha256: "0".repeat(64),
    runSealSig: "synthetic-unverified-seal", evidenceStatus: "MEASURED" };
}
function syntheticOriginals(root: string): string[] {
  const diagnostic = ".amc/runs/synthetic-legacy-diagnostic.json", assurance = ".amc/reports/assurance/synthetic-canned.json";
  mkdirSync(join(root, ".amc/runs"), { recursive: true }); mkdirSync(join(root, ".amc/reports/assurance"), { recursive: true });
  writeFileSync(join(root, diagnostic), JSON.stringify({ methodology: { amcVersion: "1.1.1" },
    layerScores: [{ avgFinalLevel: 3 }], trustLabel: "SYNTHETIC EDGE ONLY" }) + "\n", { flag: "wx", mode: 0o600 });
  writeFileSync(join(root, assurance), JSON.stringify({ assuranceRunId: "synthetic-canned-edge", trustTier: "OBSERVED",
    trustLabel: "SYNTHETIC EDGE ONLY" }) + "\n", { flag: "wx", mode: 0o600 });
  return [diagnostic, assurance, ".amc/evidence.sqlite"];
}
function ownTrust(root: string) {
  return loadTrustContext({ amcHome: join(root, "owned-operator-home"), env: {},
    pubkey: { path: join(root, ".amc/keys/monitor_ed25519.pub"), purposes: ["ledger-row"] } });
}
function receiptClock() {
  let offset = 0;
  // The documented timestamp callback only: no global clock replacement or waiting.
  return () => new Date(NOW + offset++);
}

const CORPUS_NAMES = ["diagnostic-report.json", "assurance-report.json", "trust-certificate.json", "passport.amcpass",
  "run.amcbundle", "domain-report.md", "ledger-observation.json", "evidence.sqlite"] as const;
const FIXTURE_NAMES = ["README.md", "generation.log", "originals.tar.gz", "provenance.json"];
const OLD_COMMIT = "ff53902225ff276c55558d5ca17a8fc60b780655";
type CorpusName = typeof CORPUS_NAMES[number];
type BytesPin = { bytes: number; sha256: string };
type LegacyProvenance = {
  schema: string; oldCommit: string; candidates: Array<{ name: string; origin: string; source: BytesPin; rawCopy: BytesPin }>;
  commands: Array<{ label: string; exitCode: number; signal: string | null; finishedAt: string; launchError?: string }>;
  gaps: Array<{ step: string; reason: string }>; fatal: unknown;
  storage: { format: string; rawOriginalBytes: number; archive: BytesPin };
};
function decodeCorpus(f: Owned) {
  f.facts.genuineHistoricalFixture = true;
  const fixture = join(CHECKOUT, "tests/fixtures/legacy-1.1.1");
  if (JSON.stringify(readdirSync(fixture).sort()) !== JSON.stringify(FIXTURE_NAMES)) throw new Error("Legacy fixture file selection changed");
  for (const name of FIXTURE_NAMES) {
    const st = lstatSync(join(fixture, name));
    if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1) throw new Error("Legacy fixture is not a distinct regular file");
  }
  const encodedBefore = snapshot(fixture, FIXTURE_NAMES), storedBytes = encodedBefore.reduce((sum, row) => sum + row.bytes, 0);
  f.facts.encodedFixtureBytes = storedBytes; f.facts.encodedFixtureBefore = encodedBefore;
  f.checks.push(() => {
    const after = snapshot(fixture, FIXTURE_NAMES); f.facts.encodedFixtureAfter = after;
    if (changed(encodedBefore, after).length) throw new Error("Encoded legacy fixture bytes changed");
  });
  if (storedBytes >= 1_000_000) throw new Error("Stored legacy corpus exceeds its exclusive byte cap");
  const provenance = JSON.parse(readFileSync(join(fixture, "provenance.json"), "utf8")) as LegacyProvenance;
  if (provenance.schema !== "amc-legacy-fixture-generation/2" || provenance.oldCommit !== OLD_COMMIT || provenance.fatal !== null)
    throw new Error("Legacy fixture provenance does not bind the reviewed tag generation");
  if (JSON.stringify(provenance.candidates.map(row => row.name).sort()) !== JSON.stringify([...CORPUS_NAMES].sort()))
    throw new Error("Legacy fixture must retain all eight generated originals");
  if (!provenance.commands.length || provenance.commands.some(row => row.signal !== null || row.launchError || !row.finishedAt || ![0, 1].includes(row.exitCode)))
    throw new Error("Legacy fixture generation has an unclosed command");
  const rawBytes = provenance.candidates.reduce((sum, row) => sum + row.source.bytes, 0);
  if (provenance.storage.format !== "tar-gzip" || provenance.storage.rawOriginalBytes !== rawBytes)
    throw new Error("Legacy storage encoding lost its raw byte authority");
  for (const row of provenance.candidates) {
    if (!Number.isSafeInteger(row.source.bytes) || row.source.bytes <= 0 || !/^[a-f0-9]{64}$/.test(row.source.sha256)
      || row.rawCopy.bytes !== row.source.bytes || row.rawCopy.sha256 !== row.source.sha256)
      throw new Error("Legacy original and raw-copy pins disagree");
  }
  const archive = join(fixture, "originals.tar.gz"), archived = encodedBefore.find(row => row.relative === "originals.tar.gz")!;
  if (archived.bytes !== provenance.storage.archive.bytes || archived.sha256 !== provenance.storage.archive.sha256)
    throw new Error("Legacy storage archive differs from its generation record");
  const limits = { maxEntries: 8, maxCompressedBytes: 999_999, maxEntryBytes: Math.max(...provenance.candidates.map(row => row.source.bytes)),
    maxTotalBytes: rawBytes, maxPathBytes: 128 };
  f.facts.fixtureTarUsed = true;
  const inspected = inspectTarGzipArchive({ file: archive, label: "legacy originals outer storage", limits });
  if (JSON.stringify([...inspected.members].sort()) !== JSON.stringify([...CORPUS_NAMES].sort()))
    throw new Error("Legacy archive member allowlist differs");
  const decoded = join(f.root, "decoded-originals"); mkdirSync(decoded, { mode: 0o700 });
  extractValidatedTarGzipArchive({ file: archive, destination: decoded, label: "legacy originals outer storage", limits });
  const decodedBefore = snapshot(decoded, CORPUS_NAMES);
  for (const row of decodedBefore) {
    const stat = lstatSync(join(decoded, row.relative)), expected = provenance.candidates.find(item => item.name === row.relative)!;
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || row.bytes !== expected.source.bytes || row.sha256 !== expected.source.sha256)
      throw new Error("Decoded legacy original differs from its exact raw generation pin");
  }
  f.facts.decodedOriginalsBefore = decodedBefore; f.facts.rawOriginalBytes = rawBytes;
  f.facts.generationGaps = provenance.gaps; f.facts.historicalSourceCommit = OLD_COMMIT;
  f.facts.commandClosures = provenance.commands.map(row => ({ label: row.label, exitCode: row.exitCode, signal: row.signal }));
  f.checks.push(() => {
    const after = snapshot(decoded, CORPUS_NAMES); f.facts.decodedOriginalsAfter = after;
    if (changed(decodedBefore, after).length) throw new Error("Decoded legacy originals changed");
  });
  const path = (name: CorpusName) => join(decoded, name);
  return { decoded, provenance, path };
}

function fixtureTrust(f: Owned, corpus: ReturnType<typeof decodeCorpus>) {
  const bundleRoot = join(f.root, "bundle-public-view"); mkdirSync(bundleRoot, { mode: 0o700 });
  const bundleMembers = [".", "target.json", "evidence", "target.sig", "manifest.sig", "context-graph.json", "manifest.json", "run.md", "run.json",
    "public-keys", "metadata", "metadata/exportInfo.json", "public-keys/monitor.pub", "public-keys/key-history.json",
    "public-keys/auditor.pub", "evidence/blobs", "evidence/evidence.sqlite"];
  const limits = { maxEntries: 32, maxCompressedBytes: 1_000_000,
    maxEntryBytes: Math.max(...corpus.provenance.candidates.map(row => row.source.bytes)), maxTotalBytes: 4_000_000, maxPathBytes: 256 };
  const file = corpus.path("run.amcbundle"), inspected = inspectTarGzipArchive({ file, label: "legacy bundle public-key view", limits });
  if (JSON.stringify([...inspected.members].sort()) !== JSON.stringify(bundleMembers.sort())) throw new Error("Legacy bundle member allowlist differs");
  extractValidatedTarGzipArchive({ file, destination: bundleRoot, label: "legacy bundle public-key view", limits });
  const monitor = readFileSync(join(bundleRoot, "public-keys/monitor.pub"), "utf8");
  const auditor = readFileSync(join(bundleRoot, "public-keys/auditor.pub"), "utf8");
  const monitorId = ed25519KeyId(monitor), auditorId = ed25519KeyId(auditor);
  if (!monitorId || !auditorId) throw new Error("Historical embedded public role keys are not Ed25519 public keys");
  const activeBefore = snapshot(f.root, [".amc/keys/monitor_ed25519.pub", ".amc/keys/auditor_ed25519.pub", ".amc/vault.amcvault"]);
  addPublicKeyToHistory(f.root, "monitor", monitor, "imported"); addPublicKeyToHistory(f.root, "auditor", auditor, "imported");
  const currentMonitorId = ed25519KeyId(getPublicKeyPem(f.root, "monitor"));
  if (!currentMonitorId) throw new Error("Owned current monitor is not Ed25519");
  const trust = withPins(loadTrustContext({ amcHome: join(f.root, "owned-operator-home"), env: {},
    expectMonitor: monitorId, pubkey: { path: join(f.root, ".amc/keys/monitor_ed25519.pub"), purposes: ["ledger-row"] } }),
    [{ keyId: auditorId, purposes: ["artifact-seal"], origin: "reviewed-tag-fixture-bundle-public-key" }]);
  f.facts.fixtureTrustEnrollment = { source: "imported", oldMonitorId: monitorId, oldAuditorId: auditorId, currentMonitorId,
    monitorHistoryVerified: verifyKeyHistoryChain(f.root, "monitor").ok, auditorHistoryVerified: verifyKeyHistoryChain(f.root, "auditor").ok,
    activePublicKeysAndVaultUnchanged: changed(activeBefore, snapshot(f.root, activeBefore.map(row => row.relative))).length === 0,
    independentHistoricalProvenanceClaim: false };
  return trust;
}

describe("P1-35 synthetic migration source contracts", () => {
  test("R2 reads unmarked dogfood metadata conservatively and preserves current marked rows", async () => {
    await owned("R2-synthetic-edges", false, f => {
      const rows = [
        { label: "provenance", input: { binaryPath: "synthetic", events: [{ meta_json: JSON.stringify({ provenance: "dogfood", trustTier: "OBSERVED" }) }] } },
        { label: "source", input: { binaryPath: "synthetic", events: [{ meta_json: JSON.stringify({ source: "dogfood-maturity", trustTier: "OBSERVED" }) }] } },
        { label: "binary", input: { binaryPath: "amc-dogfood-agent", events: [{ meta_json: "{}" }] } }
      ].map(row => ({ label: row.label, classification: classifyLegacyArtifact("ledger_session", row.input) }));
      const marked = classifyLegacyArtifact("ledger_session", { binaryPath: "amc-dogfood-agent",
        events: [{ meta_json: JSON.stringify({ source: "dogfood-maturity", claimKind: "synthetic_example", trustTier: "OBSERVED" }) }] });
      f.facts = { rows, currentMarkedNotLegacy: marked === null };
      expect(rows.map(row => [row.classification?.rule, row.classification?.claimKind])).toEqual(
        rows.map(() => ["R2-dogfood-seeded", "synthetic_example"]));
      expect(marked === null).toBe(true);
    });
  });

  test("R4 never promotes operator-chosen ATTESTED legacy provenance", async () => {
    await owned("R4-never-promoted", false, f => {
      const found = classifyLegacyArtifact("ledger_session", { binaryPath: "amc-eval-import",
        events: [{ meta_json: JSON.stringify({ source: "eval_import", trustTier: "ATTESTED" }) }] });
      const observed = ["OBSERVED", "OBSERVED_HARDENED"].map(trustTier => ({ trustTier,
        found: classifyLegacyArtifact("ledger_session", { binaryPath: "amc-eval-import",
          events: [{ meta_json: JSON.stringify({ source: "eval_import", trustTier }) }] }) }));
      f.facts = { found, observed };
      expect(found !== null).toBe(true);
      // First promotion-control witness. Later exact-kind checks may be masked.
      expect(["observed", "independently_reviewed"]).not.toContain(found?.claimKind);
      expect(found?.rule).toBe("R4-operator-tier"); expect(found?.claimKind).toBe("self_reported");
      expect(found?.original.trustTier).toBe("ATTESTED");
      expect(observed.map(row => [row.found?.claimKind, row.found?.original.trustTier])).toEqual(
        observed.map(row => ["self_reported", row.trustTier]));
    });
  });

  test("current public claim envelopes bypass the legacy classifier", async () => {
    await owned("current-envelope-positive", false, f => {
      const envelope = currentEnvelope(), report = { ...postfixReport(), ...envelope };
      const found = classifyLegacyArtifact("assurance_report", report);
      let callbacks = 0;
      const visible = assuranceReportClaim(report, () => { callbacks++; return envelope; }, NOW);
      f.facts = { actualCurrentKind: envelope.claimKind, notLegacy: found === null, callbacks,
        callerEnvelopeRetained: visible === envelope };
      expect(envelope.claimKind).toBe("observed"); expect(found === null).toBe(true);
      expect(callbacks).toBe(1); expect(visible === envelope).toBe(true);
    });
  });

  test("a 2.x assurance report shaped like assuranceRunner's output is not legacy and keeps the current claim", async () => {
    await owned("current-2x-assurance-not-legacy", true, async f => {
      // The fields assuranceRunner.ts writes into every report since fba5824e, with no claim envelope.
      const report: AssuranceReport = { ...postfixReport(), sessionId: "synthetic-session", inconclusiveScenarioCount: 0,
        target: { transport: "direct", endpoint: "http://127.0.0.1:1/v1", model: "synthetic-model", providerTemplateId: "custom" } };
      const envelope = currentEnvelope(); let callbacks = 0;
      const found = classifyLegacyArtifact("assurance_report", report);
      const visible = assuranceReportClaim(report, () => { callbacks++; return envelope; }, NOW);
      const locator = ".amc/reports/assurance/current-2x.json";
      mkdirSync(join(f.root, ".amc/reports/assurance"), { recursive: true });
      writeFileSync(join(f.root, locator), JSON.stringify(report) + "\n", { flag: "wx", mode: 0o600 });
      const dry = await relabelLegacyArtifacts(f.root, { trust: ownTrust(f.root), dryRun: true, now: receiptClock() });
      f.facts = { found, callbacks, callerEnvelopeRetained: visible === envelope,
        relabelledLocators: dry.records.map(row => row.artifact.locator) };
      expect(found).toBeNull(); expect(callbacks).toBe(1); expect(visible === envelope).toBe(true);
      expect(visible.provenance.legacy).toBeUndefined();
      expect(dry.receipt.scanned.assurance_report).toBeGreaterThan(0);
      expect(dry.records.some(row => row.artifact.locator === locator)).toBe(false);
    });
  });

  test("dry-run and signed persistent relabel preserve synthetic originals and append no records on repeat", async () => {
    await owned("synthetic-persistent-roundtrip", true, async f => {
      const paths = syntheticOriginals(f.root), trust = ownTrust(f.root), now = receiptClock();
      const before = snapshot(f.root, paths), verification = verifyLedgerIntegrity(f.root, { trust });
      const dry = await relabelLegacyArtifacts(f.root, { trust, dryRun: true, now });
      const afterDry = snapshot(f.root, paths);
      const dryWritesAbsent = !existsSync(join(f.root, RELABEL_LOG)) && !existsSync(join(f.root, RECEIPTS_DIR));
      const first = await relabelLegacyArtifacts(f.root, { trust, now });
      const afterFirst = snapshot(f.root, paths), changedOriginals = changed(before, afterFirst);
      f.facts = { originalHashes: before, afterDry, afterFirst, changedOriginals,
        dryWritesAbsent, receiptTimestampSource: "injected public now callback", actualLedgerVerificationOK: verification.ok };
      // First original-rewrite control witness, ahead of counts/signature checks.
      expect(changedOriginals).toEqual([]);
      expect(changed(before, afterDry)).toEqual([]); expect(dryWritesAbsent).toBe(true); expect(dry.receiptPath).toBeNull();
      expect(verification.ok).toBe(true);
      const checked = verifyRelabelLog(f.root);
      if (!checked.ok) throw new Error("Owned synthetic relabel log did not verify: " + checked.reason);
      if (!first.receiptPath) throw new Error("Owned synthetic relabel returned no receipt path");
      const receiptBytes = readFileSync(join(f.root, first.receiptPath)), signed = JSON.parse(readFileSync(join(f.root, first.receiptPath + ".sig"), "utf8")) as SignedDigest;
      const signatureValid = signed.digestSha256 === digest(receiptBytes)
        && verifySignedDigest({ workspace: f.root, digestHex: digest(receiptBytes), signed });
      const attested = attestedLogHead(f.root, first.receiptPath.split("/").at(-1)!);
      const reportHashes = before.filter(row => row.relative !== ".amc/evidence.sqlite").map(row => row.sha256);
      // No synthetic ledger rows are invented. The real initialized ledger is read and closed.
      const ledger = openLedger(f.root, { readonly: true });
      f.facts.readOnlyLedgerOpened = true;
      let eventCount = 0, sessionHashes: string[] = [];
      try {
        const events = ledger.getAllEvents(); eventCount = events.length;
        const sessions = new Map<string, string[]>();
        for (const event of events) {
          const hashes = sessions.get(event.session_id) ?? []; hashes.push(event.event_hash); sessions.set(event.session_id, hashes);
        }
        sessionHashes = [...sessions.values()].map(hashes => digest(hashes.join("\n")));
      } finally { ledger.close(); f.facts.readOnlyLedgerClosed = true; }
      const logBeforeRepeat = readFileSync(join(f.root, RELABEL_LOG)), namesBefore = receiptNames(f.root);
      const second = await relabelLegacyArtifacts(f.root, { trust, now });
      const logAfterRepeat = readFileSync(join(f.root, RELABEL_LOG)), repeated = verifyRelabelLog(f.root);
      Object.assign(f.facts, { rules: first.records.map(row => row.rule), assigned: first.records.map(row => row.assigned),
        integrity: first.records.map(row => row.integrity), signatureValid, attested, eventCount,
        originalsDigestMatches: first.receipt.originalsDigest === digest([...reportHashes, ...sessionHashes].sort().join("\n")),
        receiptHeadMatches: first.receipt.relabelLogHead === checked.head, firstRecordCount: first.records.length,
        secondRecordCount: second.records.length, logUnchangedOnRepeat: logBeforeRepeat.equals(logAfterRepeat),
        priorReceiptCount: namesBefore.length, laterReceiptCount: receiptNames(f.root).length,
        repeatedLogVerified: repeated.ok, afterRepeat: snapshot(f.root, paths) });
      expect(first.records.map(row => row.rule).sort()).toEqual(["R1-assurance-canned-reply", "R5-no-claim-envelope"]);
      expect(first.records.every(row => ["self_reported", "synthetic_example"].includes(row.assigned.claimKind))).toBe(true);
      expect(first.records.every(row => row.integrity.status === "integrityFailed")).toBe(true);
      expect(first.records.every(row => row.noticeId === CURRENT_LEGACY_NOTICE.id && row.noticeVersion === CURRENT_LEGACY_NOTICE.version)).toBe(true);
      expect(signatureValid).toBe(true); expect("error" in attested).toBe(false);
      expect(f.facts.receiptHeadMatches).toBe(true); expect(f.facts.originalsDigestMatches).toBe(true);
      expect(second.records).toHaveLength(0); expect(logBeforeRepeat.equals(logAfterRepeat)).toBe(true);
      expect(receiptNames(f.root).length).toBe(namesBefore.length + 1); expect(repeated.ok).toBe(true);
      expect(changed(before, snapshot(f.root, paths))).toEqual([]);
    });
  });

  test("an edited signed log line refuses further relabelling without changing originals", async () => {
    await owned("synthetic-log-tamper", true, async f => {
      const paths = syntheticOriginals(f.root), before = snapshot(f.root, paths), trust = ownTrust(f.root), now = receiptClock();
      const initial = await relabelLegacyArtifacts(f.root, { trust, now });
      const positive = verifyRelabelLog(f.root);
      if (!positive.ok || initial.records.length < 2) throw new Error("Owned tamper fixture has no positive two-record signed log");
      const logPath = join(f.root, RELABEL_LOG), lines = readFileSync(logPath, "utf8").trimEnd().split("\n");
      const first = JSON.parse(lines[0]!) as { original: { label: string | null } };
      first.original.label = "synthetic tampered label"; lines[0] = JSON.stringify(first);
      writeFileSync(logPath, lines.join("\n") + "\n");
      const negative = verifyRelabelLog(f.root), changedLog = readFileSync(logPath), receiptsBefore = receiptNames(f.root);
      let refused = false;
      try { await relabelLegacyArtifacts(f.root, { trust, now }); } catch (error) {
        refused = error instanceof Error && error.message.includes("failed its check at line 1");
      }
      f.facts = { signedPositive: positive.ok, tamperRefused: !negative.ok, failingLine: negative.ok ? null : negative.line,
        subsequentRelabelRefused: refused, logUnchangedAfterRefusal: changedLog.equals(readFileSync(logPath)),
        receiptsUnchangedAfterRefusal: JSON.stringify(receiptNames(f.root)) === JSON.stringify(receiptsBefore),
        originalHashes: before, after: snapshot(f.root, paths) };
      expect(negative.ok).toBe(false); if (!negative.ok) expect(negative.line).toBe(1);
      expect(refused).toBe(true); expect(f.facts.logUnchangedAfterRefusal).toBe(true); expect(f.facts.receiptsUnchangedAfterRefusal).toBe(true);
      expect(changed(before, snapshot(f.root, paths))).toEqual([]);
    });
  });

  test("a tampered migration receipt signature refuses its log and any further append", async () => {
    await owned("synthetic-receipt-signature-tamper", true, async f => {
      const paths = syntheticOriginals(f.root), before = snapshot(f.root, paths), trust = ownTrust(f.root), now = receiptClock();
      const initial = await relabelLegacyArtifacts(f.root, { trust, now });
      if (!initial.receiptPath || !verifyRelabelLog(f.root).ok) throw new Error("Owned signature fixture has no verified signed migration result");
      const signaturePath = join(f.root, initial.receiptPath + ".sig");
      const signature = JSON.parse(readFileSync(signaturePath, "utf8")) as SignedDigest;
      if (!signature.signature) throw new Error("Owned signature fixture has no signature bytes");
      signature.signature = (signature.signature[0] === "A" ? "B" : "A") + signature.signature.slice(1);
      writeFileSync(signaturePath, JSON.stringify(signature, null, 2) + "\n");
      const negative = verifyRelabelLog(f.root), attested = attestedLogHead(f.root, initial.receiptPath.split("/").at(-1)!);
      const log = readFileSync(join(f.root, RELABEL_LOG)), receipts = receiptNames(f.root);
      let refused = false;
      try { await relabelLegacyArtifacts(f.root, { trust, now }); } catch (error) {
        refused = error instanceof Error && error.message.includes("failed its check") && error.message.includes("signature does not verify");
      }
      f.facts = { positiveSignedLogReached: true, logRefused: !negative.ok, failingLine: negative.ok ? null : negative.line,
        attestedSignatureRefused: "error" in attested && attested.error === "its MIGRATION_RECEIPT signature does not verify",
        subsequentRelabelRefused: refused, logUnchanged: log.equals(readFileSync(join(f.root, RELABEL_LOG))),
        receiptsUnchanged: JSON.stringify(receipts) === JSON.stringify(receiptNames(f.root)), originalHashes: before, after: snapshot(f.root, paths),
        signaturePurposeFieldClaim: false };
      expect(negative.ok).toBe(false); if (!negative.ok) expect(negative.line).toBeNull();
      expect(f.facts.attestedSignatureRefused).toBe(true); expect(refused).toBe(true);
      expect(f.facts.logUnchanged).toBe(true); expect(f.facts.receiptsUnchanged).toBe(true);
      expect(changed(before, snapshot(f.root, paths))).toEqual([]);
    });
  });
});

describe("P1-35 genuine v1.1.1 generated originals", () => {
  test("actual old classifier inputs retain R1 to R5 labels and the genuine L3/certificate gaps", async () => {
    await owned("genuine-classifier-inputs", false, f => {
      const corpus = decodeCorpus(f);
      const assurance = JSON.parse(readFileSync(corpus.path("assurance-report.json"), "utf8")) as AssuranceReport;
      const diagnostic = JSON.parse(readFileSync(corpus.path("diagnostic-report.json"), "utf8")) as {
        layerScores: Array<{ avgFinalLevel: number }>; methodology?: { amcVersion?: string };
      };
      const observation = JSON.parse(readFileSync(corpus.path("ledger-observation.json"), "utf8")) as {
        derivedObservation: boolean; sessions: Array<{ session_id: string; binary_path: string }>;
        events: Array<{ session_id: string; event_hash: string; meta_json: string }>;
      };
      const r1 = classifyLegacyArtifact("assurance_report", assurance);
      const sessionRows = observation.sessions.map(row => ({ binaryPath: row.binary_path,
        classification: classifyLegacyArtifact("ledger_session", { binaryPath: row.binary_path,
          events: observation.events.filter(event => event.session_id === row.session_id) }) }));
      const r2 = sessionRows.filter(row => row.binaryPath === "amc-dogfood-agent");
      const r4 = sessionRows.filter(row => row.binaryPath === "amc-eval-import");
      const r3 = classifyLegacyArtifact("domain_report", readFileSync(corpus.path("domain-report.md"), "utf8"));
      const r5 = classifyLegacyArtifact("diagnostic_report", diagnostic);
      const trustCertificate = JSON.parse(readFileSync(corpus.path("trust-certificate.json"), "utf8"));
      let callbacks = 0;
      const lazy = assuranceReportClaim(assurance, () => { callbacks++; return currentEnvelope(); }, NOW);
      const levels = diagnostic.layerScores.map(row => row.avgFinalLevel);
      const mean = levels.reduce((sum, level) => sum + level, 0) / levels.length;
      Object.assign(f.facts, { assurance: r1, sessionRows, domain: r3, diagnostic: r5, assuranceLazyKind: lazy.claimKind,
        assuranceCurrentFallbackCalls: callbacks, diagnosticMeanLevel: mean, genuineL3Produced: mean === 3,
        diagnosticMethodologyVersion: diagnostic.methodology?.amcVersion ?? null,
        oldObservationDerivedNotIndependent: observation.derivedObservation,
        trustCertificateUnversioned: classifyLegacyArtifact("trust_certificate", trustCertificate) === null,
        diagnosticCertificateEmitted: corpus.provenance.candidates.some(row => row.name === "run.amccert") });
      // First genuine R1 control witness; all finite classifications above remain public if later checks are masked.
      expect(r1?.rule).toBe("R1-assurance-canned-reply"); expect(r1?.claimKind).toBe("synthetic_example");
      expect(assurance.evidenceStatus).toBeUndefined(); expect(lazy.claimKind).toBe("synthetic_example"); expect(callbacks).toBe(0);
      expect(r2.length > 0).toBe(true); expect(r2.every(row => row.classification?.rule === "R2-dogfood-seeded"
        && row.classification.claimKind === "synthetic_example")).toBe(true);
      expect(r4.length > 0).toBe(true); expect(r4.every(row => row.classification?.rule === "R4-operator-tier"
        && row.classification.claimKind === "self_reported" && row.classification.original.trustTier === "OBSERVED")).toBe(true);
      expect(r3?.rule).toBe("R3-domain-report"); expect(r3?.claimKind).toBe("synthetic_example");
      expect(r5?.rule).toBe("R5-no-claim-envelope"); expect(r5?.claimKind).toBe("self_reported"); expect(r5?.levelCap).toBe("L1");
      expect(r5?.original.level).toBe(`L${Number(mean.toFixed(2))}`);
      expect(sessionRows.every(row => row.classification === null || !["observed", "independently_reviewed"].includes(row.classification.claimKind))).toBe(true);
      expect(observation.derivedObservation).toBe(true); expect(f.facts.trustCertificateUnversioned).toBe(true);
      expect(f.facts.diagnosticCertificateEmitted).toBe(false);
      if (mean !== 3) expect(corpus.provenance.gaps.some(row => row.step === "genuine-L3")).toBe(true);
      expect(corpus.provenance.gaps.some(row => row.step === "diagnostic-certificate")).toBe(true);
    });
  });

  test("real relabelling preserves every decoded file and old SQLite bytes with explicit owned trust enrollment", async () => {
    await owned("genuine-persistent-roundtrip", true, async f => {
      const corpus = decodeCorpus(f), trust = fixtureTrust(f, corpus), now = receiptClock();
      const poolKey = `ledger:${f.root}:${join(f.root, ".amc/evidence.sqlite")}`, pool = sqlitePoolStats(poolKey);
      if (pool && pool.active !== 0) throw new Error("Owned initialized ledger is not idle before legacy-copy installation");
      if (pool) closeSqlitePool(poolKey);
      if (sqlitePoolStats(poolKey) !== null) throw new Error("Owned initialized pool did not close");
      if (existsSync(join(f.root, ".amc/evidence.sqlite-wal")) || existsSync(join(f.root, ".amc/evidence.sqlite-shm")))
        throw new Error("Owned initialized ledger retained coordination sidecars; originals were not replaced");
      renameSync(join(f.root, ".amc/evidence.sqlite"), join(f.root, ".amc/retained-initialized-evidence.sqlite"));
      copyFileSync(corpus.path("evidence.sqlite"), join(f.root, ".amc/evidence.sqlite"), constants.COPYFILE_EXCL);
      const diagnosticPath = ".amc/runs/genuine-v1-1-1-diagnostic.json", assurancePath = ".amc/reports/assurance/genuine-v1-1-1-assurance.json";
      mkdirSync(join(f.root, ".amc/reports/assurance"), { recursive: true });
      copyFileSync(corpus.path("diagnostic-report.json"), join(f.root, diagnosticPath), constants.COPYFILE_EXCL);
      copyFileSync(corpus.path("assurance-report.json"), join(f.root, assurancePath), constants.COPYFILE_EXCL);
      const installedPaths = [diagnosticPath, assurancePath, ".amc/evidence.sqlite"], installedBefore = snapshot(f.root, installedPaths);
      f.facts.installedOriginalsBefore = installedBefore;
      f.checks.push(() => {
        const after = snapshot(f.root, installedPaths); f.facts.installedOriginalsAfter = after;
        if (changed(installedBefore, after).length) throw new Error("Owned installed historical originals changed");
      });
      const verification = verifyLedgerIntegrity(f.root, { trust });
      const ledger = openLedger(f.root, { readonly: true });
      let sessionHashes: string[] = [];
      f.facts.genuineLedgerReadOnlyOpened = true;
      try {
        const hashes = new Map<string, string[]>();
        for (const event of ledger.getAllEvents()) {
          const row = hashes.get(event.session_id) ?? []; row.push(event.event_hash); hashes.set(event.session_id, row);
        }
        sessionHashes = [...hashes.values()].map(row => digest(row.join("\n")));
      } finally { ledger.close(); f.facts.genuineLedgerReadOnlyClosed = true; }
      const beforeBundle = await verifyEvidenceBundle(corpus.path("run.amcbundle"), trust);
      const bundleProjection = (result: typeof beforeBundle) => ({ ok: result.ok, integrity: result.report.integrity,
        issuerStatus: result.report.issuerAdmission.status, anchoring: result.report.anchoring,
        claim: result.run ? classifyLegacyArtifact("bundle", result.run) : null });
      const explicit = ["run.amcbundle", "domain-report.md", "passport.amcpass", "trust-certificate.json"].map(name => corpus.path(name as CorpusName));
      const automaticDry = await relabelLegacyArtifacts(f.root, { trust, dryRun: true, now });
      const dry = await relabelLegacyArtifacts(f.root, { trust, dryRun: true, now, paths: explicit });
      const afterDry = snapshot(f.root, installedPaths);
      const dryWritesAbsent = !existsSync(join(f.root, RELABEL_LOG)) && !existsSync(join(f.root, RECEIPTS_DIR));
      const first = await relabelLegacyArtifacts(f.root, { trust, now, paths: explicit });
      const afterFirst = snapshot(f.root, installedPaths), changedOriginals = changed(installedBefore, afterFirst);
      const afterBundle = await verifyEvidenceBundle(corpus.path("run.amcbundle"), trust);
      const checked = verifyRelabelLog(f.root);
      const hashedFiles = [corpus.path("diagnostic-report.json"), corpus.path("assurance-report.json"), ...explicit];
      const expectedOriginalsDigest = digest([...hashedFiles.map(path => digest(readFileSync(path))),
        ...(verification.ok && verification.trustRoot.anchored ? sessionHashes : [])].sort().join("\n"));
      Object.assign(f.facts, { fixtureTimestampSource: "injected public now callback", initializedPoolClosedBeforeCopy: true,
        actualLedgerVerification: verification, beforeBundle: bundleProjection(beforeBundle), afterBundle: bundleProjection(afterBundle),
        automaticDomainRecords: automaticDry.records.filter(row => row.rule === "R3-domain-report").length,
        explicitDomainRecords: dry.records.filter(row => row.rule === "R3-domain-report").length,
        dryWritesAbsent, afterDry, afterFirst, changedOriginals, records: first.records, skipped: first.receipt.skipped,
        relabelLogVerified: checked.ok, originalsDigestMatches: first.receipt.originalsDigest === expectedOriginalsDigest });
      // Original-rewrite control witness precedes signature, counts and successful historical-integrity requirements.
      expect(changedOriginals).toEqual([]); expect(changed(installedBefore, afterDry)).toEqual([]);
      expect(dryWritesAbsent).toBe(true); expect(dry.receiptPath).toBeNull();
      expect(f.facts.fixtureTrustEnrollment).toMatchObject({ monitorHistoryVerified: true, auditorHistoryVerified: true,
        activePublicKeysAndVaultUnchanged: true, independentHistoricalProvenanceClaim: false });
      expect(bundleProjection(afterBundle)).toEqual(bundleProjection(beforeBundle));
      expect(beforeBundle.run !== null).toBe(true); expect(bundleProjection(beforeBundle).claim?.rule).toBe("R5-no-claim-envelope");
      expect(f.facts.automaticDomainRecords).toBe(0); expect(f.facts.explicitDomainRecords).toBe(1);
      expect(first.records.every(row => !["observed", "independently_reviewed"].includes(row.assigned.claimKind))).toBe(true);
      expect(first.receipt.skipped.some(row => row.locator.endsWith("passport.amcpass") && row.reason.includes("records no AMC version"))).toBe(true);
      expect(first.receipt.skipped.some(row => row.locator.endsWith("trust-certificate.json") && row.reason.includes("records no AMC version"))).toBe(true);
      if (!first.receiptPath || !checked.ok) throw new Error("Actual historical relabel has no verified signed receipt/log");
      const receiptBytes = readFileSync(join(f.root, first.receiptPath)), signed = JSON.parse(readFileSync(join(f.root, first.receiptPath + ".sig"), "utf8")) as SignedDigest;
      const signatureValid = signed.digestSha256 === digest(receiptBytes) && verifySignedDigest({ workspace: f.root, digestHex: digest(receiptBytes), signed });
      const logBeforeRepeat = readFileSync(join(f.root, RELABEL_LOG)), receiptCount = receiptNames(f.root).length;
      const repeat = await relabelLegacyArtifacts(f.root, { trust, now, paths: explicit });
      Object.assign(f.facts, { receiptSignatureVerified: signatureValid, secondRecordCount: repeat.records.length,
        repeatLogUnchanged: logBeforeRepeat.equals(readFileSync(join(f.root, RELABEL_LOG))),
        receiptCountBeforeRepeat: receiptCount, receiptCountAfterRepeat: receiptNames(f.root).length,
        repeatedLogVerified: verifyRelabelLog(f.root).ok });
      expect(signatureValid).toBe(true); expect(first.receipt.relabelLogHead).toBe(checked.head); expect(f.facts.originalsDigestMatches).toBe(true);
      expect(repeat.records).toHaveLength(0); expect(f.facts.repeatLogUnchanged).toBe(true);
      expect(receiptNames(f.root).length).toBe(receiptCount + 1); expect(f.facts.repeatedLogVerified).toBe(true);
      // Actual verifier output is retained even if this historical compatibility assertion fails.
      expect(verification.ok).toBe(true); expect(verification.trustRoot.anchored).toBe(true);
      expect(first.records.some(row => row.rule === "R2-dogfood-seeded" && row.integrity.status === "verified")).toBe(true);
      expect(first.records.some(row => row.rule === "R4-operator-tier" && row.artifact.kind === "ledger_session" && row.integrity.status === "verified")).toBe(true);
    });
  });
});
