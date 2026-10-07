/**
 * `amc verify --relabel-legacy` (P1-35): finds the 1.x results in a workspace and in files named with --path,
 * appends one relabel record per result not yet recorded under the current notice, and writes a signed migration
 * receipt. It reads originals and never writes them: the ledger opens read-only, bundles and certificates are
 * extracted to temporary folders by their own verifiers, and the only writes are the relabel log and the receipt.
 * It never walks beyond the workspace locations below and the named files, and never calls `amc verify --repair`.
 *
 * Integrity first: the ledger must verify before its sessions are classified, and each run, bundle and certificate
 * goes through AMC's own verifier. A failed check is reported, never dropped: an artifact that fails is skipped as
 * "integrity check failed" when its content cannot be read, and recorded as integrityFailed when it is a 1.x result.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { inspectAssuranceCertificate } from "../../assurance/assuranceCertificates.js";
import { verifyCertificate } from "../../assurance/certificate.js";
import { verifyEvidenceBundle } from "../../bundles/bundle.js";
import { signDigestWithPolicy } from "../../crypto/signing/signer.js";
import { sealedRunReportVerifies } from "../../diagnostic/reportSeal.js";
import { openLedger, verifyLedgerIntegrity, type VerifyResult } from "../../ledger/ledger.js";
import { untrustedReasons, type TrustContext, type VerifierReportV1 } from "../../trust/index.js";
import { isKeyRefused } from "../../trust/signatureCheck.js";
import type { DiagnosticReport } from "../../types.js";
import { sha256Hex } from "../../utils/hash.js";
import { amcVersion } from "../../version.js";
import { classifyLegacyArtifact, LEGACY_ARTIFACT_KINDS, type LegacyArtifactKind, type LegacyClassification } from "./classify.js";
import { CURRENT_LEGACY_NOTICE } from "./notices.js";
import { originalsDigest, signReceipt, writeReceipt, type MigrationReceipt } from "./receipt.js";
import { appendRelabelLines, chainRecords, RELABEL_LOG, verifyRelabelLog, type RelabelRecord } from "./relabelLog.js";

type Integrity = RelabelRecord["integrity"];
interface Scanned {
  kind: LegacyArtifactKind; locator: string; sha256: string | null; found: LegacyClassification | null; integrity: Integrity;
  skip?: string;
}

export interface RelabelOptions {
  /** The verifier's trust: issuer pins for bundles and certificates, and the ledger's monitor anchor. */
  trust: TrustContext;
  /** The ledger check the caller already ran with `trust`; run here when absent. */
  ledgerCheck?: VerifyResult;
  dryRun?: boolean;
  paths?: readonly string[];
  now?: () => Date;
}
export interface RelabelRun { receipt: MigrationReceipt; records: RelabelRecord[]; receiptPath: string | null }

const NOT_CHECKED: Integrity = { status: "notChecked", trusted: null, reasons: [] };
const UNVERSIONED = "records no AMC version or claim envelope, so 1.x and 1.2 cannot be told apart; readers print it self-reported";
const posix = (path: string) => path.split(sep).join("/");
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const failed = (reasons: string[], trusted: boolean | null = false): Integrity => ({ status: "integrityFailed", trusted, reasons });

/** A failed check whose content gave no 1.x answer is skipped with its reason, never counted as "not 1.x". */
function settle(item: Scanned, notLegacy: string | null): Scanned {
  if (item.found || item.skip) return item;
  if (item.integrity.status === "integrityFailed") return { ...item, skip: `integrity check failed: ${item.integrity.reasons.join("; ")}` };
  return notLegacy ? { ...item, skip: notLegacy } : item;
}

/** A diagnostic run or assurance report seal, checked against this workspace's auditor keys. */
function sealIntegrity(workspace: string, parsed: Record<string, unknown>): Integrity {
  return sealedRunReportVerifies(workspace, parsed) ? { status: "verified", trusted: null, reasons: [] }
    : failed(["the run seal does not verify against this workspace's auditor keys"], null);
}

