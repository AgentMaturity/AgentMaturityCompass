import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** LOW-14: a session opened the old way signed a digest that counts its skill (the form tests/composedTurnIdentity pins). */
const opening = vi.hoisted(() => ({ oldForm: false }));
vi.mock("../src/kernel/composedTurnIdentity.js", async (original) => {
  const real = await original<typeof import("../src/kernel/composedTurnIdentity.js")>();
  return { ...real, compositionDigestOf: (options: Parameters<typeof real.compositionDigestOf>[0], profile: Parameters<typeof real.compositionDigestOf>[1], legacy?: readonly string[]) => {
    const skills = profile.contextPlugins.map((plugin) => plugin.name).filter((name) => name.startsWith("skill:"));
    return opening.oldForm && legacy === undefined && skills.length > 0 ? real.compositionDigestOf(options, profile, skills) : real.compositionDigestOf(options, profile, legacy);
  } };
});
import { registerAgentCommands } from "../src/cli-agent-commands.js";
import { verifyAgentRun, type AgentRunSummary } from "../src/agent/runReport.js";
import { readNativeSessionEvents } from "../src/session/readNativeSessionEvents.js";
import { initWorkspace } from "../src/workspace.js";

/**
 * UX-02: chat runs each turn as `agent-loop run --session <id>`. A `/skill` turn and a plain turn in one session were
 * refused as CONFIGURATION_MISMATCH, which ended the chat. Stand-in model only: nothing here is a real-model result.
 */
describe("one session holds skill turns and plain turns (UX-02)", () => {
  let dir: string, home: string, cwd: string;
  beforeEach(() => {
    process.env.AMC_VAULT_PASSPHRASE = "chat-skill-turns-passphrase";
    dir = mkdtempSync(join(tmpdir(), "amc-skill-turns-"));
    home = mkdtempSync(join(tmpdir(), "amc-skill-turns-home-"));
    initWorkspace({ workspacePath: dir, agentId: "default", trustBoundaryMode: "isolated" });
    mkdirSync(join(dir, ".agents", "skills", "tidy_notes"), { recursive: true });
    writeFileSync(join(dir, ".agents", "skills", "tidy_notes", "SKILL.md"),
      "---\nname: tidy_notes\ndescription: Summarise a notes file.\n---\nRead $ARGUMENTS and summarise it in three bullet points.\n");
    cwd = process.cwd(); process.chdir(dir);
  });
  afterEach(() => { opening.oldForm = false; process.chdir(cwd); rmSync(dir, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); });

  async function turn(prompt: string, sessionId: string | null, keepOpen = true): Promise<{ summary: AgentRunSummary; errors: string[] }> {
    const out: string[] = [], errors: string[] = [];
    const program = new Command(); program.exitOverride();
    registerAgentCommands(program, { log: line => out.push(line), error: line => errors.push(line), fail: () => errors.push("(failed)"), exit: () => undefined });
    await program.parseAsync(["agent-loop", "run", "--credentials-home", home, prompt, "--json",
      ...(keepOpen ? ["--keep-open"] : []), ...(sessionId === null ? [] : ["--session", sessionId])], { from: "user" });
    return { summary: JSON.parse(out.at(-1) ?? "{}") as AgentRunSummary, errors };
  }

  it("runs skill, plain, skill in one session, and the session verifies afterwards", async () => {
    const first = await turn("/tidy_notes notes.txt", null);
    expect(first.errors).toEqual([]);
    const sessionId = first.summary.sessionId;
    const second = await turn("hello again", sessionId);
    expect(second.errors, "a plain turn after a skill turn").toEqual([]);
    const third = await turn("/tidy_notes notes.txt", sessionId, false);
    expect(third.errors, "a skill turn after a plain turn").toEqual([]);
    expect(third.summary.sessionId).toBe(sessionId);
    expect(third.summary.endings.map(ending => ending.reason)).toEqual(["complete", "complete", "complete"]);

    // Each turn's signed composition record names the skill it loaded; the plain turn's names none.
    const contexts = readNativeSessionEvents(dir, sessionId).map(row => JSON.parse(row.meta_json) as { phase?: string; sources?: unknown; amcSession: { turn: number } })
      .filter(meta => meta.phase === "context");
    const named = (turn: number) => contexts.some(meta => meta.amcSession.turn === turn && JSON.stringify(meta.sources).includes("tidy_notes"));
    expect([1, 2, 3].map(named)).toEqual([true, false, true]);

    const verified = await verifyAgentRun(dir, sessionId);
    expect(verified.ok, JSON.stringify(verified)).toBe(true);
  });

  it("a session a skill turn opened before this change still resumes with plain and skill turns (LOW-14)", async () => {
    opening.oldForm = true;
    const first = await turn("/tidy_notes notes.txt", null);
    opening.oldForm = false;
    expect(first.errors).toEqual([]);
    const sessionId = first.summary.sessionId;
    expect((await turn("hello again", sessionId)).errors).toEqual([]);
    const last = await turn("/tidy_notes notes.txt", sessionId, false);
    expect(last.errors).toEqual([]);
    expect(last.summary.endings.map(ending => ending.reason)).toEqual(["complete", "complete", "complete"]);
    expect((await verifyAgentRun(dir, sessionId)).ok).toBe(true);
  });
});
