/**
 * P0-09 step 10: the trust flags on existing verify commands, and their verdicts and exit codes.
 *
 * Exit codes: 0 trusted; 1 failed; 2 integrity verified but untrusted only because --allow-unpinned or
 * --allow-unanchored was used, with stderr starting "UNTRUSTED:". Allow flags come from the command line only,
 * never from the environment or a request body.
 */
import type { Command } from "commander";
import { resolve } from "node:path";
import chalk from "chalk";
import {
  admitKey, buildVerifierReport, loadTrustContext, untrustedReasons, verdictExitCode,
  type IssuerAdmission, type KeyPurpose, type TrustContext, type VerifierReportV1
} from "./trust/index.js";
import { isKeyRefused } from "./trust/signatureCheck.js";

export interface TrustFlags {
  pubkey?: string;
  expectMonitor?: string;
  trustList?: string[];
  trustRoot?: string[];
  allowUnpinned?: boolean;
  allowUnanchored?: boolean;
  json?: boolean;
}

const collect = (value: string, previous: string[] = []): string[] => [...previous, value];

/**
 * Portable verify commands get every flag; ledger-only workspace checks have no issuer to pin, so no --allow-unpinned;
 * issuer-only actions that verify no ledger (backup restore) get no --allow-unanchored.
 */
export function withTrustFlags(command: Command,
  extra: { pubkey?: string; expectMonitor?: boolean; json?: boolean; ledgerOnly?: boolean; issuerOnly?: boolean } = {}): Command {
  if (extra.pubkey) command.option("--pubkey <path>", extra.pubkey);
  if (extra.expectMonitor) {
    command.option("--expect-monitor <sha256>", "pin the monitor key (ledger-row) by a fingerprint recorded outside what is verified");
  }
  command
    .option("--trust-list <file>", "signed trust list that pins issuer keys (repeatable; default <AMC home>/trust/amc-trust-list.json)", collect)
    .option("--trust-root <sha256>", "trust-list root key id (repeatable; default <AMC home>/trust/trust-roots.json)", collect);
  if (!extra.ledgerOnly) command.option("--allow-unpinned", "integrity-only result for issuer keys nobody pinned (exit 2, never trusted)");
  if (!extra.issuerOnly) command.option("--allow-unanchored", "integrity-only result for an unanchored ledger (exit 2, never trusted)");
  if (extra.json) command.option("--json", "print the result with its verifier report as JSON");
  return command;
}

/** The verifier operator's trust: --pubkey for `purposes`, --expect-monitor, trust lists and the AMC home defaults. */
export function trustFromFlags(flags: TrustFlags, purposes: readonly KeyPurpose[]): TrustContext {
  // An empty value (often an unset shell variable) is a mistake, not "no pin": refuse it.
  if (flags.pubkey === "") throw new Error("--pubkey needs a path");
  return loadTrustContext({
    ...(flags.pubkey !== undefined ? { pubkey: { path: resolve(flags.pubkey), purposes } } : {}),
    ...(flags.expectMonitor !== undefined ? { expectMonitor: flags.expectMonitor } : {}),
    trustLists: (flags.trustList ?? []).map((path) => resolve(path)),
    trustRoots: flags.trustRoot ?? [],
    allowUnpinned: flags.allowUnpinned === true,
    allowUnanchored: flags.allowUnanchored === true
  });
}

/**
 * P0-51: an artifact that names no signer (an unkeyed hash, or an HMAC under a shared secret) has no issuer to admit.
 * admitKey refuses the missing key as not-pinned whatever the flags, so the report is never trusted and exits 1.
 */
export function unsignedArtifactReport(artifact: VerifierReportV1["artifact"], trust: TrustContext, integrityErrors: readonly string[],
  signature: string): VerifierReportV1 {
  return buildVerifierReport({ artifact, context: trust, integrityErrors, anchoring: { status: "not-applicable", detail: null },
    signatures: [admitKey({ publicKeyPem: null, purpose: "artifact-seal", signature, context: trust })] });
}

function untrusted(reasons: readonly string[], overrides: readonly string[]): void {
  console.error(`UNTRUSTED: integrity verified, but ${overrides.map((flag) => `--${flag}`).join(" and ")} was used: ${reasons.join("; ")}`);
}

/** Prints a verifier report's verdict and exits with its code. */
export function finishVerify(label: string, report: VerifierReportV1, opts: { json?: boolean; result?: unknown; details?: string[] }): void {
  const code = verdictExitCode(report);
  const reasons = untrustedReasons(report);
  if (opts.json) {
    console.log(JSON.stringify(opts.result ?? report, null, 2));
  } else {
    console.log(code === 0 ? chalk.green(`${label} verification PASSED`)
      : code === 2 ? chalk.yellow(`${label} integrity verified, UNTRUSTED`) : chalk.red(`${label} verification FAILED`));
    for (const line of code === 0 ? opts.details ?? [] : reasons.map((reason) => `- ${reason}`)) console.log(line);
  }
  if (code === 2) untrusted(reasons, report.overrides);
  if (code !== 0) process.exit(code);
}

/** After an action that proceeds on an allowed integrity-only verdict (backup restore): "UNTRUSTED:" on stderr, exit 2. */
export function exitIfUntrusted(report: VerifierReportV1): void {
  if (verdictExitCode(report) !== 2) return;
  untrusted(untrustedReasons(report), report.overrides);
  process.exit(2);
}

/**
 * Step 9: a ledger verdict is 0 only when it verified and its monitor key is admitted; unanchored is 1, or 2 when
 * allowed. A distrusted or revoked monitor key is 1 whatever the flags: distrust beats every pin and allow flag.
 */
export function ledgerExitCode(result: { ok: boolean; trustRoot: { anchored: boolean; monitorAdmission?: IssuerAdmission } },
  trust: TrustContext): 0 | 1 | 2 {
  if (!result.ok) return 1;
  if (result.trustRoot.anchored) return 0;
  if (!trust.allowUnanchored || (result.trustRoot.monitorAdmission && isKeyRefused(result.trustRoot.monitorAdmission))) return 1;
  untrusted(["ledger UNANCHORED: the monitor key was read from the workspace being verified (internal consistency only)"], ["allow-unanchored"]);
  return 2;
}

/** verify all and evidence verify, after a PASS: exit 2 when the ledger was only allowed unanchored. */
export function verifyAllExit(out: { checks: ReadonlyArray<{ id: string; status: string }> }, trust: TrustContext): void {
  const anchored = out.checks.some((check) => check.id === "ledger-trust-root" && check.status === "PASS");
  const code = ledgerExitCode({ ok: true, trustRoot: { anchored } }, trust);
  if (code !== 0) process.exit(code);
}
