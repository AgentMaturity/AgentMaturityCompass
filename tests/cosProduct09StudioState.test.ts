import { describe, expect, test, vi } from "vitest";
import { captureNativeSubmission, composeNativeTaskPrompt, nativeSubmissionDraftMatches,
  readNativeTextAttachment, NATIVE_TEXT_ATTACHMENT_LIMIT, nativeTaskMediaCapabilities,
  readNativeMediaAttachment, composeNativeTaskInput, assertNativeTaskRequestSize } from "../src/console/assets/nativeTaskSubmission.js";
import { validateNativeTaskPoll } from "../src/console/assets/nativeTasks.js";
import { collectNativeTaskTools, nativeTaskErrorText, renderTaskAttachments, renderTaskApprovals,
  renderTaskToolStatus, renderTaskUsage, renderTaskValidation, taskStateLabel, renderTaskAttachmentEvidence } from "../src/console/assets/nativeTasksView.js";

// Synthetic contract inputs only; none of these cases claims provider or browser execution.
const encode = (text: string) => new TextEncoder().encode(text);
const attachment = (text = "ગુજરાતી context", name = "notes.txt") => ({ name, text, bytes: encode(text).byteLength });
const file = (bytes: Uint8Array, name = "notes.txt") => ({ name, size: bytes.byteLength,
  arrayBuffer: vi.fn(async () => bytes.slice().buffer) });
const mediaCapabilities = (overrides: Record<string, unknown> = {}) => ({
  formats: ["text", "amc-image-input@2", "amc-audio-input@1"], imageMimeTypes: ["image/png", "image/jpeg", "image/gif", "image/webp"], audioMimeTypes: ["audio/wav"],
  maxParts: 256, maxImages: 8, maxAudios: 8, maxTextBytes: 16_384,
  maxSerializedPartsBytes: 1024 * 1024 - 2048, maxPromptFrameBytes: 1024 * 1024, modelSupport: "not-probed", ...overrides
});
// Only signature recognition is exercised here. Server-owned media validity is not inferred from a header.
const pngHeader = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const wavHeader = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]);
function view(overrides: Record<string, unknown> = {}) {
  return { taskId: "task_00000001", agentId: "default", revision: 1, state: "running", provider: "openai",
    nextCursor: 2, firstCursor: 1, droppedEvents: 0, canResume: false, resumeBlockedReason: null, archived: false,
    history: { status: "authenticated", backend: "sqlite", headEventHash: "test-head", eventCount: 4, message: "Test metadata" },
    validation: { status: "not-requested", turn: null, checks: [] }, validationOutputs: [],
    approvals: [], approvalError: null, verification: "not-verified", ...overrides };
}
function event(cursor: number, overrides: Record<string, unknown> = {}) {
  return { cursor, kind: "assistant", text: `Recorded block ${cursor}`, evidence: "committed", ...overrides };
}
const page = (events = [event(1), event(2)], overrides: Record<string, unknown> = {}) => ({ task: view(), events, truncated: false, ...overrides });
function usage(overrides: Record<string, unknown> = {}) {
  return { scope: "recorded-session", status: "partial", requests: 2, syntheticRequests: 0,
    reportedRequests: 1, completeRequests: 0, unreportedRequests: 1, pendingRequests: 1, issues: [],
    totals: { inputTokens: { observedTokens: 0, reportedRequests: 1 }, outputTokens: { observedTokens: 7, reportedRequests: 1 },
      cacheReadTokens: { observedTokens: null, reportedRequests: 0 }, cacheWriteTokens: { observedTokens: null, reportedRequests: 0 },
      reasoningTokens: { observedTokens: null, reportedRequests: 0 } }, ...overrides };
}

