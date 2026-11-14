/**
 * `amc connect` for a person in a terminal: first offer to watch the Claude Code or Codex they are already signed in to
 * (an observe hook, installed only on their yes), and keep the gateway lease out of scrollback by writing the exports to a
 * 0600 file under .amc/studio/ (which the workspace's .amc/.gitignore keeps out of git). `--print-env` still prints.
 */
import { chmodSync } from "node:fs";
import { join, relative } from "node:path";
import { ensureDir, writeFileAtomic } from "../utils/fs.js";
import { studioDir } from "./studioState.js";
import type { SignInReport } from "../setup/agentSignIn.js";

const HOOK_PROVIDER = { claude: "claude-code", codex: "codex" } as const;

export interface WatchOfferDeps {
  readonly signIn: () => readonly SignInReport[];
  /** One choice from a list; null when the operator cancels. */
  readonly choose: (message: string, choices: ReadonlyArray<{ name: string; value: string }>) => Promise<string | null>;
  readonly confirm: (message: string) => Promise<boolean>;
  /** Installs the observe hook (vault, D4 confirmation and Bridge origin included); returns the lines to show. */
  readonly install: (provider: "claude-code" | "codex", agentId: string) => Promise<readonly string[]>;
  readonly log: (line: string) => void;
}

/** "watched" when a hook was installed; "skipped" when the person chose the exports, said no, or nothing is signed in. */
export async function offerWatchSignedIn(agentId: string, deps: WatchOfferDeps): Promise<"watched" | "skipped"> {
  const signedIn = deps.signIn().filter((report) => report.state === "signed-in");
  if (signedIn.length === 0) return "skipped";
  const picked = await deps.choose("What do you want AMC to watch?", [
    ...signedIn.map((report) => ({ name: `Watch ${report.displayName} (signed in)`, value: report.id })),
    { name: "Another agent: write the gateway environment for it", value: "env" }
  ]);
  const report = signedIn.find((entry) => entry.id === picked);
  if (report === undefined) return "skipped";
  const provider = HOOK_PROVIDER[report.id];
  const file = provider === "codex" ? ".codex/hooks.json" : ".claude/settings.local.json";
  if (!(await deps.confirm(`Add an AMC observe hook to ${file} in this folder? It records ${report.displayName}'s tool calls and blocks nothing.`))) {
    deps.log("Nothing installed.");
    return "skipped";
  }
  for (const line of await deps.install(provider, agentId)) deps.log(line);
  return "watched";
}

/** Writes the exports (they carry a live gateway lease) to a 0600 file; returns the `source` line to print. */
export function writeConnectEnvFile(workspace: string, agentId: string, envLines: readonly string[]): { path: string; sourceLine: string } {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(agentId)) throw new Error(`agent ID ${JSON.stringify(agentId)} cannot name a file`);
  const dir = join(studioDir(workspace), "connect");
  ensureDir(dir);
  const path = join(dir, `${agentId}.env`);
  writeFileAtomic(path, `${envLines.join("\n")}\n`, 0o600);
  chmodSync(path, 0o600);
  return { path, sourceLine: `source ${relative(workspace, path)}` };
}
