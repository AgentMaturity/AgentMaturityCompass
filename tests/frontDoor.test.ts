import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SignInReport, SignInState } from "../src/setup/agentSignIn.js";
import {
  chatArgs,
  defaultChoice,
  menuOptions,
  parseLastChoice,
  readLastChoice,
  runFrontDoor,
  saveLastChoice,
  scoreNextStep,
  shouldShowFrontDoor,
  type FrontDoorChoice,
  type FrontDoorIo,
  type FrontDoorState
} from "../src/setup/frontDoor.js";
import { detectProviderKeys } from "../src/setup/quickSetup.js";

const report = (id: "claude" | "codex", state: SignInState): SignInReport =>
  ({ id, displayName: id === "claude" ? "Claude Code" : "Codex", state, next: "" });

function state(over: Partial<FrontDoorState> = {}): FrontDoorState {
  return { signIn: [report("claude", "not-installed"), report("codex", "not-installed")], providerKeys: [], studioRunning: false,
    hasRun: false, lastChoice: null, ...over };
}

const values = (s: FrontDoorState): FrontDoorChoice[] => menuOptions(s).map((option) => option.value);

describe("front door gate", () => {
  const terminal = { args: [] as string[], env: {}, stdinTTY: true, stdoutTTY: true, operatorOk: true };
  it("shows the menu only for a bare amc in a terminal run by a person", () => {
    expect(shouldShowFrontDoor(terminal)).toBe(true);
  });
  it.each([
    ["any argument", { args: ["--json"] }],
    ["--no-menu", { args: ["--no-menu"] }],
    ["a command", { args: ["up"] }],
    ["AMC_NO_MENU=1", { env: { AMC_NO_MENU: "1" } }],
    ["stdin not a terminal", { stdinTTY: false }],
    ["stdout not a terminal", { stdoutTTY: false }],
    ["an agent marker or agent mode", { operatorOk: false }]
  ])("keeps today's behaviour with %s", (_label, over) => {
    expect(shouldShowFrontDoor({ ...terminal, ...over })).toBe(false);
  });
});

describe("menu options", () => {
  it("offers only what can work now when nothing is detected: demo chat first", () => {
    const s = state();
    expect(values(s)).toEqual(["demo-chat", "build", "console", "score"]);
    expect(defaultChoice(s)).toBe("demo-chat");
  });
  it("pre-selects watching a signed-in Claude Code, and offers Codex sign-in when Codex is signed out", () => {
    const s = state({ signIn: [report("claude", "signed-in"), report("codex", "signed-out")] });
    expect(menuOptions(s)[0]).toEqual({ value: "watch-claude", name: "Watch Claude Code as it works (signed in)" });
    expect(values(s)).toEqual(["watch-claude", "sign-in-codex", "demo-chat", "build", "console", "score"]);
    expect(defaultChoice(s)).toBe("watch-claude");
  });
  it("pre-selects Codex when only Codex is signed in, and leaves out an agent AMC could not read", () => {
    const s = state({ signIn: [report("claude", "unknown"), report("codex", "signed-in")] });
    expect(values(s)).toEqual(["watch-codex", "demo-chat", "build", "console", "score"]);
    expect(menuOptions(s)[0]!.name).toBe("Watch Codex as it works (signed in)");
    expect(defaultChoice(s)).toBe("watch-codex");
  });
  it("names the key it found for chat and pre-selects chat over the demo", () => {
    const s = state({ signIn: [report("claude", "signed-out"), report("codex", "not-installed")],
      providerKeys: [{ id: "openai", displayName: "OpenAI", apiKeyEnv: "OPENAI_API_KEY" }] });
    expect(menuOptions(s)).toContainEqual({ value: "chat", name: "Chat with a model (OPENAI_API_KEY found)" });
    expect(menuOptions(s)).toContainEqual({ value: "sign-in-claude", name: "Sign in to Claude Code first" });
    expect(defaultChoice(s)).toBe("chat");
  });
  it("says the score is empty until AMC has a run", () => {
    expect(menuOptions(state()).at(-1)!.name).toBe("Just show my score (empty for now)");
    expect(menuOptions(state({ hasRun: true })).at(-1)!.name).toBe("Just show my score");
  });
  it("says when AMC is already running", () => {
    expect(menuOptions(state({ studioRunning: true }))).toContainEqual({ value: "console", name: "Open the console in my browser (AMC is running)" });
  });
  it("pre-selects the last choice while it is still offered, else the best one", () => {
    expect(defaultChoice(state({ lastChoice: "score" }))).toBe("score");
    expect(defaultChoice(state({ lastChoice: "watch-claude" }))).toBe("demo-chat");
  });
});

