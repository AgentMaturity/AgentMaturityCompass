import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { openLedger } from "../ledger/ledger.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";

export type EvidenceExportFormat = "json" | "csv" | "pdf";

export interface EvidenceExportRecord {
  eventId: string;
  ts: number;
  isoTs: string;
  sessionId: string;
  runtime: string;
  eventType: string;
  actorId: string;
  payloadSha256: string;
  prevEventHash: string;
  eventHash: string;
  writerSignature: string;
  chainIndex: number;
  chainValid: boolean;
  chainExpectedPrevHash: string;
  incidentIds: string[];
  correctionIds: string[];
  correctionStatuses: string[];
  corrected: boolean;
  correctedTs: number | null;
  rationale: string | null;
  rationaleChain: string[];
  meta: Record<string, unknown>;
}

export interface VerifierEvidenceDataset {
  schemaVersion: 1;
  generatedTs: number;
  workspace: string;
  agentFilter: string | null;
  includeChain: boolean;
  includeRationale: boolean;
  eventCount: number;
  chainInvalidCount: number;
  records: EvidenceExportRecord[];
}

export interface CollectVerifierEvidenceParams {
  workspace: string;
  agentId?: string;
  includeChain?: boolean;
  includeRationale?: boolean;
}

export interface ExportVerifierEvidenceParams extends CollectVerifierEvidenceParams {
  format: EvidenceExportFormat;
  outFile: string;
}

export interface ExportVerifierEvidenceResult {
  outFile: string;
  format: EvidenceExportFormat;
  eventCount: number;
  chainInvalidCount: number;
  sha256: string;
}

interface EvidenceRow {
  rowid: number;
  id: string;
  ts: number;
  session_id: string;
  runtime: string;
  event_type: string;
  payload_sha256: string;
  meta_json: string;
  prev_event_hash: string;
  event_hash: string;
  writer_sig: string;
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(table) as { 1: number } | undefined;
  return row !== undefined;
}

function parseMeta(metaJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(metaJson) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      .map((entry) => entry.trim());
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }
  return [];
}

