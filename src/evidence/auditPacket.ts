import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPrivateKeyPem, signHexDigest } from "../crypto/keys.js";
import { openLedger, verifyLedgerIntegrity } from "../ledger/ledger.js";
import { pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import {
  canonicalEvidenceDatasetHash,
  collectVerifierEvidence,
  renderVerifierEvidenceCsv,
  renderVerifierEvidenceJson,
  renderVerifierEvidencePdf
} from "./exporter.js";
import { createZipArchive } from "./zip.js";

export interface GenerateAuditPacketParams {
  workspace: string;
  outputFile: string;
  agentId?: string;
  includeChain?: boolean;
  includeRationale?: boolean;
}

export interface AuditPacketFile {
  path: string;
  sha256: string;
  size: number;
}

export interface GenerateAuditPacketResult {
  outFile: string;
  sha256: string;
  fileCount: number;
  eventCount: number;
  chainInvalidCount: number;
  integrityOk: boolean;
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(table) as { 1: number } | undefined;
  return row !== undefined;
}

function queryRows(db: Database.Database, table: string, orderBy: string): Record<string, unknown>[] {
  if (!tableExists(db, table)) {
    return [];
  }
  return db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all() as Record<string, unknown>[];
}

function packetReadme(nowTs: number): string {
  return [
    "# AMC External Audit Packet",
    "",
    `Generated: ${new Date(nowTs).toISOString()}`,
    "",
    "Contents:",
    "- `evidence/`: verifier-ready exports (JSON/CSV/PDF) with chain, signatures, rationale, actor IDs, timestamps.",
    "- `integrity/ledger-verify.json`: full ledger integrity verification output.",
    "- `incidents/`: incident records and evidence link edges.",
    "- `corrections/`: correction records and evidence correction-closure links.",
    "- `ledger/evidence.sqlite`: raw immutable ledger database.",
    "- `keys/`: public keys and key history for offline signature verification.",
    "- `meta/manifest.json` + `meta/manifest.sig.json`: packet manifest and auditor signature.",
    "",
    "Verification guide:",
    "1. Verify `meta/manifest.sig.json` against `keys/auditor_ed25519.pub` and `meta/manifest.json` hash.",
    "2. Verify file hashes in `meta/manifest.json`.",
    "3. Recompute and validate event hash chain and signatures using `ledger/evidence.sqlite` and monitor keys."
  ].join("\n");
}

export async function generateAuditPacket(params: GenerateAuditPacketParams): Promise<GenerateAuditPacketResult> {
  const nowTs = Date.now();
  const dataset = collectVerifierEvidence({
    workspace: params.workspace,
    agentId: params.agentId,
    includeChain: params.includeChain ?? true,
    includeRationale: params.includeRationale ?? true
  });
  const integrity = await verifyLedgerIntegrity(params.workspace);
  const entries: Array<{ path: string; bytes: Buffer; modifiedTs?: number }> = [];

  const ledger = openLedger(params.workspace);
  try {
    const db = ledger.db;
    const evidenceJson = renderVerifierEvidenceJson(dataset);
    const evidenceCsv = renderVerifierEvidenceCsv(dataset);
    const evidencePdf = renderVerifierEvidencePdf(dataset);

    entries.push({ path: "README.md", bytes: Buffer.from(packetReadme(nowTs), "utf8"), modifiedTs: nowTs });
    entries.push({ path: "evidence/evidence.json", bytes: Buffer.from(evidenceJson, "utf8"), modifiedTs: nowTs });
    entries.push({ path: "evidence/evidence.csv", bytes: Buffer.from(evidenceCsv, "utf8"), modifiedTs: nowTs });
    entries.push({ path: "evidence/evidence.pdf", bytes: evidencePdf, modifiedTs: nowTs });
    entries.push({
      path: "evidence/evidence.dataset.sha256",
      bytes: Buffer.from(`${canonicalEvidenceDatasetHash(dataset)}\n`, "utf8"),
      modifiedTs: nowTs
    });
    entries.push({
      path: "integrity/ledger-verify.json",
      bytes: Buffer.from(`${JSON.stringify(integrity, null, 2)}\n`, "utf8"),
      modifiedTs: nowTs
    });

    const incidents = queryRows(db, "incidents", "created_ts ASC");
    const incidentTransitions = queryRows(db, "incident_transitions", "ts ASC");
    const causalEdges = queryRows(db, "causal_edges", "added_ts ASC");
    const evidenceIncidentLinks = queryRows(db, "evidence_incident_links", "created_ts ASC");
    const corrections = queryRows(db, "corrections", "created_ts ASC");
    const evidenceCorrections = queryRows(db, "evidence_corrections", "created_ts ASC");

    entries.push({
      path: "incidents/incidents.json",
      bytes: Buffer.from(`${JSON.stringify(incidents, null, 2)}\n`, "utf8"),
      modifiedTs: nowTs
    });
    entries.push({
      path: "incidents/transitions.json",
      bytes: Buffer.from(`${JSON.stringify(incidentTransitions, null, 2)}\n`, "utf8"),
      modifiedTs: nowTs
    });
    entries.push({
      path: "incidents/causal-edges.json",
      bytes: Buffer.from(`${JSON.stringify(causalEdges, null, 2)}\n`, "utf8"),
      modifiedTs: nowTs
    });
    entries.push({
      path: "incidents/evidence-links.json",
      bytes: Buffer.from(`${JSON.stringify(evidenceIncidentLinks, null, 2)}\n`, "utf8"),
      modifiedTs: nowTs
    });
    entries.push({
      path: "corrections/corrections.json",
      bytes: Buffer.from(`${JSON.stringify(corrections, null, 2)}\n`, "utf8"),
      modifiedTs: nowTs
    });
    entries.push({
      path: "corrections/evidence-corrections.json",
      bytes: Buffer.from(`${JSON.stringify(evidenceCorrections, null, 2)}\n`, "utf8"),
      modifiedTs: nowTs
    });

    const sqlitePath = resolve(params.workspace, ".amc", "evidence.sqlite");
    if (pathExists(sqlitePath)) {
      entries.push({
        path: "ledger/evidence.sqlite",
        bytes: readFileSync(sqlitePath),
        modifiedTs: nowTs
      });
    }

    for (const relativePath of [
      ".amc/keys/monitor_ed25519.pub",
      ".amc/keys/auditor_ed25519.pub",
      ".amc/keys/monitor_history.json",
      ".amc/keys/auditor_history.json"
    ]) {
      const full = resolve(params.workspace, relativePath);
      if (pathExists(full)) {
        entries.push({
          path: `keys/${relativePath.split("/").pop()}`,
          bytes: readFileSync(full),
          modifiedTs: nowTs
        });
      }
    }
  } finally {
    ledger.close();
  }

  const manifest: {
    schemaVersion: 1;
    generatedTs: number;
    workspace: string;
    agentId: string | null;
    eventCount: number;
    chainInvalidCount: number;
    integrityOk: boolean;
    files: AuditPacketFile[];
  } = {
    schemaVersion: 1,
    generatedTs: nowTs,
    workspace: params.workspace,
    agentId: params.agentId?.trim() ?? null,
    eventCount: dataset.eventCount,
    chainInvalidCount: dataset.chainInvalidCount,
    integrityOk: integrity.ok,
    files: []
  };

  manifest.files = entries
    .map((entry) => ({
      path: entry.path,
      sha256: sha256Hex(entry.bytes),
      size: entry.bytes.length
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const manifestSha256 = sha256Hex(manifestBytes);
  const manifestSig = {
    signer: "auditor" as const,
    signedTs: nowTs,
    manifestSha256,
    signature: signHexDigest(manifestSha256, getPrivateKeyPem(params.workspace, "auditor"))
  };

  entries.push({
    path: "meta/manifest.json",
    bytes: manifestBytes,
    modifiedTs: nowTs
  });
  entries.push({
    path: "meta/manifest.sig.json",
    bytes: Buffer.from(`${JSON.stringify(manifestSig, null, 2)}\n`, "utf8"),
    modifiedTs: nowTs
  });

  const archive = createZipArchive(entries);
  const outFile = resolve(params.workspace, params.outputFile);
  writeFileAtomic(outFile, archive, 0o644);
  const packetSha = sha256Hex(archive);

  return {
    outFile,
    sha256: packetSha,
    fileCount: entries.length,
    eventCount: dataset.eventCount,
    chainInvalidCount: dataset.chainInvalidCount,
    integrityOk: integrity.ok
  };
}
