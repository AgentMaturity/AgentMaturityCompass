import { afterEach, describe, expect, test } from "vitest";
import { SessionService } from "../src/session/sessionService.js";
import { LoopInbox } from "../src/agent/inbox.js";
import { recordNativeAudioMessage } from "../src/agent/nativeAudioMessage.js";
import { recordNativeOrderedMessage } from "../src/agent/nativeOrderedMessage.js";
import { readNativeTaskProjection } from "../src/studio/nativeTaskProjection.js";
import { sha256Hex } from "../src/utils/hash.js";
import { audioCleanup, audioWorkspace, audioParts, wavBytes } from "./fixtures/nativeSignedAudio.js";
import { orderedParts } from "./fixtures/nativeOrderedImageHarness.js";
import { IMAGE_PNG_BASE64 } from "./fixtures/nativeAcpImageRuntime.js";

// Actual signed inbox/claim/session rows on both stores. No provider or SDK mock
// supplies the expected authenticated media. This file is authored, not executed.
afterEach(audioCleanup);
function writerAt(root: string): SessionService {
  const writer = new SessionService(root);
  writer.open({ agentId: "default", harnessVersion: "p10-projection-fixture", compositionDigest: "p10-fixture", policyDigest: "p10-fixture" });
  return writer;
}

describe("P10 committed media projection", () => {
  test.each(["sqlite", "jsonl"])("%s projects the entire original audio group in order and survives cold read", backend => {
    const root = audioWorkspace(backend), writer = writerAt(root);
    try {
      const inbox = new LoopInbox(writer, () => {});
      inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, audioParts: audioParts() });
      writer.startTurn({ trigger: "user" }); writer.startStep();
      recordNativeAudioMessage(writer, inbox.claim("next-turn")[0]!);
      writer.endStep({ stopReason: "complete", usage: null }); writer.endTurn({ reason: "complete" }); writer.sealTurn();
      const result = readNativeTaskProjection(root, writer.sessionId, "default");
      expect(result.history).toMatchObject({ status: "authenticated", backend });
      expect(result.events.map(event => event.attachment?.type ?? "text")).toEqual(["text", "audio", "text", "image", "text", "audio", "text"]);
      expect(result.events[0]?.text).toBe("  before\n"); expect(result.events[2]?.text).toBe(""); expect(result.events[6]?.text).toBe("after  ");
      expect(result.events[1]?.attachment).toEqual({ type: "audio", mimeType: "audio/wav", byteLength: wavBytes().length, sha256: sha256Hex(wavBytes()) });
      const image = Buffer.from(IMAGE_PNG_BASE64, "base64");
      expect(result.events[3]?.attachment).toEqual({ type: "image", mimeType: "image/png", byteLength: image.length, sha256: sha256Hex(image) });
      expect(result.events.every(event => event.evidence === "committed")).toBe(true);
      expect(result.events.map(event => event.cursor)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(JSON.stringify(result.events)).not.toContain(IMAGE_PNG_BASE64);
      expect(JSON.stringify(result.events)).not.toContain(wavBytes().toString("base64"));
      writer.disposeWithoutClosing();
      expect(readNativeTaskProjection(root, writer.sessionId, "default").events).toEqual(result.events);
    } finally { writer.disposeWithoutClosing(); }
  });

  test.each(["sqlite", "jsonl"])("%s preserves ordered-image text boundaries and attachment positions", backend => {
    const root = audioWorkspace(backend), writer = writerAt(root);
    try {
      const inbox = new LoopInbox(writer, () => {});
      inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, parts: orderedParts() });
      writer.startTurn({ trigger: "user" }); writer.startStep(); recordNativeOrderedMessage(writer, inbox.claim("next-turn")[0]!);
      const result = readNativeTaskProjection(root, writer.sessionId, "default");
      expect(result.events.map(event => event.attachment?.type ?? "text")).toEqual(["text", "image", "text", "text", "image", "text"]);
      expect(result.events[2]?.text).toBe(""); expect(result.events[3]?.text).toBe("after first");
      expect(result.events[4]?.attachment?.mimeType).toBe("image/gif");
      expect(result.ending).toBeNull(); expect(result.closed).toBe(false);
    } finally { writer.disposeWithoutClosing(); }
  });

  test.each(["amc-audio-input@1", "amc-image-input@2"] as const)("%s refuses a legitimately signed but incomplete original sequence", format => {
    const root = audioWorkspace(), writer = writerAt(root);
    try {
      const inbox = new LoopInbox(writer, () => {});
      const receipt = inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null,
        ...(format === "amc-audio-input@1" ? { audioParts: audioParts() } : { parts: orderedParts() }) });
      writer.startTurn({ trigger: "user" }); writer.startStep(); inbox.claim("next-turn");
      // The prefix has a real writer signature, but that is not authority to
      // pretend that omitted original media/suffixes were never submitted.
      writer.recordUserMessage("  before\n", { sourceInputEventId: receipt.eventId, sourceInputFormat: format, sourceContentIndex: 0 });
      expect(() => readNativeTaskProjection(root, writer.sessionId, "default")).toThrow();
    } finally { writer.disposeWithoutClosing(); }
  });

  test("original queued draft is not projected as a committed user message before its claim", () => {
    const root = audioWorkspace(), writer = writerAt(root);
    try {
      const inbox = new LoopInbox(writer, () => {});
      inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, audioParts: audioParts() });
      const result = readNativeTaskProjection(root, writer.sessionId, "default");
      expect(result.events).toEqual([]); expect(result.nextCursor).toBe(0); expect(result.ending).toBeNull();
      expect(() => readNativeTaskProjection(root, writer.sessionId, "different-agent")).toThrow();
    } finally { writer.disposeWithoutClosing(); }
  });
});
