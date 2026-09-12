/** AUTHORED UNEXECUTED. Corrupts ONLY freshly minted disposable fixture evidence.
 * Byte reconstruction is not signature authentication; both boundaries matter.
 */
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vitest";
import { orderedCleanup, orderedWorkspace, openedOrdered, orderedHarness, orderedRequest, orderedCold } from "./fixtures/nativeOrderedImageHarness.js";
import { geminiInputBlocks, geminiTextResponse } from "./fixtures/nativeGeminiStream.js";

afterEach(orderedCleanup);
describe("Gemini default cold source provenance (unexecuted)", () => {
  test.each(["missing", "pruned", "wrong-header", "wrong-part", "wrong-index"])("%s history is not reconstructed or publicly replayed as authentic", async mode => {
    let responseId = 0;
    const { root, h, sessionId } = await openedOrdered(orderedWorkspace(), "gemini", { transport: async () => geminiTextResponse(`cold-${++responseId}`) });
    await h.call("session/prompt", orderedRequest(sessionId, geminiInputBlocks()));
    await h.call("session/prompt", { sessionId, prompt: [{ type: "text", text: "Commit a request that includes original Gemini history" }] });
    await h.call("_amc/session/release", { sessionId }); await h.close();
    // No production/shared evidence is touched. This future test owns this root.
    const db = new Database(join(root, ".amc", "evidence.sqlite"));
    try {
      for (const trigger of ["protect_evidence_immutable", "no_delete_evidence", "no_update_evidence"]) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
      const rows = db.prepare("SELECT id, meta_json FROM evidence_events WHERE session_id = ? AND event_type = 'assistant/block' ORDER BY rowid").all(sessionId) as { id: string; meta_json: string }[];
      const row = rows.find(item => JSON.parse(item.meta_json).gemini?.responseId === "cold-1");
      if (!row) throw new Error("No original signed Gemini response part");
      if (mode === "missing") db.prepare("UPDATE evidence_events SET payload_inline = NULL, payload_path = NULL, canonical_payload_path = NULL WHERE id = ?").run(row.id);
      else if (mode === "pruned") db.prepare("UPDATE evidence_events SET payload_pruned = 1 WHERE id = ?").run(row.id);
      else {
        const meta = JSON.parse(row.meta_json);
        if (mode === "wrong-header") meta.gemini.headerEventId = "nonexistent-original-request";
        if (mode === "wrong-part") meta.gemini.partJson = '{"text":"rewritten history"}';
        if (mode === "wrong-index") meta.gemini.partIndex = 9;
        db.prepare("UPDATE evidence_events SET meta_json = ? WHERE id = ?").run(JSON.stringify(meta), row.id);
      }
    } finally { db.close(); }
    const derived = orderedCold(root, sessionId);
    expect(derived[0]).toMatchObject({ status: "reconstructed", bytes: h.sent[0]!.body.toString("base64") });
    expect(derived[1]!.status).not.toBe("reconstructed"); expect(derived[1]!.bytes).toBeNull();
    if (mode === "missing" || mode === "pruned") expect(derived[1]!.status).toBe(`payload-${mode}`);
    const next = orderedHarness(root, "gemini", { transport: async () => { throw new Error("Corrupt load must never dispatch"); } });
    await next.call("initialize", { protocolVersion: 1, clientCapabilities: {} });
    expect((await next.call("session/load", { sessionId, cwd: root, mcpServers: [] })).error).toBeDefined();
    expect(next.sent).toEqual([]); expect(next.frames.filter(frame => frame.method === "session/update")).toEqual([]);
  }, 90_000);
});
