import { redactSecrets } from "../shield/redaction/redactSecrets.js";
import { createHash } from "node:crypto";
import { MAX_REQUEST_SCAN_CHARS, protectedWalk, redactJsonLeaves } from "../dataflow/detectors.js";
import { protectedDataOptedIn } from "../dataflow/processorRegistry.js";
import { SCRUB_PLACEHOLDER } from "../exec/outputCollector.js";
import { canonicalize } from "../utils/json.js";


function clip(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}…`;
}

/**
 * Redact secrets from text bound for a durable bridge row.
 *
 * Delegates to the shared table (P5.3). This module used to carry its own 13
 * patterns, one of which — the PEM private-key header — matched only one of the
 * five real forms, so RSA, EC, OPENSSH and DSA keys crossed the bridge
 * unredacted. The shared table uses `secretBlind`'s correct spelling.
 *
 * The anonymous placeholder is deliberate here: a bridge row is durable and
 * signed, and naming the KIND of secret that was present is itself a small
 * disclosure. `blindSecrets` makes the opposite choice for its own reasons.
 */
export function redactBridgeText(input: string): string {
  return redactSecrets(input, () => "<AMC_REDACTED>").redacted;
}

const MARKER = "<AMC_REDACTED>";
// What one call may scan with the detectors before its whole value is replaced: less than the gateway's per-body budget,
// because the bridge's event loop also answers hook control decisions.
const MAX_BRIDGE_SCAN_CHARS = MAX_REQUEST_SCAN_CHARS / 4;

/**
 * Redaction for what the bridge STORES as evidence: telemetry text, telemetry object payloads and `POST /bridge/evidence`
 * payloads, and the stored argv of adapter runs and monitored processes (and, where the workspace opted in, their output:
 * `processOutputRedactor`). Secrets always, as `redactBridgeText` (every key and leaf of a JSON payload). In a workspace
 * that opted in to protected-data redaction (P2-02, read once per redactor) the protected-data walk runs first
 * (`protectedWalk`, as in the gateway, `key` being a value's member or flag name), with the same anonymous marker for each
 * finding and for a unit or line it cannot read (over the per-text limit, a zero byte, as UTF-16 output read as UTF-8 has,
 * a rounded JSON integer), and then the secret table, so JSON reaches the walk intact. Each `text` or `json` call may scan
 * MAX_BRIDGE_SCAN_CHARS; past that, or on any failure of the walk, the whole value stored is the marker. Text the bridge
 * hands back to an agent (control responses, deny reasons, `amc wrap`'s terminal output) keeps secrets-only
 * `redactBridgeText`, so an opted-in workspace's detectors never alter what an agent is told.
 */
export function bridgeEvidenceRedactor(workspace: string):
  { readonly text: (input: string, key?: string) => string; readonly json: (value: unknown) => unknown } {
  if (!protectedDataOptedIn(workspace)) {
    return Object.freeze({ text: (input: string) => redactBridgeText(input), json: (value: unknown) => redactJsonLeaves(value, redactBridgeText) });
  }
  const walkFor = () => protectedWalk({ budget: MAX_BRIDGE_SCAN_CHARS, replace: () => MARKER, opaque: () => MARKER });
  const guarded = <R>(redact: () => R): R | typeof MARKER => { try { return redact(); } catch { return MARKER; } };
  return Object.freeze({
    text: (input: string, key?: string) => guarded(() => redactBridgeText(walkFor().text(input, key))),
    json: (value: unknown) => guarded(() => redactJsonLeaves(walkFor().value(value), redactBridgeText))
  });
}

/**
 * The stored output rows of adapter runs and monitored processes (stdout, stderr, forwarded stdin). Where the workspace
 * opted in to protected-data redaction (P2-02), `bridgeEvidenceRedactor`'s text. Elsewhere the payload as it was before:
 * the diagnostic's transcript audits (POLICY_VIOLATION) and a delegated child's folded answer read these rows, and the
 * shared secret table would take out the keyword (`api_key=...`) or the plain value (a password-less connection string)
 * they need.
 */
export function processOutputRedactor(workspace: string): (payload: string | Buffer) => string | Buffer {
  if (!protectedDataOptedIn(workspace)) return (payload) => payload;
  const evidence = bridgeEvidenceRedactor(workspace);
  return (payload) => evidence.text(typeof payload === "string" ? payload : payload.toString("utf8"));
}

/**
 * The flag an argument is the value of (`--password` for `hunter2`), as a member name. curl's `-u name:password` is a
 * password; docker's `-u 1000:1000` (uid:gid) is not.
 */
function flagMember(flag: string | undefined, value: string): string | undefined {
  const name = /^--?([A-Za-z][\w.-]*)$/.exec(flag ?? "")?.[1];
  return name !== undefined && /^(?:u|user)$/.test(name) && value.includes(":") && !/^\d+:\d+$/.test(value) ? "password" : name;
}

/**
 * A process's command and arguments as evidence stores them (P2-02): `scrubValues`, AMC's own lease and the vault
 * passphrase replaced as the output scrub replaces them, then the secret table and, where the workspace opted in, the
 * protected-data detectors (`bridgeEvidenceRedactor`), each argument under the flag before it as its member name, so
 * `--password hunter2` and `--mrn A1234567` are checked as `--password=hunter2` is. The process runs with the real ones.
 */
export function recordedArgv(workspace: string, command: string, args: readonly string[], scrubValues: readonly string[] = []):
  { readonly command: string; readonly args: readonly string[] } {
  const secrets = [...scrubValues, process.env.AMC_LEASE ?? "", process.env.AMC_VAULT_PASSPHRASE ?? ""].filter((value) => value.length >= 8);
  const scrub = (text: string) => secrets.reduce((out, secret) => out.split(secret).join(SCRUB_PLACEHOLDER), text);
  const evidence = bridgeEvidenceRedactor(workspace);
  return { command: evidence.text(scrub(command)), args: args.map((arg, index) => evidence.text(scrub(arg), flagMember(args[index - 1], arg))) };
}

export function bridgeSha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function summarizeBridgeBody(params: {
  payload: unknown;
  maxChars: number;
  redactPromptText: boolean;
}): string {
  const serialized = canonicalize(params.payload ?? {});
  if (!params.redactPromptText) {
    return clip(redactBridgeText(serialized), params.maxChars);
  }
  return clip(redactBridgeText(serialized).replace(/"content":"[^"]*"/g, "\"content\":\"<REDACTED>\""), params.maxChars);
}
