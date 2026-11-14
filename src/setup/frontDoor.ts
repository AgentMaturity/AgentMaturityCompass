/**
 * Bare `amc` in a person's terminal: one menu of what can work right now, the best choice pre-selected, so the first
 * useful thing is one or two keypresses away (watch Claude Code or Codex, chat, open the console, or the score).
 *
 * Every action runs the existing command (`amc up`, `amc connect hooks install`, `amc agent-loop chat`, `amc login`) as a
 * child with the terminal attached, so each keeps its own vault gates, agent-marker refusals and confirmations. The menu
 * itself never runs without a terminal or under an agent marker (shouldShowFrontDoor); everything else keeps the old path.
 * Decisions are pure functions; terminal, process and file I/O come in through FrontDoorIo.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import inquirer from "inquirer";
import { getAgentPaths } from "../fleet/paths.js";
import { runningStudioBridgeBase } from "../studio/studioBridge.js";
import { writeFileAtomic } from "../utils/fs.js";
import { inspectSignIn, type SignInReport } from "./agentSignIn.js";
import { NATIVE_FIRST_USE_PROVIDERS } from "./nativeFirstUseGuide.js";
import { detectProviderKeys, type DetectedProviderKey } from "./quickSetup.js";

const FRONT_DOOR_CHOICES = ["watch-claude", "watch-codex", "sign-in-claude", "sign-in-codex", "chat", "demo-chat", "console", "score"] as const;
export type FrontDoorChoice = (typeof FRONT_DOOR_CHOICES)[number];

export interface FrontDoorState {
  readonly signIn: readonly SignInReport[];
  readonly providerKeys: readonly DetectedProviderKey[];
  readonly studioRunning: boolean;
  readonly hasRun: boolean;
  readonly lastChoice: FrontDoorChoice | null;
}

export interface MenuOption {
  readonly value: FrontDoorChoice;
  readonly name: string;
}

/** Bare `amc` with no argument at all, AMC_NO_MENU unset, a terminal on both ends, and a person (interactiveOperator). */
export function shouldShowFrontDoor(input: { args: readonly string[]; env: NodeJS.ProcessEnv; stdinTTY: boolean; stdoutTTY: boolean; operatorOk: boolean }): boolean {
  return input.args.length === 0 && input.env.AMC_NO_MENU !== "1" && input.stdinTTY && input.stdoutTTY && input.operatorOk;
}

const AGENTS = {
  claude: { watch: "watch-claude", signIn: "sign-in-claude", name: "Claude Code", provider: "claude-code", binary: "claude" },
  codex: { watch: "watch-codex", signIn: "sign-in-codex", name: "Codex", provider: "codex", binary: "codex" }
} as const;

function agentOption(report: SignInReport): MenuOption | null {
  const agent = AGENTS[report.id];
  if (report.state === "signed-in") return { value: agent.watch, name: `Watch ${agent.name} as it works (signed in)` };
  if (report.state === "signed-out") return { value: agent.signIn, name: `Sign in to ${agent.name} first` };
  return null; // not installed, or its status could not be read: nothing it offers can work right now
}

/** Only options that can work now, in this order: the agents, chat with a found key, the demo, the console, the score. */
export function menuOptions(state: FrontDoorState): MenuOption[] {
  const key = state.providerKeys[0];
  return [
    ...state.signIn.map(agentOption).filter((option): option is MenuOption => option !== null),
    ...(key === undefined ? [] : [{ value: "chat" as const, name: `Chat with a model (${key.apiKeyEnv} found)` }]),
    { value: "demo-chat", name: "Try a demo chat (no account or key needed)" },
    { value: "console", name: state.studioRunning ? "Open the console in my browser (AMC is running)" : "Open the console in my browser" },
    { value: "score", name: state.hasRun ? "Just show my score" : "Just show my score (empty for now)" }
  ];
}

const BEST: readonly FrontDoorChoice[] = ["watch-claude", "watch-codex", "chat", "demo-chat"];

/** The last choice while it is still offered, else the most useful one that is. */
export function defaultChoice(state: FrontDoorState): FrontDoorChoice {
  const offered = new Set(menuOptions(state).map((option) => option.value));
  if (state.lastChoice !== null && offered.has(state.lastChoice)) return state.lastChoice;
  return BEST.find((choice) => offered.has(choice)) ?? "score";
}

const NEXT_LABEL: Partial<Record<FrontDoorChoice, string>> = {
  "watch-claude": "Watch Claude Code", "watch-codex": "Watch Codex", chat: "Chat with a model", "demo-chat": "Try a demo chat"
};

