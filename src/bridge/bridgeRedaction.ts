import { redactSecrets } from "../shield/redaction/redactSecrets.js";
import { createHash } from "node:crypto";
import { keyedSpan, MAX_PROTECTED_TEXT_CHARS, MAX_REQUEST_SCAN_CHARS, nestedJsonRedactor, redactJsonLeaves, redactProtectedText,
  secretMember } from "../dataflow/detectors.js";
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
 * payloads, and the stored output and argv of adapter runs and monitored processes. Secrets always, as `redactBridgeText`
 * (every key and leaf of a JSON payload). In a workspace that opted in to protected-data redaction (P2-02, read once per
 * redactor) the protected-data detectors too, with the same anonymous marker: text over their per-leaf limit or holding a
 * zero byte (UTF-16 output read as UTF-8) is replaced whole, an integer JSON.parse rounded (a card number sent as a number)
 * is replaced, a member's value is checked with its name (`secretMember`, `keyedSpan`), and text that holds JSON (stdout, a
 * string leaf) is read one level deep, then searched decoded (`nestedJsonRedactor`). Each `text` or `json` call may scan
 * MAX_BRIDGE_SCAN_CHARS; past that, or on any failure of the scan, the whole value stored is the marker. Text the bridge
 * hands back to an agent (control responses, deny reasons, `amc wrap`'s terminal output) keeps secrets-only
 * `redactBridgeText`, so an opted-in workspace's detectors never alter what an agent is told.
 */
export function bridgeEvidenceRedactor(workspace: string): { readonly text: (input: string) => string; readonly json: (value: unknown) => unknown } {
  const protectedData = protectedDataOptedIn(workspace);
  let scanned = 0;
  const charge = (length: number) => { scanned += length; if (scanned > MAX_BRIDGE_SCAN_CHARS) throw new RangeError("bridge scan budget"); };
  const scan = (input: string, key?: string): string => {
    if (protectedData) charge(input.length);
    const secretsRedacted = redactBridgeText(input);
    if (!protectedData) return secretsRedacted;
    if (secretsRedacted.length > MAX_PROTECTED_TEXT_CHARS || input.includes("\u0000") || secretMember(key, input)) return MARKER;
    const redacted = redactProtectedText(secretsRedacted, () => MARKER).text;
    return keyedSpan(key, redacted, undefined, charge) === undefined ? redacted : MARKER;
  };
  if (!protectedData) return Object.freeze({ text: scan, json: (value: unknown) => redactJsonLeaves(value, scan) });
  const opaque = () => MARKER;
  const text = nestedJsonRedactor(scan, opaque);
  const budgeted = <T, R>(redact: (value: T) => R) => (value: T): R | typeof MARKER => {
    scanned = 0;
    try { return redact(value); } catch { return MARKER; }
  };
  return Object.freeze({ text: budgeted(text), json: budgeted((value: unknown) => redactJsonLeaves(value, text, opaque)) });
}

/**
 * A process's command and arguments as evidence stores them (P2-02): `scrubValues`, AMC's own lease and the vault
 * passphrase replaced as the output scrub replaces them, then the secret table and, where the workspace opted in, the
 * protected-data detectors (`bridgeEvidenceRedactor`), as its output is. The process runs with the real ones.
 */
export function recordedArgv(workspace: string, command: string, args: readonly string[], scrubValues: readonly string[] = []):
  { readonly command: string; readonly args: unknown } {
  const secrets = [...scrubValues, process.env.AMC_LEASE ?? "", process.env.AMC_VAULT_PASSPHRASE ?? ""].filter((value) => value.length >= 8);
  const scrub = (text: string) => secrets.reduce((out, secret) => out.split(secret).join(SCRUB_PLACEHOLDER), text);
  const evidence = bridgeEvidenceRedactor(workspace);
  return { command: evidence.text(scrub(command)), args: evidence.json(args.map(scrub)) };
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