describe("P09 explicit text context on the existing prompt API", () => {
  test("preserves a plain prompt and uses the UTF-8 size of the entire composed request", () => {
    expect(composeNativeTaskPrompt("unchanged\ntext")).toBe("unchanged\ntext");
    expect(composeNativeTaskPrompt("\ufeffLeading Unicode character")).toBe("\ufeffLeading Unicode character");
    const parts = [attachment()], combined = composeNativeTaskPrompt("Review", parts);
    expect(combined).toContain("not separate uploaded objects");
    expect(combined).toContain(parts[0].text);
    const exact = encode(combined).byteLength;
    expect(exact).toBeGreaterThan(combined.length);
    expect(composeNativeTaskPrompt("Review", parts, exact)).toBe(combined);
    expect(() => composeNativeTaskPrompt("Review", parts, exact - 1)).toThrow(/UTF-8 bytes/);
  });

  test("freezes the actual composed body and preserves any later draft or attachment edit", () => {
    const parts = [attachment("original file")], draftPrompt = "Review this file";
    const body = { prompt: composeNativeTaskPrompt(draftPrompt, parts), clientRequestId: "original-request", expectedRevision: 3 };
    const pending = captureNativeSubmission({ body, draftPrompt, attachments: parts,
      url: "/api/v1/native-tasks/task_00000001/turn?agentId=default", taskId: "task_00000001", agentId: "default",
      workspaceScope: "https://studio.example/w/original", csrfToken: "test-only-session", adminToken: null });
    const frozenBody = JSON.stringify(pending.body);
    expect(nativeSubmissionDraftMatches(pending, draftPrompt, parts)).toBe(true);
    expect(nativeSubmissionDraftMatches(pending, "edited draft", parts)).toBe(false);
    parts[0].text = "edited file"; parts[0].bytes = encode(parts[0].text).byteLength;
    body.prompt = "different request";
    expect(nativeSubmissionDraftMatches(pending, draftPrompt, parts)).toBe(false);
    expect(nativeSubmissionDraftMatches(pending, draftPrompt, [])).toBe(false);
    expect(JSON.stringify(pending.body)).toBe(frozenBody);
    expect(pending.body.expectedRevision).toBe(3);
    expect(Object.isFrozen(pending.draftAttachments[0])).toBe(true);
    expect(pending.draftAttachments[0]).toMatchObject({ text: "original file" });
  });

  test("decodes selected text strictly and reports the submitted text bytes after BOM removal", async () => {
    const selected = await readNativeTextAttachment(file(new Uint8Array([239, 187, 191, 65])), 100);
    expect(selected).toEqual({ name: "notes.txt", text: "A", bytes: 1 });
    expect(Object.isFrozen(selected)).toBe(true);
    await expect(readNativeTextAttachment(file(new Uint8Array([195, 40])), 100)).rejects.toThrow(/valid UTF-8/);
    await expect(readNativeTextAttachment(file(encode("binary\0text")), 100)).rejects.toThrow(/control characters/);
  });

  test("bounds the read before loading content and never admits media as text", async () => {
    const oversized = file(encode("over limit"));
    await expect(readNativeTextAttachment(oversized, 2)).rejects.toThrow(/no larger/);
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
    const binary = file(encode("not an image"), "image.png");
    await expect(readNativeTextAttachment(binary, 100)).rejects.toThrow(/not accepted/);
    expect(binary.arrayBuffer).not.toHaveBeenCalled();
    await expect(readNativeTextAttachment(file(encode("text"), "../notes.txt"), 100)).rejects.toThrow(/plain filename/);
    await expect(readNativeTextAttachment(file(encode("text")), 0)).rejects.toThrow(/Refresh setup/);
  });

  test("refuses a changed file, excessive selection, invalid metadata, and prompt controls", async () => {
    const changed = { ...file(encode("text")), size: 3 };
    await expect(readNativeTextAttachment(changed, 100)).rejects.toThrow(/changed/);
    expect(() => composeNativeTaskPrompt("Review", Array.from({ length: NATIVE_TEXT_ATTACHMENT_LIMIT + 1 }, () => attachment("x")))).toThrow(/at most/);
    expect(() => composeNativeTaskPrompt("Review", [{ ...attachment(), bytes: 1 }])).toThrow(/invalid/);
    expect(() => composeNativeTaskPrompt("Review\0this")).toThrow(/control characters/);
    expect(() => composeNativeTaskPrompt("Review\ud800this")).toThrow(/lossless UTF-8/);
  });

  test("previews are escaped text, not executable HTML or remote resources", () => {
    const html = renderTaskAttachments([attachment('<img src=x onerror="attack()">', "<script>.txt")]);
    expect(html).not.toContain("<img"); expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img"); expect(html).toContain("&lt;script&gt;.txt");
    expect(html).toContain("local draft selection, not a committed input receipt");
  });
});