function reportIntegrity(report: VerifierReportV1): Integrity {
  return { status: report.integrity.status === "pass" ? "verified" : "integrityFailed", trusted: report.trusted,
    reasons: untrustedReasons(report) };
}

/** A bundle or diagnostic certificate: classified from the run its own verifier read. A throw or no run is a failure. */
async function verifiedRun(kind: LegacyArtifactKind,
  verify: () => Promise<{ run: DiagnosticReport | null; report: VerifierReportV1 }>): Promise<Pick<Scanned, "found" | "integrity">> {
  try {
    const { run, report } = await verify();
    const integrity = reportIntegrity(report);
    if (!run) return { found: null, integrity: failed(integrity.reasons.length > 0 ? integrity.reasons : ["its run could not be read"]) };
    return { found: classifyLegacyArtifact(kind, run), integrity };
  } catch (error) {
    return { found: null, integrity: failed([errorText(error)]) };
  }
}

/** Positively an assurance certificate: it parses as one. Anything else named .amccert goes to the diagnostic verifier. */
function isAssuranceCertificate(path: string): boolean {
  try {
    inspectAssuranceCertificate(path);
    return true;
  } catch {
    return false;
  }
}

function jsonKind(parsed: Record<string, unknown>): LegacyArtifactKind | null {
  if (parsed.type === "amc-trust-certificate") return "trust_certificate";
  if (typeof parsed.assuranceRunId === "string") return "assurance_report";
  if (Array.isArray(parsed.layerScores)) return "diagnostic_report";
  if (Array.isArray(parsed.categories) && typeof parsed.framework === "string") return "compliance_report";
  return null;
}

function jsonFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".json")).sort().map((name) => join(dir, name)) : [];
}

/** A run or assurance report file: its seal, then its claim. Unparseable JSON is an integrity failure. */
function scanJson(workspace: string, kind: LegacyArtifactKind | null, locator: string, bytes: Buffer): Scanned {
  const sha256 = sha256Hex(bytes);
  let parsed: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(bytes.toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not a JSON object");
    parsed = value as Record<string, unknown>;
  } catch (error) {
    return { kind: kind ?? "diagnostic_report", locator, sha256, found: null, integrity: failed([errorText(error)], null) };
  }
  const detected = kind ?? jsonKind(parsed);
  if (!detected) return { kind: "diagnostic_report", locator, sha256, found: null, integrity: NOT_CHECKED, skip: "not a result AMC recognises" };
  if (detected === "trust_certificate") return { kind: detected, locator, sha256, found: null, integrity: NOT_CHECKED, skip: UNVERSIONED };
  const sealed = detected === "diagnostic_report" || detected === "assurance_report";
  return { kind: detected, locator, sha256, found: classifyLegacyArtifact(detected, parsed),
    integrity: sealed ? sealIntegrity(workspace, parsed) : NOT_CHECKED };
}

/** Diagnostic runs and assurance reports, at the root and under each agent. */
function scanWorkspaceFiles(workspace: string): Scanned[] {
  const amc = join(workspace, ".amc");
  const agentsDir = join(amc, "agents");
  const roots = [amc, ...(existsSync(agentsDir) ? readdirSync(agentsDir).sort().map((id) => join(agentsDir, id)) : [])];
  const files = roots.flatMap((root) => [
    ...jsonFiles(join(root, "runs")).map((path) => ({ kind: "diagnostic_report" as const, path })),
    ...jsonFiles(join(root, "reports", "assurance")).map((path) => ({ kind: "assurance_report" as const, path }))
  ]);
  return files.map(({ kind, path }) => {
    const locator = posix(relative(workspace, path));
    try {
      return settle(scanJson(workspace, kind, locator, readFileSync(path)), null);
    } catch (error) {
      return { kind, locator, sha256: null, found: null, integrity: NOT_CHECKED, skip: `could not read: ${errorText(error)}` };
    }
  });
}

