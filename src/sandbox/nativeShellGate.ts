import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { bwrapBackend } from "./bwrapBackend.js";
import { seatbeltNativeShell } from "./seatbeltNativeShell.js";

/**
 * Whether the native `bash` tool is offered at all (P0-06, P1-05).
 *
 * Linux runs it under Bubblewrap and macOS under Seatbelt. Every other
 * platform is refused. Only when Seatbelt is unavailable may an operator
 * explicitly accept an unconfined macOS shell; an opt-in never replaces an
 * available boundary and never re-enables an unconfined Linux shell. No
 * workspace file is an opt-in: a workspace verifies its config against its own
 * keys, so a repository could sign one itself.
 */
export type ShellOptInSource = "cli-flag" | "sdk-option";
export type NativeShellBoundary = "linux-bwrap" | "macos-seatbelt";
type BackendCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };
export type NativeShellDecision =
  | { readonly kind: "confined"; readonly boundary: NativeShellBoundary }
  | { readonly kind: "unconfined-opt-in"; readonly platform: NodeJS.Platform; readonly source: ShellOptInSource }
  | { readonly kind: "refused"; readonly platform: NodeJS.Platform; readonly remediation: string };

/** What a surface reports about the shell; `reason` is the refusal or the opt-in warning. */
export interface NativeShellReadiness {
  readonly offered: boolean;
  readonly decision: NativeShellDecision["kind"];
  readonly enforcement: "enforced" | "none";
  readonly boundary: NativeShellBoundary | null;
  readonly reason: string | null;
  readonly optInSource: ShellOptInSource | null;
}

const NOT_HONOURED = "runtime.shell.allowUnconfined is not honoured: a workspace can sign its own config, so a file in the repository cannot grant an unconfined shell. Pass --unsafe-unconfined-shell, or start Studio with AMC_UNSAFE_UNCONFINED_SHELL=1.";
const WINDOWS_REFUSAL = "The native shell is not available on Windows. AMC has no confined Windows runner yet; the unsafe flag does not apply on Windows.";

export function decideNativeShell(input: {
  readonly platform: NodeJS.Platform;
  readonly bwrap: BackendCheck;
  readonly seatbelt: BackendCheck;
  readonly optIn: ShellOptInSource | null;
}): NativeShellDecision {
  const { platform, bwrap, seatbelt, optIn } = input;
  if (platform === "linux") {
    return bwrap.ok ? { kind: "confined", boundary: "linux-bwrap" } : { kind: "refused", platform,
      remediation: `The native shell is refused: ${bwrap.reason.replace(/\.$/, "")}. Install Bubblewrap at /usr/bin/bwrap (Debian and Ubuntu: apt install bubblewrap); on Ubuntu 24.04 also follow docs/NATIVE_SANDBOX_UBUNTU.md. AMC never falls back to an unconfined Linux shell.` };
  }
  if (platform === "darwin") {
    if (seatbelt.ok) return { kind: "confined", boundary: "macos-seatbelt" };
    return optIn === null ? { kind: "refused", platform, remediation: `The native shell is refused on macOS: ${seatbelt.reason.replace(/\.$/, "")}, so AMC cannot confine it with Seatbelt. To accept an unconfined shell with your full user rights, pass --unsafe-unconfined-shell (Studio: start it with AMC_UNSAFE_UNCONFINED_SHELL=1).` }
      : { kind: "unconfined-opt-in", platform, source: optIn };
  }
  return { kind: "refused", platform, remediation: platform === "win32" ? WINDOWS_REFUSAL
    : `The native shell is not available on ${platform}. AMC has no confined runner for this platform; the unsafe flag applies only on macOS.` };
}

function unconfinedShellWarning(platform: NodeJS.Platform, source: ShellOptInSource): string {
  return `WARNING: the native shell is UNCONFINED on ${platform} (opt-in: ${source}). Commands run with your full user rights: files outside the workspace, ~/.ssh and the network are reachable. Receipts record enforcement: none.`;
}

/** The explicit opt-ins a caller may pass. */
export type ExplicitShellOptIn = ShellOptInSource;

/** Whether the config still carries the retired key, so a refusal can say it is not honoured. */
function configCarriesOptIn(workspace: string): boolean {
  try {
    const raw = YAML.parse(readFileSync(join(workspace, ".amc", "amc.config.yaml"), "utf8")) as { runtime?: { shell?: { allowUnconfined?: unknown } } } | null;
    return raw?.runtime?.shell?.allowUnconfined !== undefined;
  } catch { return false; } // No readable config: nothing to explain.
}

function readinessFor(workspace: string, optIn: ShellOptInSource | null): NativeShellReadiness {
  const decision = decideNativeShell({ platform: process.platform, bwrap: bwrapBackend().available(), seatbelt: seatbeltNativeShell().available(), optIn });
  if (decision.kind === "confined") {
    return { offered: true, decision: decision.kind, enforcement: "enforced", boundary: decision.boundary, reason: null, optInSource: null };
  }
  if (decision.kind === "unconfined-opt-in") {
    return { offered: true, decision: decision.kind, enforcement: "none", boundary: null,
      reason: unconfinedShellWarning(decision.platform, decision.source), optInSource: decision.source };
  }
  // The note names opt-ins that only work on macOS, where a refusal means no explicit opt-in was passed.
  return { offered: false, decision: decision.kind, enforcement: "none", boundary: null, optInSource: null,
    reason: decision.platform === "darwin" && configCarriesOptIn(workspace) ? `${NOT_HONOURED} ${decision.remediation}` : decision.remediation };
}

/** Decide once for a top-level session from the caller's explicit opt-in only; never from a file or the environment. */
export function nativeShellReadiness(workspace: string, explicit?: ExplicitShellOptIn): NativeShellReadiness {
  // Checked at run time too: a JavaScript caller may pass any value.
  return readinessFor(workspace, explicit === "cli-flag" || explicit === "sdk-option" ? explicit : null);
}

/**
 * A delegated child's decision: the parent's, never wider. A refused parent
 * refuses the child; otherwise the child re-checks the platform and backend,
 * which can only narrow it. A child with no parent decision inherits no opt-in.
 */
export function childShellReadiness(workspace: string, parent: NativeShellReadiness | null): NativeShellReadiness {
  if (parent !== null && !parent.offered) return parent;
  return readinessFor(workspace, parent?.optInSource ?? null);
}