/** One next step under the score: the best menu choice when AMC knows what is here, else the menu itself. */
export function scoreNextStep(state: FrontDoorState | null): string {
  if (state === null) return "Next: run amc in your terminal and pick what to do (watch Claude Code or Codex, chat, or open the console).";
  const offered = new Set(menuOptions(state).map((option) => option.value));
  const best = BEST.find((choice) => offered.has(choice)) ?? "demo-chat";
  return `Next: run amc and choose ${NEXT_LABEL[best]}.`;
}

/** `amc agent-loop chat` arguments: a found key's provider and its reference name (never the value), or the stub demo. */
export function chatArgs(key: DetectedProviderKey | null): string[] {
  if (key === null) return ["agent-loop", "chat", "--provider", "stub"];
  return NATIVE_FIRST_USE_PROVIDERS.includes(key.id) ? ["agent-loop", "chat", "--provider", key.id, "--credential", key.apiKeyEnv] : ["agent-loop", "chat"];
}

const isChoice = (value: unknown): value is FrontDoorChoice => FRONT_DOOR_CHOICES.includes(value as FrontDoorChoice);

export function parseLastChoice(text: string | null): FrontDoorChoice | null {
  if (text === null) return null;
  try {
    const value = (JSON.parse(text) as { lastChoice?: unknown }).lastChoice;
    return isChoice(value) ? value : null;
  } catch {
    return null;
  }
}

const choicePath = (workspace: string): string => join(workspace, ".amc", "front-door.json");

export function readLastChoice(workspace: string): FrontDoorChoice | null {
  return parseLastChoice(existsSync(choicePath(workspace)) ? readFileSync(choicePath(workspace), "utf8") : null);
}

/** Not a secret: only which menu entry was picked, so it is pre-selected next time. */
export function saveLastChoice(workspace: string, choice: FrontDoorChoice): void {
  writeFileAtomic(choicePath(workspace), `${JSON.stringify({ lastChoice: choice })}\n`, 0o644);
}

export interface FrontDoorIo {
  readonly log: (line: string) => void;
  readonly detect: () => FrontDoorState;
  readonly select: (message: string, options: readonly MenuOption[], selected: FrontDoorChoice) => Promise<FrontDoorChoice>;
  /** A yes/no question whose default is yes. */
  readonly confirm: (message: string) => Promise<boolean>;
  /**
   * Runs this AMC CLI with the terminal attached; returns its exit code. `chat` (the vault environment) is true for AMC's
   * own chat, for `amc up` and for the hook install the operator just said yes to: they may inherit the vault passphrase
   * bare amc already resolved for this operator. The vendor sign-in and claude or codex never get it.
   */
  readonly runAmc: (args: readonly string[], chat?: boolean) => number;
  /** Runs claude or codex in this folder with the terminal attached; returns its exit code. */
  readonly runTool: (binary: string) => number;
  readonly openUrl: (url: string) => boolean;
  /** The running Studio's origin (http://host:port), or null when none runs for this workspace. */
  readonly studioOrigin: () => string | null;
  readonly saveChoice: (choice: FrontDoorChoice) => void;
  readonly showScore: (nextStep: string) => Promise<void>;
}

/** The running AMC's origin, starting it with `amc up` (its own prompts and gates) when none runs. */
function ensureStudio(io: FrontDoorIo): string | null {
  const running = io.studioOrigin();
  if (running !== null) return running;
  io.log("Starting AMC (amc up)...");
  const origin = io.runAmc(["up"], true) === 0 ? io.studioOrigin() : null;
  if (origin === null) io.log("AMC did not start; the lines above say why. Fix that, then run amc again.");
  return origin;
}

async function watchAgent(io: FrontDoorIo, agent: (typeof AGENTS)[keyof typeof AGENTS]): Promise<void> {
  const origin = ensureStudio(io);
  if (origin === null) return;
  if (!(await io.confirm(`Add AMC's watch hook to this project's ${agent.name} settings? It sends what ${agent.name} does to AMC on this Mac (${origin}).`))) {
    io.log(`Nothing was changed. To add it later: amc connect hooks install --provider ${agent.provider} --mode observe --agent default`);
    return;
  }
  const install = ["connect", "hooks", "install", "--provider", agent.provider, "--mode", "observe", "--agent", "default", "--bridge-url", origin];
  // The yes above is the operator's go-ahead for this one signed change, so the install runs with the vault as this menu holds it.
  if (io.runAmc(install, true) !== 0) {
    io.log("The watch hook was not installed; the lines above say why.");
    return;
  }
  if (await io.confirm(`Start ${agent.name} here now?`)) io.runTool(agent.binary);
  else io.log(`Start ${agent.binary} in this folder when you are ready. Check the hook: amc connect hooks status --provider ${agent.provider}`);
  io.log(`See what AMC recorded in the console: ${origin}/console`);
}