function firstString(meta: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function extractActorId(meta: Record<string, unknown>, fallback: string): string {
  return (
    firstString(meta, [
      "actorId",
      "actor_id",
      "agentId",
      "agent_id",
      "userId",
      "user_id",
      "ownerId",
      "owner_id",
      "subjectId",
      "subject_id"
    ]) ?? fallback
  );
}

function extractRationale(meta: Record<string, unknown>): { rationale: string | null; chain: string[] } {
  const rationale =
    firstString(meta, ["rationale", "reason", "justification", "explanation"]) ??
    firstString(meta, ["auditReason", "incidentReason", "verificationReason"]);
  const chainRaw = meta.rationaleChain ?? meta.reasoningChain ?? meta.rationale_chain;
  const chain = parseStringArray(chainRaw);
  if (rationale && !chain.includes(rationale)) {
    chain.unshift(rationale);
  }
  return { rationale, chain };
}

function normalizeCsvCell(value: string | number | boolean | null): string {
  const text = value === null ? "" : String(value);
  if (!/[",\r\n]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function escapePdfText(input: string): string {
  return input.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function renderPdfFromLines(lines: string[]): Buffer {
  const sliced = lines.map((line) => line.trimEnd()).slice(0, 110);
  const content = ["BT", "/F1 10 Tf", "40 810 Td"];
  let first = true;
  for (const line of sliced) {
    if (!first) {
      content.push("0 -13 Td");
    }
    first = false;
    content.push(`(${escapePdfText((line.length > 110 ? `${line.slice(0, 107)}...` : line) || " ")}) Tj`);
  }
  content.push("ET");

  const stream = content.join("\n");
  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += object;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

function incidentLinksByEvent(db: Database.Database): Map<string, Set<string>> {
  const links = new Map<string, Set<string>>();
  if (tableExists(db, "evidence_incident_links")) {
    const rows = db.prepare("SELECT event_id, incident_id FROM evidence_incident_links").all() as Array<{
      event_id: string;
      incident_id: string;
    }>;
    for (const row of rows) {
      if (!links.has(row.event_id)) {
        links.set(row.event_id, new Set());
      }
      links.get(row.event_id)!.add(row.incident_id);
    }
  }
  if (tableExists(db, "causal_edges")) {
    const rows = db.prepare("SELECT incident_id, from_event_id, to_event_id FROM causal_edges").all() as Array<{
      incident_id: string;
      from_event_id: string;
      to_event_id: string;
    }>;
    for (const row of rows) {
      if (row.from_event_id && row.from_event_id.length > 0) {
        if (!links.has(row.from_event_id)) {
          links.set(row.from_event_id, new Set());
        }
        links.get(row.from_event_id)!.add(row.incident_id);
      }
      if (row.to_event_id && row.to_event_id.length > 0) {
        if (!links.has(row.to_event_id)) {
          links.set(row.to_event_id, new Set());
        }
        links.get(row.to_event_id)!.add(row.incident_id);
      }
    }
  }
  return links;
}

interface CorrectionStatusRow {
  correctionIds: string[];
  correctionStatuses: string[];
  corrected: boolean;
  correctedTs: number | null;
}

function correctionStatusByEvent(db: Database.Database): Map<string, CorrectionStatusRow> {
  const map = new Map<string, CorrectionStatusRow>();
  if (!tableExists(db, "evidence_corrections")) {
    return map;
  }
  const rows = db.prepare("SELECT evidence_event_id, correction_id, status, verified_ts FROM evidence_corrections ORDER BY created_ts ASC").all() as Array<{
    evidence_event_id: string;
    correction_id: string;
    status: string;
    verified_ts: number | null;
  }>;
  for (const row of rows) {
    const existing = map.get(row.evidence_event_id) ?? {
      correctionIds: [],
      correctionStatuses: [],
      corrected: false,
      correctedTs: null
    };
    if (!existing.correctionIds.includes(row.correction_id)) {
      existing.correctionIds.push(row.correction_id);
    }
    if (!existing.correctionStatuses.includes(row.status)) {
      existing.correctionStatuses.push(row.status);
    }
    if (
      row.status === "VERIFIED_EFFECTIVE" ||
      row.status === "VERIFIED_INEFFECTIVE" ||
      row.status === "CORRECTED_EFFECTIVE" ||
      row.status === "CORRECTED_INEFFECTIVE"
    ) {
      existing.corrected = true;
      if (typeof row.verified_ts === "number" && Number.isFinite(row.verified_ts)) {
        existing.correctedTs = row.verified_ts;
      }
    }
    map.set(row.evidence_event_id, existing);
  }
  return map;
}

function hashChainStatus(rows: EvidenceRow[]): Map<string, { index: number; valid: boolean; expectedPrevHash: string }> {
  const status = new Map<string, { index: number; valid: boolean; expectedPrevHash: string }>();
  let previous = "GENESIS";
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const valid = row.prev_event_hash === previous;
    status.set(row.id, {
      index,
      valid,
      expectedPrevHash: previous
    });
    previous = row.event_hash;
  }
  return status;
}

function activeAgentFilterClause(agentId: string | undefined): { sql: string; params: unknown[] } {
  if (!agentId || agentId.trim().length === 0) {
    return { sql: "", params: [] };
  }
  const normalized = agentId.trim();
  return {
    sql: " WHERE json_extract(meta_json, '$.agentId') = ? OR json_extract(meta_json, '$.agent_id') = ?",
    params: [normalized, normalized]
  };
}

export function collectVerifierEvidence(params: CollectVerifierEvidenceParams): VerifierEvidenceDataset {
  const includeChain = params.includeChain ?? false;
  const includeRationale = params.includeRationale ?? false;
  const ledger = openLedger(params.workspace);
  try {
    const db = ledger.db;
    const allRows = db.prepare("SELECT rowid, * FROM evidence_events ORDER BY rowid ASC").all() as EvidenceRow[];
    const filter = activeAgentFilterClause(params.agentId);
    const selectedRows = db
      .prepare(`SELECT rowid, * FROM evidence_events${filter.sql} ORDER BY rowid ASC`)
      .all(...filter.params) as EvidenceRow[];
    const chainStatus = hashChainStatus(allRows);
    const incidentByEvent = incidentLinksByEvent(db);
    const correctionByEvent = correctionStatusByEvent(db);

    const records: EvidenceExportRecord[] = selectedRows.map((row) => {
      const meta = parseMeta(row.meta_json);
      const chain = chainStatus.get(row.id) ?? {
        index: 0,
        valid: true,
        expectedPrevHash: row.prev_event_hash
      };
      const rationale = extractRationale(meta);
      const incidents = [...(incidentByEvent.get(row.id) ?? new Set<string>())].sort((a, b) => a.localeCompare(b));
      const correction = correctionByEvent.get(row.id) ?? {
        correctionIds: [],
        correctionStatuses: [],
        corrected: false,
        correctedTs: null
      };

      return {
        eventId: row.id,
        ts: row.ts,
        isoTs: new Date(row.ts).toISOString(),
        sessionId: row.session_id,
        runtime: row.runtime,
        eventType: row.event_type,
        actorId: extractActorId(meta, row.session_id),
        payloadSha256: row.payload_sha256,
        prevEventHash: row.prev_event_hash,
        eventHash: row.event_hash,
        writerSignature: row.writer_sig,
        chainIndex: includeChain ? chain.index : -1,
        chainValid: includeChain ? chain.valid : true,
        chainExpectedPrevHash: includeChain ? chain.expectedPrevHash : "",
        incidentIds: incidents,
        correctionIds: correction.correctionIds,
        correctionStatuses: correction.correctionStatuses,
        corrected: correction.corrected,
        correctedTs: correction.correctedTs,
        rationale: includeRationale ? rationale.rationale : null,
        rationaleChain: includeRationale ? rationale.chain : [],
        meta
      };
    });

    return {
      schemaVersion: 1,
      generatedTs: Date.now(),
      workspace: params.workspace,
      agentFilter: params.agentId?.trim() ?? null,
      includeChain,
      includeRationale,
      eventCount: records.length,
      chainInvalidCount: includeChain ? records.filter((row) => !row.chainValid).length : 0,
      records
    };
  } finally {
    ledger.close();
  }
}

export function renderVerifierEvidenceCsv(dataset: VerifierEvidenceDataset): string {
  const columns = [
    "event_id",
    "ts",
    "iso_ts",
    "session_id",
    "runtime",
    "event_type",
    "actor_id",
    "payload_sha256",
    "prev_event_hash",
    "event_hash",
    "writer_signature",
    "chain_index",
    "chain_valid",
    "chain_expected_prev_hash",
    "incident_ids",
    "correction_ids",
    "correction_statuses",
    "corrected",
    "corrected_ts",
    "rationale"
  ];
  const lines = [columns.join(",")];
  for (const row of dataset.records) {
    lines.push(
      [
        normalizeCsvCell(row.eventId),
        normalizeCsvCell(row.ts),
        normalizeCsvCell(row.isoTs),
        normalizeCsvCell(row.sessionId),
        normalizeCsvCell(row.runtime),
        normalizeCsvCell(row.eventType),
        normalizeCsvCell(row.actorId),
        normalizeCsvCell(row.payloadSha256),
        normalizeCsvCell(row.prevEventHash),
        normalizeCsvCell(row.eventHash),
        normalizeCsvCell(row.writerSignature),
        normalizeCsvCell(row.chainIndex),
        normalizeCsvCell(row.chainValid),
        normalizeCsvCell(row.chainExpectedPrevHash),
        normalizeCsvCell(row.incidentIds.join(";")),
        normalizeCsvCell(row.correctionIds.join(";")),
        normalizeCsvCell(row.correctionStatuses.join(";")),
        normalizeCsvCell(row.corrected),
        normalizeCsvCell(row.correctedTs),
        normalizeCsvCell(row.rationale)
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

export function renderVerifierEvidencePdf(dataset: VerifierEvidenceDataset): Buffer {
  const lines: string[] = [
    "AMC Verifier-Ready Evidence Export",
    "",
    `Generated: ${new Date(dataset.generatedTs).toISOString()}`,
    `Agent filter: ${dataset.agentFilter ?? "none"}`,
    `Events: ${dataset.eventCount}`,
    `Chain invalid count: ${dataset.chainInvalidCount}`,
    "",
    "Columns: ts | event | actor | event_hash | prev_hash | sig | incidents | corrected | rationale",
    ""
  ];
  for (const row of dataset.records) {
    lines.push(
      `${row.isoTs} | ${row.eventType} | ${row.actorId} | ${row.eventHash.slice(0, 12)}... | ${row.prevEventHash.slice(0, 12)}... | ${row.writerSignature.slice(0, 12)}... | ${row.incidentIds.join(";") || "-"} | ${row.corrected ? "yes" : "no"} | ${row.rationale ?? "-"}`
    );
  }
  return renderPdfFromLines(lines);
}

export function renderVerifierEvidenceJson(dataset: VerifierEvidenceDataset): string {
  return `${JSON.stringify(dataset, null, 2)}\n`;
}

export function renderVerifierEvidence(dataset: VerifierEvidenceDataset, format: EvidenceExportFormat): Buffer | string {
  if (format === "csv") {
    return renderVerifierEvidenceCsv(dataset);
  }
  if (format === "pdf") {
    return renderVerifierEvidencePdf(dataset);
  }
  return renderVerifierEvidenceJson(dataset);
}

export function defaultEvidenceExportPath(
  workspace: string,
  format: EvidenceExportFormat,
  now: number = Date.now()
): string {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
  return resolve(workspace, ".amc", "exports", `evidence-${stamp}.${format}`);
}

export function exportVerifierEvidence(params: ExportVerifierEvidenceParams): ExportVerifierEvidenceResult {
  const dataset = collectVerifierEvidence(params);
  const rendered = renderVerifierEvidence(dataset, params.format);
  const outFile = resolve(params.workspace, params.outFile);
  ensureDir(dirname(outFile));
  writeFileAtomic(outFile, rendered, 0o644);
  const bytes = typeof rendered === "string" ? Buffer.from(rendered, "utf8") : rendered;
  const sha256 = sha256Hex(bytes);
  return {
    outFile,
    format: params.format,
    eventCount: dataset.eventCount,
    chainInvalidCount: dataset.chainInvalidCount,
    sha256
  };
}

export function hashFile(path: string): string {
  if (!pathExists(path)) {
    return "";
  }
  return sha256Hex(readFileSync(path));
}

export function canonicalEvidenceDatasetHash(dataset: VerifierEvidenceDataset): string {
  return sha256Hex(Buffer.from(canonicalize(dataset), "utf8"));
}
