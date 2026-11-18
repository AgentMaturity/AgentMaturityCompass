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
import { defaultPortOrFree } from "../studio/studioLifecycle.js";
import { writeFileAtomic } from "../utils/fs.js";
import { inspectSignIn, type SignInReport } from "./agentSignIn.js";
import { codingAdoptionBlockers, hasCodingSetup } from "./codingAdoption.js";
import { codingMoveInterrupted } from "./codingMove.js";
import { vaultExists, vaultOpensWith } from "../vault/vault.js";
import { NATIVE_FIRST_USE_PROVIDERS } from "./nativeFirstUseGuide.js";
import { detectProviderKeys, type DetectedProviderKey } from "./quickSetup.js";

const FRONT_DOOR_CHOICES = ["watch-claude", "watch-codex", "sign-in-claude", "sign-in-codex", "coding-chat", "coding-setup", "chat", "demo-chat", "build",
  "console", "score"] as const;
export type FrontDoorChoice = (typeof FRONT_DOOR_CHOICES)[number];

export interface FrontDoorState {
  readonly signIn: readonly SignInReport[];
  readonly providerKeys: readonly DetectedProviderKey[];
  readonly studioRunning: boolean;
  readonly hasRun: boolean;
  readonly lastChoice: FrontDoorChoice | null;
  /** UX-01: this folder has `init --coding`'s setup ("ready"), or is a menu workspace that can move to it ("can-set-up"). */
  readonly coding?: "ready" | "can-set-up" | "interrupted";
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
    ...(state.coding === "ready" ? [{ value: "coding-chat" as const, name: "Work here with an agent that edits files and runs commands (asks you first)" }]
      : state.coding === "can-set-up" ? [{ value: "coding-setup" as const, name: "Set up an agent that edits files and runs commands here (asks you first)" }]
        : state.coding === "interrupted" ? [{ value: "coding-setup" as const, name: "Finish or undo the coding setup that was interrupted (asks you first)" }] : []),
    ...(key === undefined ? [] : [{ value: "chat" as const, name: `Chat with a model (${key.apiKeyEnv} found)` }]),
    { value: "demo-chat", name: "Try a demo chat (no account or key needed)" },
    { value: "build", name: "Build an agent for my industry (A4 Forge preview)" },
    { value: "console", name: state.studioRunning ? "Open the console in my browser (AMC is running)" : "Open the console in my browser" },
    { value: "score", name: state.hasRun ? "Just show my score" : "Just show my score (empty for now)" }
  ];
}

const BEST: readonly FrontDoorChoice[] = ["watch-claude", "watch-codex", "coding-chat", "chat", "demo-chat"];

/**
 * Choices that start AMC's background services, open a browser, or change what an agent may do here (the coding
 * setup): a remembered one is never the pre-selected line.
 */
const STARTS_SERVICES: readonly FrontDoorChoice[] = ["watch-claude", "watch-codex", "build", "console", "coding-setup"];

/**
 * The last choice while it is still offered and does nothing beyond this terminal, else the most useful one that is.
 * A remembered line that starts services or opens a browser is not pre-selected: Enter by habit must not do that.
 */
export function defaultChoice(state: FrontDoorState): FrontDoorChoice {
  const offered = new Set(menuOptions(state).map((option) => option.value));
  if (state.lastChoice !== null && offered.has(state.lastChoice) && !STARTS_SERVICES.includes(state.lastChoice)) return state.lastChoice;
  return BEST.find((choice) => offered.has(choice)) ?? "score";
}

