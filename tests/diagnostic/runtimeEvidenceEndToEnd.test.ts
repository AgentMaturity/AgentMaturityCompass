import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { cleanSourceRuntimeEnvironment } from "../../scripts/clean-source-check.mjs";
import { agentToolset, type AgentToolset } from "../../src/agent/agentToolset.js";
import { initBudgets } from "../../src/budgets/budgets.js";
import { getPublicKeyPem, verifyHexDigest } from "../../src/crypto/keys.js";
import { emitterAdmits, emitterById, fromRegisteredEmitter } from "../../src/diagnostic/evidenceEmitters.js";
import { parseEvidenceEventWith } from "../../src/diagnostic/gates.js";
import { evaluateLevels } from "../../src/diagnostic/levelSemantics.js";
import { LIVE_PROJECTION_VERSION } from "../../src/diagnostic/liveEvidenceProjection.js";
import { questionBank } from "../../src/diagnostic/questionBank.js";
import { closeGuardDb, withWorkspaceScope } from "../../src/enforce/evidenceEmitter.js";
import { openLedger, verifyLedgerIntegrity } from "../../src/ledger/ledger.js";
import { openSessionEventStore } from "../../src/persistence/openSessionEventStore.js";
import type { SessionEventStore } from "../../src/persistence/sessionEventStore.js";
import { writeRuntimeFirewallPolicy } from "../../src/runtime/firewall.js";
import { SessionService } from "../../src/session/sessionService.js";
import { extractEnvelope } from "../../src/session/sessionTypes.js";
import { closeSqlitePool, sqlitePoolStats } from "../../src/storage/sqlitePool.js";
import { blobCurrentKeyPath, blobCurrentKeySigPath, ensureBlobKey, verifyBlobCurrentKeySignature } from "../../src/storage/blobs/blobKeys.js";
import { defaultToolsConfig } from "../../src/toolhub/toolsSchema.js";
import { initToolsConfig, loadVerifiedToolsConfigSnapshot } from "../../src/toolhub/toolhubValidators.js";
import { readSessionRootDescriptor } from "../../src/transparency/sessionRootDescriptor.js";
import { loadTrustContext } from "../../src/trust/trustContext.js";
import type { EvidenceEvent, SessionRecord } from "../../src/types.js";
import { dayKey } from "../../src/utils/time.js";
import { lockVault, vaultStatus } from "../../src/vault/vault.js";
import { initWorkspace } from "../../src/workspace.js";

const CHECKOUT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

