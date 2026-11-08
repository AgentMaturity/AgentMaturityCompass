import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { exportSessionBundle, SessionExportError, verifySessionExport, type SessionExport } from "../src/evidence/sessionExport.js";
import { sha256Hex } from "../src/utils/hash.js";

/**
 * SH-TRUST-06: one sealed native session exports as a self-contained signed bundle and verifies OFFLINE. The happy path
 * deletes the workspace before verifying; every other test mutates one property the verifier must catch.
 */
const PASS = "session-export-passphrase";
const dirs: string[] = [];
const newDir = (prefix: string) => { const dir = mkdtempSync(join(tmpdir(), prefix)); dirs.push(dir); return dir; };
afterEach(() => { while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true }); });

function newWorkspace(): string {
  process.env.AMC_VAULT_PASSPHRASE = PASS;
  const dir = newDir("amc-session-export-ws-");
  initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
  return dir;
}

/** A real two-turn session through SessionService, sealed unless `close` is false. */
function runSession(workspace: string, close = true): string {
  const service = new SessionService(workspace);
  service.open({ agentId: "default", harnessVersion: "2.4.0", compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") });
  const sessionId = service.sessionId;
  const systemPrompt = service.recordSystemPrompt("You are a careful assistant.");
  for (const turn of [1, 2]) {
    service.startTurn({ trigger: turn === 1 ? "user" : "followup" });
    service.recordUserMessage(`turn ${turn}: summarise the log`);
    const step = service.startStep();
    service.recordRequestHeader({ model: "claude-opus-4-8", providerId: "anthropic", params: { max_tokens: 512 }, encoderId: "anthropic-messages",
      encoderVersion: 1, systemPromptEventId: systemPrompt.eventId, toolSchema: null, projectionCutoffEventId: step.eventId,
      projectionDigest: sha256Hex(`projection-${turn}`), sourceEventIds: [systemPrompt.eventId], requestBytes: JSON.stringify({ turn }) });
    service.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: "end_turn", content: `answer for turn ${turn}` });
    service.endStep({ stopReason: "end_turn", usage: { inputTokens: 100, outputTokens: 20, cacheRead: 0, cacheWrite: 0 } });
    service.endTurn({ reason: "complete" });
    service.sealTurn();
  }
  if (close) service.close({ reason: "completed" }); else service.disposeWithoutClosing();
  return sessionId;
}

/** Exports a session, then destroys the workspace: what comes back is what a third party holds. */
function exportAndDetach(): { bundle: SessionExport; fingerprint: string; sessionId: string } {
  const workspace = newWorkspace();
  const sessionId = runSession(workspace);
  const bundle = exportSessionBundle({ workspace, sessionId });
  rmSync(workspace, { recursive: true, force: true });
  return { bundle: JSON.parse(JSON.stringify(bundle)) as SessionExport, fingerprint: bundle.descriptor.monitorKeyFingerprint, sessionId };
}

describe("session export verifies offline", () => {
  test("a sealed session exports and verifies with only the bundle and the pinned fingerprint", () => {
    const { bundle, fingerprint, sessionId } = exportAndDetach();
    const verdict = verifySessionExport({ bundle, expectedMonitorFingerprint: fingerprint });
    expect(verdict).toMatchObject({ ok: true, errors: [], sessionId, eventCount: bundle.rows.length });
    expect(verdict.monitorPublicKeyPem).not.toBeNull();
    expect(bundle.rows[0]?.event_type).toBe("session/open");
    expect(bundle.rows.at(-1)?.event_type).toBe("session/close");
  });

  test("the wrong fingerprint is refused: the carried keys never vouch for themselves", () => {
    const { bundle } = exportAndDetach();
    const verdict = verifySessionExport({ bundle, expectedMonitorFingerprint: "a".repeat(64) });
    expect(verdict.ok).toBe(false);
    expect(verdict.errors).toContain("trust root: no carried monitor key matches the expected fingerprint");
    expect(verdict.monitorPublicKeyPem).toBeNull();
  });

  test("one altered row payload breaks the row's hash; a dropped seal and a re-stated descriptor are caught", () => {
    const { bundle, fingerprint } = exportAndDetach();
    const tampered = structuredClone(bundle);
    tampered.rows[2]!.payload_inline = JSON.stringify({ forged: true });
    tampered.rows[2]!.payload_sha256 = sha256Hex(tampered.rows[2]!.payload_inline!);
    expect(verifySessionExport({ bundle: tampered, expectedMonitorFingerprint: fingerprint }).errors.some((error) => /event_hash mismatch/.test(error))).toBe(true);

    const unsealed = structuredClone(bundle);
    unsealed.record.session_seal_sig = Buffer.from("forged").toString("base64");
    expect(verifySessionExport({ bundle: unsealed, expectedMonitorFingerprint: fingerprint }).errors.some((error) => /seal signature invalid/.test(error))).toBe(true);

    const restated = structuredClone(bundle);
    restated.descriptor.sealCount += 1;
    expect(verifySessionExport({ bundle: restated, expectedMonitorFingerprint: fingerprint }).errors).toContain("descriptor does not match the rows it describes");

    const truncated = structuredClone(bundle);
    truncated.rows.pop();
    const verdict = verifySessionExport({ bundle: truncated, expectedMonitorFingerprint: fingerprint });
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.some((error) => /seal names|does not end with session\/close/.test(error))).toBe(true);
  });

  test("an open session is refused at export", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace, false);
    expect(() => exportSessionBundle({ workspace, sessionId })).toThrow(SessionExportError);
    expect(() => exportSessionBundle({ workspace, sessionId })).toThrow(/SESSION_NOT_SEALED/);
  });

  test("the CLI round-trips: export, then verify-export elsewhere with --expect-monitor, and fails on tamper", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace);
    const holder = newDir("amc-session-export-holder-");
    const out = join(holder, "session.amcsession.json");
    const cli = resolve(process.cwd(), "dist/cli.js");
    const env = { ...process.env, NO_COLOR: "1", AMC_VAULT_PASSPHRASE: PASS };
    const exported = spawnSync(process.execPath, [cli, "session", "export", sessionId, "--out", out, "--json"], { cwd: workspace, env, encoding: "utf8" });
    expect(exported.status, exported.stderr).toBe(0);
    const { monitorKeyFingerprint } = JSON.parse(exported.stdout) as { monitorKeyFingerprint: string };
    rmSync(workspace, { recursive: true, force: true });
    delete env.AMC_VAULT_PASSPHRASE;
    const verified = spawnSync(process.execPath, [cli, "session", "verify-export", out, "--expect-monitor", monitorKeyFingerprint, "--json"], { cwd: holder, env, encoding: "utf8" });
    expect(verified.status, verified.stderr + verified.stdout).toBe(0);
    expect((JSON.parse(verified.stdout) as { ok: boolean }).ok).toBe(true);
    const wrongPin = spawnSync(process.execPath, [cli, "session", "verify-export", out, "--expect-monitor", "b".repeat(64)], { cwd: holder, env, encoding: "utf8" });
    expect(wrongPin.status).not.toBe(0);
    const bundle = JSON.parse(readFileSync(out, "utf8")) as SessionExport;
    bundle.rows[1]!.meta_json = JSON.stringify({ forged: true });
    writeFileSync(out, JSON.stringify(bundle));
    const tampered = spawnSync(process.execPath, [cli, "session", "verify-export", out, "--expect-monitor", monitorKeyFingerprint], { cwd: holder, env, encoding: "utf8" });
    expect(tampered.status).not.toBe(0);
  }, 60_000);
});