describe("P09 original media on P10's advertised input contract", () => {
  test("absent/malformed discovery does not enable media; text submissions keep their old shape", async () => {
    expect(nativeTaskMediaCapabilities(undefined)).toBeNull();
    expect(nativeTaskMediaCapabilities(mediaCapabilities({ maxTextBytes: -1 }))).toBeNull();
    expect(nativeTaskMediaCapabilities(mediaCapabilities({ imageMimeTypes: "image/png" }))).toBeNull();
    expect(composeNativeTaskInput("Unchanged prompt")).toEqual({ prompt: "Unchanged prompt" });
    const selected = file(pngHeader, "one.png");
    await expect(readNativeMediaAttachment(selected, null)).rejects.toThrow(/not advertised/);
    expect(selected.arrayBuffer).not.toHaveBeenCalled();
  });

  test("copies original bytes exactly without trusting a MIME label, path or data URL", async () => {
    const original = file(pngHeader, "one.png");
    const selected = await readNativeMediaAttachment({ ...original, type: "text/plain" }, mediaCapabilities());
    expect(selected).toMatchObject({ type: "image", mimeType: "image/png", bytes: pngHeader.length, name: "one.png" });
    expect(selected.data).toBe(Buffer.from(pngHeader).toString("base64"));
    expect(selected.data).not.toContain("data:"); expect(Object.isFrozen(selected)).toBe(true);
    await expect(readNativeMediaAttachment(file(encode("<svg onload='x()'>"), "unsafe.svg"), mediaCapabilities())).rejects.toThrow(/supported original/);
    await expect(readNativeMediaAttachment(file(pngHeader, "../one.png"), mediaCapabilities())).rejects.toThrow(/plain filename/);
    const huge = { ...original, size: 1024 * 1024 };
    await expect(readNativeMediaAttachment(huge, mediaCapabilities())).rejects.toThrow(/base64/);
  });

  test("ordered images and mixed audio use exactly one body member and omit local names", async () => {
    const image = await readNativeMediaAttachment(file(pngHeader, "one.png"), mediaCapabilities());
    const audio = await readNativeMediaAttachment(file(wavHeader, "one.wav"), mediaCapabilities());
    const images = composeNativeTaskInput("Inspect", [image], mediaCapabilities());
    if (!images.input) throw new Error("Expected an ordered image input, not a text fallback.");
    expect(images).not.toHaveProperty("prompt");
    expect(images.input.format).toBe("amc-image-input@2");
    expect(images.input.parts).toEqual([{ type: "text", text: "Inspect" }, { type: "image", mimeType: "image/png", data: image.data }]);
    const mixed = composeNativeTaskInput("Inspect", [audio, attachment("reference"), image], mediaCapabilities());
    if (!mixed.input) throw new Error("Expected an ordered audio input, not a text fallback.");
    expect(mixed.input.format).toBe("amc-audio-input@1");
    expect(mixed.input.parts.map(part => part.type)).toEqual(["text", "audio", "image"]);
    expect(JSON.stringify(mixed)).not.toContain("one.png"); expect(JSON.stringify(mixed)).not.toContain("one.wav");
    expect(JSON.stringify(mixed)).toContain("reference");
    const pending = captureNativeSubmission({ url: "/api/v1/native-tasks", body: { ...mixed, clientRequestId: "original-input" },
      agentId: "default", taskId: null, workspaceScope: "https://studio.example", csrfToken: "test-only", adminToken: null,
      draftPrompt: "Inspect", attachments: [audio, image] });
    mixed.input.parts.reverse();
    expect(pending.body.input?.parts.map(part => part.type)).toEqual(["text", "audio", "image"]);
    expect(nativeSubmissionDraftMatches(pending, "Inspect", [image, audio])).toBe(false);
  });

  test("refuses MIME/capability changes, excessive counts and noncanonical encodings without fallback", async () => {
    const selected = await readNativeMediaAttachment(file(pngHeader, "one.png"), mediaCapabilities());
    expect(() => composeNativeTaskInput("Inspect", [selected], null)).toThrow(/No text-only fallback/);
    expect(() => composeNativeTaskInput("Inspect", [selected], mediaCapabilities({ imageMimeTypes: ["image/jpeg"] }))).toThrow(/invalid or unsupported/);
    expect(() => composeNativeTaskInput("Inspect", [selected, selected], mediaCapabilities({ maxImages: 1 }))).toThrow(/part count/);
    const badBase64 = { ...selected, data: "Zh==", bytes: 1 };
    expect(() => composeNativeTaskInput("Inspect", [badBase64], mediaCapabilities())).toThrow(/canonical base64/);
    await expect(readNativeMediaAttachment(file(wavHeader, "one.wav"), mediaCapabilities({ formats: ["text", "amc-image-input@2"], audioMimeTypes: [] }))).rejects.toThrow(/does not advertise audio\/wav/);
  });

  test("the authored media request matches the actual P10 start and follow-up schemas", async () => {
    const { nativeTaskInputCapabilities, nativeTaskStartSchema, nativeTaskTurnSchema } = await import("../src/studio/nativeTaskInput.js");
    const capability = nativeTaskInputCapabilities("gemini-audio");
    const selected = await readNativeMediaAttachment(file(wavHeader, "original.wav"), capability);
    const payload = composeNativeTaskInput("Inspect original input", [selected], capability);
    const clientRequestId = "00000000-0000-4000-8000-000000000009";
    const start = { ...payload, clientRequestId, agentId: "default", provider: "gemini-audio", model: "not-contacted", tools: "none" };
    expect(nativeTaskStartSchema.parse(start)).toEqual(start);
    const turn = { ...payload, clientRequestId, expectedRevision: 1 };
    expect(nativeTaskTurnSchema.parse(turn)).toEqual(turn);
    expect(nativeTaskTurnSchema.safeParse({ ...turn, prompt: "Forbidden second payload" }).success).toBe(false);
    // Schema agreement is not full WAV validation, a negotiated runtime, or provider acceptance.
  });

  test("bounds serialized parts, the conservative ACP frame, and the final HTTP body independently", async () => {
    const selected = await readNativeMediaAttachment(file(pngHeader, "one.png"), mediaCapabilities());
    const payload = composeNativeTaskInput("Inspect", [selected], mediaCapabilities());
    if (!payload.input) throw new Error("Expected an ordered image input for frame sizing.");
    const bytes = encode(JSON.stringify(payload.input.parts)).byteLength;
    expect(composeNativeTaskInput("Inspect", [selected], mediaCapabilities({ maxSerializedPartsBytes: bytes }))).toEqual(payload);
    expect(() => composeNativeTaskInput("Inspect", [selected], mediaCapabilities({ maxSerializedPartsBytes: bytes - 1 }))).toThrow(/frame bound/);
    expect(() => composeNativeTaskInput("Inspect", [selected], mediaCapabilities({ maxPromptFrameBytes: bytes + 100 }))).toThrow(/frame bound/);
    expect(() => assertNativeTaskRequestSize({ prompt: "x".repeat(1024 * 1024) })).toThrow(/HTTP body limit/);
  });

  test("selected media is never displayed as committed or rendered as base64 markup", async () => {
    const selected = await readNativeMediaAttachment(file(pngHeader, "<image>.png"), mediaCapabilities());
    const html = renderTaskAttachments([selected]);
    expect(html).toContain("&lt;image&gt;.png"); expect(html).not.toContain(selected.data);
    expect(html).toContain("local draft selection, not a committed input receipt");
    expect(html).toContain("inspect task activity after Studio records the input");
    const committed = { type: "image", mimeType: "image/png", byteLength: 8, sha256: "a".repeat(64) };
    expect(validateNativeTaskPoll(page([event(1, { kind: "user", attachment: committed }), event(2)]), view(), 0).events).toHaveLength(2);
    expect(() => validateNativeTaskPoll(page([event(1, { kind: "user", attachment: { ...committed, sha256: "draft-hash" } }), event(2)]), view(), 0)).toThrow(/No partial page/);
    const evidence = renderTaskAttachmentEvidence(committed);
    expect(evidence).toContain("SHA-256"); expect(evidence).toContain("does not independently rehash");
    expect(evidence).not.toContain("<image>.png");
  });
});

