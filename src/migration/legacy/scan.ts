/**
 * `amc verify --relabel-legacy` (P1-35): finds the 1.x results in a workspace and in files named with --path,
 * appends one relabel record per result not yet recorded under the current notice, and writes a signed migration
 * receipt. It reads originals and never writes them: the ledger opens read-only, bundles and certificates are
 * extracted to temporary folders, and the only writes are the relabel log and the receipt. It never walks beyond
 * the workspace locations below and the named files, and never calls `amc verify --repair`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { inspectCertificate } from "../../assurance/certificate.js";
import { inspectEvidenceBundle } from "../../bundles/bundle.js";
import { signDigestWithPolicy } from "../../crypto/signing/signer.js";
import { openLedger } from "../../ledger/ledger.js";
import { sha256Hex } from "../../utils/hash.js";
import { amcVersion } from "../../version.js";
import { classifyLegacyArtifact, LEGACY_ARTIFACT_KINDS, type LegacyArtifactKind, type LegacyClassification } from "./classify.js";
import { CURRENT_LEGACY_NOTICE } from "./notices.js";
import { originalsDigest, signReceipt, writeReceipt, type MigrationReceipt } from "./receipt.js";
import { appendRelabelLines, chainRecords, RELABEL_LOG, verifyRelabelLog, type RelabelRecord } from "./relabelLog.js";

interface Scanned { kind: LegacyArtifactKind; locator: string; sha256: string | null; found: LegacyClassification | null; skip?: string }

export interface RelabelRun { receipt: MigrationReceipt; records: RelabelRecord[]; receiptPath: string | null }

const UNVERSIONED = "records no AMC version or claim envelope, so 1.x and 1.2 cannot be told apart; readers print it self-reported";
const posix = (path: string) => path.split(sep).join("/");
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

function jsonFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".json")).sort().map((name) => join(dir, name)) : [];
}

/** Diagnostic runs and assurance reports, at the root and under each agent. */
function workspaceFiles(workspace: string): Array<{ kind: LegacyArtifactKind; path: string }> {
  const amc = join(workspace, ".amc");
  const agentsDir = join(amc, "agents");
  const roots = [amc, ...(existsSync(agentsDir) ? readdirSync(agentsDir).sort().map((id) => join(agentsDir, id)) : [])];
  return roots.flatMap((root) => [
    ...jsonFiles(join(root, "runs")).map((path) => ({ kind: "diagnostic_report" as const, path })),
    ...jsonFiles(join(root, "reports", "assurance")).map((path) => ({ kind: "assurance_report" as const, path }))
  ]);
}

