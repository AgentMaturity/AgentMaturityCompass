import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { copyForkConversation, prepareForkConversation } from "../src/session/forkConversation.js";
import { SessionService, type SessionEventRef } from "../src/session/sessionService.js";
import type { SessionEnvelope } from "../src/session/sessionTypes.js";
import * as projection from "../src/session/surfaceProjection.js";
import type { EvidenceEvent } from "../src/types.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";
import { initWorkspace } from "../src/workspace.js";
import { imageInput } from "./fixtures/nativeAcpImageRuntime.js";

// These are copy-preflight unit checks, not cryptographic admission: payloads come from real
// signed writes, then isolated in-memory mutations exercise guards unreachable after full verification.
let workspace: string, session: SessionService;
const services: SessionService[] = [];
const identity = { agentId: "default", harnessVersion: "fork-admission-fixture", compositionDigest: sha256Hex("fork admission"), policyDigest: sha256Hex("fixture policy") };
beforeEach(() => {
  for (const key of ["AMC_SESSION_STORE", "AMC_EXPECTED_MONITOR_FINGERPRINT", "AMC_NO_SIGN"]) vi.stubEnv(key, undefined);
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "fork-admission-fixture-passphrase");
  workspace = mkdtempSync(join(tmpdir(), "amc-fork-admission-"));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  session = new SessionService(workspace); services.push(session); session.open(identity);
  session.startTurn({ trigger: "user" }); session.startStep();
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const service of services.splice(0)) service.disposeWithoutClosing();
  lockVault(workspace); rmSync(workspace, { recursive: true, force: true }); vi.unstubAllEnvs();
});
function row(write: (writer: SessionService) => SessionEventRef): EvidenceEvent {
  const ref = write(session);
  return session.readEvents().find(event => event.id === ref.eventId)!;
}
function edit(source: EvidenceEvent, change: (metadata: Record<string, unknown> & { amcSession: SessionEnvelope }) => void): EvidenceEvent {
  const metadata = JSON.parse(source.meta_json) as Record<string, unknown> & { amcSession: SessionEnvelope };
  change(metadata); return { ...source, meta_json: JSON.stringify(metadata) };
}
const user = () => row(writer => writer.recordUserMessage("exact user bytes"));
const call = (toolCallId = "fixture-call") => row(writer => writer.recordToolCall({ toolCallId, toolName: "fs.read", dispatch: "native", parentToken: null, args: "{}" }));
const result = (toolCallId = "fixture-call") => row(writer => writer.recordToolResult({ toolCallId, outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: "exact tool result" }));
const rejects = (rows: readonly EvidenceEvent[], message: string) => expect(() => prepareForkConversation(workspace, rows)).toThrow(message);