/** Why the ledger cannot be relied on, or null: the rule `amc verify` exits by (fails, or unanchored without the allow flag). */
function ledgerFailure(check: VerifyResult, trust: TrustContext): string | null {
  if (!check.ok) return check.errors.slice(0, 3).join("; ") || "ledger verification failed";
  const admission = check.trustRoot.monitorAdmission;
  if (!check.trustRoot.anchored && (!trust.allowUnanchored || (admission && isKeyRefused(admission)))) {
    return "ledger UNANCHORED: the monitor key is not pinned";
  }
  return null;
}

/**
 * One entry per ledger session, after the ledger check. `sha256` covers the session's event hashes in ledger order.
 * When the ledger does not verify, every session is skipped with that reason and nothing in it is hashed or classified.
 */
function scanLedger(workspace: string, trust: TrustContext, check: VerifyResult | undefined): Scanned[] {
  if (!existsSync(join(workspace, ".amc", "evidence.sqlite"))) return [];
  const result = check ?? verifyLedgerIntegrity(workspace, { trust });
  const failure = ledgerFailure(result, trust);
  const ledger = openLedger(workspace, { readonly: true });
  try {
    const sessions = ledger.db.prepare(`SELECT e.session_id AS id, COALESCE(s.binary_path, '') AS binaryPath
      FROM (SELECT DISTINCT session_id FROM evidence_events) e LEFT JOIN sessions s ON s.session_id = e.session_id
      ORDER BY e.session_id`).all() as Array<{ id: string; binaryPath: string }>;
    if (failure) {
      return sessions.map((session) => ({ kind: "ledger_session" as const, locator: `ledger-session:${session.id}`, sha256: null,
        found: null, integrity: failed([failure]), skip: `integrity check failed: ${failure}` }));
    }
    const integrity: Integrity = !result.trustRoot.anchored
      ? { status: "verified", trusted: false, reasons: ["ledger UNANCHORED: allowed with --allow-unanchored"] }
      : { status: "verified", trusted: true, reasons: [] };
    const events = ledger.db.prepare("SELECT event_hash, meta_json FROM evidence_events WHERE session_id = ? ORDER BY rowid");
    // ponytail: one session's events in memory at a time; page them if a single session outgrows that.
    return sessions.map((session) => {
      const rows = events.all(session.id) as Array<{ event_hash: string; meta_json: string }>;
      return { kind: "ledger_session" as const, locator: `ledger-session:${session.id}`,
        sha256: sha256Hex(rows.map((row) => row.event_hash).join("\n")), integrity,
        found: classifyLegacyArtifact("ledger_session", { binaryPath: session.binaryPath, events: rows }) };
    });
  } finally {
    ledger.close();
  }
}

/** A file named with --path: its kind from its extension or content, checked by its verifier. Never writes it. */
async function scanPath(workspace: string, given: string, trust: TrustContext): Promise<Scanned> {
  const path = resolve(workspace, given);
  const inside = relative(workspace, path);
  const locator = inside.startsWith("..") || isAbsolute(inside) ? path : posix(inside);
  const ext = extname(path).toLowerCase();
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch (error) {
    return { kind: ext === ".amcbundle" ? "bundle" : ext === ".amcpass" ? "passport" : "domain_report", locator, sha256: null,
      found: null, integrity: NOT_CHECKED, skip: `could not read: ${errorText(error)}` };
  }
  const base = { locator, sha256: sha256Hex(bytes) };
  const NOT_LEGACY = "not a 1.x result";
  if (ext === ".amcbundle") {
    return settle({ ...base, kind: "bundle", ...await verifiedRun("bundle", async () => {
      const verdict = await verifyEvidenceBundle(path, trust);
      return { run: verdict.run, report: verdict.report };
    }) }, NOT_LEGACY);
  }
  if (ext === ".amccert") {
    if (isAssuranceCertificate(path)) return { ...base, kind: "assurance_certificate", found: null, integrity: NOT_CHECKED, skip: UNVERSIONED };
    return settle({ ...base, kind: "trust_certificate", ...await verifiedRun("trust_certificate", async () => {
      const capture: { run: DiagnosticReport | null } = { run: null };
      const verdict = await verifyCertificate({ certFile: path, trust, capture });
      return { run: capture.run, report: verdict.report };
    }) }, NOT_LEGACY);
  }
  if (ext === ".amcpass") return { ...base, kind: "passport", found: null, integrity: NOT_CHECKED, skip: UNVERSIONED };
  if (ext === ".json") return settle(scanJson(workspace, null, locator, bytes), NOT_LEGACY);
  return settle({ ...base, kind: "domain_report", found: classifyLegacyArtifact("domain_report", bytes.toString("utf8")),
    integrity: NOT_CHECKED }, NOT_LEGACY);
}