describe("P09 atomic committed-event observation", () => {
  test("applies ordered events and drops already observed overlap without advancing from guesses", () => {
    expect(validateNativeTaskPoll(page(), view(), 0).events).toHaveLength(2);
    const replay = validateNativeTaskPoll(page(), view(), 1);
    expect(replay.events.map(row => row.cursor)).toEqual([2]);
    expect(replay.task.nextCursor).toBe(2);
  });

  test("rejects an invalid last event before a caller can render any of the page", () => {
    const input = page([event(1), event(2, { evidence: "provisional" })]);
    const original = JSON.stringify(input);
    expect(() => validateNativeTaskPoll(input, view(), 0)).toThrow(/No partial page/);
    expect(JSON.stringify(input)).toBe(original);
  });

  test.each([{ events: [event(1), event(1)] }, { events: [event(2), event(1)] }, { events: [event(1), event(3)] }])("rejects duplicate, descending or out-of-range cursors", ({ events }) => {
    expect(() => validateNativeTaskPoll(page(events), view(), 0)).toThrow();
  });

  test("requires an explicit retention notice for gaps or withheld endings", () => {
    const gap = page([event(1), event(3)], { task: view({ nextCursor: 3 }) });
    expect(() => validateNativeTaskPoll(gap, view(), 0)).toThrow(/gap/);
    expect(validateNativeTaskPoll({ ...gap, truncated: true }, view(), 0).events).toHaveLength(2);
    expect(() => validateNativeTaskPoll(page([event(1)]), view(), 0)).toThrow(/omitted/);
  });

  test("refuses foreign scope, revision rollback, backward cursor and unbounded pages", () => {
    for (const change of [{ taskId: "task_00000002" }, { agentId: "another" }, { revision: 0 }]) {
      expect(() => validateNativeTaskPoll(page(undefined, { task: view(change) }), view(), 0)).toThrow(/identity or revision/);
    }
    expect(() => validateNativeTaskPoll(page(), view(), 3)).toThrow(/backwards/);
    expect(() => validateNativeTaskPoll(page(), view(), 0, { maxEvents: 1 })).toThrow(/display bound/);
    expect(() => validateNativeTaskPoll(page(), view(), 0, { maxEventBytes: 10 })).toThrow(/display bound/);
  });

  test("unavailable history can report unavailability, never transcript or approvals", () => {
    const unavailable = view({ history: { status: "unavailable", backend: null, headEventHash: null, eventCount: 0, message: "Unavailable" },
      nextCursor: 0, firstCursor: 1 });
    expect(validateNativeTaskPoll(page([], { task: unavailable, truncated: true }), view(), 2).events).toEqual([]);
    expect(() => validateNativeTaskPoll(page([event(1)], { task: unavailable }), view(), 2)).toThrow(/without authenticated history/);
    expect(renderTaskToolStatus(new Map(), false)).toContain("unconfirmed");
    expect(renderTaskValidation(unavailable)).toContain("No previous result");
  });
});