describe("fork conversation preflight guard admission", () => {
  test("admits an empty initial conversation without inventing content", () => {
    expect(prepareForkConversation(workspace, [])).toEqual([]);
  });

  test("rejects missing or changed surface source provenance and mismatched part digests", () => {
    const source = user(), [entry] = projection.foldSurfaceEntries([source]);
    const fold = vi.spyOn(projection, "foldSurfaceEntries");
    for (const changed of [{ ...entry!, sourceEventId: "missing-source" }, { ...entry!, sourceEventHash: "0".repeat(64) }]) {
      fold.mockReturnValue([changed]); rejects([source], "inconsistent source provenance");
    }
    fold.mockRestore();
    const changed = edit(source, metadata => {
      const surface = metadata.amcSession.surface;
      if (surface.op !== "append") throw new Error("fixture surface is not an append");
      metadata.amcSession = { ...metadata.amcSession, surface: { ...surface, part: { ...surface.part, sha256: "0".repeat(64) } } };
    });
    rejects([changed], "inconsistent source provenance");
  });

  test("refuses pruned and missing conversation payloads", () => {
    const source = user();
    for (const changed of [{ ...source, payload_pruned: 1 },
      { ...source, payload_inline: null, payload_path: ".amc/absent-fork-payload", canonical_payload_path: ".amc/absent-fork-payload" }]) {
      rejects([changed], "payload is unavailable");
    }
  });

  test("refuses readable payload bytes that disagree with the source's declared digest", () => {
    const source = user(), digest = "0".repeat(64);
    const changed = edit({ ...source, payload_sha256: digest }, metadata => {
      const surface = metadata.amcSession.surface;
      if (surface.op !== "append") throw new Error("fixture surface is not an append");
      metadata.amcSession = { ...metadata.amcSession, surface: { ...surface, part: { ...surface.part, sha256: digest } } };
    });
    rejects([changed], "does not match its signed digest");
  });

  test.each(["user", "system"] as const)("refuses invalid UTF-8 in inherited %s text", role => {
    const source = row(writer => writer.recordAssistantBlock({ blockIndex: 0, blockKind: "text", stopReason: null, content: Buffer.from([0xc3, 0x28]) }));
    const changed = edit({ ...source, event_type: role === "user" ? "user/message" : "system/prompt" }, metadata => {
      const surface = metadata.amcSession.surface;
      if (surface.op !== "append") throw new Error("fixture surface is not an append");
      metadata.amcSession = { ...metadata.amcSession, surface: { ...surface, role } };
    });
    rejects([changed], `Fork ${role} text is not valid UTF-8`);
  });

  test("refuses attachment filename, MIME and length metadata that cannot describe its content", () => {
    const source = row(writer => writer.recordUserAttachment({ filename: "fixture.txt", mimeType: "text/plain", kind: "text", content: "attachment bytes" }));
    for (const [field, value] of [["filename", null], ["mimeType", null], ["bytes", 999]] as const) {
      rejects([edit(source, metadata => { metadata[field] = value; })], "attachment metadata does not match");
    }
  });

  test("refuses an image whose MIME disagrees with its actual bytes", () => {
    const image = imageInput();
    const source = row(writer => writer.recordUserAttachment({ filename: image.filename, mimeType: image.mediaType, kind: "image", content: image.bytes }));
    expect(() => prepareForkConversation(workspace, [edit(source, metadata => { metadata.mimeType = "image/jpeg"; })])).toThrow("Image bytes and declared supported media type disagree");
  });

  test("refuses malformed tool-call identity, dispatch and parent-token metadata", () => {
    const source = call(), output = result();
    for (const [field, value] of [["toolCallId", null], ["toolCallId", ""], ["toolName", ""], ["dispatch", "external"], ["parentToken", 7]] as const) {
      rejects([edit(source, metadata => { metadata[field] = value; }), output], "tool call is malformed or ambiguous");
    }
  });

  test("refuses duplicate call identities while pending and after completion", () => {
    const source = call(), output = result(), duplicate = { ...source, id: "duplicate-call-fixture" };
    rejects([source, duplicate, output], "tool call is malformed or ambiguous");
    rejects([source, output, duplicate], "tool call is malformed or ambiguous");
  });

  test("refuses malformed tool-result identity, outcome, exit code and status flags", () => {
    const source = call(), output = result();
    for (const [field, value] of [["toolCallId", null], ["outcome", "SUCCESS"], ["exitCode", 0.5], ["timedOut", "false"], ["denied", null]] as const) {
      rejects([source, edit(output, metadata => { metadata[field] = value; })], "tool result is malformed or has no unique preceding call");
    }
  });

  test("refuses an orphan or repeated result without a unique preceding call", () => {
    const source = call(), output = result();
    rejects([output], "tool result is malformed or has no unique preceding call");
    rejects([source, output, { ...output, id: "duplicate-result-fixture" }], "tool result is malformed or has no unique preceding call");
  });

  test("refuses unsupported role/kind and source-event combinations without flattening them", () => {
    const source = user();
    for (const [role, kind, eventType] of [["tool", "text", "user/message"], ["assistant", "image", "user/message"], ["assistant", "tool_use", "assistant/block"]] as const) {
      const changed = edit({ ...source, event_type: eventType }, metadata => {
        const surface = metadata.amcSession.surface;
        if (surface.op !== "append") throw new Error("fixture surface is not an append");
        metadata.amcSession = { ...metadata.amcSession, surface: { ...surface, role, part: { ...surface.part, kind } } };
      });
      rejects([changed], "unsupported role, kind or source event");
    }
  });

  test("refuses a recorder that changes inherited bytes before claiming provenance", () => {
    const source = user(), prepared = prepareForkConversation(workspace, [source]);
    const child = new SessionService(workspace); services.push(child); child.open(identity);
    vi.spyOn(child, "recordUserMessage").mockReturnValue({ eventId: "changed-by-recorder", eventHash: "a".repeat(64), seq: 1, payloadSha256: "0".repeat(64) });
    const receipt = vi.spyOn(child, "recordProjectedEvidence");
    expect(() => copyForkConversation(child, prepared)).toThrow("Current input or redaction policy changed inherited bytes");
    expect(receipt).not.toHaveBeenCalled();
  });
});
