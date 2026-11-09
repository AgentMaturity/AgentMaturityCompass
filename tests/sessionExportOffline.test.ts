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

  test("every descriptor field is recomputed from the signed rows: editing any one, or the unsigned record times with it, is refused (fix3 S21)", () => {
    const { bundle, fingerprint } = exportAndDetach();
    // The window is the open and close rows' own timestamps (inside their hash pre-images), not the record's columns.
    expect(bundle.descriptor).toMatchObject({ startedTs: bundle.rows[0]!.ts, endedTs: bundle.rows.at(-1)!.ts, agentId: "default", runtime: bundle.rows[0]!.runtime });
    const verify = (edited: SessionExport) => verifySessionExport({ bundle: edited, expectedMonitorFingerprint: fingerprint });
    const other = "f".repeat(64);
    const edits: Record<keyof SessionExport["descriptor"], (descriptor: Record<string, unknown>) => void> = {
      v: (d) => { d.v = 2; },
      sessionId: (d) => { d.sessionId = "another-session"; },
      lifecycle: (d) => { d.lifecycle = "interrupted"; },
      runtime: (d) => { d.runtime = `${String(d.runtime)}-edited`; },
      agentId: (d) => { d.agentId = "someone-else"; },
      startedTs: (d) => { d.startedTs = Number(d.startedTs) - 1_000; },
      endedTs: (d) => { d.endedTs = Number(d.endedTs) + 1_000; },
      eventCount: (d) => { d.eventCount = Number(d.eventCount) + 1; },
      turnCount: (d) => { d.turnCount = Number(d.turnCount) + 1; },
      sealCount: (d) => { d.sealCount = Number(d.sealCount) + 1; },
      sealEventHashes: (d) => { d.sealEventHashes = [other, ...(d.sealEventHashes as string[]).slice(1)]; },
      sessionMerkleRoot: (d) => { d.sessionMerkleRoot = other; },
      openEventHash: (d) => { d.openEventHash = other; },
      closeEventHash: (d) => { d.closeEventHash = other; },
      monitorKeyFingerprint: (d) => { d.monitorKeyFingerprint = other; }
    };
    expect(Object.keys(edits).sort()).toEqual(Object.keys(bundle.descriptor).sort());
    for (const [field, edit] of Object.entries(edits)) {
      const tampered = structuredClone(bundle);
      edit(tampered.descriptor as unknown as Record<string, unknown>);
      expect(verify(tampered).ok, field).toBe(false);
    }
    const renamed = structuredClone(bundle);
    renamed.descriptor.sessionId = "another-session";
    expect(verify(renamed).errors).toContain("descriptor names another session than the bundle");
    for (const field of ["agentId", "runtime", "startedTs", "endedTs"] as const) {
      const tampered = structuredClone(bundle);
      edits[field](tampered.descriptor as unknown as Record<string, unknown>);
      expect(verify(tampered).errors, field).toContain("descriptor does not match the rows it describes");
    }
    // The record's lifecycle columns are not signed: moving them, and the descriptor with them, changes nothing it vouches for.
    const shifted = structuredClone(bundle);
    shifted.record.started_ts -= 60_000; shifted.record.ended_ts += 60_000;
    shifted.descriptor.startedTs = shifted.record.started_ts; shifted.descriptor.endedTs = shifted.record.ended_ts;
    expect(verify(shifted).errors).toContain("descriptor does not match the rows it describes");
  });

  test("an open session is refused at export", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace, false);
    expect(() => exportSessionBundle({ workspace, sessionId })).toThrow(SessionExportError);
    expect(() => exportSessionBundle({ workspace, sessionId })).toThrow(/SESSION_NOT_SEALED/);
  });

  test("the CLI verifies a sealed bundle, viewer and canonical viewer JSON offline and refuses tampering", () => {
    const workspace = newWorkspace();
    const sessionId = runSession(workspace);
    const holder = newDir("amc-session-export-holder-");
    const out = join(holder, "session.amcsession.json");
    const viewer = join(holder, "session.htm"), viewerJson = join(holder, "session.viewer.json");
    const cli = resolve(process.cwd(), "dist/cli.js");
    const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1", AMC_VAULT_PASSPHRASE: PASS, AMC_CLAIM_LABELS_STRICT: "1" };
    const exported = spawnSync(process.execPath, [cli, "session", "export", sessionId, "--out", out, "--json"], { cwd: workspace, env, encoding: "utf8" });
    expect(exported.status, exported.stderr).toBe(0);
    const { monitorKeyFingerprint } = JSON.parse(exported.stdout) as { monitorKeyFingerprint: string };
    const exportedViewer = spawnSync(process.execPath, [cli, "session", "export", sessionId, "--out", viewer, "--json-out", viewerJson, "--json"], { cwd: workspace, env, encoding: "utf8" });
    expect(exportedViewer.status, exportedViewer.stderr).toBe(0);
    expect(JSON.parse(exportedViewer.stdout)).toMatchObject({ sessionId, monitorKeyFingerprint });
    rmSync(workspace, { recursive: true, force: true });
    delete env.AMC_VAULT_PASSPHRASE;
    const verifyFile = (path: string) => spawnSync(process.execPath, [cli, "session", "verify-export", path, "--expect-monitor", monitorKeyFingerprint, "--json"], { cwd: holder, env, encoding: "utf8" });
    for (const [path, proof] of [[out, { sessionId, descriptorSha256: expect.any(String) }], [viewer, { tail: "sealed" }], [viewerJson, { tail: "sealed" }]] as const) {
      const verified = verifyFile(path);
      expect(verified.status, verified.stderr + verified.stdout).toBe(0);
      expect(JSON.parse(verified.stdout)).toMatchObject({ ...proof, ok: true, report: { artifact: { sha256: sha256Hex(readFileSync(path)) } },
        claimKind: "self_reported", statusDimensions: { result: "not_evaluated" }, claimLabel: expect.stringMatching(/^Claim: Self-reported/) });
    }
    const verifiedText = spawnSync(process.execPath, [cli, "session", "verify-export", out, "--expect-monitor", monitorKeyFingerprint], { cwd: holder, env, encoding: "utf8" });
    expect(verifiedText.status, verifiedText.stderr).toBe(0);
    expect(verifiedText.stdout.split("\n").slice(0, 2)).toEqual([
      "Session export verification PASSED", expect.stringMatching(/^Claim: Self-reported · Result: not evaluated/)
    ]);
    // Legacy bundles may be reformatted. Viewer JSON must retain its exact canonical bytes, and HTML never falls back to JSON.
    const compactBundle = JSON.stringify(JSON.parse(readFileSync(out, "utf8")));
    writeFileSync(out, compactBundle);
    expect(verifyFile(out).status).toBe(0);
    writeFileSync(viewer, compactBundle);
    expect(verifyFile(viewer).status).toBe(1);
    writeFileSync(viewerJson, JSON.stringify(JSON.parse(readFileSync(viewerJson, "utf8"))));
    expect(verifyFile(viewerJson).status).toBe(1);
    const wrongPin = spawnSync(process.execPath, [cli, "session", "verify-export", out, "--expect-monitor", "b".repeat(64)], { cwd: holder, env, encoding: "utf8" });
    expect(wrongPin.status).not.toBe(0);
    const bundle = JSON.parse(readFileSync(out, "utf8")) as SessionExport;
    bundle.rows[1]!.meta_json = JSON.stringify({ forged: true });
    writeFileSync(out, JSON.stringify(bundle));
    const tampered = spawnSync(process.execPath, [cli, "session", "verify-export", out, "--expect-monitor", monitorKeyFingerprint], { cwd: holder, env, encoding: "utf8" });
    expect(tampered.status).not.toBe(0);
  }, 60_000);
});
