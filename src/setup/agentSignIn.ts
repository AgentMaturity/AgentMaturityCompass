/**
 * `amc login`: sign in to Claude Code or Codex with the vendor's own command, and report which are signed in.
 *
 * AMC holds no subscription sign-in. A Claude or ChatGPT plan is used through the vendor's CLI, which AMC observes or
 * controls through hooks (`amc connect hooks`). This module only starts the vendor's sign-in command and reads the
 * vendor's own status answer; it never reads a token, a credentials file or a keychain item.
 */
import { spawnSync } from "node:child_process";
import type { Command } from "commander";
import { stripProviderKeys } from "../utils/providerKeys.js";

export interface SignInAgent {
  readonly id: "claude" | "codex";
  readonly displayName: string;
  readonly binary: string;
  readonly statusArgs: readonly string[];
  readonly loginArgs: readonly string[];
  /** The `amc connect hooks` command that puts this agent's tool calls into AMC's evidence. */
  readonly connect: string;
}

export const SIGN_IN_AGENTS: readonly SignInAgent[] = Object.freeze([
  { id: "claude", displayName: "Claude Code", binary: "claude", statusArgs: ["auth", "status"], loginArgs: ["auth", "login"],
    connect: "amc connect hooks install --provider claude-code --mode control --agent default" },
  { id: "codex", displayName: "Codex", binary: "codex", statusArgs: ["login", "status"], loginArgs: ["login"],
    connect: "amc connect hooks install --provider codex --mode observe --agent default" }
]);

export type SignInState = "signed-in" | "signed-out" | "not-installed" | "unknown";

export interface CommandOutcome {
  readonly error?: NodeJS.ErrnoException;
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}
export type CommandRunner = (binary: string, args: readonly string[], inherit: boolean) => CommandOutcome;

/** Provider keys and AMC secrets are stripped: the answer must describe the sign-in, not an API key in the shell. */
const runVendorCommand: CommandRunner = (binary, args, inherit) => {
  const result = spawnSync(binary, [...args], { env: stripProviderKeys(process.env), encoding: "utf8", timeout: inherit ? undefined : 15_000,
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"] });
  return { error: result.error as NodeJS.ErrnoException | undefined, status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
};

/** Reads the vendor's own status answer. Anything it cannot read is "unknown", never "signed-in". */
export function parseSignInState(agent: SignInAgent, outcome: CommandOutcome): SignInState {
  if (outcome.error?.code === "ENOENT") return "not-installed";
  if (outcome.error) return "unknown";
  const text = `${outcome.stdout}\n${outcome.stderr}`;
  if (agent.id === "claude") {
    try {
      const loggedIn = (JSON.parse(outcome.stdout) as { loggedIn?: unknown }).loggedIn;
      return loggedIn === true ? "signed-in" : loggedIn === false ? "signed-out" : "unknown";
    } catch {
      return "unknown";
    }
  }
  if (/not logged in/i.test(text)) return "signed-out";
  return outcome.status === 0 && /logged in/i.test(text) ? "signed-in" : "unknown";
}

export interface SignInReport {
  readonly id: SignInAgent["id"];
  readonly displayName: string;
  readonly state: SignInState;
  readonly next: string;
}

function nextStep(agent: SignInAgent, state: SignInState): string {
  if (state === "signed-in") return agent.connect;
  if (state === "not-installed") return `install ${agent.displayName} (the ${agent.binary} command was not found on PATH), then: amc login ${agent.id}`;
  if (state === "signed-out") return `amc login ${agent.id}`;
  return `${agent.binary} ${agent.statusArgs.join(" ")} (AMC could not read the answer)`;
}

export function inspectSignIn(run: CommandRunner = runVendorCommand): SignInReport[] {
  return SIGN_IN_AGENTS.map((agent) => {
    const state = parseSignInState(agent, run(agent.binary, agent.statusArgs, false));
    return { id: agent.id, displayName: agent.displayName, state, next: nextStep(agent, state) };
  });
}

const BOUNDARY = "AMC starts the vendor's own sign-in and reads its status answer. It never sees or stores a password, token or plan.";

function printStatus(reports: readonly SignInReport[], log: (line: string) => void): void {
  log("Sign-in for the agents AMC can watch");
  for (const report of reports) {
    log(`  ${report.displayName.padEnd(12)} ${report.state.padEnd(14)} next: ${report.next}`);
  }
  log(BOUNDARY);
}

export function registerLoginCommands(program: Command, run: CommandRunner = runVendorCommand, log: (line: string) => void = console.log): void {
  const login = program.command("login").description("Sign in to Claude Code or Codex with the vendor's own command, or show which are signed in");
  login.command("status").description("Show whether Claude Code and Codex are installed and signed in (reads the vendor's own status)")
    .option("--json", "emit structured JSON", false)
    .action((opts: { json: boolean }) => {
      const reports = inspectSignIn(run);
      if (opts.json) log(JSON.stringify({ agents: reports, boundary: BOUNDARY }, null, 2));
      else printStatus(reports, log);
    });
  for (const agent of SIGN_IN_AGENTS) {
    login.command(agent.id).description(`Run ${agent.displayName}'s own sign-in (${agent.binary} ${agent.loginArgs.join(" ")})`)
      .action(() => {
        const outcome = run(agent.binary, agent.loginArgs, true);
        if (outcome.error?.code === "ENOENT") log(`${agent.displayName} is not installed: the ${agent.binary} command was not found on PATH.`);
        else if (outcome.error || outcome.status !== 0) log(`${agent.displayName} sign-in did not finish. Run it again: amc login ${agent.id}`);
        else log(`Next: ${agent.connect}`);
        if (outcome.error || outcome.status !== 0) process.exitCode = 1;
      });
  }
}
