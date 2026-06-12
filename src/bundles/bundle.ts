import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { BundleManifest, DiagnosticReport } from "../types.js";
import { getAgentPaths, resolveAgentId } from "../fleet/paths.js";
import { pathExists, ensureDir, writeFileAtomic, readUtf8 } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { loadRunReport, generateReport } from "../diagnostic/runner.js";
import { getPublicKeyHistory, getPrivateKeyPem, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { verifyLedgerIntegrity } from "../ledger/ledger.js";
import { appendTransparencyEntry } from "../transparency/logChain.js";

interface BundleManifestSignature {
  manifestSha256: string;
  signature: string;
  signedTs: number;
  signer: "auditor";
}

interface KeyHistoryEntry {
  createdTs: number;
  fingerprint: string;
  publicKeyPem: string;
}

interface BundleContents {
  rootDir: string;
  cleanup: () => void;
}

function mkTmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function runTarCreate(sourceDir: string, outputBundle: string): void {
  const out = spawnSync("tar", ["-czf", outputBundle, "-C", sourceDir, "."], {
    encoding: "utf8"
  });
  if (out.status !== 0) {
    throw new Error(`Failed to create bundle archive: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function runTarExtract(bundleFile: string, outputDir: string): void {
  const out = spawnSync("tar", ["-xzf", bundleFile, "-C", outputDir], {
    encoding: "utf8"
  });
  if (out.status !== 0) {
    throw new Error(`Failed to extract bundle archive: ${(`${out.stdout ?? ""}${out.stderr ?? ""}`).trim()}`);
  }
}

function collectFiles(rootDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(relative(rootDir, full).replace(/\\/g, "/"));
      }
    }
  };
  walk(rootDir);
  return out.sort((a, b) => a.localeCompare(b));
}

function toKeyHistoryEntries(publicKeys: string[]): KeyHistoryEntry[] {
  return publicKeys.map((publicKeyPem) => ({
    createdTs: 0,
    fingerprint: sha256Hex(Buffer.from(publicKeyPem, "utf8")),
    publicKeyPem
  }));
}

function readKeyHistory(workspace: string, kind: "monitor" | "auditor"): KeyHistoryEntry[] {
  const historyPath = join(workspace, ".amc", "keys", `${kind}_history.json`);
  if (!pathExists(historyPath)) {
    return toKeyHistoryEntries(getPublicKeyHistory(workspace, kind));
  }

  try {
    const parsed = JSON.parse(readUtf8(historyPath)) as KeyHistoryEntry[];
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // fall through to synthesized history
  }

  return toKeyHistoryEntries(getPublicKeyHistory(workspace, kind));
}

function dbSchemaSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS evidence_events (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      runtime TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_path TEXT,
      payload_inline TEXT,
      payload_sha256 TEXT NOT NULL,
      meta_json TEXT NOT NULL,
      prev_event_hash TEXT NOT NULL,
      event_hash TEXT NOT NULL,
      writer_sig TEXT NOT NULL,
      canonical_payload_path TEXT,
      canonical_payload_inline TEXT,
      blob_ref TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      archive_segment_id TEXT,
      archive_manifest_sha256 TEXT,
      payload_pruned INTEGER NOT NULL DEFAULT 0,
      payload_pruned_ts INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      started_ts INTEGER NOT NULL,
      ended_ts INTEGER,
      runtime TEXT NOT NULL,
      binary_path TEXT NOT NULL,
      binary_sha256 TEXT NOT NULL,
      session_final_event_hash TEXT,
      session_seal_sig TEXT
    );

    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      window_start_ts INTEGER NOT NULL,
      window_end_ts INTEGER NOT NULL,
      target_profile_id TEXT,
      report_json_sha256 TEXT NOT NULL,
      run_seal_sig TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assurance_runs (
      assurance_run_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      window_start_ts INTEGER NOT NULL,
      window_end_ts INTEGER NOT NULL,
      mode TEXT NOT NULL,
      pack_ids_json TEXT NOT NULL,
      report_json_sha256 TEXT NOT NULL,
      run_seal_sig TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_session_ts ON evidence_events(session_id, ts);
    CREATE INDEX IF NOT EXISTS idx_events_type_ts ON evidence_events(event_type, ts);
    CREATE INDEX IF NOT EXISTS idx_events_runtime_ts ON evidence_events(runtime, ts);
    CREATE INDEX IF NOT EXISTS idx_events_archived_ts ON evidence_events(archived, ts);
    CREATE INDEX IF NOT EXISTS idx_events_payload_pruned_ts ON evidence_events(payload_pruned, ts);
    CREATE INDEX IF NOT EXISTS idx_events_blob_ref ON evidence_events(blob_ref);
    CREATE INDEX IF NOT EXISTS idx_assurance_runs_agent_ts ON assurance_runs(agent_id, ts);

    CREATE TABLE IF NOT EXISTS outcome_events (
      outcome_event_id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      agent_id TEXT NOT NULL,
      work_order_id TEXT,
      category TEXT NOT NULL,
      metric_id TEXT NOT NULL,
      value TEXT NOT NULL,
      unit TEXT,
      trust_tier TEXT NOT NULL,
      source TEXT NOT NULL,
      meta_json TEXT NOT NULL,
      prev_event_hash TEXT NOT NULL,
      event_hash TEXT NOT NULL,
      signature TEXT NOT NULL,
      receipt_id TEXT NOT NULL,
      receipt TEXT NOT NULL,
      payload_sha256 TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outcome_contracts (
      contract_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      sig_valid INTEGER NOT NULL,
      created_ts INTEGER NOT NULL,
      signer_fpr TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_ts INTEGER NOT NULL
    );

    INSERT OR IGNORE INTO schema_migrations(version, applied_ts) VALUES
      (1, 0),
      (2, 0),
      (3, 0),
      (4, 0),
      (5, 0);
  `;
}

function allEvidenceIdsFromReport(report: DiagnosticReport): string[] {
  const set = new Set<string>();
  for (const question of report.questionScores) {
    for (const id of question.evidenceEventIds) {
      if (id && id.length > 0) {
        set.add(id);
      }
    }
  }
  return [...set];
}

function findTargetFileForRun(agentTargetsDir: string, targetProfileId: string | null): string | null {
  const targetFiles = readdirSync(agentTargetsDir)
    .filter((name) => name.endsWith(".target.json"))
    .sort((a, b) => a.localeCompare(b));

  if (targetFiles.length === 0) {
    return null;
  }

  for (const name of targetFiles) {
    const full = join(agentTargetsDir, name);
    try {
      const parsed = JSON.parse(readUtf8(full)) as { id?: string };
      if (targetProfileId && parsed.id === targetProfileId) {
        return full;
      }
      if (!targetProfileId && name === "default.target.json") {
        return full;
      }
    } catch {
      // ignore invalid file and continue
    }
  }

  return join(agentTargetsDir, targetFiles[0]!);
}

function latestFileByExt(dir: string, ext: string): string | null {
  if (!pathExists(dir)) {
    return null;
  }
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(ext))
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0) {
    return null;
  }
  return join(dir, files[files.length - 1]!);
}

function findLatestOutcomeReport(agentRootDir: string): { json: string; md: string | null } | null {
  const reportsDir = join(agentRootDir, "outcomes", "reports");
  const json = latestFileByExt(reportsDir, ".json");
  if (!json) {
    return null;
  }
  const mdCandidate = json.slice(0, -5) + ".md";
  return {
    json,
    md: pathExists(mdCandidate) ? mdCandidate : null
  };
}

function findLatestExperimentReport(agentRootDir: string): { json: string; md: string | null } | null {
  const experimentsDir = join(agentRootDir, "experiments");
  if (!pathExists(experimentsDir)) {
    return null;
  }
  const candidates: string[] = [];
  for (const dir of readdirSync(experimentsDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) {
      continue;
    }
    const runsDir = join(experimentsDir, dir.name, "runs");
    const latest = latestFileByExt(runsDir, ".json");
    if (latest) {
      candidates.push(latest);
    }
  }
  if (candidates.length === 0) {
    return null;
  }
  const json = candidates.sort((a, b) => a.localeCompare(b))[candidates.length - 1]!;
  const mdCandidate = json.slice(0, -5) + ".md";
  return {
    json,
    md: pathExists(mdCandidate) ? mdCandidate : null
  };
}

function resolveWorkspacePayload(workspace: string, payloadPath: string): { source: string; relativePath: string } | null {
  const workspaceRoot = resolve(workspace);
  const source = resolve(workspaceRoot, payloadPath);
  const relativeNative = relative(workspaceRoot, source);
  if (
    relativeNative.length === 0 ||
    relativeNative === ".." ||
    relativeNative.startsWith(`..${sep}`) ||
    isAbsolute(relativeNative)
  ) {
    return null;
  }
  return {
    source,
    relativePath: relativeNative.replace(/\\/g, "/")
  };
}

function copyPayloadIntoBundle(params: {
  workspace: string;
  bundleRoot: string;
  payloadPath: string;
}): void {
  const resolved = resolveWorkspacePayload(params.workspace, params.payloadPath);
  if (!resolved || !pathExists(resolved.source)) {
    return;
  }

  if (resolved.relativePath.startsWith(".amc/blobs/")) {
    const filename = resolved.relativePath.split("/").pop();
    if (!filename) {
      return;
    }
    writeFileAtomic(join(params.bundleRoot, "evidence", "blobs", filename), readFileSync(resolved.source));
    return;
  }

  writeFileAtomic(join(params.bundleRoot, "payloads", resolved.relativePath), readFileSync(resolved.source));
}

function restorePayloadsFromBundle(root: string, workspace: string): void {
  const payloadsRoot = join(root, "payloads");
  if (!pathExists(payloadsRoot)) {
    return;
  }
  for (const payloadFile of collectFiles(payloadsRoot)) {
    const resolved = resolveWorkspacePayload(workspace, payloadFile);
    if (!resolved) {
      continue;
    }
    writeFileAtomic(resolved.source, readFileSync(join(payloadsRoot, payloadFile)));
  }
}

function copyEvidenceSlice(params: {
  sourceDbPath: string;
  outputDbPath: string;
  report: DiagnosticReport;
}): { blobPaths: string[]; eventCount: number; sessionCount: number } {
  const source = new Database(params.sourceDbPath, { readonly: true });
  const out = new Database(params.outputDbPath);

  try {
    out.exec(dbSchemaSql());

    const runRow = source.prepare("SELECT * FROM runs WHERE run_id = ?").get(params.report.runId) as Record<string, unknown> | undefined;
    if (!runRow) {
      throw new Error(`Run not found in ledger: ${params.report.runId}`);
    }

    const allRunWindowEvents = source
      .prepare("SELECT rowid, * FROM evidence_events WHERE ts >= ? AND ts <= ? ORDER BY rowid ASC")
      .all(params.report.windowStartTs, params.report.windowEndTs) as Array<Record<string, unknown>>;

    const selectedIds = new Set(allEvidenceIdsFromReport(params.report));
    let maxRowId = 0;

    if (selectedIds.size > 0) {
      const ids = [...selectedIds];
      const placeholders = ids.map(() => "?").join(",");
      const rows = source
        .prepare(`SELECT rowid FROM evidence_events WHERE id IN (${placeholders}) ORDER BY rowid ASC`)
        .all(...ids) as Array<{ rowid: number }>;
      maxRowId = rows.length > 0 ? Math.max(...rows.map((row) => row.rowid)) : 0;
    }

    if (maxRowId === 0 && allRunWindowEvents.length > 0) {
      maxRowId = Number(allRunWindowEvents[allRunWindowEvents.length - 1]?.rowid ?? 0);
    }

    let selectedEvents =
      maxRowId > 0
        ? (source
            .prepare("SELECT rowid, * FROM evidence_events WHERE rowid <= ? ORDER BY rowid ASC")
            .all(maxRowId) as Array<Record<string, unknown>>)
        : [];

    const selectedSessionIds = [...new Set(selectedEvents.map((row) => String(row.session_id)))];
    if (selectedSessionIds.length > 0) {
      const placeholders = selectedSessionIds.map(() => "?").join(",");
      const sessionMaxRows = source
        .prepare(`SELECT MAX(rowid) as maxRowId FROM evidence_events WHERE session_id IN (${placeholders})`)
        .get(...selectedSessionIds) as { maxRowId: number | null };
      const sealedSessionMaxRowId = Number(sessionMaxRows.maxRowId ?? 0);
      if (sealedSessionMaxRowId > maxRowId) {
        maxRowId = sealedSessionMaxRowId;
        selectedEvents = source
          .prepare("SELECT rowid, * FROM evidence_events WHERE rowid <= ? ORDER BY rowid ASC")
          .all(maxRowId) as Array<Record<string, unknown>>;
      }
    }

    const insertEvent = out.prepare(
      `INSERT INTO evidence_events
      (id, ts, session_id, runtime, event_type, payload_path, payload_inline, payload_sha256, meta_json, prev_event_hash, event_hash, writer_sig, canonical_payload_path, canonical_payload_inline, blob_ref, archived, archive_segment_id, archive_manifest_sha256, payload_pruned, payload_pruned_ts)
      VALUES (@id, @ts, @session_id, @runtime, @event_type, @payload_path, @payload_inline, @payload_sha256, @meta_json, @prev_event_hash, @event_hash, @writer_sig, @canonical_payload_path, @canonical_payload_inline, @blob_ref, @archived, @archive_segment_id, @archive_manifest_sha256, @payload_pruned, @payload_pruned_ts)`
    );

    const txEvents = out.transaction((rows: Array<Record<string, unknown>>) => {
      for (const row of rows) {
        insertEvent.run({
          id: row.id,
          ts: row.ts,
          session_id: row.session_id,
          runtime: row.runtime,
          event_type: row.event_type,
          payload_path: row.payload_path,
          payload_inline: row.payload_inline,
          payload_sha256: row.payload_sha256,
          meta_json: row.meta_json,
          prev_event_hash: row.prev_event_hash,
          event_hash: row.event_hash,
          writer_sig: row.writer_sig,
          canonical_payload_path: row.canonical_payload_path ?? row.payload_path ?? null,
          canonical_payload_inline: row.canonical_payload_inline ?? row.payload_inline ?? null,
          blob_ref: row.blob_ref ?? null,
          archived: Number(row.archived ?? 0),
          archive_segment_id: row.archive_segment_id ?? null,
          archive_manifest_sha256: row.archive_manifest_sha256 ?? null,
          payload_pruned: Number(row.payload_pruned ?? 0),
          payload_pruned_ts: row.payload_pruned_ts ?? null
        });
      }
    });
    txEvents(selectedEvents);

    const sessionIds = [...new Set(selectedEvents.map((row) => String(row.session_id)))];
    const sessions: Array<Record<string, unknown>> = [];
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => "?").join(",");
      sessions.push(
        ...(source
          .prepare(`SELECT * FROM sessions WHERE session_id IN (${placeholders}) ORDER BY started_ts ASC`)
          .all(...sessionIds) as Array<Record<string, unknown>>)
      );
    }

    const insertSession = out.prepare(
      `INSERT INTO sessions
      (session_id, started_ts, ended_ts, runtime, binary_path, binary_sha256, session_final_event_hash, session_seal_sig)
      VALUES (@session_id, @started_ts, @ended_ts, @runtime, @binary_path, @binary_sha256, @session_final_event_hash, @session_seal_sig)`
    );
    const txSessions = out.transaction((rows: Array<Record<string, unknown>>) => {
      for (const row of rows) {
        insertSession.run(row);
      }
    });
    txSessions(sessions);

    const assuranceRows = source
      .prepare("SELECT * FROM assurance_runs WHERE agent_id = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC")
      .all(params.report.agentId, params.report.windowStartTs, params.report.windowEndTs) as Array<Record<string, unknown>>;
    if (assuranceRows.length > 0) {
      const insertAssurance = out.prepare(
        `INSERT INTO assurance_runs
        (assurance_run_id, agent_id, ts, window_start_ts, window_end_ts, mode, pack_ids_json, report_json_sha256, run_seal_sig, status)
        VALUES (@assurance_run_id, @agent_id, @ts, @window_start_ts, @window_end_ts, @mode, @pack_ids_json, @report_json_sha256, @run_seal_sig, @status)`
      );
      const txAssurance = out.transaction((rows: Array<Record<string, unknown>>) => {
        for (const row of rows) {
          insertAssurance.run(row);
        }
      });
      txAssurance(assuranceRows);
    }

    out.prepare(
      `INSERT INTO runs
      (run_id, ts, window_start_ts, window_end_ts, target_profile_id, report_json_sha256, run_seal_sig, status)
      VALUES (@run_id, @ts, @window_start_ts, @window_end_ts, @target_profile_id, @report_json_sha256, @run_seal_sig, @status)`
    ).run(runRow);

    const blobPaths = [...new Set(selectedEvents.map((row) => String(row.payload_path ?? "")).filter((value) => value.length > 0))];
    return {
      blobPaths,
      eventCount: selectedEvents.length,
      sessionCount: sessions.length
    };
  } finally {
    source.close();
    out.close();
  }
}