function filePin(path: string) {
  const physicalPath = realpathSync(path);
  const stat = lstatSync(physicalPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("selected input is not a regular physical file");
  const bytes = readFileSync(physicalPath);
  return { path, physicalPath, bytes: bytes.length, sha256: hash(bytes), dev: stat.dev, inode: stat.ino, nlink: stat.nlink };
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
  return JSON.stringify(keys) === JSON.stringify(Object.keys(expected).sort())
    && keys.every((key) => process.env[key] === expected[key]);
}

interface OwnedSession {
  store: SessionEventStore;
  session: SessionService | null;
  toolset: AgentToolset | null;
  sessionId: string | null;
  opened: boolean;
  turnOpen: boolean;
  turnEndAttempted: boolean;
  turnEnded: boolean;
  turnSealAttempted: boolean;
  turnSealed: boolean;
  toolsetCloseAttempted: boolean;
  toolsetClosed: boolean;
  sessionCloseAttempted: boolean;
  sessionClosed: boolean;
  storeClosed: boolean;
  fallbackStoreCloseAttempted: boolean;
}

// One real native seam fixture. It does not ask a model to make these calls.
it("binds real allowed and denied native reads from two sealed sessions to the shipped AMC-5.29 gates", async () => {
  const retainedRoot = realpathSync(mkdtempSync(join(tmpdir(), "amc-p107-native-evidence-")));
  chmodSync(retainedRoot, 0o700);
  const workspace = join(retainedRoot, "workspace");
  const home = join(retainedRoot, "home");
  const publicPath = join(retainedRoot, "public-evidence.json");
  const previousEnvironment = { ...process.env };
  const secrets = new Set<string>();
  const owners: OwnedSession[] = [];
  const cleanupErrors: Error[] = [];
  let bodyError: unknown;
  let bodyFailed = false;
  let workspaceInitialized = false;
  let vaultLocked = false;
  let environmentRestored = false;
  let poolClosed = false;
  let nativeBefore: ReturnType<typeof filePin> | null = null;
  let protectedBeforePins: Array<ReturnType<typeof filePin>> = [];
  const poolKey = `ledger:${resolve(workspace)}:${join(resolve(workspace), ".amc", "evidence.sqlite")}`;
  const facts: Record<string, unknown> = {
    schema: "amc-p107-native-evidence/1", checkout: CHECKOUT, retainedRoot,
    noModelLoop: true, noClockOrGateEdits: true, backend: "sqlite",
    nativeCalls: [], sessions: [], auditRows: [], roots: [],
    trustBoundary: "monitor public key captured before calls in this owned fixture; no external identity attestation",
    limitation: "two real sessions establish mapped native evidence; actual UTC-day continuity controls the earned level"
  };

  const redact = (text: string): string => {
    let safe = text;
    for (const secret of secrets) if (secret.length > 0) safe = safe.split(secret).join("[redacted]");
    return safe.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[redacted private key]");
  };
  const safeError = (error: unknown): Error => {
    // Keep an AssertionError's identity and original first frame. Assertion operands below are public facts only.
    const safe = error instanceof Error ? error : new Error(String(error));
    safe.message = redact(safe.message);
    if (safe.stack) safe.stack = redact(safe.stack);
    return safe;
  };
  const errorFact = (error: unknown) => {
    const safe = safeError(error);
    return { name: safe.name, message: safe.message, stack: safe.stack ?? null };
  };
  const cleanup = (label: string, operation: () => void): void => {
    try { operation(); }
    catch (error) {
      const safe = safeError(error);
      const tagged = new Error(`${label}: ${safe.message}`);
      tagged.name = safe.name;
      tagged.stack = safe.stack;
      cleanupErrors.push(tagged);
    }
  };
  const closeOwnedSession = (owned: OwnedSession, completed: boolean): void => {
    if (owned.toolset !== null && !owned.toolsetCloseAttempted) {
      owned.toolsetCloseAttempted = true;
      cleanup("toolset.close", () => { owned.toolset!.close(); owned.toolsetClosed = true; });
    }
    if (owned.session !== null && owned.opened && !owned.sessionCloseAttempted) {
      if (owned.turnOpen && !owned.turnEndAttempted) {
        owned.turnEndAttempted = true;
        cleanup("session.endTurn", () => {
          owned.session!.endTurn({ reason: completed ? "complete" : "error" });
          owned.turnEnded = true;
        });
      }
      if (owned.turnOpen && owned.turnEnded && !owned.turnSealAttempted) {
        owned.turnSealAttempted = true;
        cleanup("session.sealTurn", () => {
          owned.session!.sealTurn();
          owned.turnSealed = true;
          owned.turnOpen = false;
        });
      }
      if (!owned.turnOpen) {
        owned.sessionCloseAttempted = true;
        cleanup("session.close", () => {
          owned.session!.close({ reason: completed ? "completed" : "failed" });
          owned.sessionClosed = true;
          owned.storeClosed = true; // Successful SessionService.close closes this exact injected store.
        });
      }
      // A failed end/seal leaves the session unclosed. Release its retained store below;
      // never retry a non-idempotent seal or manufacture session completion after failure.
    }
    if (!owned.storeClosed && !owned.fallbackStoreCloseAttempted) {
      // Retained before SessionService construction/open: constructor failure cannot orphan its real handle.
      // This is an idempotent store release, never a retry of session.close or its non-idempotent seal.
      owned.fallbackStoreCloseAttempted = true;
      cleanup("retained store.close", () => { owned.store.close(); owned.storeClosed = true; });
    }
  };

  try {
    mkdirSync(home, { mode: 0o700 });
    mkdirSync(workspace, { mode: 0o700 });
    const isolated: NodeJS.ProcessEnv = cleanSourceRuntimeEnvironment(previousEnvironment, home);
    // Keep the shipped guard persistence enabled and explicitly rooted in the owned fixture.
    isolated.AMC_GUARD_EVENTS_DB_PATH = join(workspace, ".amc", "guard_events.sqlite");
    isolated.AMC_GUARD_RECEIPTS_WORKSPACE = workspace;
    secrets.add(isolated.AMC_VAULT_PASSPHRASE!);
    replaceEnvironment(isolated);
    await withWorkspaceScope(workspace, async () => {
      facts.environment = {
        helper: "scripts/clean-source-check.mjs#cleanSourceRuntimeEnvironment",
        privateHome: process.env.HOME === home,
        signingEnabled: process.env.AMC_NO_SIGN === undefined,
        storageOverrideAbsent: process.env.AMC_SESSION_STORE === undefined,
        trustOverridesAbsent: ["AMC_EXPECTED_MONITOR_FINGERPRINT", "AMC_TRUST_LIST", "AMC_TRUST_ROOT"].every((key) => process.env[key] === undefined),
        loaderOverridesAbsent: process.env.NODE_OPTIONS === undefined && process.env.NODE_PATH === undefined
      };
      const nativePath = join(dirname(createRequire(import.meta.url).resolve("better-sqlite3/package.json")), "build", "Release", "better_sqlite3.node");
      nativeBefore = filePin(nativePath);
      const capturedNative = nativeBefore;
      facts.nativeBefore = nativeBefore;
      workspaceInitialized = true;
      initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
      initBudgets(workspace, "default");
      // Initial encrypted-blob key creation rewrites public mirrors; finish setup before capturing their pins.
      const blobKey = ensureBlobKey(workspace);
      const blobKeySignature = verifyBlobCurrentKeySignature(workspace);
      facts.blobKeySetup = { keyVersion: blobKey.keyVersion, algorithm: blobKey.algorithm, signatureValid: blobKeySignature.valid };
      if (blobKey.keyVersion !== 1 || !blobKeySignature.valid) throw new Error("owned signed blob key setup did not verify");
      mkdirSync(join(workspace, "workspace"), { mode: 0o700 });
      const allowedContent = "owned P1-07 allowed native read content\n";
      const deniedContent = "owned P1-07 denied native read canary\n";
      for (const content of [allowedContent, deniedContent]) { secrets.add(content); secrets.add(content.trim()); }
      const allowedPath = join(workspace, "workspace", "allowed.txt");
      const deniedPath = join(workspace, "workspace", "denied.txt");
      writeFileSync(allowedPath, allowedContent, { flag: "wx", mode: 0o600 });
      writeFileSync(deniedPath, deniedContent, { flag: "wx", mode: 0o600 });
      const config = defaultToolsConfig();
      config.tools.allowedTools = config.tools.allowedTools.filter((tool) => tool.name === "fs.read");
      const readTool = config.tools.allowedTools[0];
      if (!readTool) throw new Error("shipped fs.read policy is absent");
      readTool.deny = { ...readTool.deny, paths: [...(readTool.deny?.paths ?? []), "./workspace/denied.txt"] };
      const policyPaths = initToolsConfig(workspace, config);
      const firewall = writeRuntimeFirewallPolicy({ workspace, mode: "block", enabled: true, failClosedOnMissingPolicy: true });
      const snapshot = loadVerifiedToolsConfigSnapshot(workspace);
      if (!snapshot.signatureValid || snapshot.config === null || snapshot.digestSha256 === null) throw new Error("owned signed tool policy did not verify");
      const policyDigest = snapshot.digestSha256;
      const monitorPem = getPublicKeyPem(workspace, "monitor");
      const monitorFingerprint = hash(monitorPem);
      const publicKeys = ["monitor", "auditor"] as const;
      const pinnedPaths = [allowedPath, deniedPath, policyPaths.configPath, policyPaths.sigPath,
        firewall.path, firewall.signaturePath, blobCurrentKeyPath(workspace), blobCurrentKeySigPath(workspace),
        ...publicKeys.map((kind) => join(workspace, ".amc", "keys", `${kind}_ed25519.pub`))];
      const beforePins = pinnedPaths.map(filePin);
      protectedBeforePins = beforePins;
      facts.beforePins = beforePins;
      facts.policy = { signatureValid: snapshot.signatureValid, digest: policyDigest, firewallMode: firewall.policy.mode, firewallMirrorTrusted: firewall.mirrorTrusted };
      facts.monitorFingerprint = monitorFingerprint;
      // Retain the pre-call public pin outside the workspace the verifier reads.
      writeFileSync(join(retainedRoot, "pre-call-public-pins.json"), JSON.stringify({ monitorFingerprint, beforePins, nativeBefore }, null, 2), { flag: "wx", mode: 0o600 });

      const calls: Array<{ sessionId: string; callId: string; allowed: boolean; outcome: string; denied: boolean; timedOut: boolean; outputMatchesAllowed: boolean; deniedCanaryAbsent: boolean }> = [];
      const readiness: Array<Record<string, unknown>> = [];
      facts.nativeCalls = calls;
      facts.readiness = readiness;
      for (const number of [1, 2]) {
        const store = openSessionEventStore(workspace, "sqlite");
        const owned: OwnedSession = {
          store, session: null, toolset: null, sessionId: null, opened: false, turnOpen: false,
          turnEndAttempted: false, turnEnded: false, turnSealAttempted: false, turnSealed: false,
          toolsetCloseAttempted: false, toolsetClosed: false, sessionCloseAttempted: false,
          sessionClosed: false, storeClosed: false, fallbackStoreCloseAttempted: false
        };
        owners.push(owned);
        let callsCompleted = false;
        try {
          owned.session = new SessionService(workspace, store);
          owned.session.open({ agentId: "default", harnessVersion: "3.2.0", runtime: "amc",
            compositionDigest: hash(JSON.stringify({ policyDigest, tool: "fs.read", recorder: "SessionService", native: capturedNative.sha256 })),
            policyDigest });
          owned.opened = true;
          owned.sessionId = owned.session.sessionId;
          owned.session.recordSystemPrompt("Read only the supplied owned fixture paths through the governed tool.");
          owned.session.startTurn({ trigger: "user" });
          owned.turnOpen = true;
          owned.toolset = agentToolset({ workspace, agentId: "default", sessionId: owned.sessionId,
            recorder: owned.session, expectedToolsDigest: policyDigest });
          readiness.push({ ready: owned.toolset.readiness.ready, blockerCount: owned.toolset.readiness.blockers.length,
            confined: owned.toolset.readiness.confined, confinementVerdict: owned.toolset.readiness.confinement.verdict,
            actualProbeResult: owned.toolset.readiness.confinement.probe.result,
            sandboxBackendAvailable: owned.toolset.readiness.sandboxBackendAvailable });
          for (const allowed of [true, false]) {
            const callId = `p107-session-${number}-${allowed ? "allowed" : "denied"}`;
            const outcome = await owned.toolset.seam.execute({ callId, toolName: "fs.read",
              rawArguments: JSON.stringify({ path: allowed ? "workspace/allowed.txt" : "workspace/denied.txt" }),
              sessionId: owned.sessionId, turn: 1, step: allowed ? 1 : 2, parentToken: null,
              dispatch: "native", signal: new AbortController().signal });
            const output = Buffer.isBuffer(outcome.content) ? outcome.content.toString("utf8") : outcome.content;
            calls.push({ sessionId: owned.sessionId, callId, allowed, outcome: outcome.outcome, denied: outcome.denied,
              timedOut: outcome.timedOut, outputMatchesAllowed: output === allowedContent, deniedCanaryAbsent: !output.includes(deniedContent) });
          }
          callsCompleted = true;
        } finally { closeOwnedSession(owned, callsCompleted); }
      }
      const sessionIds = owners.flatMap((owner) => owner.sessionId === null ? [] : [owner.sessionId]);
      const reader = openLedger(workspace, { readonly: true });
      let events: EvidenceEvent[];
      let sessions: SessionRecord[];
      try {
        facts.ledgerReadOnly = reader.db.readonly;
        events = reader.getAllEvents().filter((row) => sessionIds.includes(row.session_id));
        sessions = reader.getAllSessions().filter((row) => sessionIds.includes(row.session_id));
      } finally { cleanup("readonly ledger.close", () => reader.close()); }
      const trust = loadTrustContext({ amcHome: home, env: {}, expectMonitor: monitorFingerprint });
      const verified = verifyLedgerIntegrity(workspace, { trust, expectedMonitorFingerprint: monitorFingerprint });
      facts.ledger = { ok: verified.ok, errorCount: verified.errors.length, errors: verified.errors.map(redact), chainOk: verified.chain.ok,
        governanceOk: verified.governance.ok, anchored: verified.trustRoot.anchored,
        expectedFingerprintMatches: verified.trustRoot.expectedFingerprint === monitorFingerprint,
        monitorFingerprintMatches: verified.trustRoot.monitorFingerprint === monitorFingerprint,
        closedSessionIds: [...verified.sessions.closed], openSessionCount: verified.sessions.open.length,
        releasedSessionCount: verified.sessions.released.length, interruptedSessionCount: verified.sessions.interrupted.length };
      const roots = sessionIds.map((sessionId) => readSessionRootDescriptor(workspace, sessionId, { expectedMonitorFingerprint: monitorFingerprint }));
      facts.roots = roots;
      facts.sessions = sessions.map((session) => ({ sessionId: session.session_id, ended: session.ended_ts !== null,
        sealPresent: session.session_final_event_hash !== null && session.session_seal_sig !== null,
        sealSignatureValid: session.session_final_event_hash !== null && session.session_seal_sig !== null
          && verifyHexDigest(session.session_final_event_hash, session.session_seal_sig, monitorPem) }));
      const parsed = events.map((event) => parseEvidenceEventWith(event, () => ({ trustList: trust })));
      const callIds = new Set(calls.map((call) => call.callId));
      const audits = parsed.filter((event) => event.event_type === "audit" && callIds.has(String(event.meta.callId))
        && ["TOOL_CALL_ALLOWED", "TOOL_CALL_DENIED"].includes(String(event.meta.auditType)));
      const admission = audits.map((event) => {
        const emitterId = event.meta.auditType === "TOOL_CALL_ALLOWED" ? "tool-call-allowed" : "tool-call-denied";
        const entry = emitterById(emitterId);
        const envelope = extractEnvelope(event.meta_json);
        return { id: event.id, sessionId: event.session_id, callId: event.meta.callId, ts: event.ts,
          eventHash: event.event_hash, auditType: event.meta.auditType, emitterId,
          writerSignatureValid: verifyHexDigest(event.event_hash, event.writer_sig, monitorPem),
          envelopePresent: envelope !== null, envelopeSessionMatches: envelope?.sessionId === event.session_id,
          envelopeSynthetic: envelope?.synthetic ?? null, effectiveTrustTier: event.trustTier,
          projectedToQuestion: Array.isArray(event.meta.questionIds) && event.meta.questionIds.includes("AMC-5.29"),
          projectionVersionMatches: event.meta.projectionVersion === LIVE_PROJECTION_VERSION,
          allowlistRulePresent: Array.isArray(event.meta.projectionRules) && event.meta.projectionRules.includes("tool-allowlist-governed"),
          denialGuard: event.meta.auditType === "TOOL_CALL_DENIED" ? event.meta.denialGuard : null,
          denialStage: event.meta.auditType === "TOOL_CALL_DENIED" ? event.meta.denialStage : null,
          emitterAdmitted: entry !== undefined && emitterAdmits(entry, event), registered: fromRegisteredEmitter(event) };
      });
      facts.auditRows = admission;
      facts.rowCount = events.length;
      facts.allWriterSignaturesValid = events.every((event) => verifyHexDigest(event.event_hash, event.writer_sig, monitorPem));
      const question = questionBank.find((entry) => entry.id === "AMC-5.29");
      if (!question) throw new Error("shipped AMC-5.29 question is absent");
      const evaluation = evaluateLevels(question, parsed);
      const l1 = evaluation.perLevel.find((entry) => entry.level === 1);
      const l2 = evaluation.perLevel.find((entry) => entry.level === 2);
      const gate2 = question.gates.find((entry) => entry.level === 2);
      if (!gate2) throw new Error("shipped AMC-5.29 L2 gate is absent");
      const actualDays = new Set(audits.map((event) => dayKey(event.ts))).size;
      const actualSessions = new Set(audits.map((event) => event.session_id)).size;
      const expectedL2Pass = audits.length >= gate2.minEvents && actualSessions >= gate2.minSessions && actualDays >= gate2.minDistinctDays;
      facts.evaluation = { ...evaluation, actualUtcDays: actualDays, actualSessions,
        minima: { events: gate2.minEvents, sessions: gate2.minSessions, days: gate2.minDistinctDays },
        expectedLevelFromActualContinuity: expectedL2Pass ? 2 : 1 };
      facts.afterPins = pinnedPaths.map(filePin);
      facts.nativeAfter = filePin(nativePath);

      // Native/cryptographic positives precede the mapping witness; later gate claims can be masked by a control.
      expect(calls.length).toBe(4);
      expect(calls.every((call) => call.deniedCanaryAbsent && !call.timedOut)).toBe(true);
      expect(calls.filter((call) => call.allowed).every((call) => call.outcome === "OK" && !call.denied && call.outputMatchesAllowed)).toBe(true);
      expect(calls.filter((call) => !call.allowed).every((call) => call.outcome === "DENIED" && call.denied && !call.outputMatchesAllowed)).toBe(true);
      expect(readiness.every((entry) => entry.ready === true && entry.blockerCount === 0)).toBe(true);
      expect(verified.ok && verified.chain.ok && verified.governance.ok && verified.trustRoot.anchored).toBe(true);
      expect(verified.trustRoot.monitorFingerprint === monitorFingerprint && verified.trustRoot.expectedFingerprint === monitorFingerprint).toBe(true);
      expect([...verified.sessions.closed].sort()).toEqual([...sessionIds].sort());
      expect(verified.sessions.open.length + verified.sessions.released.length + verified.sessions.interrupted.length).toBe(0);
      expect(sessions.length).toBe(2);
      expect(sessions.every((session) => session.ended_ts !== null && session.session_final_event_hash !== null && session.session_seal_sig !== null
        && verifyHexDigest(session.session_final_event_hash, session.session_seal_sig, monitorPem))).toBe(true);
      expect(facts.allWriterSignaturesValid).toBe(true);
      expect(roots.every((root) => root.lifecycle === "closed" && root.monitorKeyFingerprint === monitorFingerprint && root.turnCount === 1 && root.sealCount === 1
        && root.eventCount === events.filter((event) => event.session_id === root.sessionId).length)).toBe(true);
      expect(admission.length).toBe(4);
      expect(admission.every((row) => row.writerSignatureValid && row.envelopePresent && row.envelopeSessionMatches
        && row.envelopeSynthetic === false && row.effectiveTrustTier === "OBSERVED" && row.projectedToQuestion
        && row.projectionVersionMatches && row.allowlistRulePresent)).toBe(true);
      expect(admission.filter((row) => row.auditType === "TOOL_CALL_DENIED").every((row) => row.denialGuard === "tool-allowlist" && row.denialStage === "guard")).toBe(true);
      expect(admission.filter((row) => row.auditType === "TOOL_CALL_ALLOWED").length).toBe(2);
      expect(admission.filter((row) => row.auditType === "TOOL_CALL_DENIED").length).toBe(2);
      // First gate-mapping witness: exact independently selected native disposition IDs, never metric/bookkeeping inflation.
      expect([...(l2?.matchedEventIds ?? [])].sort()).toEqual(audits.map((event) => event.id).sort());
      expect(admission.every((row) => row.emitterAdmitted && row.registered)).toBe(true);
      expect(l1?.status).toBe("pass");
      expect(l2?.distinctDays).toBe(actualDays);
      expect(l2?.distinctSessions).toBe(actualSessions);
      expect(l2?.status).toBe(expectedL2Pass ? "pass" : "fail");
      expect(evaluation.level).toBe(expectedL2Pass ? 2 : 1);
      expect(evaluation.perLevel.filter((entry) => entry.level >= 3).every((entry) => entry.status === "not_evaluated")).toBe(true);
      expect(facts.afterPins).toEqual(beforePins);
      expect(facts.nativeAfter).toEqual(capturedNative);
    });
  } catch (error) { bodyFailed = true; bodyError = safeError(error); }
  finally {
    for (const owned of owners) closeOwnedSession(owned, false);
    // The scope above makes any guard emitter acquisition in this file fixture-owned.
    // The unchanged public close function is best-effort; no stronger native-handle proof is inferred.
    cleanup("owned guard emitter release", () => { closeGuardDb(); facts.guardEmitterCloseInvoked = true; });
    cleanup("owned SQLite pool", () => {
      const stats = sqlitePoolStats(poolKey);
      facts.poolBeforeClose = stats;
      if (stats !== null && stats.active !== 0) throw new Error("owned ledger pool still has active leases; refusing forced closure");
      closeSqlitePool(poolKey);
      poolClosed = sqlitePoolStats(poolKey) === null;
      if (!poolClosed) throw new Error("owned ledger pool remained registered");
    });
    if (workspaceInitialized) cleanup("vault lock", () => { lockVault(workspace); vaultLocked = !vaultStatus(workspace).unlocked; });
    cleanup("captured input preservation", () => {
      facts.protectedInputCount = protectedBeforePins.length;
      facts.finalProtectedPins = protectedBeforePins.map((pin) => filePin(pin.path));
      facts.protectedInputsUnchanged = JSON.stringify(facts.finalProtectedPins) === JSON.stringify(protectedBeforePins);
      if (nativeBefore !== null) {
        facts.finalNativePin = filePin(nativeBefore.path);
        facts.nativeUnchanged = JSON.stringify(facts.finalNativePin) === JSON.stringify(nativeBefore);
        if (facts.nativeUnchanged !== true) throw new Error("source native pin changed");
      }
      if (facts.protectedInputsUnchanged !== true) throw new Error("captured owned file/policy/public-key pin changed");
    });
    cleanup("exact environment restore", () => {
      replaceEnvironment(previousEnvironment);
      environmentRestored = sameEnvironment(previousEnvironment);
      if (!environmentRestored) throw new Error("environment restoration differs from original snapshot");
    });
    facts.ownership = owners.map((owned) => ({ sessionId: owned.sessionId, opened: owned.opened,
      turnOpen: owned.turnOpen, turnEndAttempted: owned.turnEndAttempted, turnEnded: owned.turnEnded,
      turnSealAttempted: owned.turnSealAttempted, turnSealed: owned.turnSealed,
      toolsetAcquired: owned.toolset !== null, toolsetCloseAttempted: owned.toolsetCloseAttempted, toolsetClosed: owned.toolsetClosed,
      sessionCloseAttempted: owned.sessionCloseAttempted, sessionClosed: owned.sessionClosed,
      storeClosed: owned.storeClosed, fallbackStoreCloseAttempted: owned.fallbackStoreCloseAttempted }));
    facts.bodyFailed = bodyFailed;
    facts.bodyError = bodyFailed ? errorFact(bodyError) : null;
    facts.cleanupErrors = cleanupErrors.map(errorFact);
    facts.environmentRestored = environmentRestored;
    facts.vaultLocked = vaultLocked;
    facts.poolClosed = poolClosed;
    // Finite public facts only: no file contents, vault/private key bytes, raw environment or session payload bodies.
    cleanup("public evidence write", () => writeFileSync(publicPath, JSON.stringify(facts, null, 2), { flag: "wx", mode: 0o600 }));
    console.log(`PUBLIC_EVIDENCE ${publicPath}`);
  }
  if (bodyFailed && cleanupErrors.length === 0) throw bodyError;
  if (bodyFailed || cleanupErrors.length > 0) throw new AggregateError([...(bodyFailed ? [bodyError] : []), ...cleanupErrors], "native evidence body/cleanup failed");
  expect(owners.length === 2 && owners.every((owner) => owner.toolsetClosed && owner.turnEndAttempted && owner.turnEnded
    && owner.turnSealAttempted && owner.turnSealed && !owner.turnOpen && owner.sessionClosed && owner.storeClosed)).toBe(true);
  expect(environmentRestored && vaultLocked && poolClosed).toBe(true);
});
