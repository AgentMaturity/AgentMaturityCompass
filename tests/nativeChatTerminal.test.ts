import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChatDisplay } from "../src/setup/nativeChatDisplay.js";
import { attachMentionedFiles, loadChatSettings, saveChatSettings, withChatSettings } from "../src/setup/nativeChatInput.js";
import { chatUsageTotals, renderExitSummary, renderTurnFooter } from "../src/setup/nativeChatSummary.js";
import { renderMarkdown, wrapLine } from "../src/utils/terminalMarkdown.js";
import { toolsetConfinementNotice } from "../src/agent/agentToolset.js";

// Plain colour so assertions read the words; colour itself is chalk's (NO_COLOR, TERM=dumb and a pipe turn it off).
let level: typeof chalk.level;
beforeEach(() => { level = chalk.level; chalk.level = 0; });
afterEach(() => { chalk.level = level; });

function display(columns: number | null = 80) {
  const out: string[] = [], err: string[] = [];
  const view = createChatDisplay({ write: text => out.push(text), writeError: text => err.push(text), columns: () => columns, spinner: false });
  return { view, out: () => out.join(""), err: () => err.join("") };
}
const HEADER = "\nLive reply · session s-1 · provisional until recorded settlement\n";
const END = "\n[Live preview ended; read the recorded result for the outcome.]\n";

describe("chat display of a turn child's stderr", () => {
  it("renders the streamed reply as Markdown, in any chunking, and keeps setup lines for /status", () => {
    const reply = "# Plan\n\n- first `item`\n1. step one\n\n```ts\nconst x = 1;\n```\nDone **now**.";
    const stream = ["turn 1 started\n", "  step 1.1 → model\n", "tool writes are scoped to: ./**\n", "action policy: signed\n",
      "File tools are limited by AMC's signed policy, not by the operating system; shell commands run inside the macos-seatbelt sandbox.\n",
      HEADER, reply, END, "  step 1.1 context: prompt 1200 tokens of 200000 (1%)\n", "turn 1 ended: complete\n"].join("");
    for (const size of [1, 3, 7, stream.length]) {
      const { view, out, err } = display();
      for (let at = 0; at < stream.length; at += size) view.child(stream.slice(at, at + size));
      view.end();
      expect(out()).toBe("Plan\n\n  • first item\n  1. step one\n\n  ts\n  const x = 1;\nDone now.\n");
      expect(view.liveText()).toBe(reply);
      expect(view.context()).toEqual({ promptTokens: 1200, windowTokens: 200000 });
      expect(view.notes()).toEqual(["tool writes are scoped to: ./**", "action policy: signed",
        "File tools are limited by AMC's signed policy, not by the operating system; shell commands run inside the macos-seatbelt sandbox."]);
      // The confinement notice is shown once (wrapped); progress lines and the complete ending are not.
      expect(err()).toContain("File tools are limited by AMC's signed policy");
      expect(err()).not.toMatch(/turn 1|step 1\.1|scoped to|action policy/);
    }
  });

  it("passes through what it does not recognise and a turn that did not complete", () => {
    const { view, err } = display();
    view.child("native error at turn 1, step 1: TRANSPORT\nturn 1 ended: cancelled\n");
    view.end();
    expect(err()).toBe("native error at turn 1, step 1: TRANSPORT\nturn 1 ended: cancelled\n");
  });

  it("escapes terminal controls a model writes and wraps prose at 80 and at 200 columns", () => {
    const words = Array.from({ length: 120 }, (_, at) => `word${at}`).join(" ");
    for (const columns of [80, 200]) {
      const { view, out } = display(columns);
      view.child(`${HEADER}\u001b[2J${words}${END}`);
      view.end();
      expect(out()).not.toContain("\u001b");
      for (const line of out().split("\n")) expect(line.length).toBeLessThan(columns);
      expect(out().split("\n").length).toBeGreaterThan(columns === 80 ? 9 : 3);
    }
  });
});

describe("terminal Markdown and wrapping", () => {
  it("keeps code unwrapped, wraps prose with the line's indentation and splits embedded newlines", () => {
    expect(renderMarkdown("```\n" + "x".repeat(150) + "\n```", 80)).toEqual([`  ${"x".repeat(150)}`]);
    const wrapped = wrapLine(`  ${"alpha ".repeat(30).trim()}`, 80);
    expect(wrapped.length).toBeGreaterThan(1);
    for (const line of wrapped) { expect(line.startsWith("  alpha")).toBe(true); expect(line.length).toBeLessThan(80); }
    expect(wrapLine("one\ntwo", null)).toEqual(["one", "two"]);
  });
});

