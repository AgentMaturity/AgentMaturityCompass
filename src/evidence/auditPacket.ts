import Database from "better-sqlite3";
import { readdirSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";
import { signWithPurposeKey } from "../keys/purposeProviders.js";
import { capturePurposePublication, assertPurposePublicationCurrent } from "../keys/purposePublication.js";
import { openLedger, verifyLedgerIntegrity } from "../ledger/ledger.js";
import { writeFileAtomic } from "../utils/fs.js";
import { canonicalize } from "../utils/json.js";
import { isWithin, physicalPathWithMissingSuffix } from "../utils/pathSafety.js";
import { captureRunHashAuthority } from "../ledger/runHashSignature.js";
import { captureOrgFiles, assertOrgPairsCurrent, orgPairBytes } from "../org/preparedOrgPairs.js";
import { assertKeysetComplete, keysetFileRel, keysetPaths } from "../keys/keyset.js";
import { getAgentPaths, fleetAgentsDir } from "../fleet/paths.js";
import { readSessionStoreMarker } from "../persistence/openSessionEventStore.js";
import { readEventRows } from "../persistence/jsonl/jsonlEventLog.js";
import { captureRetentionProofs } from "../ops/retention/retentionArchive.js";
import { sha256Hex } from "../utils/hash.js";
import {
  canonicalEvidenceDatasetHash,
  collectVerifierEvidenceFromDatabase,
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
    "- `keys/`: public keys and key history. They identify the keys; they do not vouch for this packet.",
    "- `meta/manifest.json` + `meta/manifest.sig.json`: packet manifest and auditor signature.",
    "",
    "Verification guide:",
    "1. Verify `meta/manifest.sig.json` and the `meta/manifest.json` hash with an auditor key pinned outside this packet: from your trust list, or a fingerprint the operator published when the vault was created. The copy in `keys/` only identifies which key to look up; a forger can replace it, so a match with it proves nothing.",
    "2. Verify file hashes in `meta/manifest.json`.",
    "3. Recompute and validate event hash chain and signatures using `ledger/evidence.sqlite` and monitor keys."
  ].join("\n");
}

