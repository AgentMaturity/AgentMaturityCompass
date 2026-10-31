import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoopInbox } from "../src/agent/inbox.js";
import { createRedactingSession } from "../src/dataflow/redactingSession.js";
import { SessionService } from "../src/session/sessionService.js";
import { readLoopInboxMeta } from "../src/session/loopEventMeta.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { sha256Hex } from "../src/utils/hash.js";
import { canonicalize } from "../src/utils/json.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * A redacted inbox row must not keep an unkeyed digest of the raw text: `clientRequestSha256`
 * over a short protected value (an SSN) is brute-forced from evidence in minutes.
 */
const SECRET = "123456789";
const TOKEN = "TOK_SSN_FIXTURE";
let workspace: string, writer: SessionService;
beforeEach(() => {
  vi.stubEnv("AMC_VAULT_PASSPHRASE", "secsweep-request-digest");
  workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-request-digest-")));
  initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  writer = new SessionService(workspace);
  writer.open({ agentId: "default", harnessVersion: "fixture", compositionDigest: "fixture", policyDigest: "fixture" });
});
afterEach(() => {
  writer.disposeWithoutClosing(); rmSync(workspace, { recursive: true, force: true }); vi.unstubAllEnvs();
});

const rawFingerprint = (text: string) => sha256Hex(canonicalize({ target: "next-turn", origin: "followup", wake: false,
  payloadFormat: null, payloadSha256: sha256Hex(Buffer.from(text, "utf8")) }));

describe("a redacted inbox row's request digest", () => {
  it("is taken over the committed redacted text, never the raw protected text, and the session replays", () => {
    const session = createRedactingSession(writer, { redact: text => ({ text: text.replaceAll(SECRET, TOKEN), findings: [], declaredFields: [] }) });
    const raw = `my ssn is ${SECRET}`;
    new LoopInbox(session, () => {}).insert("next-turn", raw, "followup", { wake: false, demotedFrom: null, clientRequestId: "req-ssn" });
    const row = writer.readEvents().find(event => event.event_type === "loop/inbox")!;
    const stored = readEventPayload(workspace, row);
    if (stored.status !== "ok") throw new Error("inbox payload unavailable");
    expect(stored.bytes.toString("utf8")).toBe(`my ssn is ${TOKEN}`);
    const digest = readLoopInboxMeta(row.meta_json)?.clientRequestSha256;
    expect(digest).not.toBe(rawFingerprint(raw));
    expect(row.meta_json).not.toContain(sha256Hex(Buffer.from(raw, "utf8")));
    expect(digest).toBe(rawFingerprint(`my ssn is ${TOKEN}`));
    // Replay recomputes the fingerprint over the stored bytes; a raw digest made every later inbox refuse the session.
    expect(() => new LoopInbox(writer, () => {})).not.toThrow();
  });
});