describe("score next step", () => {
  it("names one next step from what was detected", () => {
    expect(scoreNextStep(state({ signIn: [report("claude", "signed-in"), report("codex", "signed-in")] }))).toBe("Next: run amc and choose Watch Claude Code.");
    expect(scoreNextStep(state({ signIn: [report("claude", "signed-out"), report("codex", "signed-in")] }))).toBe("Next: run amc and choose Watch Codex.");
    expect(scoreNextStep(state({ providerKeys: [{ id: "openai", displayName: "OpenAI", apiKeyEnv: "OPENAI_API_KEY" }] }))).toBe("Next: run amc and choose Chat with a model.");
    expect(scoreNextStep(state())).toBe("Next: run amc and choose Try a demo chat.");
  });
  it("without detection (no terminal, --no-menu) points at the menu", () => {
    expect(scoreNextStep(null)).toBe("Next: run amc in your terminal and pick what to do (watch Claude Code or Codex, chat, or open the console).");
  });
});

describe("chat arguments", () => {
  it("passes a native provider and its key's reference name, never a key value", () => {
    expect(chatArgs({ id: "openai", displayName: "OpenAI", apiKeyEnv: "OPENAI_API_KEY" })).toEqual(["agent-loop", "chat", "--provider", "openai", "--credential", "OPENAI_API_KEY"]);
  });
  it("lets chat ask when the provider has no native route, and uses the stub for the demo", () => {
    expect(chatArgs({ id: "not-a-route", displayName: "X", apiKeyEnv: "X_KEY" })).toEqual(["agent-loop", "chat"]);
    expect(chatArgs(null)).toEqual(["agent-loop", "chat", "--provider", "stub"]);
  });
});

describe("remembered choice", () => {
  const dirs: string[] = [];
  afterEach(() => { while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true }); });
  it("parses only a known choice", () => {
    expect(parseLastChoice(JSON.stringify({ lastChoice: "console" }))).toBe("console");
    expect(parseLastChoice(JSON.stringify({ lastChoice: "rm -rf" }))).toBeNull();
    expect(parseLastChoice("{not json")).toBeNull();
    expect(parseLastChoice(null)).toBeNull();
  });
  it("writes and reads .amc/front-door.json", () => {
    const ws = mkdtempSync(join(tmpdir(), "amc-front-door-"));
    dirs.push(ws);
    expect(readLastChoice(ws)).toBeNull();
    mkdirSync(join(ws, ".amc"));
    saveLastChoice(ws, "demo-chat");
    expect(JSON.parse(readFileSync(join(ws, ".amc", "front-door.json"), "utf8"))).toEqual({ lastChoice: "demo-chat" });
    expect(readLastChoice(ws)).toBe("demo-chat");
    writeFileSync(join(ws, ".amc", "front-door.json"), "garbage");
    expect(readLastChoice(ws)).toBeNull();
  });
});

describe("provider key detection (quick setup's list)", () => {
  it("reports the env names that hold a non-empty key", () => {
    expect(detectProviderKeys({ OPENAI_API_KEY: "x", ANTHROPIC_API_KEY: " ", GROQ_API_KEY: "y" }).map((key) => key.apiKeyEnv)).toEqual(["OPENAI_API_KEY", "GROQ_API_KEY"]);
  });
});