const PACKET_PUBLIC_KEYS = [".amc/keys/monitor_ed25519.pub", ".amc/keys/auditor_ed25519.pub", ".amc/keys/monitor_history.json", ".amc/keys/auditor_history.json"];
interface AuditPacketProgress {
  phase: string; outputFile: string; ledgerOpenAttempted: boolean; ledgerOpened: boolean;
  outputCallEntered: boolean; outputReturned: boolean; outputAcknowledged: boolean;
  ledgerCloseAttempted: boolean; ledgerClosed: boolean; ledgerCloseFailed: boolean; publishedPaths: readonly string[];
}
class AuditPacketPublicationError extends Error {
  readonly code = "AUDIT_PACKET_INCOMPLETE";
  constructor(readonly progress: Readonly<AuditPacketProgress>, cause: unknown, readonly closeCause?: unknown) {
    super("audit packet did not complete; inspect output return/acknowledgment and readonly setup/close progress before retrying", { cause });
    this.name = "AuditPacketPublicationError";
  }
}
function directoryEntries(path: string) {
  try { return readdirSync(path, { withFileTypes: true }); }
  catch (cause) { if ((cause as NodeJS.ErrnoException).code === "ENOENT") return []; throw cause; }
}
/** Known consumed file families only; no recursive workspace inventory or host authorization claim. */
function verifierInputSelection(workspace: string, db: Database.Database) {
  const root = resolve(workspace, ".amc"), agentsRoot = fleetAgentsDir(workspace);
  const agentIds = directoryEntries(agentsRoot).filter(row => row.isDirectory()).map(row => row.name).sort();
  const targets = join(root, "targets"), archives = join(root, "archive", "ledger"), workorderRoots: string[] = [];
  const keyset = assertKeysetComplete(workspace), keys = keysetPaths(workspace);
  const paths = [join(root, "evidence.sqlite"), join(root, "evidence.sqlite-wal"), ...PACKET_PUBLIC_KEYS.map(path => resolve(workspace, path)),
    keys.keyset, keys.pending, ...(keyset === null ? [] : Object.keys(keyset.files).map(path => join(workspace, keysetFileRel(path)))),
    ...["amc.config.yaml", "amc.config.yaml.sig", "trust.yaml", "trust.yaml.sig", "fleet.yaml", "fleet.yaml.sig", "action-policy.yaml", "action-policy.yaml.sig",
      "tools.yaml", "tools.yaml.sig", "gateway.yaml", "gateway.yaml.sig", "session-store.json", "jsonl/events.jsonl", "jsonl/sessions.jsonl",
      "blobs/pruned.jsonl", "blobs/pruned.jsonl.sig", "blobs/index.jsonl", "blobs/index.jsonl.sig", "blobs/unvaulted.key", "blob-keys/current.json", "blob-keys/current.json.sig",
      "vault.amcvault", "keys/revocations.signed.json", "keys/revocations.signed.json.pending", "agent.config.yaml", "agent.config.yaml.sig",
      "context-graph.json", "agents/default/agent.config.yaml", "agents/default/context-graph.json"].map(path => join(root, path))];
  for (const row of directoryEntries(targets)) if (row.name.endsWith(".target.json")) paths.push(join(targets, row.name));
  for (const row of directoryEntries(archives)) if (row.name.endsWith(".jsonl.gz")) {
    const path = join(archives, row.name); paths.push(path, `${path}.manifest.json`, `${path}.manifest.sig`);
  }
  for (const agentId of agentIds) {
    const selected = getAgentPaths(workspace, agentId), orders = join(selected.rootDir, "workorders"); workorderRoots.push(orders);
    paths.push(selected.agentConfig, selected.agentConfigSig, selected.contextGraph);
    for (const row of directoryEntries(orders)) if (row.name.endsWith(".json")) {
      const path = join(orders, row.name); paths.push(path, `${path}.sig`);
    }
  }
  const events = db.prepare("SELECT * FROM evidence_events ORDER BY rowid ASC").all() as Record<string, unknown>[];
  if (readSessionStoreMarker(workspace) === "jsonl") {
    try { events.push(...readEventRows(workspace) as unknown as Record<string, unknown>[]); } catch { /* Actual verifier retains invalid-backend verdict; raw log remains captured. */ }
  }
  const retained = captureRetentionProofs(workspace);
  for (const archived of retained.index.archivedEvents.values()) events.push(archived.event as unknown as Record<string, unknown>);
  for (const event of events) for (const field of ["payload_path", "canonical_payload_path"]) {
    const path = event[field]; if (typeof path === "string" && path.length > 0) paths.push(join(workspace, path), resolve(path));
  }
  return { paths: [...new Set(paths.map(path => resolve(path)))].sort(), agentIds, agentsRoot, targets, archives, workorderRoots,
    physicalRoots: [agentsRoot, targets, archives, ...workorderRoots].map(path => physicalPathWithMissingSuffix(path)) };
}
function packetProjection(params: GenerateAuditPacketParams, db: Database.Database, generatedTs?: number) {
  return { dataset: collectVerifierEvidenceFromDatabase({ workspace: params.workspace, agentId: params.agentId,
    includeChain: params.includeChain ?? true, includeRationale: params.includeRationale ?? true }, db, generatedTs),
    incidents: queryRows(db, "incidents", "created_ts ASC"), incidentTransitions: queryRows(db, "incident_transitions", "ts ASC"),
    causalEdges: queryRows(db, "causal_edges", "added_ts ASC"), evidenceIncidentLinks: queryRows(db, "evidence_incident_links", "created_ts ASC"),
    corrections: queryRows(db, "corrections", "created_ts ASC"), evidenceCorrections: queryRows(db, "evidence_corrections", "created_ts ASC") };
}
function refuseSelectorOutput(output: string, selection: ReturnType<typeof verifierInputSelection>) {
  const physical = physicalPathWithMissingSuffix(output), roots = selection.physicalRoots;
  const singleName = (root: string) => isWithin(root, physical) ? relative(root, physical) : "";
  const targetName = singleName(roots[1]!), archiveName = singleName(roots[2]!);
  if ((targetName && !targetName.includes(sep) && targetName.endsWith(".target.json"))
    || (archiveName && !archiveName.includes(sep) && archiveName.endsWith(".jsonl.gz"))) throw new Error("audit packet output enters a consumed verifier selector");
  const agentName = singleName(roots[0]!);
  if (agentName.includes(sep) && !selection.agentIds.includes(agentName.split(sep)[0]!)) throw new Error("audit packet output would create a newly selected agent directory");
  for (const root of roots.slice(3)) { const name = singleName(root);
    if (name && !name.includes(sep) && name.endsWith(".json")) throw new Error("audit packet output enters a consumed work-order selector"); }
}