function gatherManifest(root: string): BundleManifest["files"] {
  return collectFiles(root)
    .filter((path) => path !== "manifest.sig" && path !== "manifest.json")
    .map((path) => {
      const full = join(root, path);
      return {
        path,
        sha256: sha256Hex(readFileSync(full)),
        size: statSync(full).size
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function createManifestSignature(workspace: string, manifestBytes: Buffer): BundleManifestSignature {
  const manifestSha256 = sha256Hex(manifestBytes);
  const signature = signHexDigest(manifestSha256, getPrivateKeyPem(workspace, "auditor"));
  return {
    manifestSha256,
    signature,
    signedTs: Date.now(),
    signer: "auditor"
  };
}

function withExtractedBundle(bundleFile: string): BundleContents {
  const root = mkTmp("amc-bundle-read-");
  runTarExtract(bundleFile, root);
  return {
    rootDir: root,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

function parseRunFromBundle(root: string): DiagnosticReport {
  const runFile = join(root, "run.json");
  if (!pathExists(runFile)) {
    throw new Error("Bundle missing run.json");
  }
  return JSON.parse(readUtf8(runFile)) as DiagnosticReport;
}

function readBundleManifest(root: string): BundleManifest {
  const file = join(root, "manifest.json");
  if (!pathExists(file)) {
    throw new Error("Bundle missing manifest.json");
  }
  return JSON.parse(readUtf8(file)) as BundleManifest;
}

function readBundleManifestSig(root: string): BundleManifestSignature {
  const file = join(root, "manifest.sig");
  if (!pathExists(file)) {
    throw new Error("Bundle missing manifest.sig");
  }
  return JSON.parse(readUtf8(file)) as BundleManifestSignature;
}

function collectAuditorKeysFromBundle(root: string): string[] {
  const direct = readUtf8(join(root, "public-keys", "auditor.pub"));
  const historyFile = join(root, "public-keys", "key-history.json");
  if (!pathExists(historyFile)) {
    return [direct];
  }
  try {
    const parsed = JSON.parse(readUtf8(historyFile)) as { auditor?: Array<{ publicKeyPem?: string }> };
    const keys = new Set<string>([direct]);
    for (const entry of parsed.auditor ?? []) {
      if (entry.publicKeyPem) {
        keys.add(entry.publicKeyPem);
      }
    }
    return [...keys];
  } catch {
    return [direct];
  }
}

function collectMonitorKeysFromBundle(root: string): string[] {
  const direct = readUtf8(join(root, "public-keys", "monitor.pub"));
  const historyFile = join(root, "public-keys", "key-history.json");
  if (!pathExists(historyFile)) {
    return [direct];
  }
  try {
    const parsed = JSON.parse(readUtf8(historyFile)) as { monitor?: Array<{ publicKeyPem?: string }> };
    const keys = new Set<string>([direct]);
    for (const entry of parsed.monitor ?? []) {
      if (entry.publicKeyPem) {
        keys.add(entry.publicKeyPem);
      }
    }
    return [...keys];
  } catch {
    return [direct];
  }
}

function materializeBundleWorkspace(root: string): string {
  const workspace = mkTmp("amc-bundle-verify-");
  const amc = join(workspace, ".amc");
  const keysDir = join(amc, "keys");
  const blobsDir = join(amc, "blobs");
  const targetsDir = join(amc, "targets");
  ensureDir(keysDir);
  ensureDir(blobsDir);
  ensureDir(targetsDir);

  writeFileAtomic(join(amc, "evidence.sqlite"), readFileSync(join(root, "evidence", "evidence.sqlite")));

  const bundleBlobDir = join(root, "evidence", "blobs");
  if (pathExists(bundleBlobDir)) {
    for (const name of readdirSync(bundleBlobDir)) {
      const source = join(bundleBlobDir, name);
      const target = join(blobsDir, name);
      writeFileAtomic(target, readFileSync(source));
    }
  }
  restorePayloadsFromBundle(root, workspace);

  writeFileAtomic(join(keysDir, "monitor_ed25519.pub"), readUtf8(join(root, "public-keys", "monitor.pub")), 0o644);
  writeFileAtomic(join(keysDir, "auditor_ed25519.pub"), readUtf8(join(root, "public-keys", "auditor.pub")), 0o644);

  const historyRaw = readUtf8(join(root, "public-keys", "key-history.json"));
  const history = JSON.parse(historyRaw) as { monitor?: unknown; auditor?: unknown };
  writeFileAtomic(join(keysDir, "monitor_history.json"), JSON.stringify(history.monitor ?? [], null, 2), 0o644);
  writeFileAtomic(join(keysDir, "auditor_history.json"), JSON.stringify(history.auditor ?? [], null, 2), 0o644);

  if (pathExists(join(root, "target.json"))) {
    writeFileAtomic(join(targetsDir, "bundle.target.json"), readFileSync(join(root, "target.json")));
  }

  return workspace;
}

function trustTierByEventIdFromBundle(root: string): Map<string, string> {
  const db = new Database(join(root, "evidence", "evidence.sqlite"), { readonly: true });
  try {
    const rows = db.prepare("SELECT id, meta_json, event_type FROM evidence_events").all() as Array<{
      id: string;
      meta_json: string;
      event_type: string;
    }>;

    const out = new Map<string, string>();
    for (const row of rows) {
      let trustTier = "OBSERVED";
      try {
        const parsed = JSON.parse(row.meta_json) as Record<string, unknown>;
        if (
          parsed.trustTier === "OBSERVED" ||
          parsed.trustTier === "OBSERVED_HARDENED" ||
          parsed.trustTier === "ATTESTED" ||
          parsed.trustTier === "SELF_REPORTED"
        ) {
          trustTier = parsed.trustTier;
        } else if (row.event_type === "review") {
          trustTier = "SELF_REPORTED";
        }
      } catch {
        if (row.event_type === "review") {
          trustTier = "SELF_REPORTED";
        }
      }
      out.set(row.id, trustTier);
    }

    return out;
  } finally {
    db.close();
  }
}

export function exportEvidenceBundle(params: {
  workspace: string;
  runId: string;
  outFile: string;
  agentId?: string;
}): { outFile: string; manifest: BundleManifest; fileCount: number; eventCount: number; sessionCount: number } {
  const agentId = resolveAgentId(params.workspace, params.agentId);
  const agentPaths = getAgentPaths(params.workspace, agentId);
  const report = loadRunReport(params.workspace, params.runId, agentId);

  const root = mkTmp("amc-bundle-build-");
  const cleanup = () => rmSync(root, { recursive: true, force: true });

  try {
    ensureDir(join(root, "public-keys"));
    ensureDir(join(root, "evidence", "blobs"));
    ensureDir(join(root, "metadata"));

    const reportJsonPath = join(agentPaths.runsDir, `${params.runId}.json`);
    if (!pathExists(reportJsonPath)) {
      throw new Error(`Run JSON not found: ${reportJsonPath}`);
    }
    writeFileAtomic(join(root, "run.json"), readFileSync(reportJsonPath));

    const reportMdPath = join(agentPaths.reportsDir, `${params.runId}.md`);
    const markdown = pathExists(reportMdPath) ? readUtf8(reportMdPath) : (generateReport(report, "md") as string);
    writeFileAtomic(join(root, "run.md"), markdown, 0o644);

    writeFileAtomic(join(root, "context-graph.json"), readFileSync(agentPaths.contextGraph));

    const latestOutcome = findLatestOutcomeReport(agentPaths.rootDir);
    if (latestOutcome) {
      ensureDir(join(root, "outcomes"));
      writeFileAtomic(join(root, "outcomes", "report.json"), readFileSync(latestOutcome.json));
      if (latestOutcome.md) {
        writeFileAtomic(join(root, "outcomes", "report.md"), readFileSync(latestOutcome.md), 0o644);
      }
    }

    const latestExperiment = findLatestExperimentReport(agentPaths.rootDir);
    if (latestExperiment) {
      ensureDir(join(root, "experiments"));
      writeFileAtomic(join(root, "experiments", "report.json"), readFileSync(latestExperiment.json));
      if (latestExperiment.md) {
        writeFileAtomic(join(root, "experiments", "report.md"), readFileSync(latestExperiment.md), 0o644);
      }
    }

    const targetFile = findTargetFileForRun(agentPaths.targetsDir, report.targetProfileId);
    if (targetFile) {
      const targetRaw = readUtf8(targetFile);
      writeFileAtomic(join(root, "target.json"), targetRaw, 0o644);
      try {
        const targetParsed = JSON.parse(targetRaw) as Record<string, unknown>;
        const payload = { ...targetParsed };
        const signature = String(payload.signature ?? "");
        delete payload.signature;
        const payloadSha256 = sha256Hex(canonicalize(payload));
        writeFileAtomic(
          join(root, "target.sig"),
          JSON.stringify(
            {
              targetId: String(targetParsed.id ?? "unknown"),
              payloadSha256,
              signature
            },
            null,
            2
          ),
          0o644
        );
      } catch {
        writeFileAtomic(join(root, "target.sig"), JSON.stringify({ invalid: true }, null, 2), 0o644);
      }
    }

    const monitorPub = readUtf8(join(params.workspace, ".amc", "keys", "monitor_ed25519.pub"));
    const auditorPub = readUtf8(join(params.workspace, ".amc", "keys", "auditor_ed25519.pub"));
    writeFileAtomic(join(root, "public-keys", "monitor.pub"), monitorPub, 0o644);
    writeFileAtomic(join(root, "public-keys", "auditor.pub"), auditorPub, 0o644);

    const monitorHistory = readKeyHistory(params.workspace, "monitor");
    const auditorHistory = readKeyHistory(params.workspace, "auditor");
    writeFileAtomic(
      join(root, "public-keys", "key-history.json"),
      JSON.stringify({ monitor: monitorHistory, auditor: auditorHistory }, null, 2),
      0o644
    );

    const sourceDbPath = join(params.workspace, ".amc", "evidence.sqlite");
    const outputDbPath = join(root, "evidence", "evidence.sqlite");
    const copied = copyEvidenceSlice({ sourceDbPath, outputDbPath, report });

    for (const payloadPath of copied.blobPaths) {
      copyPayloadIntoBundle({
        workspace: params.workspace,
        bundleRoot: root,
        payloadPath
      });
    }

    const packageJsonPath = join(params.workspace, "package.json");
    const packageVersion = pathExists(packageJsonPath)
      ? String((JSON.parse(readUtf8(packageJsonPath)) as { version?: string }).version ?? "unknown")
      : "unknown";

    writeFileAtomic(
      join(root, "metadata", "exportInfo.json"),
      JSON.stringify(
        {
          tool: "agent-maturity-compass",
          version: packageVersion,
          exportTs: Date.now(),
          agentId,
          runId: report.runId,
          window: {
            startTs: report.windowStartTs,
            endTs: report.windowEndTs
          },
          eventCount: copied.eventCount,
          sessionCount: copied.sessionCount
        },
        null,
        2
      ),
      0o644
    );

    const manifest: BundleManifest = {
      schemaVersion: 1,
      runId: report.runId,
      agentId,
      windowStartTs: report.windowStartTs,
      windowEndTs: report.windowEndTs,
      publicKeyFingerprints: {
        monitor: monitorHistory.map((entry) => entry.fingerprint),
        auditor: auditorHistory.map((entry) => entry.fingerprint)
      },
      files: []
    };

    writeFileAtomic(join(root, "manifest.json"), JSON.stringify(manifest, null, 2), 0o644);

    manifest.files = gatherManifest(root);
    writeFileAtomic(join(root, "manifest.json"), JSON.stringify(manifest, null, 2), 0o644);

    const manifestSig = createManifestSignature(params.workspace, readFileSync(join(root, "manifest.json")));
    writeFileAtomic(join(root, "manifest.sig"), JSON.stringify(manifestSig, null, 2), 0o644);

    const outFile = resolve(params.workspace, params.outFile);
    ensureDir(dirname(outFile));
    runTarCreate(root, outFile);
    appendTransparencyEntry({
      workspace: params.workspace,
      type: "BUNDLE_EXPORTED",
      agentId,
      artifact: {
        kind: "amcbundle",
        sha256: sha256Hex(readFileSync(outFile)),
        id: report.runId
      }
    });

    return {
      outFile,
      manifest,
      fileCount: manifest.files.length,
      eventCount: copied.eventCount,
      sessionCount: copied.sessionCount
    };
  } finally {
    cleanup();
  }
}

export async function verifyEvidenceBundle(bundleFile: string): Promise<{
  ok: boolean;
  errors: string[];
  runId: string | null;
  agentId: string | null;
}> {
  const extracted = withExtractedBundle(bundleFile);
  const errors: string[] = [];

  try {
    let manifest: BundleManifest | null = null;
    let run: DiagnosticReport | null = null;
    try {
      manifest = readBundleManifest(extracted.rootDir);
    } catch (error) {
      errors.push(String(error));
    }

    try {
      run = parseRunFromBundle(extracted.rootDir);
    } catch (error) {
      errors.push(String(error));
    }

    try {
      const manifestRaw = readFileSync(join(extracted.rootDir, "manifest.json"));
      const manifestSig = readBundleManifestSig(extracted.rootDir);
      const digest = sha256Hex(manifestRaw);
      if (digest !== manifestSig.manifestSha256) {
        errors.push("Manifest signature payload digest mismatch.");
      }
      const auditorKeys = collectAuditorKeysFromBundle(extracted.rootDir);
      if (!verifyHexDigestAny(digest, manifestSig.signature, auditorKeys)) {
        errors.push("Manifest signature verification failed.");
      }
    } catch (error) {
      errors.push(`Manifest signature error: ${String(error)}`);
    }

    if (manifest) {
      const actualFiles = collectFiles(extracted.rootDir).filter((path) => path !== "manifest.sig" && path !== "manifest.json");
      const expectedFiles = manifest.files.map((entry) => entry.path).sort((a, b) => a.localeCompare(b));

      for (const expected of expectedFiles) {
        if (!actualFiles.includes(expected)) {
          errors.push(`Manifest entry missing from archive: ${expected}`);
        }
      }
      for (const actual of actualFiles) {
        if (!expectedFiles.includes(actual)) {
          errors.push(`Archive contains file not listed in manifest: ${actual}`);
        }
      }

      for (const entry of manifest.files) {
        const full = join(extracted.rootDir, entry.path);
        if (!pathExists(full)) {
          continue;
        }
        const bytes = readFileSync(full);
        const digest = sha256Hex(bytes);
        if (digest !== entry.sha256) {
          errors.push(`File hash mismatch: ${entry.path}`);
        }
        if (bytes.length !== entry.size) {
          errors.push(`File size mismatch: ${entry.path}`);
        }
      }
    }

    if (run) {
      const base = { ...run } as Record<string, unknown>;
      base.runSealSig = "";
      base.reportJsonSha256 = "";
      const digest = sha256Hex(canonicalize(base));
      if (digest !== run.reportJsonSha256) {
        errors.push("run.json reportJsonSha256 mismatch.");
      }
      const auditorKeys = collectAuditorKeysFromBundle(extracted.rootDir);
      if (!verifyHexDigestAny(run.reportJsonSha256, run.runSealSig, auditorKeys)) {
        errors.push("run.json runSealSig verification failed.");
      }
    }

    const outcomeFile = join(extracted.rootDir, "outcomes", "report.json");
    if (pathExists(outcomeFile)) {
      try {
        const parsed = JSON.parse(readUtf8(outcomeFile)) as Record<string, unknown>;
        const payload = { ...parsed };
        const reportJsonSha256 = String(payload.reportJsonSha256 ?? "");
        const reportSealSig = String(payload.reportSealSig ?? "");
        delete payload.reportJsonSha256;
        delete payload.reportSealSig;
        const digest = sha256Hex(canonicalize(payload));
        if (digest !== reportJsonSha256) {
          errors.push("outcomes/report.json reportJsonSha256 mismatch.");
        }
        const auditorKeys = collectAuditorKeysFromBundle(extracted.rootDir);
        if (!verifyHexDigestAny(reportJsonSha256, reportSealSig, auditorKeys)) {
          errors.push("outcomes/report.json reportSealSig verification failed.");
        }
      } catch (error) {
        errors.push(`outcomes/report.json parse/verify failure: ${String(error)}`);
      }
    }

    const experimentFile = join(extracted.rootDir, "experiments", "report.json");
    if (pathExists(experimentFile)) {
      try {
        const parsed = JSON.parse(readUtf8(experimentFile)) as Record<string, unknown>;
        const payload = { ...parsed };
        const reportJsonSha256 = String(payload.reportJsonSha256 ?? "");
        const reportSealSig = String(payload.reportSealSig ?? "");
        delete payload.reportJsonSha256;
        delete payload.reportSealSig;
        const digest = sha256Hex(canonicalize(payload));
        if (digest !== reportJsonSha256) {
          errors.push("experiments/report.json reportJsonSha256 mismatch.");
        }
        const auditorKeys = collectAuditorKeysFromBundle(extracted.rootDir);
        if (!verifyHexDigestAny(reportJsonSha256, reportSealSig, auditorKeys)) {
          errors.push("experiments/report.json reportSealSig verification failed.");
        }
      } catch (error) {
        errors.push(`experiments/report.json parse/verify failure: ${String(error)}`);
      }
    }

    if (pathExists(join(extracted.rootDir, "target.json"))) {
      try {
        const parsed = JSON.parse(readUtf8(join(extracted.rootDir, "target.json"))) as Record<string, unknown>;
        const signature = String(parsed.signature ?? "");
        const payload = { ...parsed };
        delete payload.signature;
        const digest = sha256Hex(canonicalize(payload));
        const auditorKeys = collectAuditorKeysFromBundle(extracted.rootDir);
        if (!verifyHexDigestAny(digest, signature, auditorKeys)) {
          errors.push("target.json signature verification failed.");
        }
      } catch (error) {
        errors.push(`target.json parse/verify failure: ${String(error)}`);
      }
    }

    try {
      const verifyWorkspace = materializeBundleWorkspace(extracted.rootDir);
      try {
        const ledgerResult = await verifyLedgerIntegrity(verifyWorkspace);
        for (const error of ledgerResult.errors) {
          errors.push(`Ledger verify: ${error}`);
        }
      } finally {
        rmSync(verifyWorkspace, { recursive: true, force: true });
      }
    } catch (error) {
      errors.push(`Ledger verification setup failed: ${String(error)}`);
    }

    if (manifest && run) {
      if (manifest.runId !== run.runId) {
        errors.push(`Run mismatch: manifest runId=${manifest.runId} run.json runId=${run.runId}`);
      }
      if (manifest.agentId !== run.agentId) {
        errors.push(`Agent mismatch: manifest agentId=${manifest.agentId} run.json agentId=${run.agentId}`);
      }
      if (manifest.windowStartTs !== run.windowStartTs || manifest.windowEndTs !== run.windowEndTs) {
        errors.push("Window mismatch between manifest and run.json.");
      }
    }

    return {
      ok: errors.length === 0,
      errors,
      runId: manifest?.runId ?? run?.runId ?? null,
      agentId: manifest?.agentId ?? run?.agentId ?? null
    };
  } finally {
    extracted.cleanup();
  }
}

export function inspectEvidenceBundle(bundleFile: string): {
  manifest: BundleManifest;
  run: DiagnosticReport;
  files: string[];
} {
  const extracted = withExtractedBundle(bundleFile);
  try {
    const manifest = readBundleManifest(extracted.rootDir);
    const run = parseRunFromBundle(extracted.rootDir);
    const files = collectFiles(extracted.rootDir);
    return {
      manifest,
      run,
      files
    };
  } finally {
    extracted.cleanup();
  }
}

function overallFromRun(run: DiagnosticReport): number {
  if (run.layerScores.length === 0) {
    return 0;
  }
  const total = run.layerScores.reduce((sum, layer) => sum + layer.avgFinalLevel, 0);
  return Number((total / run.layerScores.length).toFixed(4));
}

export function diffEvidenceBundles(bundleA: string, bundleB: string): {
  bundleA: { runId: string; agentId: string; integrityIndex: number; overall: number; trustLabel: string };
  bundleB: { runId: string; agentId: string; integrityIndex: number; overall: number; trustLabel: string };
  deltas: {
    integrityIndex: number;
    overall: number;
    layer: Array<{ layerName: string; delta: number }>;
  };
} {
  const a = inspectEvidenceBundle(bundleA);
  const b = inspectEvidenceBundle(bundleB);

  const layerDeltas = a.run.layerScores.map((layer) => {
    const other = b.run.layerScores.find((item) => item.layerName === layer.layerName);
    return {
      layerName: layer.layerName,
      delta: Number(((other?.avgFinalLevel ?? 0) - layer.avgFinalLevel).toFixed(4))
    };
  });

  return {
    bundleA: {
      runId: a.run.runId,
      agentId: a.run.agentId,
      integrityIndex: a.run.integrityIndex,
      overall: overallFromRun(a.run),
      trustLabel: a.run.trustLabel
    },
    bundleB: {
      runId: b.run.runId,
      agentId: b.run.agentId,
      integrityIndex: b.run.integrityIndex,
      overall: overallFromRun(b.run),
      trustLabel: b.run.trustLabel
    },
    deltas: {
      integrityIndex: Number((b.run.integrityIndex - a.run.integrityIndex).toFixed(4)),
      overall: Number((overallFromRun(b.run) - overallFromRun(a.run)).toFixed(4)),
      layer: layerDeltas
    }
  };
}

export function loadBundleRunAndTrustMap(bundleFile: string): {
  run: DiagnosticReport;
  eventTrustTier: Map<string, string>;
  outcomeReport: Record<string, unknown> | null;
  experimentReport: Record<string, unknown> | null;
} {
  const extracted = withExtractedBundle(bundleFile);
  try {
    const run = parseRunFromBundle(extracted.rootDir);
    const eventTrustTier = trustTierByEventIdFromBundle(extracted.rootDir);
    const outcomeFile = join(extracted.rootDir, "outcomes", "report.json");
    const experimentFile = join(extracted.rootDir, "experiments", "report.json");
    return {
      run,
      eventTrustTier,
      outcomeReport: pathExists(outcomeFile) ? (JSON.parse(readUtf8(outcomeFile)) as Record<string, unknown>) : null,
      experimentReport: pathExists(experimentFile) ? (JSON.parse(readUtf8(experimentFile)) as Record<string, unknown>) : null
    };
  } finally {
    extracted.cleanup();
  }
}
