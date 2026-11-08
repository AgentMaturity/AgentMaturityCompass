/**
 * `amc session export` and `amc session verify-export` (SH-TRUST-06): one sealed native session as a self-contained
 * signed bundle, verified elsewhere with the file and a pinned monitor fingerprint. Registered from
 * `registerSessionCommands`; the logic lives in src/evidence/sessionExport.ts.
 */
import type { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { finishVerify, trustFromFlags, withTrustFlags, type TrustFlags } from "./cli-trust-flags.js";
import { admitKey, buildVerifierReport } from "./trust/index.js";
import { fileSha256 } from "./trust/signatureCheck.js";
import { sha256Hex } from "./utils/hash.js";

export function registerSessionExportCommands(session: Command): void {
  session
    .command("export")
    .description("Export one sealed session as a self-contained signed bundle (rows, seal, monitor keys) for offline verification")
    .argument("<id>", "session id")
    .requiredOption("--out <path>", "file to write the bundle to")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { out: string; json?: boolean }) => {
      const { exportSessionBundle } = await import("./evidence/sessionExport.js");
      try {
        const bundle = exportSessionBundle({ workspace: process.cwd(), sessionId: id });
        const outFile = resolve(opts.out);
        writeFileSync(outFile, `${JSON.stringify(bundle, null, 2)}\n`, { mode: 0o600 });
        const fingerprint = bundle.descriptor.monitorKeyFingerprint;
        if (opts.json) { console.log(JSON.stringify({ outFile, sessionId: id, eventCount: bundle.rows.length, monitorKeyFingerprint: fingerprint }, null, 2)); return; }
        console.log(chalk.green(`Wrote ${outFile}`));
        // The fingerprint must travel out of band: a bundle that carries its own trust anchor proves only self-consistency.
        console.log(chalk.gray("  monitor key fingerprint (share out of band):"));
        console.log(`  ${fingerprint}`);
      } catch (error) {
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  withTrustFlags(session
    .command("verify-export")
    .description("Verify an exported session bundle offline: needs only the file and a pinned monitor fingerprint")
    .argument("<file>", "bundle path")
    .option("--json", "Output as JSON"), { expectMonitor: true, ledgerOnly: true })
    .action(async (file: string, opts: TrustFlags) => {
      if (opts.expectMonitor === undefined || opts.expectMonitor.trim() === "") {
        console.error(chalk.red("--expect-monitor <sha256> is required: the fingerprint must come from outside the bundle"));
        process.exit(1);
      }
      const { verifySessionExport } = await import("./evidence/sessionExport.js");
      const path = resolve(file);
      let bundle: unknown;
      try { bundle = JSON.parse(readFileSync(path, "utf8")); } catch (error) {
        console.error(chalk.red(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`)); process.exit(1);
      }
      const verdict = verifySessionExport({ bundle, expectedMonitorFingerprint: opts.expectMonitor });
      // trustFromFlags pins --expect-monitor for ledger-row; admitKey adds the operator's distrust and trust lists, so a
      // distrusted or revoked monitor key fails even when its fingerprint matches.
      const context = trustFromFlags(opts, ["ledger-row"]);
      const keyPem = verdict.monitorPublicKeyPem;
      const report = buildVerifierReport({ artifact: { kind: "session-export", path, sha256: fileSha256(path) }, context,
        integrityErrors: verdict.errors, anchoring: { status: "not-applicable", detail: null },
        signatures: [admitKey({ publicKeyPem: keyPem, purpose: "ledger-row", signature: "session rows and seal", context })] });
      finishVerify("Session export", report, { json: opts.json, result: { ...verdict, ok: report.trusted, report },
        details: verdict.sessionId === null ? [] : [`  session ${verdict.sessionId}: ${verdict.eventCount} rows, descriptor ${verdict.descriptorSha256}`,
          `  monitor key ${keyPem === null ? "none" : sha256Hex(Buffer.from(keyPem, "utf8"))}`] });
    });
}