export async function generateAuditPacket(input: GenerateAuditPacketParams, options: { beforePublish?: () => void } = {}): Promise<GenerateAuditPacketResult> {
  const params = { ...input }, beforePublish = options.beforePublish, nowTs = Date.now(); beforePublish?.();
  const fixed = captureRunHashAuthority(params.workspace, false), publication = capturePurposePublication(params.workspace, "artifact-seal");
  const outFile = resolve(params.workspace, params.outputFile), physicalOutput = physicalPathWithMissingSuffix(outFile);
  let expectedOutput = captureOrgFiles([outFile]), ledger: ReturnType<typeof openLedger> | null = null;
  const expectedFingerprint = process.env.AMC_EXPECTED_MONITOR_FINGERPRINT;
  let phase = "ledger-open", ledgerOpenAttempted = false, ledgerOpened = false, outputCallEntered = false, outputReturned = false, outputAcknowledged = false;
  let ledgerCloseAttempted = false, ledgerClosed = false, ledgerCloseFailed = false, failed = false, primary: unknown, closeCause: unknown;
  let result: GenerateAuditPacketResult | null = null, signedCurrent: (() => void) | null = null;
  const publishedPaths: string[] = [];
  const assertAuthorityAndOutput = () => { beforePublish?.(); fixed(); signedCurrent?.();
    if (physicalPathWithMissingSuffix(outFile) !== physicalOutput) throw new Error("audit packet output physical selection changed");
    assertOrgPairsCurrent(expectedOutput); };
  const progress = (): Readonly<AuditPacketProgress> => Object.freeze({ phase, outputFile: outFile, ledgerOpenAttempted, ledgerOpened,
    outputCallEntered, outputReturned, outputAcknowledged, ledgerCloseAttempted, ledgerClosed, ledgerCloseFailed, publishedPaths: Object.freeze([...publishedPaths]) });
  try {
    assertAuthorityAndOutput(); ledgerOpenAttempted = true; ledger = openLedger(params.workspace, { readonly: true }); ledgerOpened = true; phase = "input-capture";
    const db = ledger.db, selection = verifierInputSelection(params.workspace, db), inputs = captureOrgFiles(selection.paths);
    const projection = packetProjection(params, db), dataset = projection.dataset, selected = canonicalize(projection);
    let integritySelected: string | null = null;
    const assertInputsCurrent = () => {
      assertAuthorityAndOutput();
      if (process.env.AMC_EXPECTED_MONITOR_FINGERPRINT !== expectedFingerprint) throw new Error("audit packet verifier trust-root selection changed");
      if (canonicalize(verifierInputSelection(params.workspace, db)) !== canonicalize(selection)) throw new Error("audit packet selected verifier inputs changed");
      assertOrgPairsCurrent(inputs);
      if (canonicalize(packetProjection(params, db, dataset.generatedTs)) !== selected) throw new Error("audit packet consumed SQL projection changed");
      // The actual verifier is synchronous. Its real current-time session predicate remains a negative, never a forged fixed verdict.
      if (integritySelected !== null && canonicalize(verifyLedgerIntegrity(params.workspace)) !== integritySelected) throw new Error("audit packet current integrity verdict changed");
      assertOrgPairsCurrent(inputs);
      refuseSelectorOutput(outFile, selection);
      const aliases = captureOrgFiles([...selection.paths, resolve(params.workspace, ".amc", "evidence.sqlite-shm")]);
      const output = captureOrgFiles([outFile]).members[0]!;
      for (const source of aliases.members) if (physicalPathWithMissingSuffix(source.path) === physicalOutput
        || (output.identity !== null && output.identity === source.identity)) throw new Error("audit packet output aliases a known consumed input");
      assertAuthorityAndOutput();
    };
    assertInputsCurrent(); phase = "ledger-verify";
    const integrity = await verifyLedgerIntegrity(params.workspace); // Preserve the existing microtask boundary.
    integritySelected = canonicalize(integrity); assertInputsCurrent();
    const entries: Array<{ path: string; bytes: Buffer; modifiedTs?: number }> = [];
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

    const { incidents, incidentTransitions, causalEdges, evidenceIncidentLinks, corrections, evidenceCorrections } = projection;

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
    if (orgPairBytes(inputs, sqlitePath) !== null) {
      entries.push({
        path: "ledger/evidence.sqlite",
        bytes: orgPairBytes(inputs, sqlitePath)!,
        modifiedTs: nowTs
      });
    }

    for (const relativePath of PACKET_PUBLIC_KEYS) {
      const full = resolve(params.workspace, relativePath);
      if (orgPairBytes(inputs, full) !== null) {
        entries.push({
          path: `keys/${relativePath.split("/").pop()}`,
          bytes: orgPairBytes(inputs, full)!,
          modifiedTs: nowTs
        });
      }
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
    phase = "manifest-sign";
    const signed = await signWithPurposeKey(params.workspace, "artifact-seal", Buffer.from(manifestSha256, "hex"), { beforeSign: assertInputsCurrent });
    signedCurrent = () => assertPurposePublicationCurrent(params.workspace, publication, signed);
    assertInputsCurrent();
    const manifestSig = {
      signer: "auditor" as const,
      signedTs: nowTs,
      manifestSha256,
      signature: signed.signature.toString("base64")
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

    const archive = createZipArchive(entries); phase = "output"; assertInputsCurrent();
    outputCallEntered = true; writeFileAtomic(outFile, archive, 0o644); outputReturned = true; publishedPaths.push(outFile);
    const own = captureOrgFiles([outFile]), body = own.members[0]!;
    if (body.bytes === null || body.mode !== 0o644 || !body.bytes.equals(archive)) throw new Error("audit packet output differs from exact prepared bytes or mode");
    expectedOutput = own; outputAcknowledged = true; phase = "final-inputs"; assertInputsCurrent();
    result = { outFile, sha256: sha256Hex(archive), fileCount: entries.length, eventCount: dataset.eventCount,
      chainInvalidCount: dataset.chainInvalidCount, integrityOk: integrity.ok };
  } catch (cause) { failed = true; primary = cause; }
  // No SQL transaction or publication lock spans any await. Close/setup effects are separate from the one output call.
  if (ledger !== null) { if (!failed) phase = "ledger-close"; ledgerCloseAttempted = true; try { ledger.close(); ledgerClosed = true; } catch (cause) { ledgerCloseFailed = true; closeCause = cause; } }
  if (failed || ledgerCloseFailed) throw new AuditPacketPublicationError(progress(), failed ? primary : closeCause, closeCause);
  phase = "return";
  try { assertAuthorityAndOutput(); } catch (cause) { throw new AuditPacketPublicationError(progress(), cause); }
  if (result === null) throw new AuditPacketPublicationError(progress(), new Error("audit packet result was not prepared"));
  return result;
}
