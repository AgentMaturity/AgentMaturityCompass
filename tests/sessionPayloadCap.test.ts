/**
 * The per-event payload cap at the two media doors. Both retain bytes above it through the signed spill store
 * (tests/sessionAttachmentSpill.test.ts and tests/sessionInboxSpill.test.ts cover those paths end to end) and
 * refuse, with nothing recorded, when the store cannot prepare -- here because no blob has provisioned the
 * workspace key yet.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { LoopInbox } from "../src/agent/inbox.js";
import type { NativeInputPart } from "../src/attachments/nativeOrderedInput.js";
import { sessionPayloadCap } from "../src/session/sessionPayloadCap.js";
import { SpilledInputRetentionError } from "../src/session/spill/spillInput.js";
import { extractSpillRef } from "../src/session/spill/spillTypes.js";
import { loadOpsPolicy } from "../src/ops/policy.js";

const roots: string[] = [], writers = new Set<SessionService>();
afterEach(() => {
  for (const writer of writers) writer.disposeWithoutClosing();
  writers.clear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=", "base64");
function opened() {
  const root = mkdtempSync(join(tmpdir(), "amc-payload-cap-")); roots.push(root);
  initWorkspace({ workspacePath: root, agentId: "default", trustBoundaryMode: "isolated" });
  const writer = new SessionService(root); writers.add(writer);
  writer.open({ agentId: "default", harnessVersion: "cap-fixture", compositionDigest: "cap-fixture", policyDigest: "cap-fixture" });
  return { root, writer, cap: sessionPayloadCap(root) };
}
/** A PNG header followed by zeros: valid enough for the media sniff, sized exactly as the case needs. */
function png(bytes: number): Buffer { const out = Buffer.alloc(bytes); PNG.copy(out); return out; }

describe("session payload cap", () => {
  test("the cap is the signed ops-policy value the ledger applies", () => {
    const { root, cap } = opened();
    expect(cap).toBe(loadOpsPolicy(root).opsPolicy.retention.maxPayloadBytesPerEvent);
    expect(cap).toBe(65536);
  });

  test("an oversize attachment is refused with nothing recorded while the spill store has no key, then retained behind a signed commitment", () => {
    const { writer, cap } = opened();
    writer.startTurn({ trigger: "user" }); writer.startStep();
    const before = writer.readEvents().length;
    let refusal: unknown;
    try { writer.recordUserAttachment({ filename: "large.png", content: png(cap + 1), mimeType: "image/png", kind: "image" }); }
    catch (error) { refusal = error; }
    expect(refusal).toBeInstanceOf(SpilledInputRetentionError);
    expect((refusal as SpilledInputRetentionError).stage).toBe("prepare");
    const message = (refusal as Error).message;
    expect(message).toContain(`${cap + 1} bytes`); expect(message).toContain(`${cap}-byte limit`);
    expect(message).toContain("Nothing was recorded");
    expect(writer.readEvents()).toHaveLength(before);
    // An ordinary blob provisions the workspace key; the same attachment is then one signed commitment row plus one descriptor row.
    writer.recordUserMessage("provisions the key");
    const retained = writer.recordUserAttachment({ filename: "large.png", content: png(cap + 1), mimeType: "image/png", kind: "image" });
    const events = writer.readEvents();
    expect(events).toHaveLength(before + 3);
    expect(events[events.length - 2]!.event_type).toBe("tool/spill-commitment");
    expect(events[events.length - 1]!.id).toBe(retained.eventId);
    expect(extractSpillRef(events[events.length - 1]!.meta_json)).toMatchObject({ bytes: cap + 1, maxInlineBytes: cap });
    // Exactly at the cap is still one inline signed row.
    const fits = writer.recordUserAttachment({ filename: "fits.png", content: png(cap), mimeType: "image/png", kind: "image" });
    expect(extractSpillRef(writer.readEvents().find(row => row.id === fits.eventId)!.meta_json)).toBeNull();
    expect(writer.readEvents()).toHaveLength(before + 4);
  });

  test("an oversize queued input is refused before the inbox row exists while the spill store has no key, then retained behind a signed loop/inbox commitment", () => {
    const { writer, cap } = opened();
    const inbox = new LoopInbox(writer, () => {});
    const before = writer.readEvents().length;
    // Base64 inflates the image by a third, so a raw image well under the cap can still overflow the queued row.
    const raw = Math.ceil(cap * 0.8);
    const parts: NativeInputPart[] = [{ type: "text", text: "Look" }, { type: "image", image: { filename: "large.png", mediaType: "image/png", bytes: png(raw) } }];
    let refusal: unknown;
    try { inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, parts }); }
    catch (error) { refusal = error; }
    expect(refusal).toBeInstanceOf(SpilledInputRetentionError);
    expect((refusal as SpilledInputRetentionError).stage).toBe("prepare");
    expect((refusal as Error).message).toContain("queued input");
    expect((refusal as Error).message).toContain("Nothing was recorded");
    expect(writer.readEvents()).toHaveLength(before);
    expect(inbox.hasPending).toBe(false);
    // An ordinary blob provisions the workspace key; the same queued input is then one signed loop/inbox commitment
    // row plus one descriptor row, and the lane holds the message.
    writer.recordUserMessage("provisions the key");
    const receipt = inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, parts });
    const events = writer.readEvents();
    expect(events).toHaveLength(before + 3);
    const commitment = events[events.length - 2]!;
    expect(commitment.event_type).toBe("tool/spill-commitment");
    expect(JSON.parse(commitment.meta_json)).toMatchObject({ subject: "loop/inbox", messageId: receipt.messageId });
    expect(extractSpillRef(commitment.meta_json)).toMatchObject({ maxInlineBytes: cap });
    expect(events[events.length - 1]!.id).toBe(receipt.eventId);
    expect(extractSpillRef(events[events.length - 1]!.meta_json)).toBeNull();
    expect(inbox.hasPending).toBe(true);
    // A small queued input is admitted as one row.
    inbox.insert("next-turn", "", "followup", { wake: false, demotedFrom: null, parts: [{ type: "text", text: "Look" }, { type: "image", image: { filename: "small.png", mediaType: "image/png", bytes: PNG } }] });
    expect(inbox.nextTurn).toHaveLength(2); expect(writer.readEvents()).toHaveLength(before + 4);
  });
});
