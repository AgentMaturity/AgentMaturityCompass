/**
 * Where this workspace's provider hooks send events: the Bridge on this workspace's own running Studio. A default of port
 * 3212 sent them to whichever Studio held 3212 (often another workspace's) when `amc up` had fallen back to a free port.
 * state.json is unsigned: it picks a target, and the hook's signed manifest still binds that target at install.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathExists } from "../utils/fs.js";
import { processRunning, readStudioState, studioDir } from "./studioState.js";

/** The file writeStudioState keeps the API port in; `amc down` clears state.json but not this. */
export function lastApiPortPath(workspace: string): string {
  return join(studioDir(workspace), "last-api-port");
}

/** The API port this workspace's Studio last listened on, or null. */
export function previousStudioApiPort(workspace: string): number | null {
  const file = lastApiPortPath(workspace);
  const port = pathExists(file) ? Number(readFileSync(file, "utf8").trim()) : Number.NaN;
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "::1"]);

/** The loopback Bridge origin of the Studio running for this workspace, or null when none runs. */
export function runningStudioBridgeBase(workspace: string, isRunning: (pid: number) => boolean = processRunning): string | null {
  let state: ReturnType<typeof readStudioState>;
  try { state = readStudioState(workspace); } catch { return null; }
  if (state === null || !Number.isInteger(state.apiPort) || state.apiPort <= 0 || state.apiPort > 65535) return null;
  if (!Number.isInteger(state.pid) || state.pid <= 0 || !isRunning(state.pid)) return null;
  // state.json is an unsigned file inside the workspace, and a copied or cloned folder can ship one. A hook target is
  // taken from it only when it is this machine: any other host would send the agent's tool calls to someone else.
  const host = state.host === "0.0.0.0" || state.host === "::" || !state.host ? "127.0.0.1" : state.host;
  if (!LOOPBACK_HOSTS.has(host)) return null;
  return `http://${host.includes(":") ? `[${host}]` : host}:${state.apiPort}`;
}

/** An explicit --bridge-url, else this workspace's running Studio; with neither, a plain refusal rather than a guess. */
export function requireStudioBridgeBase(workspace: string, explicit: string | undefined): string {
  if (explicit !== undefined && explicit.trim().length > 0) return explicit;
  const running = runningStudioBridgeBase(workspace);
  if (running === null) {
    throw new Error("Start AMC here first: amc up. AMC is not running in this folder, so a hook installed now would send its events to no "
      + "Studio, or to another folder's. (To name a Bridge yourself, pass --bridge-url.)");
  }
  return running;
}

/** A hook whose signed Bridge origin is not where this workspace's Studio listens, with the command that re-signs it. */
export function bridgeTargetIssue(input: { installed: string | null; running: string | null; provider: string; mode: string | null }): string | null {
  if (input.installed === null || input.running === null || input.installed === input.running) return null;
  return `the hook sends events to ${input.installed}, but this workspace's Studio listens on ${input.running}; reinstall to point it here: `
    + `amc connect hooks install --provider ${input.provider}${input.mode === null ? "" : ` --mode ${input.mode}`}`;
}

/**
 * For `connect hooks status` and `health`: the bridge mismatch of an installation whose manifest verified (manifestValid),
 * read from that manifest's bridgeBase. Empty when none, when the manifest did not verify, or when no Studio runs here.
 */
export function hookBridgeIssues(workspace: string, input: { manifestPath: string; manifestValid: boolean; provider: string; mode: string | null }): string[] {
  if (!input.manifestValid || !pathExists(input.manifestPath)) return [];
  let installed: unknown;
  try { installed = (JSON.parse(readFileSync(input.manifestPath, "utf8")) as { bridgeBase?: unknown }).bridgeBase; } catch { return []; }
  const issue = bridgeTargetIssue({ installed: typeof installed === "string" ? installed : null, running: runningStudioBridgeBase(workspace),
    provider: input.provider, mode: input.mode });
  return issue === null ? [] : [issue];
}