interface Fake { io: FrontDoorIo; lines: string[]; amc: string[][]; tools: string[]; opened: string[]; saved: FrontDoorChoice[]; scores: string[] }

function fake(picks: FrontDoorChoice[], over: Partial<FrontDoorIo> & { states?: FrontDoorState[]; answers?: boolean[]; origin?: (string | null)[]; codes?: number[] } = {}): Fake {
  const f: Fake = { lines: [], amc: [], tools: [], opened: [], saved: [], scores: [] } as unknown as Fake;
  const states = over.states ?? [state({ signIn: [report("claude", "signed-in"), report("codex", "signed-in")] })];
  const answers = [...(over.answers ?? [])];
  const origins = [...(over.origin ?? [null, "http://127.0.0.1:4000"])];
  const codes = [...(over.codes ?? [])];
  let detected = 0;
  f.io = {
    log: (line) => f.lines.push(line),
    detect: () => states[Math.min(detected++, states.length - 1)]!,
    select: async () => picks.shift()!,
    confirm: async () => answers.shift() ?? true,
    runAmc: (args, chat, extraEnv) => { f.amc.push([...(chat === true ? ["(chat env)"] : []), ...args, ...Object.entries(extraEnv ?? {}).map(([name, value]) => `${name}=${value}`)]); return codes.shift() ?? 0; },
    portsIfDefaultBusy: async () => null,
    runTool: (binary) => { f.tools.push(binary); return 0; },
    openUrl: (url) => { f.opened.push(url); return true; },
    studioOrigin: () => (origins.length > 1 ? origins.shift()! : origins[0]!),
    saveChoice: (choice) => f.saved.push(choice),
    showScore: async (next) => { f.scores.push(next); },
    ...over
  };
  return f;
}

