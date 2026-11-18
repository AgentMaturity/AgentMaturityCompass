/**
 * P0-09 step 10: the trust flags on existing verify commands, and their verdicts and exit codes.
 *
 * Exit codes: 0 trusted; 1 failed; 2 integrity verified but untrusted only because --allow-unpinned or
 * --allow-unanchored was used, with stderr starting "UNTRUSTED:". Allow flags come from the command line only,
 * never from the environment or a request body.
 */
import type { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { sha256Hex } from "./utils/hash.js";
import { join, resolve } from "node:path";
import chalk from "chalk";
import {
  loadTrustContext, untrustedReasons, verdictExitCode,
  type IssuerAdmission, type KeyPurpose, type TrustContext, type VerifierReportV1
} from "./trust/index.js";
import { isKeyRefused } from "./trust/signatureCheck.js";
import { envelopeForFailedVerification } from "./claims/eligibility/adapters/results.js";
import type { ClaimEnvelope } from "./claims/eligibility/types.js";
import { printClaimResult, withClaimFields } from "./cli/claimOutput.js";

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

/** Moved to src/trust so the API can share it (P0-51). */
export { unsignedArtifactReport } from "./trust/index.js";

function untrusted(reasons: readonly string[], overrides: readonly string[]): void {
  console.error(`UNTRUSTED: integrity verified, but ${overrides.map((flag) => `--${flag}`).join(" and ")} was used: ${reasons.join("; ")}`);
}

/**
 * Prints a verifier report's verdict and exits with its code. `claim` is the verified artifact's own claim (a valid
 * signature proves integrity, never a stronger kind): printed after the verdict, or added to the JSON result. An
 * artifact that did not verify vouches for nothing, so its claim then reads untrusted evidence and no pass.
 */
export function finishVerify(label: string, report: VerifierReportV1,
  opts: { json?: boolean; result?: object; details?: string[]; claim?: ClaimEnvelope; passedHeadline?: string }): void {
  const code = verdictExitCode(report);
  const reasons = untrustedReasons(report);
  const claim = opts.claim && code !== 0 ? envelopeForFailedVerification(opts.claim, code === 1) : opts.claim;
  if (opts.json) {
    const result = opts.result ?? report;
    console.log(JSON.stringify(claim ? withClaimFields(result, claim) : result, null, 2));
  } else {
    // CLI-11: an intact artifact whose signer is only unpinned did not fail; it is not trusted yet, and the pin is named.
    const refused = report.issuerAdmission.signatures.filter((signature) => signature.status !== "admitted");
    const onlyUnpinned = code === 1 && report.integrity.status === "pass" && refused.length > 0 && refused.every((signature) => signature.status === "not-pinned");
    // UX-05: a command may say in words what it checked instead of a bare PASSED beside an unevaluated claim.
    console.log(code === 0 ? chalk.green(opts.passedHeadline ?? `${label} verification PASSED`)
      : code === 2 ? chalk.yellow(`${label} integrity verified, UNTRUSTED`)
        : onlyUnpinned ? chalk.yellow(`${label} integrity verified, NOT TRUSTED: the signer's public key is not pinned`) : chalk.red(`${label} verification FAILED`));
    if (claim) printClaimResult(claim, {});
    for (const line of code === 0 ? opts.details ?? [] : reasons.map((reason) => `- ${reason}`)) console.log(line);
    if (onlyUnpinned && refused.some((signature) => signature.purpose === "artifact-seal")) for (const line of folderKeyHint(process.cwd())) console.log(chalk.gray(line));
  }
  if (code === 2) untrusted(reasons, report.overrides);
  if (code !== 0) process.exit(code);
}

/**
 * CLI-11: how to pin a signer without treating the key stored next to the records as a trust root. A check against that
 * key shows only that the file matches the key kept in this folder; whoever can change the records can replace the key
 * too. So the hint gives its sha256 to compare with one recorded outside the folder, and never recommends it alone.
 */
function folderKeyHint(workspace: string): string[] {
  const path = join(workspace, ".amc", "keys", "artifact-seal.pub");
  const general = "Next: pass --pubkey with the signer's public key obtained outside this folder (for someone else's file, the key they gave you), or a signed trust list with --trust-list.";
  if (!existsSync(path)) return [general];
  return [general,
    `This folder keeps its own signing key at .amc/keys/artifact-seal.pub (sha256 ${sha256Hex(readFileSync(path))}). Checking against it shows only that the file`
      + " matches the key kept in this folder, and anyone who can change the records here can replace that key too. Pass it as --pubkey only after comparing"
      + " that sha256 with one you recorded outside this folder."];
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
 * Payloads not evaluated (B1: a locked vault) are 1 whatever the flags: integrity was not verified.
 */
export function ledgerExitCode(result: { ok: boolean; trustRoot: { anchored: boolean; monitorAdmission?: IssuerAdmission };
  payloadsNotEvaluated?: readonly string[] }, trust: TrustContext): 0 | 1 | 2 {
  if (!result.ok || (result.payloadsNotEvaluated?.length ?? 0) > 0) return 1;
  if (result.trustRoot.anchored) return 0;
  if (!trust.allowUnanchored || (result.trustRoot.monitorAdmission && isKeyRefused(result.trustRoot.monitorAdmission))) return 1;
  untrusted(["ledger UNANCHORED: the monitor key was read from the workspace being verified (internal consistency only)"], ["allow-unanchored"]);
  return 2;
}

/**
 * verify all and evidence verify, after no FAIL: exit 2 when the ledger was only allowed unanchored, 1 when INCOMPLETE.
 * A skipped ledger hash chain (B1: payloads not evaluated) is 1 before --allow-unanchored can make it 2.
 */
export function verifyAllExit(out: { status?: string; skippedCritical?: readonly string[]; checks: ReadonlyArray<{ id: string; status: string }> },
  trust: TrustContext): void {
  const incomplete = () => {
    console.error(`INCOMPLETE: critical checks not performed: ${(out.skippedCritical ?? []).join(", ")}`);
    process.exit(1);
  };
  if (out.checks.some((check) => check.id === "ledger-hash-chain" && check.status === "SKIP")) incomplete();
  const anchored = out.checks.some((check) => check.id === "ledger-trust-root" && check.status === "PASS");
  const code = ledgerExitCode({ ok: true, trustRoot: { anchored } }, trust);
  if (code !== 0) process.exit(code);
  // A skipped critical check was never performed: withhold PASS rather than exit 0 on it (WP37).
  if (out.status === "INCOMPLETE") incomplete();
}
