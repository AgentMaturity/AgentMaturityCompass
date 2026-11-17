/**
 * src/cli/firstRunGuards.ts and src/cli/questionApplicabilityCli.ts run in-process: refusals, printed lines and the
 * signed applicability change, in a temporary workspace.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import {
  printNoAgentInstructionFile,
  printTopGaps,
  refuseNewFolderWithoutTerminal,
  refuseUnknownAgent,
  scoreStep
} from "../src/cli/firstRunGuards.js";
import { markQuestionApplicability } from "../src/cli/questionApplicabilityCli.js";
import { loadQuestionApplicability } from "../src/diagnostic/questionApplicability.js";
import { initWorkspace } from "../src/workspace.js";
import type { QuestionScore } from "../src/types.js";

const exitSentinel = new Error("process.exit called");
const roots: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { out.push(stripVTControlCharacters(a.join(" "))); });
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => { err.push(stripVTControlCharacters(a.join(" "))); });
  const exit = vi.spyOn(process, "exit").mockImplementation(() => { throw exitSentinel; });
  return { out, err, exit };
}

const score = (questionId: string, finalLevel: number) => ({ questionId, finalLevel }) as unknown as QuestionScore;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("refuseUnknownAgent", () => {
  it("lets the default agent through without printing", () => {
    const io = capture();
    refuseUnknownAgent(tempDir("amc-frg-default-"), "default");
    expect(io.exit).not.toHaveBeenCalled();
    expect(io.err).toEqual([]);
  });

  it("refuses an agent nobody added, says how to list and add one, and exits 1", () => {
    const io = capture();
    expect(() => refuseUnknownAgent(tempDir("amc-frg-unknown-"), "ghost-agent")).toThrow(exitSentinel);
    expect(io.exit).toHaveBeenCalledWith(1);
    expect(io.err[0]).toBe("There is no agent named 'ghost-agent' in this folder.");
    expect(io.err[1]).toContain("amc agent list");
    expect(io.err[1]).toContain("amc agent add");
  });
});

describe("refuseNewFolderWithoutTerminal", () => {
  it("names the folder it would set up, says how to go ahead, and exits 1", () => {
    const io = capture();
    const ws = tempDir("amc-frg-noterm-");
    expect(() => refuseNewFolderWithoutTerminal(ws)).toThrow(exitSentinel);
    expect(io.exit).toHaveBeenCalledWith(1);
    expect(io.err.join("\n")).toContain(`creates a .amc/ folder in ${ws}`);
    expect(io.err).toContain("To go ahead without a terminal, run: amc --yes");
  });
});

describe("printTopGaps", () => {
  it("lists questions below their reachable level by title, skips not-applicable ones, and points at amc explain", async () => {
    const io = capture();
    await printTopGaps([score("AMC-1.1", 0), score("AMC-1.2", 0), score("AMC-1.3", 1)], {
      status: "answered", notApplicable: [{ questionId: "AMC-1.2", title: "x", reason: "not used" }]
    } as never);
    const text = io.out.join("\n");
    expect(text).toContain("Top gaps (each can move up a level):");
    expect(text).toMatch(/: L0 \(AMC-1\.1\)/);
    expect(text).not.toContain("AMC-1.2");
    // AMC-1.3 at L1 is already at the highest level AMC can evaluate for it.
    expect(text).not.toContain("AMC-1.3");
    expect(text).toContain("Why a question is at its level: amc explain AMC-1.1");
  });

  it("stops at five gaps, in the order given", async () => {
    const io = capture();
    await printTopGaps([score("AMC-1.1", 0), score("AMC-1.2", 0), score("AMC-1.4", 0), score("AMC-1.5", 0), score("AMC-1.6", 0), score("AMC-1.7", 0)]);
    const ids = io.out.filter((line) => /: L0 \(/.test(line)).map((line) => /\((AMC-[\d.]+)\)$/.exec(line)?.[1]);
    expect(ids).toEqual(["AMC-1.1", "AMC-1.2", "AMC-1.4", "AMC-1.5", "AMC-1.6"]);
  });

  it("says every question is at its highest level when there is no gap", async () => {
    const io = capture();
    await printTopGaps([score("AMC-1.1", 1)]);
    expect(io.out).toContain("  Every question is at the highest level AMC can evaluate for it today.");
    expect(io.out.join("\n")).not.toContain("Top gaps");
  });
});

describe("scoreStep", () => {
  it("offers a first score before any run and scoring again after one", async () => {
    const ws = tempDir("amc-frg-step-");
    expect(await scoreStep(ws)).toEqual({ cmd: "amc", desc: "Get your first full maturity score" });
    mkdirSync(join(ws, ".amc", "runs"), { recursive: true });
    writeFileSync(join(ws, ".amc", "runs", "run-1.json"), "{}\n");
    expect(await scoreStep(ws)).toEqual({ cmd: "amc", desc: "Score again and see what changed" });
  });
});

describe("printNoAgentInstructionFile", () => {
  it("says nothing was written and names the command that writes AGENTS.md", () => {
    const io = capture();
    printNoAgentInstructionFile();
    expect(io.out[0]).toContain("so nothing was written");
    expect(io.out[1]).toContain("amc guide --go --apply AGENTS.md");
    expect(io.out[2]).toBe("");
  });
});

describe("markQuestionApplicability", () => {
  let ws: string;
  beforeAll(() => {
    ws = tempDir("amc-qa-cli-");
    initWorkspace({ workspacePath: ws, trustBoundaryMode: "isolated" });
  });

  it("marks a question as not applying, signed, then counts it again", () => {
    vi.stubEnv("AMC_AGENT_ID", "");
    const question = { questionId: "AMC-1.1", title: "Some question" };
    let io = capture();
    markQuestionApplicability(ws, undefined, question, "This agent has no such feature.");
    expect(io.out[0]).toBe("Some question (AMC-1.1) is marked as not applying to default. It is left out of the score and listed, with your reason, in every report.");
    expect(io.out[1]).toContain("Questions marked not applicable for this agent: 1.");
    const applied = loadQuestionApplicability(ws, "default", [{ id: "AMC-1.1", title: "Some question" }, { id: "AMC-1.2", title: "Other" }]);
    expect(applied.status).toBe("answered");
    expect(applied.notApplicable.map((row) => row.questionId)).toEqual(["AMC-1.1"]);

    vi.restoreAllMocks();
    io = capture();
    markQuestionApplicability(ws, "default", question, null);
    expect(io.out[0]).toBe("Some question (AMC-1.1) counts in default's score again.");
    expect(io.out[1]).toContain("Questions marked not applicable for this agent: 0.");
    expect(io.exit).not.toHaveBeenCalled();
  });

  it("prints the reason rule and exits 1 for a blank reason", () => {
    const io = capture();
    expect(() => markQuestionApplicability(ws, "default", { questionId: "AMC-1.2", title: "T" }, "   ")).toThrow(exitSentinel);
    expect(io.exit).toHaveBeenCalledWith(1);
    expect(io.err[0]).toMatch(/^Give a reason of 1 to \d+ characters/);
  });

  it("explains a locked vault instead of printing the raw key error", () => {
    // A folder AMC never set up has no signing key: the signing step fails with a key error.
    const bare = tempDir("amc-qa-cli-bare-");
    const io = capture();
    expect(() => markQuestionApplicability(bare, "default", { questionId: "AMC-1.2", title: "T" }, "Not used here.")).toThrow(exitSentinel);
    expect(io.exit).toHaveBeenCalledWith(1);
    expect(io.err).toEqual(["This change is signed with the vault, and the vault is locked. Unlock it with amc vault unlock, then run this again."]);
  });
});
