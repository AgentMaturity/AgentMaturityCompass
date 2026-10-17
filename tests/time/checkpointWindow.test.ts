import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect } from "vitest";
import { cleanSourceRuntimeEnvironment } from "../../scripts/clean-source-check.mjs";
import { resolveAmcHome } from "../../src/credentials/credentialsPaths.js";
import { getPublicKeyPem, verifyHexDigest } from "../../src/crypto/keys.js";
import { closeGuardDb, withWorkspaceScope } from "../../src/enforce/evidenceEmitter.js";
import { hashBinaryOrPath, openLedger, verifyLedgerIntegrity } from "../../src/ledger/ledger.js";
import { closeSqlitePool, sqlitePoolStats } from "../../src/storage/sqlitePool.js";
import { checkpointLedger, checkpointsDir, completePendingCheckpoints, ledgerTimeline, readCheckpointChain, timeCheckpointTick } from "../../src/time/checkpoint.js";
import { loadTimeConfig } from "../../src/time/tsaClient.js";
import { loadTransparencyConfig } from "../../src/transparency/anchors/anchor.js";
import { loadTrustContext, type TrustContext } from "../../src/trust/trustContext.js";
import type { EvidenceEvent } from "../../src/types.js";
import { lockVault, vaultStatus } from "../../src/vault/vault.js";
import { initWorkspace, loadAMCConfig, saveAMCConfig, signAmcConfig, verifyAmcConfigSignature } from "../../src/workspace.js";
import { rawSignature, testKey, trustList } from "../trust/trustFixtures.js";
import { ANCHOR_ID, POLICY, optionalTsaTest, withGrantFixture, type Fixture } from "./tsaTestFixture.js";

const CHECKOUT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const optionalCheckpointTest = optionalTsaTest(["CHECKPOINT-PENDING-GRANT", "CHECKPOINT-REQUIRED-REFUSAL", "CHECKPOINT-TWO-BOUND-WINDOW", "CHECKPOINT-EVENT-CADENCE", "CHECKPOINT-PERSISTED-PRODUCER-CLAIMS"]);
const sha256 = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");

function filePin(path: string) {
  const physicalPath = realpathSync(path);
  const st = lstatSync(path);
  if (!st.isFile() || st.isSymbolicLink() || physicalPath !== path) throw new Error("selected fixture input is not a physical regular file");
  const bytes = readFileSync(path);
  return { path, physicalPath, bytes: bytes.length, sha256: sha256(bytes), dev: st.dev, inode: st.ino, nlink: st.nlink };
}

function replaceEnvironment(next: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) if (!Object.hasOwn(next, key)) delete process.env[key];
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function sameEnvironment(expected: NodeJS.ProcessEnv): boolean {
  const keys = Object.keys(process.env).sort();
  return JSON.stringify(keys) === JSON.stringify(Object.keys(expected).sort()) && keys.every(key => process.env[key] === expected[key]);
}

function checkpointSignatureValid(path: string, digest: string, monitorPem: string): boolean {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  return typeof value === "object" && value !== null && "signature" in value && typeof value.signature === "string"
    && verifyHexDigest(digest, value.signature, monitorPem);
}

type LedgerOwner = { handle: ReturnType<typeof openLedger>; readonly: boolean; closeAttempted: boolean; closed: boolean };
type CheckpointFixture = {
  trust: TrustContext; monitorPem: string; monitorFingerprint: string; seedEventId: string;
  appendSealedAudit: (label: string, ts?: number) => string;
  events: () => EvidenceEvent[];
  verify: () => ReturnType<typeof verifyLedgerIntegrity>;
  configure: (required: boolean, path: string) => void;
  facts: Record<string, unknown>;
};