function openConsole(io: FrontDoorIo): void {
  const origin = ensureStudio(io);
  if (origin === null) return;
  const url = `${origin}/console`;
  io.log(io.openUrl(url) ? `Opening ${url}` : `Open ${url} in your browser.`);
}

async function act(io: FrontDoorIo, choice: FrontDoorChoice, state: FrontDoorState): Promise<"done" | "menu"> {
  switch (choice) {
    case "watch-claude": await watchAgent(io, AGENTS.claude); return "done";
    case "watch-codex": await watchAgent(io, AGENTS.codex); return "done";
    case "sign-in-claude": io.runAmc(["login", "claude"]); return "menu";
    case "sign-in-codex": io.runAmc(["login", "codex"]); return "menu";
    case "chat": io.runAmc(chatArgs(state.providerKeys[0] ?? null), true); return "done";
    case "demo-chat": io.runAmc(chatArgs(null), true); return "done";
    case "console": openConsole(io); return "done";
    default: await io.showScore(scoreNextStep(state)); return "done";
  }
}

/** The menu loop: a sign-in returns to the menu with fresh detection; every other choice ends it. */
export async function runFrontDoor(io: FrontDoorIo): Promise<void> {
  for (;;) {
    const state = io.detect();
    const choice = await io.select("What do you want to do?", menuOptions(state), defaultChoice(state));
    io.saveChoice(choice);
    if ((await act(io, choice, state)) === "done") return;
  }
}

/** Ctrl-C belongs to the child (chat cancels a turn, claude handles its own); this process waits for it to exit. */
function attached(command: string, args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): number {
  const ignore = (): void => undefined;
  process.on("SIGINT", ignore);
  try {
    const result = spawnSync(command, [...args], { cwd, env, stdio: "inherit" });
    return result.error ? 127 : result.status ?? 1;
  } finally {
    process.off("SIGINT", ignore);
  }
}

function hasRun(workspace: string, agentId: string): boolean {
  try {
    const runs = getAgentPaths(workspace, agentId).runsDir;
    return existsSync(runs) && readdirSync(runs).some((name) => name.endsWith(".json"));
  } catch {
    return false;
  }
}

/** Loopback only: the state file is unsigned workspace content, so a host that is not this machine is never a hook target. */
function studioOrigin(workspace: string): string | null {
  return runningStudioBridgeBase(workspace);
}

/**
 * The terminal, process and file I/O runFrontDoor uses in a real terminal. `operatorEnv` is the environment as the
 * operator started amc, taken before the workspace step: that step can put the local vault passphrase into this
 * process's environment (loadLocalVaultPassphrase: an operator, never an agent, and only for a vault this machine
 * created). AMC's own chat, `amc up` and the hook install the operator confirmed inherit it, as bare amc signs its score with it.
 * The vendor sign-in, claude and codex never see it.
 */
export function terminalFrontDoorIo(params: { workspace: string; agentId: string; operatorEnv: NodeJS.ProcessEnv;
  openUrl: (url: string) => boolean; showScore: (nextStep: string) => Promise<void> }): FrontDoorIo {
  const { workspace, agentId, operatorEnv } = params;
  const entry = process.argv[1] ?? "";
  return {
    log: (line) => console.log(line),
    detect: () => ({ signIn: inspectSignIn(), providerKeys: detectProviderKeys(operatorEnv), studioRunning: studioOrigin(workspace) !== null,
      hasRun: hasRun(workspace, agentId), lastChoice: readLastChoice(workspace) }),
    select: async (message, options, selected) => (await inquirer.prompt<{ choice: FrontDoorChoice }>([{ type: "select", name: "choice", message,
      choices: options.map((option) => ({ name: option.name, value: option.value })), default: selected }])).choice,
    confirm: async (message) => (await inquirer.prompt<{ yes: boolean }>([{ type: "confirm", name: "yes", message, default: true }])).yes,
    runAmc: (args, chat) => attached(process.execPath, [entry, ...args], workspace, chat === true ? process.env : operatorEnv),
    runTool: (binary) => attached(binary, [], workspace, operatorEnv),
    openUrl: params.openUrl,
    studioOrigin: () => studioOrigin(workspace),
    saveChoice: (choice) => saveLastChoice(workspace, choice),
    showScore: params.showScore
  };
}