const NEXT_LABEL: Partial<Record<FrontDoorChoice, string>> = {
  "watch-claude": "Watch Claude Code", "watch-codex": "Watch Codex", "coding-chat": "Work here with an agent", chat: "Chat with a model",
  "demo-chat": "Try a demo chat"
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

/** AMC's default gateway and proxy ports (src/config/envSchema.ts, src/gateway/config.ts): one set per machine. */
const DEFAULT_GATEWAY_PORT = 3210;
const DEFAULT_PROXY_PORT = 3211;
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
  readonly runAmc: (args: readonly string[], chat?: boolean, extraEnv?: Readonly<Record<string, string>>) => number;
  /** Free ports for this folder when another AMC folder holds the default gateway port and none was configured; else null. */
  readonly portsIfDefaultBusy: () => Promise<{ AMC_GATEWAY_PORT: string; AMC_PROXY_PORT: string } | null>;
  /** Runs claude or codex in this folder with the terminal attached; returns its exit code. */
  readonly runTool: (binary: string) => number;
  readonly openUrl: (url: string) => boolean;
  /** The running Studio's origin (http://host:port), or null when none runs for this workspace. */
  readonly studioOrigin: () => string | null;
  readonly saveChoice: (choice: FrontDoorChoice) => void;
  readonly showScore: (nextStep: string) => Promise<void>;
}

/**
 * The running AMC's origin, starting it with `amc up` (its own gates) when none runs. AMC's default gateway port is
 * shared by every folder, and a busy one is refused on purpose (clients that assume it would reach the other folder's
 * gateway). So when another folder holds it, the operator is asked before this folder starts on ports of its own.
 */
async function ensureStudio(io: FrontDoorIo, extraEnv: Readonly<Record<string, string>> = {}): Promise<string | null> {
  const running = io.studioOrigin();
  if (running !== null) return running;
  const ownPorts = await io.portsIfDefaultBusy();
  if (ownPorts !== null) {
    io.log("Another AMC folder is already running on this Mac and holds AMC's default ports.");
    if (!(await io.confirm("Start AMC for this folder on its own ports? (Watching Claude Code or Codex and the console work the same.)"))) {
      io.log("Nothing was started. To use the default ports here, run amc down in the other folder first.");
      return null;
    }
    io.log(`This folder's AMC uses gateway port ${ownPorts.AMC_GATEWAY_PORT}. Commands that send model traffic through AMC's gateway from here need `
      + `AMC_GATEWAY_PORT=${ownPorts.AMC_GATEWAY_PORT} set; amc connect prints the right address.`);
  }
  io.log("Starting AMC on this Mac...");
  const origin = io.runAmc(["up", "--no-baseline"], true, { ...extraEnv, ...ownPorts }) === 0 ? io.studioOrigin() : null;
  if (origin === null) io.log("AMC did not start; the lines above say why. Fix that, then run amc again.");
  return origin;
}

