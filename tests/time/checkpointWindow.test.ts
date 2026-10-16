import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect } from "vitest";
import { cleanSourceRuntimeEnvironment } from "../../scripts/clean-source-check.mjs";
import { getPublicKeyPem, verifyHexDigest } from "../../src/crypto/keys.js";
import { closeGuardDb, withWorkspaceScope } from "../../src/enforce/evidenceEmitter.js";
import { hashBinaryOrPath, openLedger, verifyLedgerIntegrity } from "../../src/ledger/ledger.js";
import { closeSqlitePool, sqlitePoolStats } from "../../src/storage/sqlitePool.js";
import { checkpointLedger, checkpointsDir, completePendingCheckpoints, ledgerTimeline, readCheckpointChain } from "../../src/time/checkpoint.js";
import { loadTimeConfig } from "../../src/time/tsaClient.js";
import { loadTrustContext, type TrustContext } from "../../src/trust/trustContext.js";
import type { EvidenceEvent } from "../../src/types.js";
import { lockVault, vaultStatus } from "../../src/vault/vault.js";
import { initWorkspace, loadAMCConfig, saveAMCConfig, signAmcConfig, verifyAmcConfigSignature } from "../../src/workspace.js";
import { rawSignature, testKey, trustList } from "../trust/trustFixtures.js";
import { ANCHOR_ID, POLICY, optionalTsaTest, withGrantFixture, type Fixture } from "./tsaTestFixture.js";

const CHECKOUT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const optionalCheckpointTest = optionalTsaTest(["CHECKPOINT-PENDING-GRANT", "CHECKPOINT-REQUIRED-REFUSAL"]);
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
    windowBoundary: "one checkpoint supplies an upper bound; no lower-window, scheduler, seal or certificate qualification"
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
      const sessionId = randomUUID();
      const seedEventId = useLedger(false, ledger => {
        ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "amc-p125-checkpoint-fixture",
          binarySha256: hashBinaryOrPath("amc-p125-checkpoint-fixture", "1") });
        const id = ledger.appendEvidence({ sessionId, runtime: "unknown", eventType: "audit", inline: true, payloadExt: "json",
          payload: JSON.stringify({ schema: "amc-p125-checkpoint-fixture-event/1", caseId }), meta: { fixtureCase: caseId } });
        ledger.sealSession(sessionId);
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
      await body({ trust, monitorPem, monitorFingerprint, seedEventId, events, verify, configure, facts });
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
});