/** One entry per ledger session; `sha256` covers the session's event hashes in ledger order. */
function ledgerSessions(workspace: string): Scanned[] {
  if (!existsSync(join(workspace, ".amc", "evidence.sqlite"))) return [];
  const ledger = openLedger(workspace, { readonly: true });
  try {
    const sessions = ledger.db.prepare(`SELECT e.session_id AS id, COALESCE(s.binary_path, '') AS binaryPath
      FROM (SELECT DISTINCT session_id FROM evidence_events) e LEFT JOIN sessions s ON s.session_id = e.session_id
      ORDER BY e.session_id`).all() as Array<{ id: string; binaryPath: string }>;
    const events = ledger.db.prepare("SELECT event_hash, meta_json FROM evidence_events WHERE session_id = ? ORDER BY rowid");
    // ponytail: one session's events in memory at a time; page them if a single session outgrows that.
    return sessions.map((session) => {
      const rows = events.all(session.id) as Array<{ event_hash: string; meta_json: string }>;
      return { kind: "ledger_session" as const, locator: `ledger-session:${session.id}`,
        sha256: sha256Hex(rows.map((row) => row.event_hash).join("\n")),
        found: classifyLegacyArtifact("ledger_session", { binaryPath: session.binaryPath, events: rows }) };
    });
  } finally {
    ledger.close();
  }
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function jsonKind(parsed: Record<string, unknown>): LegacyArtifactKind | null {
  if (parsed.type === "amc-trust-certificate") return "trust_certificate";
  if (typeof parsed.assuranceRunId === "string") return "assurance_report";
  if (Array.isArray(parsed.layerScores)) return "diagnostic_report";
  if (Array.isArray(parsed.categories) && typeof parsed.framework === "string") return "compliance_report";
  return null;
}

/** A file named with --path: its kind from its extension or content. Reads it; never writes it. */
function scanPath(workspace: string, given: string): Scanned {
  const path = resolve(workspace, given);
  const inside = relative(workspace, path);
  const locator = inside.startsWith("..") || isAbsolute(inside) ? path : posix(inside);
  const ext = extname(path).toLowerCase();
  let kind: LegacyArtifactKind = ext === ".amcbundle" ? "bundle" : ext === ".amccert" ? "trust_certificate"
    : ext === ".amcpass" ? "passport" : ext === ".json" ? "diagnostic_report" : "domain_report";
  try {
    const sha256 = sha256Hex(readFileSync(path));
    let found: LegacyClassification | null = null;
    if (kind === "bundle") {
      found = classifyLegacyArtifact(kind, inspectEvidenceBundle(path).run);
    } else if (kind === "trust_certificate") {
      let run: unknown = null;
      try {
        run = inspectCertificate(path).run;
      } catch {
        // Not a diagnostic certificate: assurance certificates carry no run.
      }
      if (run) found = classifyLegacyArtifact(kind, run);
      else kind = "assurance_certificate";
    } else if (kind === "diagnostic_report") {
      const parsed = readJson(path) as Record<string, unknown>;
      const detected = parsed && typeof parsed === "object" ? jsonKind(parsed) : null;
      if (!detected) return { kind, locator, sha256, found: null, skip: "not a result AMC recognises" };
      kind = detected;
      found = classifyLegacyArtifact(kind, parsed);
    } else if (kind === "domain_report") {
      found = classifyLegacyArtifact(kind, readFileSync(path, "utf8"));
    }
    const unversioned = kind === "passport" || kind === "assurance_certificate" || (kind === "trust_certificate" && ext === ".json");
    return { kind, locator, sha256, found, ...(found ? {} : { skip: unversioned ? UNVERSIONED : "not a 1.x result" }) };
  } catch (error) {
    return { kind, locator, sha256: null, found: null, skip: `could not read: ${errorText(error)}` };
  }
}

function scanWorkspace(workspace: string): Scanned[] {
  const files = workspaceFiles(workspace).map(({ kind, path }): Scanned => {
    const locator = posix(relative(workspace, path));
    try {
      const bytes = readFileSync(path);
      return { kind, locator, sha256: sha256Hex(bytes), found: classifyLegacyArtifact(kind, JSON.parse(bytes.toString("utf8"))) };
    } catch (error) {
      return { kind, locator, sha256: null, found: null, skip: `could not read: ${errorText(error)}` };
    }
  });
  return [...ledgerSessions(workspace), ...files];
}

const zeroCounts = () => Object.fromEntries(LEGACY_ARTIFACT_KINDS.map((kind) => [kind, 0])) as Record<LegacyArtifactKind, number>;

/**
 * Scans, appends the new relabel records and writes the signed receipt; with `dryRun` it writes nothing. Idempotent:
 * a result already recorded under this notice version (same sha256) is not recorded again. A broken relabel log or a
 * failed signature stops the run before anything is written.
 */
export function relabelLegacyArtifacts(workspace: string,
  options: { dryRun?: boolean; paths?: readonly string[]; now?: () => Date } = {}): RelabelRun {
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const log = verifyRelabelLog(workspace);
  if (!log.ok) throw new Error(`${RELABEL_LOG} is broken at line ${log.line} (${log.reason}); nothing was written`);
  const notice = CURRENT_LEGACY_NOTICE;
  const recorded = new Set(log.records.filter((row) => row.noticeId === notice.id && row.noticeVersion === notice.version)
    .map((row) => row.artifact.sha256));
  const scanned = [...scanWorkspace(workspace), ...(options.paths ?? []).map((path) => scanPath(workspace, path))];

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
      rule: item.found.rule, recordedAt, recordedBy: { tool: "agent-maturity-compass", version: amcVersion }
    });
  }
  const chain = chainRecords(log.head, log.records.length + 1, drafts);
  const receipt: MigrationReceipt = {
    v: 1, noticeId: notice.id, noticeVersion: notice.version, startedAt, finishedAt: now().toISOString(),
    scanned: counts.scanned, relabelled: counts.relabelled,
    skipped: scanned.flatMap((item) => item.skip ? [{ locator: item.locator, reason: item.skip }] : []),
    relabelLogHead: chain.head,
    originalsDigest: originalsDigest(scanned.flatMap((item) => item.sha256 ? [item.sha256] : []))
  };
  const records = chain.lines.map((line) => JSON.parse(line) as RelabelRecord);
  if (options.dryRun) return { receipt, records, receiptPath: null };

  const out = signReceipt(workspace, receipt, (digestHex) => signDigestWithPolicy({ workspace, kind: "MIGRATION_RECEIPT", digestHex }));
  appendRelabelLines(workspace, chain.lines);
  writeReceipt(workspace, out);
  return { receipt, records, receiptPath: out.path };
}