/** Only this case's initialized workspace, pool, vault and process environment are owned here. */
async function withCheckpointWorkspace(caseId: string, tsa: Fixture, body: (fixture: CheckpointFixture) => Promise<void>): Promise<void> {
  const previousEnvironment = { ...process.env };
  const secrets = new Set<string>();
  const owners: LedgerOwner[] = [];
  const cleanupErrors: unknown[] = [];
  const publicPath = join(tsa.workspace, "checkpoint-public-evidence.json");
  const poolKey = `ledger:${resolve(tsa.workspace)}:${join(resolve(tsa.workspace), ".amc", "evidence.sqlite")}`;
  let bodyFailed = false;
  let primary: unknown;
  let initializationAttempted = false;
  let nativeBefore: ReturnType<typeof filePin> | null = null;
  let immutablePins: ReturnType<typeof filePin>[] = [];
  const facts: Record<string, unknown> = {
    schema: "amc-p125-checkpoint-owned-fixture/1", caseId, checkout: CHECKOUT, workspace: tsa.workspace,
    privateHome: tsa.home, noClockRowGateOrPolicyBypass: true,
    trustBoundary: "the signed own trust list and captured monitor pin are controlled fixture authority, not an independent production issuer",
    windowBoundary: caseId === "CHECKPOINT-TWO-BOUND-WINDOW"
      ? "two genuine checkpoints supply a window; extra claimedTs values test only the reader; no scheduler, seal or certificate qualification"
      : "one checkpoint supplies an upper bound; no lower-window, scheduler, seal or certificate qualification"
  };
  const safeError = (error: unknown): unknown => {
    if (error instanceof Error) {
      const redact = (text: string): string => {
        let safe = text;
        for (const secret of secrets) if (secret.length > 0) safe = safe.split(secret).join("[redacted]");
        return safe.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[redacted private key]");
      };
      error.message = redact(error.message);
      if (error.stack) error.stack = redact(error.stack);
    }
    return error; // Preserve the original thrown identity and first frame.
  };
  const cleanup = (operation: () => void): void => {
    try { operation(); } catch (error) {
      const safe = safeError(error);
      if (safe !== primary && !cleanupErrors.includes(safe)) cleanupErrors.push(safe);
    }
  };
  const useLedger = <T>(readonly: boolean, action: (ledger: ReturnType<typeof openLedger>) => T): T => {
    const owner: LedgerOwner = { handle: openLedger(tsa.workspace, { readonly }), readonly, closeAttempted: false, closed: false };
    owners.push(owner); // Retain the public handle before any action can fail.
    let failed = false;
    let error: unknown;
    let result!: T;
    try { result = action(owner.handle); } catch (caught) { failed = true; error = safeError(caught); }
    let closeFailed = false;
    let closeError: unknown;
    owner.closeAttempted = true;
    try { owner.handle.close(); owner.closed = true; } catch (caught) {
      closeFailed = true; closeError = safeError(caught); cleanupErrors.push(closeError);
    }
    if (failed) throw error;
    if (closeFailed) throw closeError;
    return result;
  };
  try {
    const isolated: NodeJS.ProcessEnv = cleanSourceRuntimeEnvironment(previousEnvironment, tsa.home);
    isolated.AMC_GUARD_EVENTS_DB_PATH = join(tsa.workspace, ".amc", "guard_events.sqlite");
    isolated.AMC_GUARD_RECEIPTS_WORKSPACE = tsa.workspace;
    if (isolated.AMC_VAULT_PASSPHRASE !== undefined) secrets.add(isolated.AMC_VAULT_PASSPHRASE);
    replaceEnvironment(isolated);
    await withWorkspaceScope(tsa.workspace, async () => {
      facts.environment = {
        helper: "scripts/clean-source-check.mjs#cleanSourceRuntimeEnvironment", privateHome: process.env.HOME === tsa.home,
        signingEnabled: process.env.AMC_NO_SIGN === undefined,
        storageOverrideAbsent: process.env.AMC_SESSION_STORE === undefined,
        trustOverridesAbsent: ["AMC_EXPECTED_MONITOR_FINGERPRINT", "AMC_TRUST_LIST", "AMC_TRUST_ROOT"].every(key => process.env[key] === undefined),
        loaderOverridesAbsent: process.env.NODE_OPTIONS === undefined && process.env.NODE_PATH === undefined
      };
      const nativePath = realpathSync(join(dirname(createRequire(import.meta.url).resolve("better-sqlite3/package.json")), "build", "Release", "better_sqlite3.node"));
      nativeBefore = filePin(nativePath);
      facts.nativeBefore = nativeBefore;
      initializationAttempted = true;
      initWorkspace({ workspacePath: tsa.workspace, agentId: "default", trustBoundaryMode: "isolated" });
      const monitorPem = getPublicKeyPem(tsa.workspace, "monitor");
      const monitorFingerprint = sha256(monitorPem);
      const listRoot = testKey();
      const now = Date.now();
      const list = trustList([], { listId: "p125-checkpoint-fixture", issuedAt: new Date(now - 60_000).toISOString(),
        expiresAt: new Date(now + 86_400_000).toISOString(), timestampAuthorities: [tsa.anchor] });
      const signedListPath = join(tsa.home, "checkpoint-trust-list.json");
      writeFileSync(signedListPath, JSON.stringify({ list, signatures: [rawSignature(list, listRoot)] }, null, 2), { flag: "wx", mode: 0o600 });
      const trust = loadTrustContext({ amcHome: tsa.home, env: {}, trustLists: [signedListPath], trustRoots: [listRoot.keyId], expectMonitor: monitorFingerprint });
      facts.trust = { mode: trust.mode, signatureVerifiedListCount: trust.lists.length, rootKeyId: listRoot.keyId, monitorFingerprint,
        tsaLoaded: trust.lists.some(row => row.timestampAuthorities?.some(anchor => anchor.anchorId === ANCHOR_ID)), signedList: filePin(signedListPath) };
      expect(trust.mode === "pinned" && trust.lists.length === 1 && trust.lists[0]!.timestampAuthorities?.[0]?.anchorId === ANCHOR_ID).toBe(true);
      immutablePins = [filePin(join(tsa.workspace, ".amc", "keys", "monitor_ed25519.pub")),
        filePin(join(tsa.workspace, ".amc", "keys", "auditor_ed25519.pub")), filePin(signedListPath)];
      if (caseId === "CHECKPOINT-EVENT-CADENCE") {
        const amcHome = resolveAmcHome();
        const overridesAbsent = ["AMC_HOME", "AMC_TRUST_LIST", "AMC_TRUST_ROOT", "AMC_EXPECTED_MONITOR_FINGERPRINT"].every(key => process.env[key] === undefined);
        expect(overridesAbsent && process.env.HOME === tsa.home).toBe(true);
        expect(amcHome).toBe(join(tsa.home, ".config", "amc"));
        const trustDirectory = join(amcHome, "trust");
        const defaultListPath = join(trustDirectory, "amc-trust-list.json");
        const defaultRootsPath = join(trustDirectory, "trust-roots.json");
        expect(existsSync(defaultListPath) || existsSync(defaultRootsPath)).toBe(false);
        mkdirSync(trustDirectory, { recursive: true, mode: 0o700 });
        writeFileSync(defaultListPath, readFileSync(signedListPath), { flag: "wx", mode: 0o600 });
        writeFileSync(defaultRootsPath, JSON.stringify({ type: "amc.trust-roots", version: 1, roots: [listRoot.keyId] }, null, 2), { flag: "wx", mode: 0o600 });
        const defaultTrust = loadTrustContext();
        expect(defaultTrust.mode).toBe("pinned");
        expect(defaultTrust.lists).toEqual([list]);
        expect(defaultTrust.explicitPins).toEqual([]);
        expect(defaultTrust.allowUnpinned || defaultTrust.allowUnanchored).toBe(false);
        const trustFiles = [filePin(defaultListPath), filePin(defaultRootsPath)];
        expect(trustFiles.every(pin => pin.nlink === 1 && (lstatSync(pin.path).mode & 0o777) === 0o600)).toBe(true);
        immutablePins.push(...trustFiles);
        facts.defaultHome = { resolved: amcHome, expected: join(tsa.home, ".config", "amc"), overridesAbsent,
          noOptionsLoaderUsed: true, mode: defaultTrust.mode, signatureVerifiedListCount: defaultTrust.lists.length,
          listId: defaultTrust.lists[0]!.listId, listEqualsOwnSignedList: true, explicitPinCount: defaultTrust.explicitPins.length,
          allowUnpinned: defaultTrust.allowUnpinned, allowUnanchored: defaultTrust.allowUnanchored, rootKeyId: listRoot.keyId,
          tsaAnchorIds: defaultTrust.lists.flatMap(row => row.timestampAuthorities?.map(anchor => anchor.anchorId) ?? []), trustFiles };
        facts.windowBoundary = "default-argument event cadence only; no elapsed-minute, Studio interval, session-seal or certificate qualification";
      }
      const sessionId = randomUUID();
      const seedEventId = useLedger(false, ledger => {
        ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "amc-p125-checkpoint-fixture",
          binarySha256: hashBinaryOrPath("amc-p125-checkpoint-fixture", "1") });
        const id = ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "audit", inline: true, payloadExt: "json",
          payload: JSON.stringify({ schema: "amc-p125-checkpoint-fixture-event/1", caseId }), meta: { fixtureCase: caseId } });
        ledger.sealSession(sessionId);
        return id;
      });
      const appendSealedAudit = (label: string, ts?: number): string => useLedger(false, ledger => {
        const appendedSessionId = randomUUID();
        ledger.startSession({ sessionId: appendedSessionId, runtime: "unknown", binaryPath: "amc-p125-checkpoint-fixture",
          binarySha256: hashBinaryOrPath("amc-p125-checkpoint-fixture", "1") });
        const id = ledger.appendEvidence({ sessionId: appendedSessionId, runtime: "unknown", eventType: "audit", inline: true, payloadExt: "json",
          payload: JSON.stringify({ schema: "amc-p125-checkpoint-fixture-event/1", caseId, label }), meta: { fixtureCase: caseId, fixtureLabel: label },
          ...(ts === undefined ? {} : { ts }) });
        ledger.sealSession(appendedSessionId);
        return id;
      });
      const events = (): EvidenceEvent[] => useLedger(true, ledger => ledger.getAllEvents());
      const verify = () => verifyLedgerIntegrity(tsa.workspace, { trust, expectedMonitorFingerprint: monitorFingerprint });
      const initialVerification = verify();
      facts.initialLedger = { ok: initialVerification.ok, chain: initialVerification.chain.ok, governance: initialVerification.governance.ok,
        anchored: initialVerification.trustRoot.anchored, errors: initialVerification.errors.length, seedEventId, sessionId, eventCount: events().length };
      expect(initialVerification.ok && initialVerification.chain.ok && initialVerification.governance.ok && initialVerification.trustRoot.anchored).toBe(true);
      const configure = (required: boolean, path: string): void => {
        const config = loadAMCConfig(tsa.workspace);
        config.time = { required, tsa: [{ name: "checkpoint-tsa", url: tsa.url(path), anchorIds: [ANCHOR_ID], reqPolicy: POLICY }] };
        saveAMCConfig(tsa.workspace, config);
        signAmcConfig(tsa.workspace);
        expect(verifyAmcConfigSignature(tsa.workspace).valid).toBe(true);
        const loaded = loadTimeConfig(tsa.workspace);
        expect(loaded.required === required && loaded.tsa.length === 1 && loaded.tsa[0]!.url === tsa.url(path)).toBe(true);
      };
      await body({ trust, monitorPem, monitorFingerprint, seedEventId, appendSealedAudit, events, verify, configure, facts });
    });
  } catch (error) { bodyFailed = true; primary = safeError(error); }
  finally {
    // Each acquired ledger's one close attempt already ran before leaving useLedger; no retry after a close error.
    cleanup(() => { if (!owners.every(owner => owner.closeAttempted && owner.closed)) throw new Error("an owned ledger did not close"); });
    if (initializationAttempted) {
      // All emitter calls were bound to this workspace. The unchanged close API is best-effort, not a native-handle proof.
      cleanup(() => { closeGuardDb(); facts.ownedGuardCloseInvoked = true; });
      cleanup(() => {
        const stats = sqlitePoolStats(poolKey);
        facts.poolBeforeClose = stats;
        if (stats !== null && stats.active !== 0) throw new Error("owned ledger pool has active leases; refusing forced closure");
        closeSqlitePool(poolKey);
        facts.poolClosed = sqlitePoolStats(poolKey) === null;
        if (facts.poolClosed !== true) throw new Error("owned ledger pool remained registered");
      });
      cleanup(() => { lockVault(tsa.workspace); facts.vaultLocked = !vaultStatus(tsa.workspace).unlocked;
        if (facts.vaultLocked !== true) throw new Error("owned vault remained unlocked"); });
    }
    cleanup(() => {
      facts.immutableInputCount = immutablePins.length;
      facts.immutableInputsUnchanged = immutablePins.every(pin => JSON.stringify(filePin(pin.path)) === JSON.stringify(pin));
      if (facts.immutableInputsUnchanged !== true) throw new Error("owned public key or signed trust list changed");
      if (nativeBefore !== null) {
        facts.nativeAfter = filePin(nativeBefore.path);
        facts.nativeUnchanged = JSON.stringify(facts.nativeAfter) === JSON.stringify(nativeBefore);
        if (facts.nativeUnchanged !== true) throw new Error("selected native module changed");
      }
    });
    cleanup(() => { replaceEnvironment(previousEnvironment); facts.environmentRestored = sameEnvironment(previousEnvironment);
      if (facts.environmentRestored !== true) throw new Error("process environment restoration differs from its exact snapshot"); });
    facts.ledgerOwners = owners.map(({ readonly, closeAttempted, closed }) => ({ readonly, closeAttempted, closed }));
    facts.bodyFailed = bodyFailed;
    facts.bodyErrorName = bodyFailed ? primary instanceof Error ? primary.name : typeof primary : null;
    facts.cleanupErrorNames = cleanupErrors.map(error => error instanceof Error ? error.name : typeof error);
    cleanup(() => writeFileSync(publicPath, JSON.stringify(facts, null, 2), { flag: "wx", mode: 0o600 }));
    console.info("P125_CHECKPOINT_EVIDENCE", publicPath);
  }
  const secondaryCleanupErrors = cleanupErrors.filter(error => error !== primary);
  if (bodyFailed && secondaryCleanupErrors.length === 0) throw primary;
  if (bodyFailed) throw new AggregateError([primary, ...secondaryCleanupErrors], "checkpoint body and owned cleanup failed");
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "owned checkpoint cleanup failed");
}

