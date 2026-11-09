import type { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import chalk from "chalk";
import { finishVerify, trustFromFlags, withTrustFlags, type TrustFlags } from "./cli-trust-flags.js";
import { extractSessionExportJson, type ExtractedSessionExport } from "./observability/sessionExportHtml.js";
import { admitKey, buildVerifierReport } from "./trust/index.js";
import { sha256Hex } from "./utils/hash.js";

function isSealedBundle(doc: unknown): boolean {
  return doc !== null && typeof doc === "object" && "kind" in doc && doc.kind === "amc.session-export";
}

function exportExtension(path: string): string {
  return extname(path).toLowerCase();
}

function isHtmlExport(ext: string): boolean {
  return ext === ".html" || ext === ".htm";
}

/**
 * The extension picks the parser. HTML must match the viewer's canonical rendering. JSON with the legacy bundle
 * discriminator retains its original parsing rules. Viewer JSON must match the canonical `--json-out` form.
 */
export function parseSessionExportFile(path: string, text: string): ExtractedSessionExport {
  const ext = exportExtension(path);
  if (isHtmlExport(ext)) return extractSessionExportJson(text);
  if (ext !== ".json") return { doc: null, error: `unsupported export file extension ${ext || "(none)"}: use .html, .htm or .json` };
  let doc: unknown;
  try { doc = JSON.parse(text); } catch { return { doc: null, error: "the file is not valid JSON" }; }
  if (!isSealedBundle(doc) && JSON.stringify(doc, null, 2) !== text) {
    return { doc: null, error: "the file is not the canonical --json-out form of its document: it was edited or reformatted" };
  }
  return { doc, error: null };
}

interface ExportOptions {
  out: string;
  json?: boolean;
  includeContent?: boolean;
  decryptContent?: boolean;
  jsonOut?: string;
}

async function writeSessionExport(id: string, opts: ExportOptions): Promise<void> {
  const outFile = resolve(opts.out);
  const ext = exportExtension(outFile);
  const workspace = process.cwd();
  let monitorKeyFingerprint: string;
  let eventCount: number;
  let description = "";
  let metadataNote = false;
  if (ext === ".json") {
    if (opts.includeContent || opts.decryptContent || opts.jsonOut !== undefined) {
      throw new Error("The viewer options require an .html or .htm --out path. A .json --out path writes the sealed bundle.");
    }
    const { exportSessionBundle } = await import("./evidence/sessionExport.js");
    const bundle = exportSessionBundle({ workspace, sessionId: id });
    writeFileSync(outFile, `${JSON.stringify(bundle, null, 2)}\n`, { mode: 0o600 });
    monitorKeyFingerprint = bundle.descriptor.monitorKeyFingerprint;
    eventCount = bundle.rows.length;
  } else {
    if (!isHtmlExport(ext)) throw new Error("Choose an .html, .htm or .json --out path.");
    if (opts.jsonOut !== undefined && exportExtension(opts.jsonOut) !== ".json") throw new Error("--json-out requires a .json path.");
    const { buildSessionExport } = await import("./observability/sessionExport.js");
    const { renderSessionExportHtml } = await import("./observability/sessionExportHtml.js");
    const doc = buildSessionExport({ workspace, sessionId: id, includeContent: opts.includeContent === true, decryptContent: opts.decryptContent === true });
    writeFileSync(outFile, renderSessionExportHtml(doc), { mode: 0o600 });
    if (opts.jsonOut !== undefined) writeFileSync(resolve(opts.jsonOut), JSON.stringify(doc, null, 2), { mode: 0o600 });
    monitorKeyFingerprint = doc.monitorKeyFingerprint;
    eventCount = doc.rows.length;
    metadataNote = doc.content === null;
    description = ` (${eventCount} rows, ${metadataNote ? "payload digests only" : "content included"}, tail ${doc.record?.ended_ts != null ? "sealed" : "unproven"})`;
  }
  if (opts.json) {
    console.log(JSON.stringify({ outFile, sessionId: id, eventCount, monitorKeyFingerprint }, null, 2));
    return;
  }
  console.log(chalk.green(`Wrote ${outFile}${description}`));
  if (metadataNote) console.log(chalk.gray("  signed row metadata is embedded verbatim: provider failure messages, approval questions and answer reasons included"));
  console.log(chalk.gray("  monitor key fingerprint (share out of band; verify with --expect-monitor):"));
  console.log(`  ${monitorKeyFingerprint}`);
}

async function checkSessionExport(path: string, extracted: ExtractedSessionExport, pin: string, acceptUnverifiableContent: boolean) {
  const { doc } = extracted;
  if (exportExtension(path) === ".json" && isSealedBundle(doc)) {
    const { verifySessionExport } = await import("./evidence/sessionExport.js");
    const verdict = verifySessionExport({ bundle: doc, expectedMonitorFingerprint: pin });
    const pem = verdict.monitorPublicKeyPem;
    const details = verdict.sessionId === null ? [] : [
      `  session ${verdict.sessionId}: ${verdict.eventCount} rows, descriptor ${verdict.descriptorSha256}`,
      `  monitor key ${pem === null ? "none" : sha256Hex(pem)}`
    ];
    return { verdict, pem, details, warnings: [] };
  }
  const { verifySessionExport } = await import("./observability/sessionExport.js");
  const checked = verifySessionExport(doc, { expectedFingerprint: pin, acceptUnverifiableContent });
  const verdict = extracted.error === null ? checked : { ...checked, ok: false, errors: [extracted.error, ...checked.errors] };
  const pem = doc !== null && typeof doc === "object" && "monitorPublicKeyPem" in doc && typeof doc.monitorPublicKeyPem === "string"
    ? doc.monitorPublicKeyPem : null;
  const { verified, unverifiable, unavailable } = verdict.content;
  const accepted = unverifiable > 0 && acceptUnverifiableContent ? " (accepted as display-only)" : "";
  const details = [`rows checked: ${verdict.rowsChecked}; tail ${verdict.tail}; content verified ${verified}, unverifiable (redacted, truncated or spilled) ${unverifiable}${accepted}, unavailable ${unavailable}`];
  const warnings = extracted.error === null && verdict.tail === "unproven"
    ? ["session is open or released: the tail is not sealed, so a truncated row list cannot be detected"] : [];
  return { verdict, pem, details, warnings };
}

export function registerSessionExportCommands(session: Command): void {
  session
    .command("export")
    .description("Export a session for offline verification as an HTML viewer or a sealed JSON bundle")
    .argument("<id>", "session id")
    .requiredOption("--out <path>", ".html or .htm for a viewer, .json for a sealed bundle")
    .option("--json", "Print the export result as JSON")
    .option("--include-content", "Embed redacted, bounded message and tool text in the viewer, unless ledger payload encryption is enabled")
    .option("--decrypt-content", "With --include-content, allow decrypting encrypted blobs or spills for the viewer")
    .option("--json-out <path>", "Also write the viewer's document to this .json file")
    .action(async (id: string, opts: ExportOptions) => {
      try { await writeSessionExport(id, opts); }
      catch (error) {
        console.error(chalk.red(`Export refused: ${error instanceof Error ? error.message : String(error)}`));
        process.exitCode = 1;
      }
    });

  withTrustFlags(session
    .command("verify-export")
    .description("Verify an exported session offline against a pinned monitor key fingerprint")
    .argument("<file>", "an .html or .htm viewer, a sealed .json bundle, or the .json written by --json-out")
    .option("--accept-unverifiable-content", "Accept redacted, truncated or spilled viewer content as display-only")
    .option("--json", "Output as JSON"), { expectMonitor: true, ledgerOnly: true })
    .action(async (file: string, opts: TrustFlags & { acceptUnverifiableContent?: boolean }) => {
      const pin = opts.expectMonitor?.trim().toLowerCase();
      if (pin === undefined || !/^[0-9a-f]{64}$/.test(pin)) {
        console.error(chalk.red("--expect-monitor <sha256> is required and must be a 64-hex fingerprint obtained out of band"));
        process.exit(1);
      }
      const path = resolve(file);
      let bytes: Buffer;
      try { bytes = readFileSync(path); }
      catch (error) {
        console.error(chalk.red(`Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
      const text = bytes.toString("utf8");
      const extracted = Buffer.from(text, "utf8").equals(bytes)
        ? parseSessionExportFile(path, text) : { doc: null, error: "the file is not valid UTF-8" };
      const { verdict, pem, details, warnings } = await checkSessionExport(path, extracted, pin, opts.acceptUnverifiableContent === true);
      const context = trustFromFlags({ ...opts, expectMonitor: pin }, ["ledger-row"]);
      const report = buildVerifierReport({ artifact: { kind: "session-export", path, sha256: sha256Hex(bytes) }, context,
        integrityErrors: verdict.errors, anchoring: { status: "not-applicable", detail: null }, warnings,
        signatures: [admitKey({ publicKeyPem: pem, purpose: "ledger-row", signature: "session rows and seal", context })] });
      finishVerify("Session export", report, { json: opts.json, result: { ...verdict, ok: report.trusted, report }, details });
    });
}