async function watchAgent(io: FrontDoorIo, agent: (typeof AGENTS)[keyof typeof AGENTS]): Promise<void> {
  const origin = await ensureStudio(io);
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

/** A browser window is opened only on a yes; on a no, or when it cannot be opened, the address is printed instead. */
async function showInBrowser(io: FrontDoorIo, url: string): Promise<void> {
  const opened = (await io.confirm(`Open ${url} in your browser now?`)) && io.openUrl(url);
  io.log(opened ? `Opening ${url}` : `Open ${url} in your browser.`);
}

async function openConsole(io: FrontDoorIo): Promise<void> {
  const origin = await ensureStudio(io);
  if (origin === null) return;
  await showInBrowser(io, `${origin}/console`);
}

/**
 * Agent projects (A4 Forge) are a preview that Studio serves by default (AMC_A4_PREVIEW=0 turns it off). Choosing this
 * line starts AMC if needed and opens the start form; an AMC that already runs is left as it is.
 */
async function buildAgent(io: FrontDoorIo, wasRunning: boolean): Promise<void> {
  const origin = await ensureStudio(io);
  if (origin === null) return;
  await showInBrowser(io, `${origin}/console/a4?new=1`);
  io.log("Sign in as the workspace owner (create the account once with amc user init), pick your industry, and start an agent project.");
  io.log("Each step needs someone other than you to approve it. Alone, a practice project gets you as far as building the agent; the page asks for the people when they are needed.");
  if (wasRunning) io.log("AMC was already running. If the page says agent projects are turned off, it was started with AMC_A4_PREVIEW=0: run amc down, then choose this line again.");
}

async function act(io: FrontDoorIo, choice: FrontDoorChoice, state: FrontDoorState): Promise<"done" | "menu"> {
  switch (choice) {
    case "watch-claude": await watchAgent(io, AGENTS.claude); return "done";
    case "watch-codex": await watchAgent(io, AGENTS.codex); return "done";
    case "sign-in-claude": io.runAmc(["login", "claude"]); return "menu";
    case "sign-in-codex": io.runAmc(["login", "codex"]); return "menu";
    // `init --coding` asks the person before it changes anything, and the menu comes back with the coding chat on it.
    case "coding-setup": io.runAmc(["init", "--coding"], true); return "menu";
    // The operator's own environment: after the setup the vault opens only with the passphrase the person chose.
    case "coding-chat": io.runAmc([...chatArgs(state.providerKeys[0] ?? null), "--tools", "workspace", "--approval-mode", "default"]); return "done";
    case "chat": io.runAmc(chatArgs(state.providerKeys[0] ?? null), true); return "done";
    case "demo-chat": io.runAmc(chatArgs(null), true); return "done";
    case "build": await buildAgent(io, state.studioRunning); return "done";
    case "console": await openConsole(io); return "done";
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

/** Whether `init --coding`'s setup is here, or this menu workspace can move to it; neither when a file cannot be read. */
function codingState(workspace: string): Pick<FrontDoorState, "coding"> {
  try {
    // A half-moved folder is never shown as ready: its only line finishes or undoes the move.
    if (codingMoveInterrupted(workspace)) return { coding: "interrupted" };
    if (hasCodingSetup(workspace)) return { coding: "ready" };
    return codingAdoptionBlockers(workspace).length === 0 ? { coding: "can-set-up" } : {};
  } catch {
    return {};
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
      hasRun: hasRun(workspace, agentId), lastChoice: readLastChoice(workspace), ...codingState(workspace) }),
    select: async (message, options, selected) => (await inquirer.prompt<{ choice: FrontDoorChoice }>([{ type: "select", name: "choice", message,
      choices: options.map((option) => ({ name: option.name, value: option.value })), default: selected }])).choice,
    confirm: async (message) => (await inquirer.prompt<{ yes: boolean }>([{ type: "confirm", name: "yes", message, default: true }])).yes,
    runAmc: (args, chat, extraEnv) => {
      const code = attached(process.execPath, [entry, ...args], workspace, { ...(chat === true ? process.env : operatorEnv), ...extraEnv });
      // A child can change the vault passphrase (the coding setup does): one that no longer opens the vault is not passed on.
      const held = process.env.AMC_VAULT_PASSPHRASE;
      if (held && vaultExists(workspace) && !vaultOpensWith(workspace, held)) delete process.env.AMC_VAULT_PASSPHRASE;
      return code;
    },
    portsIfDefaultBusy: async () => {
      if ((operatorEnv.AMC_GATEWAY_PORT ?? "").length > 0) return null;
      const gateway = await defaultPortOrFree("127.0.0.1", DEFAULT_GATEWAY_PORT);
      return gateway === DEFAULT_GATEWAY_PORT ? null : { AMC_GATEWAY_PORT: String(gateway), AMC_PROXY_PORT: String(await defaultPortOrFree("127.0.0.1", DEFAULT_PROXY_PORT)) };
    },
    runTool: (binary) => attached(binary, [], workspace, operatorEnv),
    openUrl: params.openUrl,
    studioOrigin: () => studioOrigin(workspace),
    saveChoice: (choice) => saveLastChoice(workspace, choice),
    showScore: params.showScore
  };
}
