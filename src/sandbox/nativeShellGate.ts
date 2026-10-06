import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { verifyAmcConfigSignature } from "../config/amcConfigSignature.js";
import { bwrapBackend } from "./bwrapBackend.js";

/**
 * Whether the native `bash` tool is offered at all (P0-06).
 *
 * Linux runs it under Bubblewrap. Nothing else can confine it yet, so every
 * other platform is refused, except macOS when an operator explicitly accepts
 * an unconfined shell. An opt-in never re-enables an unconfined Linux shell.
 */
export type ShellOptInSource = "cli-flag" | "signed-config" | "sdk-option";
export type NativeShellDecision =
  | { readonly kind: "confined"; readonly boundary: "linux-bwrap" }
  | { readonly kind: "unconfined-opt-in"; readonly platform: NodeJS.Platform; readonly source: ShellOptInSource }
  | { readonly kind: "refused"; readonly platform: NodeJS.Platform; readonly remediation: string };

/** What a surface reports about the shell; `reason` is the refusal or the opt-in warning. */
export interface NativeShellReadiness {
  readonly offered: boolean;
  readonly decision: NativeShellDecision["kind"];
  readonly enforcement: "enforced" | "none";
  readonly boundary: "linux-bwrap" | null;
  readonly reason: string | null;
  readonly optInSource: ShellOptInSource | null;
}

const MACOS_REFUSAL = "The native shell is refused on macOS: AMC cannot confine it yet (Seatbelt confinement arrives with P1-05). To accept an unconfined shell with your full user rights, pass --unsafe-unconfined-shell or set runtime.shell.allowUnconfined: true in a signed .amc/amc.config.yaml.";
const WINDOWS_REFUSAL = "The native shell is not available on Windows. AMC has no confined Windows runner yet; the unsafe flag does not apply on Windows.";

export function decideNativeShell(input: {
  readonly platform: NodeJS.Platform;
  readonly bwrap: { readonly ok: true } | { readonly ok: false; readonly reason: string };
  readonly optIn: ShellOptInSource | null;
}): NativeShellDecision {
  const { platform, bwrap, optIn } = input;
  if (platform === "linux") {
    return bwrap.ok ? { kind: "confined", boundary: "linux-bwrap" } : { kind: "refused", platform,
      remediation: `The native shell is refused: ${bwrap.reason.replace(/\.$/, "")}. Install Bubblewrap at /usr/bin/bwrap (Debian and Ubuntu: apt install bubblewrap); on Ubuntu 24.04 also follow docs/NATIVE_SANDBOX_UBUNTU.md. AMC never falls back to an unconfined Linux shell.` };
  }
  if (platform === "darwin") {
    return optIn === null ? { kind: "refused", platform, remediation: MACOS_REFUSAL } : { kind: "unconfined-opt-in", platform, source: optIn };
  }
  return { kind: "refused", platform, remediation: platform === "win32" ? WINDOWS_REFUSAL
    : `The native shell is not available on ${platform}. AMC has no confined runner for this platform; the unsafe flag applies only on macOS.` };
}

export function unconfinedShellWarning(platform: NodeJS.Platform, source: ShellOptInSource): string {
  return `WARNING: the native shell is UNCONFINED on ${platform} (opt-in: ${source}). Commands run with your full user rights: files outside the workspace, ~/.ssh and the network are reachable. Receipts record enforcement: none.`;
}

/** The explicit opt-ins a caller may pass; "signed-config" is only ever derived from a verified file. */
export type ExplicitShellOptIn = Exclude<ShellOptInSource, "signed-config">;
type ResolvedOptIn = { readonly optIn: ShellOptInSource | null; readonly ignored: string | null };
const NO_OPT_IN: ResolvedOptIn = { optIn: null, ignored: null };

/** `runtime.shell.allowUnconfined: true` counts only under a valid auditor signature over the bytes read here. */
function signedConfigOptIn(workspace: string): ResolvedOptIn {
  let bytes: Buffer;
  let raw: { runtime?: { shell?: { allowUnconfined?: unknown } } } | null;
  try {
    bytes = readFileSync(join(workspace, ".amc", "amc.config.yaml"));
    raw = YAML.parse(bytes.toString("utf8")) as typeof raw;
  } catch { return NO_OPT_IN; } // No readable config: nothing was opted in.
  if (raw?.runtime?.shell?.allowUnconfined !== true) return NO_OPT_IN;
  const signature = verifyAmcConfigSignature(workspace, bytes);
  return signature.valid ? { optIn: "signed-config", ignored: null } : { optIn: null,
    ignored: `runtime.shell.allowUnconfined is ignored: ${signature.reason ?? "signature invalid"}. Re-sign the config with: amc verify --sign-config` };
}

function readinessFor(config: ResolvedOptIn): NativeShellReadiness {
  const decision = decideNativeShell({ platform: process.platform, bwrap: bwrapBackend().available(), optIn: config.optIn });
  if (decision.kind === "confined") {
    return { offered: true, decision: decision.kind, enforcement: "enforced", boundary: decision.boundary, reason: null, optInSource: null };
  }
  if (decision.kind === "unconfined-opt-in") {
    return { offered: true, decision: decision.kind, enforcement: "none", boundary: null,
      reason: unconfinedShellWarning(decision.platform, decision.source), optInSource: decision.source };
  }
  return { offered: false, decision: decision.kind, enforcement: "none", boundary: null,
    reason: config.ignored === null ? decision.remediation : `${config.ignored} ${decision.remediation}`, optInSource: null };
}

/** Decide once for a top-level session; an explicit opt-in wins over the config. */
export function nativeShellReadiness(workspace: string, explicit?: ExplicitShellOptIn): NativeShellReadiness {
  // Checked at run time too: a JavaScript caller must not label its own opt-in as the signed config.
  return readinessFor(explicit === "cli-flag" || explicit === "sdk-option" ? { optIn: explicit, ignored: null } : signedConfigOptIn(workspace));
}

/**
 * A delegated child's decision: the parent's, never wider. A refused parent
 * refuses the child; otherwise the child re-checks the platform and backend
 * (and re-verifies a signed-config opt-in), which can only narrow it. A child
 * with no parent decision inherits no opt-in.
 */
export function childShellReadiness(workspace: string, parent: NativeShellReadiness | null): NativeShellReadiness {
  if (parent !== null && !parent.offered) return parent;
  const source = parent?.optInSource ?? null;
  if (source === "signed-config") return readinessFor(signedConfigOptIn(workspace));
  return readinessFor(source === "cli-flag" || source === "sdk-option" ? { optIn: source, ignored: null } : NO_OPT_IN);
}