describe("P1-25 real signed ledger checkpoint transitions", () => {
  optionalCheckpointTest("completes the same signed pending checkpoint with a genuine query-bound token and ledger event", async () => {
    await withGrantFixture("CHECKPOINT-PENDING-GRANT", "/checkpoint-good", async tsa => {
      await withCheckpointWorkspace("CHECKPOINT-PENDING-GRANT", tsa, async fixture => {
        fixture.configure(false, "/http-first");
        const before = fixture.events();
        const pending = await checkpointLedger(tsa.workspace, fixture.trust);
        const pendingChain = readCheckpointChain(tsa.workspace);
        expect(pendingChain).toHaveLength(1);
        const entry = pendingChain[0]!;
        const checkpointPath = join(checkpointsDir(tsa.workspace), "1.json");
        const tokenPath = join(checkpointsDir(tsa.workspace), "1.tsr");
        const pendingBytes = readFileSync(checkpointPath);
        const signatureValid = checkpointSignatureValid(checkpointPath, entry.sha256, fixture.monitorPem);
        const pendingEvents = fixture.events();
        const pendingTimeline = ledgerTimeline(tsa.workspace, pendingEvents, { anchors: [tsa.anchor] });
        fixture.facts.pending = { result: pending, signedCheckpoint: filePin(checkpointPath), signatureValid,
          eventCount: pendingEvents.length, tokenAbsent: !existsSync(tokenPath), timeline: pendingTimeline.checkpoints };
        expect(tsa.requests.map(request => request.path)).toEqual(["/http-first"]);
        expect(pending).toEqual({ sequence: 1, status: "pending", failures: ["checkpoint-tsa: HTTP 500"] });
        expect(signatureValid).toBe(true);
        expect(entry.checkpoint.ledger).toEqual({ eventCount: before.length, headEventHash: before[before.length - 1]!.event_hash });
        expect(pendingEvents.map(event => event.event_hash)).toEqual(before.map(event => event.event_hash));
        expect(pendingTimeline.checkpoints).toEqual([{ sequence: 1, status: "pending", genTime: null, detail: null }]);
        expect(existsSync(tokenPath)).toBe(false);

        fixture.configure(false, "/checkpoint-good");
        const completed = await completePendingCheckpoints(tsa.workspace, fixture.trust);
        const attested = await tsa.verifyReply("/checkpoint-good", entry.sha256);
        const chain = readCheckpointChain(tsa.workspace);
        const storedToken = readFileSync(tokenPath);
        const events = fixture.events();
        const checkpointRows = events.filter(event => event.event_type === "time/checkpoint");
        const seedIndex = events.findIndex(event => event.id === fixture.seedEventId);
        const verification = fixture.verify();
        const timeline = ledgerTimeline(tsa.workspace, events, { anchors: [tsa.anchor] });
        const seed = events[seedIndex];
        const seedTime = seed === undefined ? null : timeline.eventTime(seedIndex, seed.ts);
        fixture.facts.completed = { result: completed, sequenceCount: chain.length,
          checkpointBytesUnchanged: readFileSync(checkpointPath).equals(pendingBytes), token: filePin(tokenPath),
          storedTokenMatchesIndependentGrant: storedToken.equals(Buffer.from(attested.tokenDerB64, "base64")),
          attested: { genTime: attested.genTime, anchorId: attested.tsa.anchorId, messageImprint: attested.messageImprint, revocationChecked: attested.revocationChecked },
          checkpointRows: checkpointRows.map(event => ({ id: event.id, eventHash: event.event_hash, meta: JSON.parse(event.meta_json) as unknown })),
          ledger: { ok: verification.ok, chain: verification.chain.ok, governance: verification.governance.ok, anchored: verification.trustRoot.anchored, errors: verification.errors.length },
          timeline: timeline.checkpoints, seedIndex, seedTime };
        expect(tsa.requests.map(request => request.path)).toEqual(["/http-first", "/checkpoint-good"]);
        expect(completed).toEqual([{ sequence: 1, status: "timestamped", failures: [] }]);
        expect(chain).toEqual(pendingChain);
        expect(readFileSync(checkpointPath).equals(pendingBytes)).toBe(true);
        expect(storedToken.equals(Buffer.from(attested.tokenDerB64, "base64"))).toBe(true);
        // First direct append-control witness, after the independent query/token and signed-checkpoint positives.
        expect(checkpointRows).toHaveLength(1);
        expect(JSON.parse(checkpointRows[0]!.meta_json)).toEqual({ checkpointSequence: 1, checkpointSha256: entry.sha256, tokenSha256: sha256(storedToken) });
        expect(events.length).toBe(before.length + 1);
        expect(verification.ok && verification.chain.ok && verification.governance.ok && verification.trustRoot.anchored).toBe(true);
        expect(seedIndex >= 0 && seedTime !== null).toBe(true);
        if (seedTime === null) throw new Error("owned ledger seed event is absent");
        expect(seedTime.time.claimedAt).toBe(new Date(seed!.ts).toISOString());
        expect(seedTime.time.basis).toBe("attested-upper-bound");
        expect(seedTime.time.attested).toEqual(attested);
        expect(seedTime.time.window).toEqual({ notBefore: null, notAfter: attested.genTime });
        expect(seedTime.findings).toEqual([]);
        const checkpointIndex = events.findIndex(event => event.id === checkpointRows[0]!.id);
        expect(timeline.eventTime(checkpointIndex, checkpointRows[0]!.ts).time.basis).toBe("claimed");
      });
    });
  });

  optionalCheckpointTest("rejects required time only after the real TSA refusal while preserving the signed pending checkpoint", async () => {
    await withGrantFixture("CHECKPOINT-REQUIRED-REFUSAL", "/unused-good", async tsa => {
      await withCheckpointWorkspace("CHECKPOINT-REQUIRED-REFUSAL", tsa, async fixture => {
        fixture.configure(true, "/http-first");
        const before = fixture.events();
        let rejected = false;
        let rejection: unknown;
        try { await checkpointLedger(tsa.workspace, fixture.trust); }
        catch (error) { rejected = true; rejection = error; }
        const chain = readCheckpointChain(tsa.workspace);
        const events = fixture.events();
        const verification = fixture.verify();
        const timeline = ledgerTimeline(tsa.workspace, events, { anchors: [tsa.anchor] });
        const checkpointPath = join(checkpointsDir(tsa.workspace), "1.json");
        const tokenAbsent = !existsSync(join(checkpointsDir(tsa.workspace), "1.tsr"));
        const signatureValid = chain.length === 1 && checkpointSignatureValid(checkpointPath, chain[0]!.sha256, fixture.monitorPem);
        const expectedRejection = rejected && rejection instanceof Error
          && rejection.message === "time.required: checkpoint 1 has no verified token (checkpoint-tsa: HTTP 500)";
        fixture.facts.required = { rejected, rejectionName: rejected ? rejection instanceof Error ? rejection.name : typeof rejection : null,
          expectedRejection, signatureValid, tokenAbsent, sequenceCount: chain.length, signedCheckpoint: filePin(checkpointPath),
          eventCount: events.length, checkpointRowCount: events.filter(event => event.event_type === "time/checkpoint").length,
          ledger: { ok: verification.ok, chain: verification.chain.ok, governance: verification.governance.ok, anchored: verification.trustRoot.anchored, errors: verification.errors.length },
          timeline: timeline.checkpoints };
        expect(tsa.requests.map(request => request.path)).toEqual(["/http-first"]);
        expect(chain).toHaveLength(1);
        expect(signatureValid && tokenAbsent).toBe(true);
        expect(chain[0]!.checkpoint.ledger).toEqual({ eventCount: before.length, headEventHash: before[before.length - 1]!.event_hash });
        expect(events.map(event => event.event_hash)).toEqual(before.map(event => event.event_hash));
        expect(timeline.checkpoints).toEqual([{ sequence: 1, status: "pending", genTime: null, detail: null }]);
        expect(verification.ok && verification.chain.ok && verification.governance.ok && verification.trustRoot.anchored).toBe(true);
        // First required-control witness follows real HTTP500, signed pending bytes, and unchanged verified ledger positives.
        expect(rejected).toBe(true);
        expect(expectedRejection).toBe(true);
      });
    });
  });

  optionalCheckpointTest("derives a genuine two-checkpoint window and inclusive default and zero-tolerance reader boundaries", async () => {
    await withGrantFixture("CHECKPOINT-TWO-BOUND-WINDOW", "/window-good", async tsa => {
      await withCheckpointWorkspace("CHECKPOINT-TWO-BOUND-WINDOW", tsa, async fixture => {
        fixture.configure(false, "/window-good");
        const beforeFirst = fixture.events();
        const firstResult = await checkpointLedger(tsa.workspace, fixture.trust);
        const firstChain = readCheckpointChain(tsa.workspace);
        expect(firstChain).toHaveLength(1);
        const first = firstChain[0]!;
        const firstGrant = await tsa.verifyReply("/window-good", first.sha256);
        const firstPath = join(checkpointsDir(tsa.workspace), "1.json");
        const firstBytes = readFileSync(firstPath);
        const firstTokenPath = join(checkpointsDir(tsa.workspace), "1.tsr");
        const firstToken = readFileSync(firstTokenPath);
        const middleId = fixture.appendSealedAudit("between-checkpoints");
        const beforeSecond = fixture.events();
        const secondResult = await checkpointLedger(tsa.workspace, fixture.trust);
        const chain = readCheckpointChain(tsa.workspace);
        expect(chain).toHaveLength(2);
        const second = chain[1]!;
        // The explicit occurrence selects this query; the original default still requires one response.
        expect(tsa.requests.map(request => request.path)).toEqual(["/window-good", "/window-good"]);
        const secondGrant = await tsa.verifyReply("/window-good", second.sha256, 1);
        const secondPath = join(checkpointsDir(tsa.workspace), "2.json");
        const secondTokenPath = join(checkpointsDir(tsa.workspace), "2.tsr");
        const secondToken = readFileSync(secondTokenPath);
        const events = fixture.events();
        const verification = fixture.verify();
        const checkpointRows = events.filter(event => event.event_type === "time/checkpoint");
        const middleIndex = events.findIndex(event => event.id === middleId);
        const middle = events[middleIndex];
        const seedIndex = events.findIndex(event => event.id === fixture.seedEventId);
        const seed = events[seedIndex];
        const lastCheckpointIndex = events.findIndex(event => event.id === checkpointRows[1]?.id);
        const lastCheckpoint = events[lastCheckpointIndex];
        const timeline = ledgerTimeline(tsa.workspace, events, { anchors: [tsa.anchor] });
        const zeroTimeline = ledgerTimeline(tsa.workspace, events, { anchors: [tsa.anchor], toleranceMinutes: 0 });
        const lowerMs = Date.parse(firstGrant.genTime);
        const upperMs = Date.parse(secondGrant.genTime);
        const lowerAccuracyMs = firstGrant.accuracyMs ?? 0;
        const upperAccuracyMs = secondGrant.accuracyMs ?? 0;
        // Five minutes is the independent default contract. Date claims have integer-millisecond resolution.
        const defaultLowerEdge = Math.ceil(lowerMs - lowerAccuracyMs - 5 * 60_000);
        const defaultUpperEdge = Math.floor(upperMs + upperAccuracyMs + 5 * 60_000);
        const zeroLowerEdge = Math.ceil(lowerMs - lowerAccuracyMs);
        const zeroUpperEdge = Math.floor(upperMs + upperAccuracyMs);
        const defaultClaims: Array<{ id: string; claimedTs: number; expected: string[] }> = [
          { id: "default-lower-inclusive", claimedTs: defaultLowerEdge, expected: [] },
          { id: "default-lower-one-ms-beyond", claimedTs: defaultLowerEdge - 1, expected: ["BACKDATED_CLAIM"] },
          { id: "default-upper-inclusive", claimedTs: defaultUpperEdge, expected: [] },
          { id: "default-upper-one-ms-beyond", claimedTs: defaultUpperEdge + 1, expected: ["POSTDATED_CLAIM"] }
        ];
        const zeroClaims: Array<{ id: string; claimedTs: number; expected: string[] }> = [
          { id: "zero-lower-inclusive", claimedTs: zeroLowerEdge, expected: [] },
          { id: "zero-lower-one-ms-beyond", claimedTs: zeroLowerEdge - 1, expected: ["BACKDATED_CLAIM"] },
          { id: "zero-upper-inclusive", claimedTs: zeroUpperEdge, expected: [] },
          { id: "zero-upper-one-ms-beyond", claimedTs: zeroUpperEdge + 1, expected: ["POSTDATED_CLAIM"] },
          { id: "zero-refuses-default-lower-edge", claimedTs: defaultLowerEdge, expected: ["BACKDATED_CLAIM"] },
          { id: "zero-refuses-default-upper-edge", claimedTs: defaultUpperEdge, expected: ["POSTDATED_CLAIM"] }
        ];
        const defaultObservations = defaultClaims.map(row => ({ ...row, result: timeline.eventTime(middleIndex, row.claimedTs) }));
        const zeroObservations = zeroClaims.map(row => ({ ...row, result: zeroTimeline.eventTime(middleIndex, row.claimedTs) }));
        const actualMiddle = middle === undefined ? null : timeline.eventTime(middleIndex, middle.ts);
        const seedTime = seed === undefined ? null : timeline.eventTime(seedIndex, seed.ts);
        const lastCheckpointTime = lastCheckpoint === undefined ? null : timeline.eventTime(lastCheckpointIndex, lastCheckpoint.ts);
        const afterReads = fixture.events();
        const finalVerification = fixture.verify();
        const signaturesValid = checkpointSignatureValid(firstPath, first.sha256, fixture.monitorPem)
          && checkpointSignatureValid(secondPath, second.sha256, fixture.monitorPem);
        fixture.facts.twoBoundWindow = {
          results: [firstResult, secondResult], checkpoints: chain.map(row => ({ ...row, tokenSha256: row.checkpoint.sequence === 1 ? sha256(firstToken) : sha256(secondToken) })),
          checkpointPins: [filePin(firstPath), filePin(secondPath)], tokenPins: [filePin(firstTokenPath), filePin(secondTokenPath)],
          signaturesValid, firstCheckpointBytesUnchanged: readFileSync(firstPath).equals(firstBytes),
          independentGrants: [firstGrant, secondGrant].map(attested => ({ genTime: attested.genTime, accuracyMs: attested.accuracyMs,
            digest: attested.messageImprint.digest, anchorId: attested.tsa.anchorId, signerCertSha256: attested.tsa.certSha256,
            tokenSha256: sha256(Buffer.from(attested.tokenDerB64, "base64")), revocationChecked: attested.revocationChecked })),
          checkpointRows: checkpointRows.map(event => ({ id: event.id, eventHash: event.event_hash, meta: JSON.parse(event.meta_json) as unknown })),
          middle: middle === undefined ? null : { id: middle.id, ts: middle.ts, eventHash: middle.event_hash, index: middleIndex, time: actualMiddle },
          seedTime, lastCheckpointTime, defaultObservations, zeroObservations,
          readerClaimsOnly: true, persistedRowTimestampsOrClockEdited: false,
          eventsUnchangedByReader: JSON.stringify(afterReads) === JSON.stringify(events),
          ledger: { beforeReader: verification.ok, afterReader: finalVerification.ok, chain: finalVerification.chain.ok,
            governance: finalVerification.governance.ok, anchored: finalVerification.trustRoot.anchored, errors: finalVerification.errors.length }
        };
        // Real crypto, chain, event and ledger positives precede the first lower-window witness.
        expect(firstResult).toEqual({ sequence: 1, status: "timestamped", failures: [] });
        expect(secondResult).toEqual({ sequence: 2, status: "timestamped", failures: [] });
        expect(signaturesValid).toBe(true);
        expect(readFileSync(firstPath).equals(firstBytes)).toBe(true);
        expect(chain[0]).toEqual(first);
        expect(second.checkpoint.previousCheckpointSha256).toBe(first.sha256);
        expect(first.checkpoint.ledger).toEqual({ eventCount: beforeFirst.length, headEventHash: beforeFirst[beforeFirst.length - 1]!.event_hash });
        expect(second.checkpoint.ledger).toEqual({ eventCount: beforeSecond.length, headEventHash: beforeSecond[beforeSecond.length - 1]!.event_hash });
        expect(firstToken.equals(Buffer.from(firstGrant.tokenDerB64, "base64"))).toBe(true);
        expect(secondToken.equals(Buffer.from(secondGrant.tokenDerB64, "base64"))).toBe(true);
        expect(checkpointRows).toHaveLength(2);
        expect(checkpointRows.map(event => JSON.parse(event.meta_json))).toEqual([
          { checkpointSequence: 1, checkpointSha256: first.sha256, tokenSha256: sha256(firstToken) },
          { checkpointSequence: 2, checkpointSha256: second.sha256, tokenSha256: sha256(secondToken) }
        ]);
        expect(verification.ok && verification.chain.ok && verification.governance.ok && verification.trustRoot.anchored).toBe(true);
        expect(finalVerification.ok && finalVerification.chain.ok && finalVerification.governance.ok && finalVerification.trustRoot.anchored).toBe(true);
        expect(middle !== undefined && middleIndex > events.findIndex(event => event.id === checkpointRows[0]!.id)
          && middleIndex < lastCheckpointIndex && seed !== undefined && lastCheckpoint !== undefined).toBe(true);
        expect(lowerMs <= upperMs).toBe(true); // Equal-second TSA genTimes are valid; no wait or clock edit.
        expect(timeline.checkpoints).toEqual([
          { sequence: 1, status: "timestamped", genTime: firstGrant.genTime, detail: null },
          { sequence: 2, status: "timestamped", genTime: secondGrant.genTime, detail: null }
        ]);
        expect(actualMiddle).not.toBeNull();
        if (actualMiddle === null || middle === undefined || seedTime === null || lastCheckpointTime === null) throw new Error("real window fixture event is absent");
        expect(actualMiddle.time.basis).toBe("attested-window");
        expect(actualMiddle.time.window).toEqual({ notBefore: firstGrant.genTime, notAfter: secondGrant.genTime });
        expect(actualMiddle.time.attested).toEqual(secondGrant);
        expect(actualMiddle.time.claimedAt).toBe(new Date(middle.ts).toISOString());
        expect(seedTime.time.basis).toBe("attested-upper-bound");
        expect(lastCheckpointTime.time.basis).toBe("claimed");
        for (const row of defaultObservations) {
          expect(row.result.findings, row.id).toEqual(row.expected);
          expect(row.result.time.claimedAt, row.id).toBe(new Date(row.claimedTs).toISOString());
          expect(row.result.time.basis, row.id).toBe("attested-window");
          expect(row.result.time.window, row.id).toEqual({ notBefore: firstGrant.genTime, notAfter: secondGrant.genTime });
        }
        for (const row of zeroObservations) {
          expect(row.result.findings, row.id).toEqual(row.expected);
          expect(row.result.time.claimedAt, row.id).toBe(new Date(row.claimedTs).toISOString());
          expect(row.result.time.basis, row.id).toBe("attested-window");
          expect(row.result.time.window, row.id).toEqual({ notBefore: firstGrant.genTime, notAfter: secondGrant.genTime });
        }
        expect(actualMiddle.findings).toEqual([]);
        expect(afterReads).toEqual(events);
      });
    });
  });

  optionalCheckpointTest("uses the default signed trust home and checkpoints after exactly two new audit events", async () => {
    await withGrantFixture("CHECKPOINT-EVENT-CADENCE", "/cadence-good", async tsa => {
      await withCheckpointWorkspace("CHECKPOINT-EVENT-CADENCE", tsa, async fixture => {
        const config = loadAMCConfig(tsa.workspace);
        const requestedTime = { required: false, tsa: [{ name: "checkpoint-tsa", url: tsa.url("/cadence-good"), anchorIds: [ANCHOR_ID], reqPolicy: POLICY }],
          checkpoint: { everyEvents: 2 } };
        config.time = requestedTime; // everyMinutes is absent, so the actual loader must supply its default.
        saveAMCConfig(tsa.workspace, config);
        signAmcConfig(tsa.workspace);
        expect(verifyAmcConfigSignature(tsa.workspace).valid).toBe(true);
        expect(loadAMCConfig(tsa.workspace).time).toEqual(requestedTime);
        const loaded = loadTimeConfig(tsa.workspace);
        expect(loaded.checkpoint).toEqual({ everyEvents: 2, everyMinutes: 15 });
        expect(loaded.required).toBe(false);
        expect(loaded.tsa).toEqual(requestedTime.tsa);
        const transparency = loadTransparencyConfig(tsa.workspace);
        expect(transparency.anchors).toEqual([]);
        const configPin = filePin(join(tsa.workspace, ".amc", "amc.config.yaml"));
        const stages: Array<Record<string, unknown>> = [];
        const independentGrants: Array<Record<string, unknown>> = [];
        const cadence: Record<string, unknown> = { configured: requestedTime, loadedCheckpoint: loaded.checkpoint,
          emptyTransparencyAnchors: transparency.anchors, defaultArgumentsOnly: true, noClockOrRowEdit: true,
          elapsedMinuteOrStudioCredit: false, configPin, stages, independentGrants };
        fixture.facts.eventCadence = cadence;
        const recordGrant = (attested: Awaited<ReturnType<Fixture["verifyReply"]>>): void => {
          independentGrants.push({ genTime: attested.genTime, accuracyMs: attested.accuracyMs, digest: attested.messageImprint.digest,
            anchorId: attested.tsa.anchorId, signerCertSha256: attested.tsa.certSha256,
            tokenSha256: sha256(Buffer.from(attested.tokenDerB64, "base64")), revocationChecked: attested.revocationChecked });
        };
        const capture = (id: string, result: Awaited<ReturnType<typeof timeCheckpointTick>>) => {
          const events = fixture.events();
          const chain = readCheckpointChain(tsa.workspace);
          stages.push({ id, result, observedAtMs: Date.now(), requestPaths: tsa.requests.map(request => request.path),
            events: events.map(event => ({ id: event.id, eventType: event.event_type, ts: event.ts, eventHash: event.event_hash,
              meta: JSON.parse(event.meta_json) as unknown })), chain,
            checkpointPins: chain.map(row => filePin(join(checkpointsDir(tsa.workspace), `${row.checkpoint.sequence}.json`))),
            tokenPins: chain.map(row => { const path = join(checkpointsDir(tsa.workspace), `${row.checkpoint.sequence}.tsr`); return existsSync(path) ? filePin(path) : null; }) });
          return { result, events, chain };
        };
        const beforeFirst = fixture.events();
        expect(beforeFirst.map(event => ({ id: event.id, type: event.event_type }))).toEqual([{ id: fixture.seedEventId, type: "audit" }]);
        expect(readCheckpointChain(tsa.workspace)).toEqual([]);
        expect(tsa.requests).toHaveLength(0);
        const initial = capture("initial", await timeCheckpointTick(tsa.workspace));
        expect(initial.result).toEqual({ ran: true, anchors: [] });
        expect(initial.chain).toHaveLength(1);
        const first = initial.chain[0]!;
        const firstGrant = await tsa.verifyReply("/cadence-good", first.sha256);
        recordGrant(firstGrant);
        const firstPath = join(checkpointsDir(tsa.workspace), "1.json");
        const firstTokenPath = join(checkpointsDir(tsa.workspace), "1.tsr");
        const firstBytes = readFileSync(firstPath);
        const firstToken = readFileSync(firstTokenPath);
        const firstRows = initial.events.filter(event => event.event_type === "time/checkpoint");
        const firstVerification = fixture.verify();
        cadence.firstLedger = { ok: firstVerification.ok, chain: firstVerification.chain.ok, governance: firstVerification.governance.ok,
          anchored: firstVerification.trustRoot.anchored, errors: firstVerification.errors.length };
        expect(tsa.requests.map(request => request.path)).toEqual(["/cadence-good"]);
        expect(checkpointSignatureValid(firstPath, first.sha256, fixture.monitorPem)).toBe(true);
        expect(first.checkpoint.previousCheckpointSha256).toBeNull();
        expect(first.checkpoint.ledger).toEqual({ eventCount: beforeFirst.length, headEventHash: beforeFirst[beforeFirst.length - 1]!.event_hash });
        expect(firstToken.equals(Buffer.from(firstGrant.tokenDerB64, "base64"))).toBe(true);
        expect(firstRows).toHaveLength(1);
        expect(JSON.parse(firstRows[0]!.meta_json)).toEqual({ checkpointSequence: 1, checkpointSha256: first.sha256, tokenSha256: sha256(firstToken) });
        expect(initial.events.slice(0, beforeFirst.length)).toEqual(beforeFirst);
        expect(initial.events).toHaveLength(beforeFirst.length + 1);
        expect(firstVerification.ok && firstVerification.chain.ok && firstVerification.governance.ok && firstVerification.trustRoot.anchored).toBe(true);

        const checkpointOnly = capture("checkpoint-only", await timeCheckpointTick(tsa.workspace));
        expect(checkpointOnly.result).toEqual({ ran: false, anchors: [] });
        expect(checkpointOnly.events).toEqual(initial.events);
        expect(checkpointOnly.chain).toEqual(initial.chain);
        expect(tsa.requests.map(request => request.path)).toEqual(["/cadence-good"]);
        expect(readFileSync(firstPath).equals(firstBytes) && readFileSync(firstTokenPath).equals(firstToken)).toBe(true);

        const firstAuditId = fixture.appendSealedAudit("cadence-first-audit");
        const beforeOne = fixture.events();
        const afterFirstHead = beforeOne.slice(first.checkpoint.ledger.eventCount);
        cadence.oneEventBeforeTick = { firstAuditId, afterHeadIds: afterFirstHead.map(event => event.id), afterHeadTypes: afterFirstHead.map(event => event.event_type) };
        expect(afterFirstHead.map(event => event.event_type)).toEqual(["time/checkpoint", "audit"]);
        expect(afterFirstHead.filter(event => event.event_type !== "time/checkpoint").map(event => event.id)).toEqual([firstAuditId]);
        expect(Date.now() - Date.parse(first.checkpoint.claimedAt)).toBeLessThan(15 * 60_000);
        const one = capture("one-new-audit", await timeCheckpointTick(tsa.workspace));
        // First checkpoint-row-count control witness follows the genuine first checkpoint and independent grant.
        expect(one.result).toEqual({ ran: false, anchors: [] });
        expect(one.events).toEqual(beforeOne);
        expect(one.chain).toEqual(initial.chain);
        expect(tsa.requests.map(request => request.path)).toEqual(["/cadence-good"]);
        expect(readFileSync(firstPath).equals(firstBytes) && readFileSync(firstTokenPath).equals(firstToken)).toBe(true);

        const secondAuditId = fixture.appendSealedAudit("cadence-second-audit");
        const beforeSecond = fixture.events();
        const afterFirstHeadAtTwo = beforeSecond.slice(first.checkpoint.ledger.eventCount);
        cadence.twoEventsBeforeTick = { secondAuditId, afterHeadIds: afterFirstHeadAtTwo.map(event => event.id), afterHeadTypes: afterFirstHeadAtTwo.map(event => event.event_type) };
        expect(afterFirstHeadAtTwo.map(event => event.event_type)).toEqual(["time/checkpoint", "audit", "audit"]);
        expect(afterFirstHeadAtTwo.filter(event => event.event_type !== "time/checkpoint").map(event => event.id)).toEqual([firstAuditId, secondAuditId]);
        expect(Date.now() - Date.parse(first.checkpoint.claimedAt)).toBeLessThan(15 * 60_000);
        const two = capture("two-new-audits", await timeCheckpointTick(tsa.workspace));
        // First exact-threshold control witness; the elapsed-minute path has not become due.
        expect(two.result).toEqual({ ran: true, anchors: [] });
        expect(two.chain).toHaveLength(2);
        expect(tsa.requests.map(request => request.path)).toEqual(["/cadence-good", "/cadence-good"]);
        const second = two.chain[1]!;
        const secondGrant = await tsa.verifyReply("/cadence-good", second.sha256, 1);
        recordGrant(secondGrant);
        const secondPath = join(checkpointsDir(tsa.workspace), "2.json");
        const secondTokenPath = join(checkpointsDir(tsa.workspace), "2.tsr");
        const secondBytes = readFileSync(secondPath);
        const secondToken = readFileSync(secondTokenPath);
        expect(two.chain[0]).toEqual(first);
        expect(second.checkpoint.previousCheckpointSha256).toBe(first.sha256);
        expect(second.checkpoint.ledger).toEqual({ eventCount: beforeSecond.length, headEventHash: beforeSecond[beforeSecond.length - 1]!.event_hash });
        expect(secondToken.equals(Buffer.from(secondGrant.tokenDerB64, "base64"))).toBe(true);
        expect(two.events.slice(0, beforeSecond.length)).toEqual(beforeSecond);
        expect(two.events).toHaveLength(beforeSecond.length + 1);
        const reset = capture("reset", await timeCheckpointTick(tsa.workspace));
        expect(reset.result).toEqual({ ran: false, anchors: [] });
        expect(reset.events).toEqual(two.events);
        expect(reset.chain).toEqual(two.chain);
        expect(tsa.requests.map(request => request.path)).toEqual(["/cadence-good", "/cadence-good"]);
        const checkpointRows = reset.events.filter(event => event.event_type === "time/checkpoint");
        const finalVerification = fixture.verify();
        const signaturesValid = checkpointSignatureValid(firstPath, first.sha256, fixture.monitorPem)
          && checkpointSignatureValid(secondPath, second.sha256, fixture.monitorPem);
        const oldFilesUnchanged = readFileSync(firstPath).equals(firstBytes) && readFileSync(firstTokenPath).equals(firstToken)
          && readFileSync(secondPath).equals(secondBytes) && readFileSync(secondTokenPath).equals(secondToken);
        cadence.final = { signaturesValid, oldFilesUnchanged, configUnchanged: JSON.stringify(filePin(configPin.path)) === JSON.stringify(configPin),
          checkpointRows: checkpointRows.map(event => ({ id: event.id, eventHash: event.event_hash, meta: JSON.parse(event.meta_json) as unknown })),
          ledger: { ok: finalVerification.ok, chain: finalVerification.chain.ok, governance: finalVerification.governance.ok,
            anchored: finalVerification.trustRoot.anchored, errors: finalVerification.errors.length } };
        expect(signaturesValid && oldFilesUnchanged).toBe(true);
        expect(filePin(configPin.path)).toEqual(configPin);
        expect(checkpointRows).toHaveLength(2);
        expect(checkpointRows.map(event => JSON.parse(event.meta_json))).toEqual([
          { checkpointSequence: 1, checkpointSha256: first.sha256, tokenSha256: sha256(firstToken) },
          { checkpointSequence: 2, checkpointSha256: second.sha256, tokenSha256: sha256(secondToken) }
        ]);
        expect(finalVerification.ok && finalVerification.chain.ok && finalVerification.governance.ok && finalVerification.trustRoot.anchored).toBe(true);
      });
    });
  });

  optionalCheckpointTest("persists backdated and postdated producer claims in the signed ledger and reports their genuine checkpoint window", async () => {
    await withGrantFixture("CHECKPOINT-PERSISTED-PRODUCER-CLAIMS", "/producer-good", async tsa => {
      await withCheckpointWorkspace("CHECKPOINT-PERSISTED-PRODUCER-CLAIMS", tsa, async fixture => {
        fixture.facts.windowBoundary = "supported caller input.ts is stored and signed between two genuine checkpoints; no post-append row, clock, scheduler or policy change";
        const stages: Array<Record<string, unknown>> = [];
        const independentGrants: Array<Record<string, unknown>> = [];
        const producer: Record<string, unknown> = { supportedProducerInputOnly: true, noPostAppendRowOrClockEdit: true,
          elapsedMinuteOrStudioCredit: false, stages, independentGrants };
        fixture.facts.producerClaims = producer;
        const recordGrant = (attested: Awaited<ReturnType<Fixture["verifyReply"]>>): void => {
          independentGrants.push({ genTime: attested.genTime, accuracyMs: attested.accuracyMs, digest: attested.messageImprint.digest,
            anchorId: attested.tsa.anchorId, signerCertSha256: attested.tsa.certSha256,
            tokenSha256: sha256(Buffer.from(attested.tokenDerB64, "base64")), revocationChecked: attested.revocationChecked });
        };
        fixture.configure(false, "/producer-good");
        const beforeFirst = fixture.events();
        const firstResult = await checkpointLedger(tsa.workspace, fixture.trust);
        const firstChain = readCheckpointChain(tsa.workspace);
        stages.push({ id: "first-checkpoint", result: firstResult, chain: firstChain, requestPaths: tsa.requests.map(request => request.path) });
        expect(firstChain).toHaveLength(1);
        const first = firstChain[0]!;
        const firstGrant = await tsa.verifyReply("/producer-good", first.sha256);
        recordGrant(firstGrant);
        const firstPath = join(checkpointsDir(tsa.workspace), "1.json");
        const firstTokenPath = join(checkpointsDir(tsa.workspace), "1.tsr");
        const firstBytes = readFileSync(firstPath);
        const firstToken = readFileSync(firstTokenPath);
        const firstSignatureValid = checkpointSignatureValid(firstPath, first.sha256, fixture.monitorPem);
        const firstEvents = fixture.events();
        const firstRows = firstEvents.filter(event => event.event_type === "time/checkpoint");
        const firstVerification = fixture.verify();
        producer.first = { result: firstResult, checkpoint: first, checkpointPin: filePin(firstPath), tokenPin: filePin(firstTokenPath),
          signatureValid: firstSignatureValid, tokenMatchesIndependentGrant: firstToken.equals(Buffer.from(firstGrant.tokenDerB64, "base64")),
          checkpointRows: firstRows.map(event => ({ id: event.id, eventHash: event.event_hash, meta: JSON.parse(event.meta_json) as unknown })),
          ledger: { ok: firstVerification.ok, chain: firstVerification.chain.ok, governance: firstVerification.governance.ok,
            anchored: firstVerification.trustRoot.anchored, errors: firstVerification.errors.length } };
        expect(firstResult).toEqual({ sequence: 1, status: "timestamped", failures: [] });
        expect(firstSignatureValid).toBe(true);
        expect(firstToken.equals(Buffer.from(firstGrant.tokenDerB64, "base64"))).toBe(true);
        expect(first.checkpoint.ledger).toEqual({ eventCount: beforeFirst.length, headEventHash: beforeFirst[beforeFirst.length - 1]!.event_hash });
        expect(firstRows).toHaveLength(1);
        expect(JSON.parse(firstRows[0]!.meta_json)).toEqual({ checkpointSequence: 1, checkpointSha256: first.sha256, tokenSha256: sha256(firstToken) });
        expect(firstVerification.ok && firstVerification.chain.ok && firstVerification.governance.ok && firstVerification.trustRoot.anchored).toBe(true);

        const lowerMs = Date.parse(firstGrant.genTime);
        const lowerAccuracyMs = firstGrant.accuracyMs ?? 0;
        const backdatedTs = Math.ceil(lowerMs - lowerAccuracyMs - 5 * 60_000) - 1;
        const postdatedTs = lowerMs + 24 * 60 * 60_000; // A producer claim, never a clock or row override.
        producer.requestedClaims = { backdatedTs, postdatedTs, postdateOffsetMs: 24 * 60 * 60_000 };
        const backdatedId = fixture.appendSealedAudit("producer-backdated", backdatedTs);
        const afterBackdate = fixture.events();
        const backdatedStored = afterBackdate.find(event => event.id === backdatedId);
        stages.push({ id: "backdated-appended", requestedTs: backdatedTs, row: backdatedStored === undefined ? null : {
          id: backdatedStored.id, ts: backdatedStored.ts, sessionId: backdatedStored.session_id, eventType: backdatedStored.event_type,
          eventHash: backdatedStored.event_hash, previousHash: backdatedStored.prev_event_hash, index: afterBackdate.indexOf(backdatedStored) } });
        expect(backdatedStored).toBeDefined();
        if (backdatedStored === undefined) throw new Error("persisted backdated producer event is absent");
        expect(backdatedStored.ts).toBe(backdatedTs);
        const postdatedId = fixture.appendSealedAudit("producer-postdated", postdatedTs);
        const beforeSecond = fixture.events();
        const postdatedStored = beforeSecond.find(event => event.id === postdatedId);
        stages.push({ id: "postdated-appended", requestedTs: postdatedTs, row: postdatedStored === undefined ? null : {
          id: postdatedStored.id, ts: postdatedStored.ts, sessionId: postdatedStored.session_id, eventType: postdatedStored.event_type,
          eventHash: postdatedStored.event_hash, previousHash: postdatedStored.prev_event_hash, index: beforeSecond.indexOf(postdatedStored) } });
        expect(postdatedStored).toBeDefined();
        if (postdatedStored === undefined) throw new Error("persisted postdated producer event is absent");
        expect(postdatedStored.ts).toBe(postdatedTs);

        const secondResult = await checkpointLedger(tsa.workspace, fixture.trust);
        const chain = readCheckpointChain(tsa.workspace);
        stages.push({ id: "second-checkpoint", result: secondResult, chain, requestPaths: tsa.requests.map(request => request.path) });
        expect(chain).toHaveLength(2);
        const second = chain[1]!;
        expect(tsa.requests.map(request => request.path)).toEqual(["/producer-good", "/producer-good"]);
        const secondGrant = await tsa.verifyReply("/producer-good", second.sha256, 1);
        recordGrant(secondGrant);
        const secondPath = join(checkpointsDir(tsa.workspace), "2.json");
        const secondTokenPath = join(checkpointsDir(tsa.workspace), "2.tsr");
        const secondBytes = readFileSync(secondPath);
        const secondToken = readFileSync(secondTokenPath);
        const events = fixture.events();
        const verification = fixture.verify();
        const checkpointRows = events.filter(event => event.event_type === "time/checkpoint");
        const backdatedIndex = events.findIndex(event => event.id === backdatedId);
        const postdatedIndex = events.findIndex(event => event.id === postdatedId);
        const backdated = events[backdatedIndex];
        const postdated = events[postdatedIndex];
        const lowerIndex = events.findIndex(event => event.id === firstRows[0]!.id);
        const upperIndex = events.findIndex(event => event.id === checkpointRows[1]?.id);
        const signaturesValid = checkpointSignatureValid(firstPath, first.sha256, fixture.monitorPem)
          && checkpointSignatureValid(secondPath, second.sha256, fixture.monitorPem);
        const upperMs = Date.parse(secondGrant.genTime);
        const upperAccuracyMs = secondGrant.accuracyMs ?? 0;
        const defaultLowerEdge = Math.ceil(lowerMs - lowerAccuracyMs - 5 * 60_000);
        const defaultUpperEdge = Math.floor(upperMs + upperAccuracyMs + 5 * 60_000);
        producer.covered = { results: [firstResult, secondResult], checkpoints: chain,
          checkpointPins: [filePin(firstPath), filePin(secondPath)], tokenPins: [filePin(firstTokenPath), filePin(secondTokenPath)],
          signaturesValid, firstCheckpointBytesUnchanged: readFileSync(firstPath).equals(firstBytes),
          beforeSecondHead: { eventCount: beforeSecond.length, headEventHash: beforeSecond[beforeSecond.length - 1]!.event_hash },
          checkpointRows: checkpointRows.map(event => ({ id: event.id, eventHash: event.event_hash, meta: JSON.parse(event.meta_json) as unknown })),
          lowerIndex, backdatedIndex, postdatedIndex, upperIndex, bounds: { lowerMs, upperMs, lowerAccuracyMs, upperAccuracyMs, defaultLowerEdge, defaultUpperEdge },
          ledger: { ok: verification.ok, chain: verification.chain.ok, governance: verification.governance.ok,
            anchored: verification.trustRoot.anchored, errors: verification.errors.length } };
        expect(secondResult).toEqual({ sequence: 2, status: "timestamped", failures: [] });
        expect(signaturesValid).toBe(true);
        expect(chain[0]).toEqual(first);
        expect(second.checkpoint.previousCheckpointSha256).toBe(first.sha256);
        expect(second.checkpoint.ledger).toEqual({ eventCount: beforeSecond.length, headEventHash: beforeSecond[beforeSecond.length - 1]!.event_hash });
        expect(secondToken.equals(Buffer.from(secondGrant.tokenDerB64, "base64"))).toBe(true);
        expect(checkpointRows).toHaveLength(2);
        expect(checkpointRows.map(event => JSON.parse(event.meta_json))).toEqual([
          { checkpointSequence: 1, checkpointSha256: first.sha256, tokenSha256: sha256(firstToken) },
          { checkpointSequence: 2, checkpointSha256: second.sha256, tokenSha256: sha256(secondToken) }
        ]);
        expect(verification.ok && verification.chain.ok && verification.governance.ok && verification.trustRoot.anchored).toBe(true);
        expect(events.slice(0, beforeSecond.length)).toEqual(beforeSecond);
        expect(backdated !== undefined && postdated !== undefined && lowerIndex >= 0 && lowerIndex < backdatedIndex
          && backdatedIndex < postdatedIndex && postdatedIndex < upperIndex).toBe(true);
        if (backdated === undefined || postdated === undefined) throw new Error("covered persisted producer event is absent");
        expect(backdated.ts).toBe(backdatedTs);
        expect(postdated.ts).toBe(postdatedTs);
        expect(lowerMs <= upperMs).toBe(true); // Equal-second genuine tokens are valid; do not wait or change a clock.
        expect(backdated.ts < defaultLowerEdge).toBe(true);
        expect(postdated.ts > defaultUpperEdge).toBe(true); // An actual failed premise stays failed; never rewrite or retry it.

        const timeline = ledgerTimeline(tsa.workspace, events, { anchors: [tsa.anchor] });
        const backdatedTime = timeline.eventTime(backdatedIndex, backdated.ts);
        const postdatedTime = timeline.eventTime(postdatedIndex, postdated.ts);
        producer.observations = { checkpoints: timeline.checkpoints,
          backdated: { id: backdated.id, index: backdatedIndex, requestedTs: backdatedTs, storedTs: backdated.ts, result: backdatedTime },
          postdated: { id: postdated.id, index: postdatedIndex, requestedTs: postdatedTs, storedTs: postdated.ts, result: postdatedTime } };
        expect(timeline.checkpoints).toEqual([
          { sequence: 1, status: "timestamped", genTime: firstGrant.genTime, detail: null },
          { sequence: 2, status: "timestamped", genTime: secondGrant.genTime, detail: null }
        ]);
        for (const [event, result] of [[backdated, backdatedTime], [postdated, postdatedTime]] as const) {
          expect(result.time.claimedAt).toBe(new Date(event.ts).toISOString());
          expect(result.time.basis).toBe("attested-window");
          expect(result.time.window).toEqual({ notBefore: firstGrant.genTime, notAfter: secondGrant.genTime });
          expect(result.time.attested).toEqual(secondGrant);
        }
        expect(backdatedTime.findings).toEqual(["BACKDATED_CLAIM"]);
        expect(postdatedTime.findings).toEqual(["POSTDATED_CLAIM"]);
        const afterReads = fixture.events();
        const finalVerification = fixture.verify();
        const oldFilesUnchanged = readFileSync(firstPath).equals(firstBytes) && readFileSync(firstTokenPath).equals(firstToken)
          && readFileSync(secondPath).equals(secondBytes) && readFileSync(secondTokenPath).equals(secondToken);
        producer.final = { eventsUnchangedByReader: JSON.stringify(afterReads) === JSON.stringify(events), oldFilesUnchanged,
          ledger: { ok: finalVerification.ok, chain: finalVerification.chain.ok, governance: finalVerification.governance.ok,
            anchored: finalVerification.trustRoot.anchored, errors: finalVerification.errors.length } };
        expect(afterReads).toEqual(events);
        expect(oldFilesUnchanged).toBe(true);
        expect(finalVerification.ok && finalVerification.chain.ok && finalVerification.governance.ok && finalVerification.trustRoot.anchored).toBe(true);
      });
    });
  });
});