describe("runFrontDoor", () => {
  // 2026-11-14: AMC's default gateway port is one per machine and a busy one is refused, so a second folder could not start.
  it("when another AMC folder holds the default ports, asks before starting this folder on its own, and names the port", async () => {
    const ports = { AMC_GATEWAY_PORT: "50001", AMC_PROXY_PORT: "50002" };
    const yes = fake(["console"], { portsIfDefaultBusy: async () => ports, answers: [true] });
    await runFrontDoor(yes.io);
    expect(yes.amc).toEqual([["(chat env)", "up", "--no-baseline", "AMC_GATEWAY_PORT=50001", "AMC_PROXY_PORT=50002"]]);
    expect(yes.lines.join("\n")).toContain("Another AMC folder is already running");
    expect(yes.lines.join("\n")).toContain("AMC_GATEWAY_PORT=50001");
    const no = fake(["console"], { portsIfDefaultBusy: async () => ports, answers: [false] });
    await runFrontDoor(no.io);
    expect(no.amc).toEqual([]);
    expect(no.opened).toEqual([]);
    expect(no.lines.join("\n")).toContain("run amc down in the other folder");
  });


  it("build an agent: starts AMC (the A4 preview is on by default) and opens the new-project page; a running AMC is left as it is", async () => {
    const f = fake(["build"]);
    await runFrontDoor(f.io);
    expect(f.amc).toEqual([["(chat env)", "up", "--no-baseline"]]);
    expect(f.opened).toEqual(["http://127.0.0.1:4000/console/a4?new=1"]);
    expect(f.lines.join("\n")).toContain("pick your industry");
    const running = fake(["build"], { origin: ["http://127.0.0.1:4000"], states: [state({ studioRunning: true })] });
    await runFrontDoor(running.io);
    expect(running.amc).toEqual([]);
    expect(running.lines.join("\n")).toContain("run amc down, then choose this line again");
  });

  it("watch Claude Code: starts AMC, asks before writing the hook, installs observe only, then offers to start claude", async () => {
    const f = fake(["watch-claude"], { answers: [true, true] });
    await runFrontDoor(f.io);
    expect(f.amc).toEqual([["(chat env)", "up", "--no-baseline"], ["(chat env)", "connect", "hooks", "install", "--provider", "claude-code", "--mode", "observe", "--agent", "default", "--bridge-url", "http://127.0.0.1:4000"]]);
    expect(f.tools).toEqual(["claude"]);
    expect(f.saved).toEqual(["watch-claude"]);
    expect(f.lines.at(-1)).toContain("http://127.0.0.1:4000/console");
  });
  it("does not start AMC again when it is running, and changes nothing when consent is refused", async () => {
    const f = fake(["watch-codex"], { answers: [false], origin: ["http://127.0.0.1:4000"] });
    await runFrontDoor(f.io);
    expect(f.amc).toEqual([]);
    expect(f.tools).toEqual([]);
    expect(f.lines.join("\n")).toContain("Nothing was changed");
  });
  it("codex: installs the codex hook, and does not start codex on no", async () => {
    const f = fake(["watch-codex"], { answers: [true, false], origin: ["http://127.0.0.1:4000"] });
    await runFrontDoor(f.io);
    expect(f.amc[0]).toContain("codex");
    expect(f.tools).toEqual([]);
    expect(f.lines.join("\n")).toContain("amc connect hooks status --provider codex");
  });
  it("stops with a plain message when AMC cannot start or the hook cannot be installed", async () => {
    const down = fake(["watch-claude"], { codes: [1] });
    await runFrontDoor(down.io);
    expect(down.amc).toEqual([["(chat env)", "up", "--no-baseline"]]);
    expect(down.lines.join("\n")).toContain("AMC did not start");
    const refused = fake(["watch-claude"], { codes: [1], origin: ["http://127.0.0.1:4000"] });
    await runFrontDoor(refused.io);
    expect(refused.tools).toEqual([]);
    expect(refused.lines.join("\n")).toContain("The watch hook was not installed");
  });
  it("says so when AMC started but its address cannot be read", async () => {
    const f = fake(["console"], { origin: [null] });
    await runFrontDoor(f.io);
    expect(f.opened).toEqual([]);
    expect(f.lines.join("\n")).toContain("AMC did not start");
  });
  it("sign-in runs amc login, then returns to the menu with fresh detection", async () => {
    const f = fake(["sign-in-claude", "score"], { states: [state({ signIn: [report("claude", "signed-out"), report("codex", "not-installed")] }), state()] });
    await runFrontDoor(f.io);
    expect(f.amc).toEqual([["login", "claude"]]);
    expect(f.scores).toEqual(["Next: run amc and choose Try a demo chat."]);
    expect(f.saved).toEqual(["sign-in-claude", "score"]);
  });
  it("chat, demo chat and console run the existing commands", async () => {
    const key = { id: "anthropic", displayName: "Anthropic", apiKeyEnv: "ANTHROPIC_API_KEY" };
    const chat = fake(["chat"], { states: [state({ providerKeys: [key] })] });
    await runFrontDoor(chat.io);
    expect(chat.amc).toEqual([["(chat env)", "agent-loop", "chat", "--provider", "anthropic", "--credential", "ANTHROPIC_API_KEY"]]);
    const demo = fake(["demo-chat"]);
    await runFrontDoor(demo.io);
    expect(demo.amc).toEqual([["(chat env)", "agent-loop", "chat", "--provider", "stub"]]);
    const open = fake(["console"], { origin: ["http://127.0.0.1:4000"] });
    await runFrontDoor(open.io);
    expect(open.opened).toEqual(["http://127.0.0.1:4000/console"]);
  });
  it("prints the console address when the browser cannot be opened", async () => {
    const f = fake(["console"], { origin: ["http://127.0.0.1:4000"], openUrl: () => false });
    await runFrontDoor(f.io);
    expect(f.lines.join("\n")).toContain("Open http://127.0.0.1:4000/console in your browser");
  });
});
