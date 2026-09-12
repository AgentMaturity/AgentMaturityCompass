/** AUTHORED UNEXECUTED. Future mutations ONLY in freshly owned disposable roots.
 * Reconstruction consistency and authenticated public replay are separate checks.
 */
import { writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vitest";
import { deriveRecordedRequest } from "../src/llm/request/deriveRequest.js";
import { assertNativeAudioBytes, NATIVE_AUDIO_INPUT_FORMAT } from "../src/attachments/nativeAudioInput.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { audioCleanup, audioWorkspace, openedAudio, audioHarness, audioRequest, audioCold } from "./fixtures/nativeSignedAudio.js";

afterEach(audioCleanup);
describe("audio original provenance cold/hostile (unexecuted)", () => {
  test.each(["sqlite", "jsonl"])("%s changed original sample bytes with unchanged WAV header and signed metadata cannot reconstruct or replay", async backend => {
    const { h, root, sessionId } = await openedAudio(audioWorkspace(backend)); await h.call("session/prompt", audioRequest(sessionId));
    const audio = h.sessions.get(sessionId)!.readEvents().find(row => row.event_type === "user/attachment" && JSON.parse(row.meta_json).mimeType === "audio/wav")!;
    const original = readEventPayload(root, audio); expect(original.status).toBe("ok");
    if (original.status !== "ok") throw new Error("No original fixture bytes");
    await h.call("_amc/session/release", { sessionId }); await h.close();
    expect(audioCold(root, sessionId)[0]!.status).toBe("reconstructed");
    const changed = Buffer.from(original.bytes); changed[44] = changed[44]! ^ 1;
    // Header admission still succeeds; it must not stand in for original digest
    // and inbox provenance. This is an adversarial blob replacement ONLY inside
    // the newly created disposable fixture, never an edit of the source checkout.
    assertNativeAudioBytes(changed, "audio/wav");
    const stored = audio.payload_path ?? audio.canonical_payload_path;
    if (!stored || audio.payload_inline !== null) throw new Error("Expected a blob-backed original audio fixture");
    const target = resolve(root, stored);
    if (!target.startsWith(resolve(root, ".amc") + sep)) throw new Error("Refuse mutation outside the owned fixture storage");
    writeFileSync(target, changed);
    const derived = audioCold(root, sessionId)[0]!;
    expect(derived.status).toBe("evidence-inconsistent"); expect(derived.bytes).toBeNull();
    const next = audioHarness(root); await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    expect((await next.call("session/load", { sessionId, cwd: root, mcpServers: [] })).error).toBeDefined();
    expect(next.frames.filter(frame => frame.method === "session/update")).toEqual([]); expect(next.sent).toEqual([]);
  }, 90_000);
  test.each(["inbox-missing", "inbox-pruned", "audio-missing", "audio-pruned", "mime", "length", "filename", "digest", "order", "source", "format", "claim"])("%s refuses byte derivation and all authenticated public replay", async attack => {
    const { h, root, sessionId } = await openedAudio(); await h.call("session/prompt", audioRequest(sessionId));
    await h.call("_amc/session/release", { sessionId }); await h.close();
    const db = new Database(join(root, ".amc", "evidence.sqlite"));
    try {
      for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
      const rows = db.prepare("SELECT id, event_type, meta_json FROM evidence_events WHERE session_id = ? ORDER BY rowid").all(sessionId) as { id: string; event_type: string; meta_json: string }[];
      const source = rows.find(row => row.event_type === "loop/inbox" && JSON.parse(row.meta_json).payloadFormat === NATIVE_AUDIO_INPUT_FORMAT)!;
      const audio = rows.find(row => row.event_type === "user/attachment" && JSON.parse(row.meta_json).mimeType === "audio/wav")!;
      const claim = rows.find(row => row.event_type === "loop/inbox" && JSON.parse(row.meta_json).op === "claim")!;
      const row = attack.startsWith("inbox-") ? source : attack === "claim" ? claim : audio;
      expect(row).toBeDefined();
      if (attack.endsWith("missing")) db.prepare("UPDATE evidence_events SET payload_inline = NULL, payload_path = NULL, canonical_payload_path = NULL WHERE id = ?").run(row.id);
      else if (attack.endsWith("pruned")) db.prepare("UPDATE evidence_events SET payload_pruned = 1 WHERE id = ?").run(row.id);
      else if (attack === "digest") db.prepare("UPDATE evidence_events SET payload_sha256 = ? WHERE id = ?").run("0".repeat(64), row.id);
      else {
        const meta = JSON.parse(row.meta_json);
        if (attack === "mime") meta.mimeType = "audio/mpeg";
        if (attack === "length") meta.bytes = 1;
        if (attack === "filename") meta.filename = "replaced.wav";
        if (attack === "order") meta.sourceContentIndex = 6;
        if (attack === "source") meta.sourceInputEventId = "unowned-input";
        if (attack === "format") meta.sourceInputFormat = "amc-image-input@2";
        if (attack === "claim") meta.op = "drop";
        db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(JSON.stringify(meta), row.id);
      }
    } finally { db.close(); }
    const derived = audioCold(root, sessionId); expect(derived).toHaveLength(1); expect(derived[0]!.status).not.toBe("reconstructed"); expect(derived[0]!.bytes).toBeNull();
    if (attack.endsWith("missing")) expect(derived[0]!.status).toBe("payload-missing");
    if (attack.endsWith("pruned")) expect(derived[0]!.status).toBe("payload-pruned");
    const next = audioHarness(root); await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    expect((await next.call("session/load", { sessionId, cwd: root, mcpServers: [] })).error).toBeDefined();
    expect(next.sent).toEqual([]); expect(next.frames.filter(frame => frame.method === "session/update")).toEqual([]);
  }, 90_000);
  test.each(["sqlite", "jsonl"])("%s original row-order and omitted-part contradictions fail without custom reconstruction input", async backend => {
    const { h, root, sessionId } = await openedAudio(audioWorkspace(backend)); await h.call("session/prompt", audioRequest(sessionId));
    const rows = h.sessions.get(sessionId)!.readEvents(), header = rows.find(row => row.event_type === "request/header")!;
    const originals = rows.filter(row => ["user/message", "user/attachment"].includes(row.event_type));
    await h.call("_amc/session/release", { sessionId }); await h.close();
    expect(audioCold(root, sessionId)[0]!.status).toBe("reconstructed");
    // Direct derivation receives only already-read events, never body/encoder. This
    // mutation is a source-consistency test, not an authenticated replay receipt.
    const swapped = [...rows], a = swapped.findIndex(row => row.id === originals[1]!.id), b = swapped.findIndex(row => row.id === originals[5]!.id);
    [swapped[a], swapped[b]] = [swapped[b]!, swapped[a]!];
    for (const events of [swapped, rows.filter(row => row.id !== originals[1]!.id)]) {
      const derived = deriveRecordedRequest({ workspace: root, events, headerEventId: header.id });
      expect(derived.status).toBe("evidence-inconsistent"); expect(derived.bytes).toBeNull();
    }
  }, 90_000);
});