const zeroCounts = () => Object.fromEntries(LEGACY_ARTIFACT_KINDS.map((kind) => [kind, 0])) as Record<LegacyArtifactKind, number>;

/**
 * Scans, appends the new relabel records and writes the signed receipt; with `dryRun` it writes nothing. Idempotent:
 * a result already recorded under this notice version (same sha256) is not recorded again. A relabel log that fails
 * its chain or receipt check, or a receipt that cannot be signed, stops the run before anything is written.
 */
export async function relabelLegacyArtifacts(workspace: string, options: RelabelOptions): Promise<RelabelRun> {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const log = verifyRelabelLog(workspace);
  if (!log.ok) {
    throw new Error(`${RELABEL_LOG} failed its check${log.line === null ? "" : ` at line ${log.line}`}: ${log.reason}; nothing was written`);
  }
  const notice = CURRENT_LEGACY_NOTICE;
  const recorded = new Set(log.records.filter((row) => row.noticeId === notice.id && row.noticeVersion === notice.version)
    .map((row) => row.artifact.sha256));
  const scanned = [...scanLedger(workspace, options.trust, options.ledgerCheck), ...scanWorkspaceFiles(workspace)];
  for (const path of options.paths ?? []) scanned.push(await scanPath(workspace, path, options.trust));

  const counts = { scanned: zeroCounts(), relabelled: zeroCounts() };
  const recordedAt = now().toISOString();
  const drafts: Array<Omit<RelabelRecord, "v" | "seq" | "prevHash">> = [];
  for (const item of scanned) {
    counts.scanned[item.kind] += 1;
    if (!item.found || item.sha256 === null || recorded.has(item.sha256)) continue;
    recorded.add(item.sha256);
    counts.relabelled[item.kind] += 1;
    drafts.push({
      noticeId: item.found.noticeId, noticeVersion: item.found.noticeVersion,
      artifact: { kind: item.kind, locator: item.locator, sha256: item.sha256 },
      original: item.found.original,
      assigned: { claimKind: item.found.claimKind, legacy: true, levelCap: item.found.levelCap },
      integrity: item.integrity,
      rule: item.found.rule, recordedAt, recordedBy: { tool: "agent-maturity-compass", version: amcVersion }
    });
  }
  const chain = chainRecords(log.head, log.records.length + 1, drafts);
  const receipt: MigrationReceipt = {
    v: 1, noticeId: notice.id, noticeVersion: notice.version, startedAt, finishedAt: now().toISOString(),
    scanned: counts.scanned, relabelled: counts.relabelled,
    skipped: scanned.flatMap((item) => item.skip ? [{ locator: item.locator, reason: item.skip }] : []),
    relabelLogLines: log.records.length + chain.lines.length,
    relabelLogHead: chain.head,
    originalsDigest: originalsDigest(scanned.flatMap((item) => item.sha256 ? [item.sha256] : []))
  };
  const records = chain.lines.map((line) => JSON.parse(line) as RelabelRecord);
  if (options.dryRun) return { receipt, records, receiptPath: null };

  const out = signReceipt(workspace, receipt, (digestHex) => signDigestWithPolicy({ workspace, kind: "MIGRATION_RECEIPT", digestHex }));
  // ponytail: a crash between these two writes leaves lines no receipt attests, and the next run refuses; recovery is
  // the operator's call. A write-ahead intent record would let the next run finish the receipt instead.
  appendRelabelLines(workspace, chain.lines);
  writeReceipt(workspace, out);
  return { receipt, records, receiptPath: out.path };
}