describe("P09 latest tool status and visible signed approvals", () => {
  test("joins a recorded call and update without making an absent ending successful", () => {
    const opening = event(1, { kind: "tool", toolCallId: "call_one", text: "Read workspace file", status: "in_progress" });
    const initial = collectNativeTaskTools(new Map(), [opening]);
    expect(initial.get("call_one").status).toBe("in_progress");
    const completed = collectNativeTaskTools(initial, [event(2, { kind: "tool-update", toolCallId: "call_one", status: "completed" })]);
    expect(completed.size).toBe(1);
    expect(completed.get("call_one")).toMatchObject({ title: "Read workspace file", status: "completed", cursor: 2 });
    expect(initial.get("call_one").status).toBe("in_progress");
    const unlinked = collectNativeTaskTools(new Map(), [event(3, { kind: "tool-update" })]);
    expect(renderTaskToolStatus(unlinked)).toContain("Status unreported");
    expect(renderTaskToolStatus(unlinked)).toContain("opening not loaded");
  });

  test("bounds the retained tool summary and explicitly labels a shortened title", () => {
    const tools = collectNativeTaskTools(new Map(), [1, 2, 3].map(cursor => event(cursor,
      { kind: "tool", toolCallId: `call_${cursor}`, text: "x".repeat(300) })), 2);
    expect([...tools.keys()]).toEqual(["call_2", "call_3"]);
    expect(renderTaskToolStatus(tools)).toContain("title shortened");
    expect(renderTaskToolStatus(tools)).toContain("not a complete tool inventory");
  });

  test("approval review retains the selected agent and request; never renders a vote-as-execution action", () => {
    const html = renderTaskApprovals(view({ approvals: [{ approvalRequestId: "request&one", requestDigestSha256: "test-digest",
      toolName: "<tool>", actionClass: "WRITE_HIGH", riskTier: "high", status: "PENDING", required: 2, received: 1, expiresTs: 1 }] }));
    expect(html).toContain("&lt;tool&gt;"); expect(html).not.toContain("<tool>");
    expect(html).toContain("agent=default&approval=request%26one");
    expect(html).toContain("1 of 2 required decisions");
    expect(html).toContain("only the server determines");
    expect(html).toContain("A recorded vote does not mean the action has run");
    expect(taskStateLabel(view({ state: "cancel-requested" }))).toBe("Stop requested");
  });
});