describe("@file attachments and saved chat settings", () => {
  let workspace: string;
  beforeEach(() => {
    workspace = realpathSync(mkdtempSync(join(tmpdir(), "amc-chat-terminal-")));
    writeFileSync(join(workspace, "notes.md"), "line one\nline two\n");
    writeFileSync(join(workspace, ".env"), "SECRET=1\n");
    writeFileSync(join(workspace, "blob.bin"), Buffer.from([1, 0, 2]));
    mkdirSync(join(workspace, ".amc"));
    writeFileSync(join(workspace, ".amc", "vault.json"), "{}");
  });
  afterEach(() => rmSync(workspace, { recursive: true, force: true }));

  it("attaches text files in the workspace and refuses secrets, AMC state, binaries, escapes and missing files", () => {
    const result = attachMentionedFiles(workspace, "read @notes.md, @.env @.amc/vault.json @blob.bin @../outside.txt @nope.txt and ping @alice");
    expect(result.prompt).toContain("Attached file notes.md:\n```\nline one\nline two\n```");
    expect(result.prompt).not.toContain("SECRET");
    expect(result.notes).toEqual([
      "Attached @notes.md (2 lines).",
      "Not attached: @.env: the file names an environment or credential file.",
      "Not attached: @.amc/vault.json: the file names AMC state, version control, dependencies or a credential directory.",
      "Not attached: @blob.bin is not a text file.",
      "Not attached: @../outside.txt (no such file in this folder).",
      "Not attached: @nope.txt (no such file in this folder)."
    ]);
    expect(attachMentionedFiles(workspace, "hello @alice").prompt).toBe("hello @alice");
  });

  it("restores only known settings and lets a flag on the command line win", () => {
    saveChatSettings(workspace, "s-1", { provider: "openai", model: "m-1", tools: "workspace", maxSteps: "4", autoCompact: false });
    const path = join(workspace, ".amc", "chat", "sessions", "s-1.json");
    const row = JSON.parse(readFileSync(path, "utf8"));
    row.settings.unsafeUnconfinedShell = true; row.settings.mcpConfig = ["/x.json"];
    writeFileSync(path, JSON.stringify(row));
    const settings = loadChatSettings(workspace, "s-1")!;
    expect(settings).toEqual({ provider: "openai", model: "m-1", tools: "workspace", maxSteps: "4", autoCompact: false });
    expect(withChatSettings({ model: "explicit", autoCompact: true, autoSummary: true }, settings))
      .toEqual({ provider: "openai", model: "explicit", tools: "workspace", maxSteps: "4", autoCompact: false, autoSummary: true });
    expect(loadChatSettings(workspace, "../escape")).toBeNull();
    expect(loadChatSettings(workspace, "unknown")).toBeNull();
  });
});

describe("chat footer, exit summary and confinement notice", () => {
  const usage = { requests: 2, syntheticRequests: 0, totals: { inputTokens: { observedTokens: 1000 }, cacheReadTokens: { observedTokens: 200 },
    cacheWriteTokens: { observedTokens: null }, outputTokens: { observedTokens: 50 } }, cost: { status: "partial", attributedSubtotalUsd: 0.0123 } };

  it("labels cost and context as estimated and the stand-in model as costing nothing", () => {
    expect(chatUsageTotals(usage)).toMatchObject({ inputTokens: 1200, outputTokens: 50, costUsd: 0.0123, costComplete: false });
    expect(renderTurnFooter({ recorded: true, turn: 2, ending: "complete", usage, context: { promptTokens: 1200, windowTokens: 200000 } }))
      .toBe("── reply recorded · turn 2 complete · 1,200 tokens in, 50 out · cost about $0.01 or more (estimated) · context 1% of 200,000 (estimated)");
    expect(renderTurnFooter({ recorded: false, turn: 1, ending: "cancelled", usage: { requests: 1, syntheticRequests: 1 }, context: null }))
      .toBe("── no reply recorded · turn 1 cancelled · stand-in model: no tokens used, no cost");
  });

  it("keeps the exit summary to six lines", () => {
    const lines = renderExitSummary({ sessionId: "s-1", summary: { sessionId: "s-1", driverStatus: "idle", assistantText: [], endings: [{ reason: "complete", turn: 1 }], usage },
      resume: "amc agent-loop chat --agent default --session s-1", verify: "amc agent-loop verify s-1 --expect-monitor <monitor sha256>\n  (how to get it)" });
    expect(lines.join("\n").split("\n")).toHaveLength(6);
    expect(lines[0]).toBe("Session s-1 · 1 turn · last turn complete");
  });

  it("says the same thing about the shell as init does", () => {
    const shell = { offered: true, decision: "confined", enforcement: "enforced", boundary: "macos-seatbelt", reason: null, optInSource: null } as const;
    expect(toolsetConfinementNotice({ confined: false, sandboxBackendAvailable: true, shell }))
      .toBe("File tools are limited by AMC's signed policy, not by the operating system; shell commands run inside the macos-seatbelt sandbox.");
    expect(toolsetConfinementNotice({ confined: true, sandboxBackendAvailable: true, shell })).toBeNull();
    expect(toolsetConfinementNotice({ confined: false, sandboxBackendAvailable: false, shell: { ...shell, offered: false, boundary: null } }))
      .toBe("File tools are limited by AMC's signed policy, not by the operating system; no shell is offered. This machine has no sandbox backend.");
  });
});
