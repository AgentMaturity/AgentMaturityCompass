/**
 * `amc session export` and `amc session verify-export` (SH-OBS-03). Registered on the existing `session` group.
 * The verifier admits the embedded key through the same trust path as `session verify-proof` (pin, distrust and
 * revocation lists), so a distrusted key fails even when its fingerprint matches (P0-51).
 */
import type { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { finishVerify, trustFromFlags, withTrustFlags, type TrustFlags } from "./cli-trust-flags.js";
import type { ExtractedSessionExport } from "./observability/sessionExportHtml.js";
import { admitKey, buildVerifierReport, withPins } from "./trust/index.js";
import { fileSha256 } from "./trust/signatureCheck.js";

export function registerSessionExportCommands(session: Command): void {
  session
    .command("export")
    .description("Export a session as a self-contained HTML viewer (digests only unless --include-content), verifiable offline")
    .argument("<id>", "session id")
    .requiredOption("--out <path>", "HTML file to write")
    .option("--include-content", "Embed message, tool argument and output text (redacted, bounded; refused when payloads are encrypted)")
    .option("--json-out <path>", "Also write the export document as JSON")
    .action(async (id: string, opts: { out: string; includeContent?: boolean; jsonOut?: string }) => {
      const { buildSessionExport } = await import("./observability/sessionExport.js");
      const { renderSessionExportHtml } = await import("./observability/sessionExportHtml.js");
      try {
        const doc = buildSessionExport({ workspace: process.cwd(), sessionId: id, includeContent: opts.includeContent === true });
        writeFileSync(resolve(opts.out), renderSessionExportHtml(doc));
        if (opts.jsonOut !== undefined) writeFileSync(resolve(opts.jsonOut), JSON.stringify(doc, null, 2));
        console.log(chalk.green(`Wrote ${resolve(opts.out)} (${doc.rows.length} rows, ${doc.content === null ? "digests only" : "content included"}, tail ${doc.record?.ended_ts != null ? "sealed" : "unproven"})`));
        // The fingerprint must travel out of band, not inside the file it authenticates.
        console.log(chalk.gray("  monitor key fingerprint (share out of band; verify with --expect-monitor):"));
        console.log(`    ${doc.monitorKeyFingerprint}`);
      } catch (error) {
        console.error(chalk.red(`Export refused: ${error instanceof Error ? error.message : String(error)}`));
        process.exitCode = 1;
      }
    });

  withTrustFlags(session
    .command("verify-export")
    .description("Verify an exported session file offline against a pinned monitor key fingerprint")
    .argument("<file>", "HTML or JSON export")
    .option("--accept-unverifiable-content", "Accept redacted, truncated or spilled content entries as display-only (they cannot be checked against their digests)")
    .option("--json", "Output as JSON"), { expectMonitor: true, ledgerOnly: true })
    .action(async (file: string, opts: TrustFlags & { acceptUnverifiableContent?: boolean }) => {
      const { verifySessionExport } = await import("./observability/sessionExport.js");
      const { extractSessionExportJson } = await import("./observability/sessionExportHtml.js");
      if (opts.expectMonitor === undefined) {
        console.error(chalk.red("verify-export needs --expect-monitor <sha256>: a file cannot vouch for its own key."));
        process.exit(1);
        return;
      }
      const path = resolve(file);
      const text = readFileSync(path, "utf8");
      const parseJson = (): ExtractedSessionExport => { try { return { doc: JSON.parse(text) as unknown, error: null }; } catch { return { doc: null, error: "the file is not valid JSON" }; } };
      const extracted = text.trimStart().startsWith("{") ? parseJson() : extractSessionExportJson(text);
      const doc = extracted.doc;
      const checked = verifySessionExport(doc, { expectedFingerprint: opts.expectMonitor, acceptUnverifiableContent: opts.acceptUnverifiableContent === true });
      const verdict = extracted.error === null ? checked : { ...checked, ok: false, errors: [extracted.error, ...checked.errors] };
      const trust = trustFromFlags(opts, ["ledger-row"]);
      const pinned = /^[0-9a-f]{64}$/i.test(opts.expectMonitor) ? opts.expectMonitor.toLowerCase() : null;
      const context = pinned === null ? trust : withPins(trust, [{ keyId: pinned, purposes: ["ledger-row"], origin: "--expect-monitor" }]);
      const pem = doc && typeof doc === "object" && typeof (doc as { monitorPublicKeyPem?: unknown }).monitorPublicKeyPem === "string" ? (doc as { monitorPublicKeyPem: string }).monitorPublicKeyPem : null;
      const report = buildVerifierReport({ artifact: { kind: "session-export", path, sha256: fileSha256(path) }, context, integrityErrors: verdict.errors,
        anchoring: { status: "not-applicable", detail: null },
        signatures: [admitKey({ publicKeyPem: pem, purpose: "ledger-row", signature: "session rows and seal", context })],
        warnings: verdict.tail === "unproven" ? ["session is open or released: the tail is not sealed, so a truncated row list cannot be detected"] : [] });
      finishVerify("Session export", report, { json: opts.json, result: { ...verdict, ok: report.trusted, report },
        details: [`rows checked: ${verdict.rowsChecked}; tail ${verdict.tail}; content verified ${verdict.content.verified}, unverifiable (redacted, truncated or spilled) ${verdict.content.unverifiable}${verdict.content.unverifiable > 0 && opts.acceptUnverifiableContent === true ? " (accepted as display-only)" : ""}, unavailable ${verdict.content.unavailable}`] });
    });
}