describe("P09 truthful usage and actionable failures", () => {
  test("missing reports, invalid metadata and synthetic requests never masquerade as measured zero", () => {
    for (const value of [undefined, usage({ status: "invalid" }), usage({ status: "unavailable" }), usage({ issues: [{ code: "bad-link" }] }),
      usage({ completeRequests: 2 }), usage({ unreportedRequests: 0 }), usage({ status: "recorded" }), usage({ pendingRequests: 2 })]) {
      expect(renderTaskUsage(view({ usage: value }))).toContain("absent counts are not zero");
    }
    const stub = renderTaskUsage(view({ provider: "stub", usage: usage() }));
    expect(stub).toContain("synthetic"); expect(stub).not.toContain("<dd>0");
    expect(renderTaskUsage(view({ history: { status: "unavailable" }, usage: usage() }))).toContain("withheld");
  });

  test("distinguishes explicitly reported zero from absent counts and never derives spend from a limit", () => {
    const html = renderTaskUsage(view({ usage: usage(), maxTokens: 654321 }));
    expect(html).toContain("<dd>0 <small>(1 reports)</small>");
    expect(html).toContain("Unreported <small>(0 reports)</small>");
    expect(html).toContain("1 of 2 non-synthetic requests reported usage");
    expect(html).toContain("Cost is unavailable"); expect(html).not.toContain("654321");
    const inconsistent = { ...usage(), totals: { ...usage().totals, inputTokens: { observedTokens: null, reportedRequests: 1 } } };
    expect(renderTaskUsage(view({ usage: inconsistent }))).toContain("absent counts are not zero");
    const missingRequiredOutput = { ...usage(), totals: { ...usage().totals, outputTokens: { observedTokens: null, reportedRequests: 0 } } };
    expect(renderTaskUsage(view({ usage: missingRequiredOutput }))).toContain("absent counts are not zero");
  });

  test("stale revisions and local timeouts point to observation, not an automatic replacement request", () => {
    expect(nativeTaskErrorText({ code: "NATIVE_STALE_REVISION", message: "Revision changed" })).toContain("not automatically resent");
    expect(nativeTaskErrorText({ code: "NATIVE_TIMEOUT", message: "No reply" })).toContain("not necessarily on the server");
    expect(nativeTaskErrorText({ code: "NATIVE_CREDENTIAL_MISSING", message: "Credential missing" })).toContain("never in the prompt");
  });
});
