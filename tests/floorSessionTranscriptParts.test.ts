// `amc session show` transcript (src/session/sessionTranscript.ts): tool calls, long tool results, thinking blocks,
// runtime-context snapshots, pruned payloads and terminal controls, from a real signed session in a temp workspace.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { SessionService } from "../src/session/sessionService.js";
import { openSessionEventStore } from "../src/persistence/openSessionEventStore.js";
import { loadSessionEventHistory } from "../src/session/sessionEventHistory.js";
import { renderSessionTranscript } from "../src/session/sessionTranscript.js";
import { sha256Hex } from "../src/utils/hash.js";
import { lockVault } from "../src/vault/vault.js";

const SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const plain = (text: string) => text.replace(SGR, "");

describe("session transcript parts", () => {
  let workspace: string;
  beforeEach(() => {
    for (const name of ["AMC_SESSION_STORE", "AMC_EXPECTED_MONITOR_FINGERPRINT", "AMC_NO_SIGN"]) vi.stubEnv(name, undefined);
    vi.stubEnv("AMC_VAULT_PASSPHRASE", "synthetic-transcript-parts");
    workspace = mkdtempSync(join(tmpdir(), "amc-transcript-parts-"));
    initWorkspace({ workspacePath: workspace, agentId: "default", trustBoundaryMode: "isolated" });
  });
  afterEach(() => { lockVault(workspace); vi.unstubAllEnvs(); rmSync(workspace, { recursive: true, force: true }); });

  function record(): ReturnType<typeof loadSessionEventHistory>["events"] {
    const session = new SessionService(workspace, openSessionEventStore(workspace, "jsonl"), {});
    session.open({ sessionId: "transcript-parts", agentId: "default", harnessVersion: "synthetic-transcript",
      compositionDigest: sha256Hex("composition"), policyDigest: sha256Hex("policy") });
    session.startTurn({ trigger: "user" }); session.startStep();
    session.recordUserMessage("Current runtime context.\nclock: fixed\nfolder: fixture");
    session.recordUserMessage("List the files");
    session.recordAssistantBlock({ blockIndex: 0, blockKind: "thinking", stopReason: null, content: "private reasoning text" });
    session.recordToolCall({ toolCallId: "call-1", toolName: "fs.list\u001b[31m", args: "{\n  \"path\":   \".\"\n}", dispatch: "native", parentToken: null });
    const listing = Array.from({ length: 15 }, (_, index) => `file-${index}.txt`).join("\n");
    session.recordToolResult({ toolCallId: "call-1", outcome: "OK", exitCode: 0, timedOut: false, denied: false, content: `${listing}\n\u001b[2Jcleared` });
    session.endStep({ stopReason: "tool_use", usage: null }); session.endTurn({ reason: "complete" }); session.sealTurn();
    session.close({ reason: "completed" }); session.disposeWithoutClosing();
    return loadSessionEventHistory({ workspace }).events.filter(row => row.session_id === "transcript-parts");
  }

  it("shows tool calls on one line, caps long results, and names thinking and context snapshots without printing them", () => {
    const events = record();
    const shown = renderSessionTranscript(workspace, events, null);
    expect(shown.unreadable).toBe(0);
    const text = plain(shown.lines.join("\n"));
    expect(text).toContain("You:\n  [runtime context snapshot, 3 lines]");
    expect(text).not.toContain("clock: fixed");
    expect(text).toContain("  List the files");
    expect(text).toMatch(/Agent:\n {2}\[thinking, 22 bytes\]/);
    expect(text).not.toContain("private reasoning text");
    // Whitespace in the arguments is folded to single spaces; controls in the tool name are escaped.
    expect(text).toMatch(/→ fs\.list.*\{ "path": "\." \}/);
    expect(text).toContain("  file-0.txt");
    expect(text).toContain("  file-11.txt");
    expect(text).not.toContain("file-12.txt");
    expect(text).toContain("(4 more lines)");
    expect(shown.lines.join("\n")).not.toContain("\u001b[31m");
    expect(shown.lines.join("\n")).not.toContain("\u001b[2J");
  });

  it("names a pruned payload as removed by retention and a row it cannot find as not readable", () => {
    const events = record();
    const call = events.find(row => row.event_type === "tool/call")!;
    const pruned = events.map(row => row.id === call.id ? { ...row, payload_pruned: 1 } : row);
    const shown = renderSessionTranscript(workspace, pruned, 80);
    expect(shown.unreadable).toBe(1);
    expect(plain(shown.lines.join("\n"))).toContain("[tool_use: removed by retention]");
  });

  it("refuses bytes that do not match the part's signed digest instead of printing them", () => {
    const events = record();
    const user = events.find(row => row.event_type === "user/message" && row.payload_sha256 === sha256Hex("List the files"))!;
    const thinking = events.find(row => row.event_type === "assistant/block")!;
    // The user row now points at another row's stored bytes: they read fine but are not what its part committed to.
    const swapped = events.map(row => row.id === user.id
      ? { ...row, payload_path: thinking.payload_path, payload_inline: thinking.payload_inline, payload_sha256: thinking.payload_sha256 } : row);
    const shown = renderSessionTranscript(workspace, swapped, 80);
    expect(shown.unreadable).toBe(1);
    const text = plain(shown.lines.join("\n"));
    expect(text).toContain("[text: not readable here]");
    expect(text).not.toContain("private reasoning text");
    expect(text).not.toContain("List the files");
  });
});
