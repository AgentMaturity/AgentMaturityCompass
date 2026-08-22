import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type {
  AMCConfig,
  AssuranceRunRecord,
  EvidenceEvent,
  EvidenceEventType,
  OutcomeContractRecord,
  OutcomeEvent,
  RunRecord,
  RuntimeName,
  SessionRecord
} from "../types.js";
import { ensureSigningKeys, getPrivateKeyPem, getPublicKeyHistory, signHexDigest, verifyHexDigestAny } from "../crypto/keys.js";
import { verifyGatewayConfigSignature } from "../gateway/config.js";
import { verifyActionPolicySignature } from "../governor/actionPolicyEngine.js";
import { verifyToolsConfigSignature } from "../toolhub/toolhubValidators.js";
import { listAgents, verifyAgentConfigSignature, verifyFleetConfigSignature } from "../fleet/registry.js";
import { listWorkOrders, verifyWorkOrder } from "../workorders/workorderEngine.js";
import { ensureDir, pathExists, writeFileAtomic } from "../utils/fs.js";
import { sha256Hex } from "../utils/hash.js";
import { canonicalize } from "../utils/json.js";
import { mintReceipt, verifyReceipt, type ReceiptKind } from "../receipts/receipt.js";
import { loadOpsPolicy } from "../ops/policy.js";
import { loadBlobPlaintext, storeEncryptedBlob } from "../storage/blobs/blobStore.js";
import { getOrCreateSqlitePool, type SqliteConnectionLease } from "../storage/sqlitePool.js";
import { createIncidentStore } from "../incidents/incidentStore.js";
import type { Incident, CausalRelationship } from "../incidents/incidentTypes.js";
import { queueEvidenceEventSpan } from "../observability/otelExporter.js";
import { buildRetentionProofIndex, type RetentionProofIndex } from "../ops/retention/retentionArchive.js";
import { verifyAmcConfigSignature } from "../config/amcConfigSignature.js";


export interface AppendEvidenceInput {
  sessionId: string;
  runtime: RuntimeName;
  eventType: EvidenceEventType;
  payload?: string | Buffer;
  payloadPath?: string;
  payloadExt?: "txt" | "json";
  inline?: boolean;
  meta?: Record<string, unknown>;
  id?: string;
  ts?: number;
}

export interface AppendEvidenceResult {
  id: string;
  ts: number;
  payloadSha256: string;
  eventHash: string;
  writerSig: string;
}

export interface AppendEvidenceWithReceiptInput extends AppendEvidenceInput {
  receipt: {
    kind: ReceiptKind;
    agentId: string;
    providerId: string;
    model: string | null;
    bodySha256: string;
  };
}


export interface EvidenceLedgerReader {
  readonly workspace: string;
  readonly db: Database.Database;
}


export interface AppendOutcomeEventInput {
  ts?: number;
  agentId: string;
  workOrderId?: string | null;
  category: "Emotional" | "Functional" | "Economic" | "Brand" | "Lifetime";
  metricId: string;
  value: number | string | boolean;
  unit?: string | null;
  trustTier: "OBSERVED" | "ATTESTED" | "SELF_REPORTED";
  source: "toolhub" | "webhook" | "manual" | "import";
  meta?: Record<string, unknown>;
  payload?: string;
  sessionId?: string;
}

import { hasTable, runMigrations, reconcileLegacyMigrationState } from "./ledgerSchema.js";

function ledgerPath(workspace: string): string {
  return join(workspace, ".amc", "evidence.sqlite");
}

function blobDir(workspace: string): string {
  return join(workspace, ".amc", "blobs");
}

export function targetsDir(workspace: string): string {
  return join(workspace, ".amc", "targets");
}

function runsDir(workspace: string): string {
  return join(workspace, ".amc", "runs");
}

function parsePoolSize(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function ledgerPoolSize(): number {
  return parsePoolSize(process.env.AMC_LEDGER_SQLITE_POOL_SIZE ?? process.env.AMC_SQLITE_POOL_SIZE, 4);
}

type SqliteSyncMode = "OFF" | "NORMAL" | "FULL" | "EXTRA";

function ledgerSynchronousMode(): SqliteSyncMode {
  const raw = (process.env.AMC_LEDGER_SQLITE_SYNCHRONOUS ?? "FULL").trim().toUpperCase();
  if (raw === "OFF" || raw === "NORMAL" || raw === "FULL" || raw === "EXTRA") {
    return raw;
  }
  return "FULL";
}

function ledgerPoolKey(workspace: string): string {
  return `ledger:${resolve(workspace)}:${ledgerPath(workspace)}`;
}


function sanitizeMetaForHash(metaJson: string): string {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(metaJson) as Record<string, unknown>;
  } catch {
    return metaJson;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return metaJson;
  }
  const clone: Record<string, unknown> = { ...parsed };
  delete clone.receipt;
  delete clone.receipt_sha256;
  return JSON.stringify(clone);
}

export function canonicalMetadataForHash(params: {
  id: string;
  ts: number;
  sessionId: string;
  runtime: RuntimeName;
  eventType: EvidenceEventType;
  payloadPath: string | null;
  payloadInline: string | null;
  metaJson: string;
}): string {
  return canonicalize({
    id: params.id,
    ts: params.ts,
    session_id: params.sessionId,
    runtime: params.runtime,
    event_type: params.eventType,
    payload_path: params.payloadPath,
    payload_inline: params.payloadInline,
    meta_json: sanitizeMetaForHash(params.metaJson)
  });
}

function firstString(
  source: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function stringArray(value: unknown): string[] {
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

function contextFromEvidenceMeta(meta: Record<string, unknown>): {
  agentId: string | null;
  explicitIncidentIds: string[];
  triggerIds: string[];
  questionIds: string[];
} {
  const explicitIncidentIds = [
    ...stringArray(meta.incidentId),
    ...stringArray(meta.incident_id),
    ...stringArray(meta.incidentIds),
    ...stringArray(meta.incident_ids)
  ];
  const triggerIds = [
    ...stringArray(meta.triggerId),
    ...stringArray(meta.trigger_id)
  ];
  const questionIds = [
    ...stringArray(meta.questionId),
    ...stringArray(meta.question_id),
    ...stringArray(meta.questionIds),
    ...stringArray(meta.question_ids),
    ...stringArray(meta.affectedQuestionIds),
    ...stringArray(meta.affected_question_ids)
  ];
  return {
    agentId: firstString(meta, ["agentId", "agent_id"]),
    explicitIncidentIds: [...new Set(explicitIncidentIds)],
    triggerIds: [...new Set(triggerIds)],
    questionIds: [...new Set(questionIds)]
  };
}

const AUTO_INCIDENT_FALLBACK_EVENT_TYPES = new Set<EvidenceEventType>([
  "audit",
  "review",
  "test",
  "metric",
  "artifact",
  "tool_action",
  "tool_result",
  "outcome"
]);

const EVIDENCE_EVENT_INSERT_SQL = `
  INSERT INTO evidence_events
  (id, ts, session_id, runtime, event_type, payload_path, payload_inline, payload_sha256, meta_json, prev_event_hash, event_hash, writer_sig, canonical_payload_path, canonical_payload_inline, blob_ref, archived, archive_segment_id, archive_manifest_sha256, payload_pruned, payload_pruned_ts)
  VALUES (@id, @ts, @session_id, @runtime, @event_type, @payload_path, @payload_inline, @payload_sha256, @meta_json, @prev_event_hash, @event_hash, @writer_sig, @canonical_payload_path, @canonical_payload_inline, @blob_ref, @archived, @archive_segment_id, @archive_manifest_sha256, @payload_pruned, @payload_pruned_ts)
`;

export class Ledger {
  readonly workspace: string;
  readonly db: Database.Database;
  private readonly dbLease: SqliteConnectionLease;
  private readonly unsignedSignatures: boolean;
  private incidentStoreInitialized = false;

  constructor(workspace: string) {
    this.workspace = workspace;
    this.unsignedSignatures = process.env.AMC_NO_SIGN === "1";
    ensureDir(join(workspace, ".amc"));
    ensureDir(blobDir(workspace));
    ensureDir(targetsDir(workspace));
    ensureDir(runsDir(workspace));
    if (!this.unsignedSignatures) {
      ensureSigningKeys(workspace);
    }

    const pool = getOrCreateSqlitePool({
      key: ledgerPoolKey(workspace),
      dbPath: ledgerPath(workspace),
      maxSize: ledgerPoolSize(),
      configureConnection: (db) => {
        db.pragma("journal_mode = WAL");
        db.pragma("foreign_keys = ON");
        db.pragma("busy_timeout = 5000");
        db.pragma(`synchronous = ${ledgerSynchronousMode()}`);
      },
      initialize: (db) => {
        runMigrations(db);
      }
    });

    this.dbLease = pool.acquire();
    this.db = this.dbLease.db;
    try {
      reconcileLegacyMigrationState(this.db);
    } catch (error) {
      this.dbLease.release();
      throw error;
    }
  }

  close(): void {
    this.dbLease.release();
  }

  private monitorPrivateKey(): string {
    return getPrivateKeyPem(this.workspace, "monitor");
  }

  private auditorPrivateKey(): string {
    return getPrivateKeyPem(this.workspace, "auditor");
  }

  private signMonitorDigest(digestHex: string): string {
    return this.unsignedSignatures ? "unsigned" : signHexDigest(digestHex, this.monitorPrivateKey());
  }

  private signAuditorDigest(digestHex: string): string {
    return this.unsignedSignatures ? "unsigned" : signHexDigest(digestHex, this.auditorPrivateKey());
  }

  private assertTrustedWriter(): void {
    if (process.env.AMC_EVALUATED_AGENT === "1") {
      throw new Error("untrusted evaluated agent process cannot write to AMC ledger");
    }
  }

  private runImmediateTransaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // no-op: rollback best effort
      }
      throw error;
    }
  }

  private latestEventHash(): string {
    const row = this.db.prepare("SELECT event_hash FROM evidence_events ORDER BY rowid DESC LIMIT 1").get() as
      | { event_hash: string }
      | undefined;
    return row?.event_hash ?? "GENESIS";
  }

  private latestOutcomeEventHash(): string {
    const row = this.db
      .prepare("SELECT event_hash FROM outcome_events ORDER BY rowid DESC LIMIT 1")
      .get() as { event_hash: string } | undefined;
    return row?.event_hash ?? "GENESIS_OUTCOME";
  }

  private storeBlob(payload: Buffer, _ext: "txt" | "json"): { path: string; sha: string; blobRef: string | null } {
    const policy = loadOpsPolicy(this.workspace);
    if (payload.byteLength > policy.opsPolicy.retention.maxBlobBytes) {
      throw new Error(
        `payload exceeds max blob bytes (${payload.byteLength} > ${policy.opsPolicy.retention.maxBlobBytes})`
      );
    }
    if (!policy.opsPolicy.encryption.blobEncryptionEnabled) {
      const sha = sha256Hex(payload);
      const name = `${sha}.txt`;
      const full = join(blobDir(this.workspace), name);
      if (!pathExists(full)) {
        writeFileAtomic(full, payload);
      }
      return { path: join(".amc", "blobs", name), sha, blobRef: null };
    }
    const stored = storeEncryptedBlob(this.workspace, payload);
    return {
      path: stored.path,
      sha: stored.payloadSha256,
      blobRef: stored.blobId
    };
  }

  private ensureIncidentStore() {
    const store = createIncidentStore(this.db);
    if (!this.incidentStoreInitialized) {
      store.initTables();
      this.incidentStoreInitialized = true;
    }
    return store;
  }

  private appendEvidenceIncidentLink(params: {
    eventId: string;
    incidentId: string;
    relationship: CausalRelationship;
    confidence: number;
    reason: string;
    createdTs: number;
  }): void {
    if (!hasTable(this.db, "evidence_incident_links")) {
      return;
    }
    const existing = this.db
      .prepare("SELECT 1 FROM evidence_incident_links WHERE event_id = ? AND incident_id = ? LIMIT 1")
      .get(params.eventId, params.incidentId);
    if (existing) {
      return;
    }

    const linkId = `eil_${randomUUID().replace(/-/g, "")}`;
    const canonical = canonicalize({
      link_id: linkId,
      event_id: params.eventId,
      incident_id: params.incidentId,
      relationship: params.relationship,
      confidence: params.confidence,
      reason: params.reason,
      source: "AUTO_OPEN_INCIDENT_MATCH",
      created_ts: params.createdTs,
      created_by: "AUTO"
    });
    const signature = signHexDigest(sha256Hex(canonical), this.monitorPrivateKey());

    this.db
      .prepare(
        `INSERT INTO evidence_incident_links
         (link_id, event_id, incident_id, relationship, confidence, reason, source, created_ts, created_by, signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        linkId,
        params.eventId,
        params.incidentId,
        params.relationship,
        params.confidence,
        params.reason,
        "AUTO_OPEN_INCIDENT_MATCH",
        params.createdTs,
        "AUTO",
        signature
      );

    if (!hasTable(this.db, "causal_edges")) {
      return;
    }

    const existingEdge = this.db
      .prepare("SELECT 1 FROM causal_edges WHERE incident_id = ? AND from_event_id = ? AND to_event_id = ? LIMIT 1")
      .get(params.incidentId, params.eventId, params.incidentId);
    if (existingEdge) {
      return;
    }

    const edgeId = `edge_${randomUUID().replace(/-/g, "")}`;
    const edgePayload = canonicalize({
      edge_id: edgeId,
      from_event_id: params.eventId,
      to_event_id: params.incidentId,
      relationship: params.relationship,
      confidence: params.confidence,
      evidence: [params.eventId],
      added_ts: params.createdTs,
      added_by: "AUTO"
    });
    const edgeSig = signHexDigest(sha256Hex(edgePayload), this.monitorPrivateKey());
    this.db
      .prepare(
        `INSERT INTO causal_edges
         (edge_id, incident_id, from_event_id, to_event_id, relationship, confidence, evidence_json, added_ts, added_by, signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        edgeId,
        params.incidentId,
        params.eventId,
        params.incidentId,
        params.relationship,
        params.confidence,
        JSON.stringify([params.eventId]),
        params.createdTs,
        "AUTO",
        edgeSig
      );
  }

  private autoLinkEvidenceToOpenIncidents(params: {
    eventId: string;
    eventType: EvidenceEventType;
    meta: Record<string, unknown>;
    ts: number;
  }): void {
    const context = contextFromEvidenceMeta(params.meta);
    if (!context.agentId) {
      return;
    }

    let open: Incident[] = [];
    try {
      const store = this.ensureIncidentStore();
      open = store.getOpenIncidents(context.agentId);
    } catch {
      return;
    }
    if (open.length === 0) {
      return;
    }

    for (const incident of open) {
      const reasons: string[] = [];
      let confidence = 0.5;

      if (context.explicitIncidentIds.includes(incident.incidentId)) {
        reasons.push("meta.incidentId match");
        confidence = Math.max(confidence, 1);
      }
      if (context.triggerIds.includes(incident.triggerId)) {
        reasons.push("meta.triggerId match");
        confidence = Math.max(confidence, 0.9);
      }
      if (context.questionIds.some((questionId) => incident.affectedQuestionIds.includes(questionId))) {
        reasons.push("affected question overlap");
        confidence = Math.max(confidence, 0.75);
      }
      if (
        reasons.length === 0 &&
        open.length === 1 &&
        AUTO_INCIDENT_FALLBACK_EVENT_TYPES.has(params.eventType)
      ) {
        reasons.push("single open incident fallback");
        confidence = Math.max(confidence, 0.4);
      }
      if (reasons.length === 0) {
        continue;
      }
      this.appendEvidenceIncidentLink({
        eventId: params.eventId,
        incidentId: incident.incidentId,
        relationship: "CORRELATED",
        confidence,
        reason: reasons.join("; "),
        createdTs: params.ts
      });
    }
  }

  private materializePayloadPath(
    payloadPath: string,
    payload?: string | Buffer,
    maxPayloadBytes?: number
  ): { relativePath: string; bytes: Buffer } {
    const workspaceRoot = resolve(this.workspace);
    const fullPath = resolve(this.workspace, payloadPath);
    if (fullPath !== workspaceRoot && !fullPath.startsWith(`${workspaceRoot}/`)) {
      throw new Error(`payloadPath must stay inside workspace: ${payloadPath}`);
    }
    if (payload !== undefined) {
      const bytes = typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
      if (maxPayloadBytes !== undefined && bytes.byteLength > maxPayloadBytes) {
        throw new Error(`payload exceeds max bytes for payloadPath (${bytes.byteLength} > ${maxPayloadBytes})`);
      }
      writeFileAtomic(fullPath, bytes);
      return {
        relativePath: relative(this.workspace, fullPath).replace(/\\/g, "/"),
        bytes
      };
    }
    if (!pathExists(fullPath)) {
      throw new Error(`payloadPath not found: ${payloadPath}`);
    }
    return {
      relativePath: relative(this.workspace, fullPath).replace(/\\/g, "/"),
      bytes: readFileSync(fullPath)
    };
  }

  private buildEvidenceInsert(params: {
    input: AppendEvidenceInput;
    id: string;
    ts: number;
    prevHash: string;
    policy?: ReturnType<typeof loadOpsPolicy>;
  }): {
    row: Record<string, unknown>;
    meta: Record<string, unknown>;
    result: AppendEvidenceResult;
  } {
    const { input, id, ts, prevHash } = params;
    const policy = params.policy ?? loadOpsPolicy(this.workspace);
    const payload = input.payload;
    let payloadPath: string | null = null;
    let payloadInline: string | null = null;
    let blobRef: string | null = null;
    let payloadSha256 = sha256Hex(Buffer.alloc(0));

    if (input.payloadPath) {
      const materialized = this.materializePayloadPath(input.payloadPath, payload, policy.opsPolicy.retention.maxBlobBytes);
      payloadPath = materialized.relativePath;
      payloadSha256 = sha256Hex(materialized.bytes);
    } else if (payload !== undefined) {
      const bytes = typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
      if (bytes.byteLength > policy.opsPolicy.retention.maxPayloadBytesPerEvent) {
        throw new Error(
          `payload exceeds max bytes per event (${bytes.byteLength} > ${policy.opsPolicy.retention.maxPayloadBytesPerEvent})`
        );
      }
      payloadSha256 = sha256Hex(bytes);
      if (input.inline) {
        payloadInline = bytes.toString("utf8");
      } else {
        const blob = this.storeBlob(bytes, input.payloadExt ?? "txt");
        payloadPath = blob.path;
        blobRef = blob.blobRef;
      }
    }

    const meta = input.meta ?? {};
    const metaJson = JSON.stringify(meta);
    const canonicalMetadata = canonicalMetadataForHash({
      id,
      ts,
      sessionId: input.sessionId,
      runtime: input.runtime,
      eventType: input.eventType,
      payloadPath,
      payloadInline,
      metaJson
    });
    const eventHash = sha256Hex(`${prevHash}${canonicalMetadata}${payloadSha256}`);
    const writerSig = this.signMonitorDigest(eventHash);

    return {
      row: {
        id,
        ts,
        session_id: input.sessionId,
        runtime: input.runtime,
        event_type: input.eventType,
        payload_path: payloadPath,
        payload_inline: payloadInline,
        payload_sha256: payloadSha256,
        meta_json: metaJson,
        prev_event_hash: prevHash,
        event_hash: eventHash,
        writer_sig: writerSig,
        canonical_payload_path: payloadPath,
        canonical_payload_inline: payloadInline,
        blob_ref: blobRef,
        archived: 0,
        archive_segment_id: null,
        archive_manifest_sha256: null,
        payload_pruned: 0,
        payload_pruned_ts: null
      },
      meta,
      result: {
        id,
        ts,
        payloadSha256,
        eventHash,
        writerSig
      }
    };
  }

  appendEvidenceDetailed(input: AppendEvidenceInput): AppendEvidenceResult {
    this.assertTrustedWriter();
    const prepared = this.runImmediateTransaction(() => {
      const id = input.id ?? randomUUID();
      const ts = input.ts ?? Date.now();
      const candidate = this.buildEvidenceInsert({
        input,
        id,
        ts,
        prevHash: this.latestEventHash()
      });
      this.db.prepare(EVIDENCE_EVENT_INSERT_SQL).run(candidate.row);
      return candidate;
    });
    queueEvidenceEventSpan(prepared.row as unknown as EvidenceEvent);

    this.autoLinkEvidenceToOpenIncidents({
      eventId: prepared.result.id,
      eventType: input.eventType,
      meta: prepared.meta,
      ts: prepared.result.ts
    });

    return prepared.result;
  }

  appendEvidenceBatch(
    inputs: AppendEvidenceInput[],
    options: {
      autoLink?: boolean;
    } = {}
  ): AppendEvidenceResult[] {
    this.assertTrustedWriter();
    if (inputs.length === 0) {
      return [];
    }
    const autoLink = options.autoLink ?? true;
    const results: AppendEvidenceResult[] = [];
    const autoLinkRows: Array<{
      eventId: string;
      eventType: EvidenceEventType;
      meta: Record<string, unknown>;
      ts: number;
    }> = [];
    const insert = this.db.prepare(EVIDENCE_EVENT_INSERT_SQL);
    const spanRows: EvidenceEvent[] = [];
    const policy = loadOpsPolicy(this.workspace);
    this.runImmediateTransaction(() => {
      let previousHash = this.latestEventHash();
      for (const input of inputs) {
        const id = input.id ?? randomUUID();
        const ts = input.ts ?? Date.now();
        const prepared = this.buildEvidenceInsert({
          input,
          id,
          ts,
          prevHash: previousHash,
          policy
        });
        insert.run(prepared.row);
        spanRows.push(prepared.row as unknown as EvidenceEvent);
        previousHash = prepared.result.eventHash;
        results.push(prepared.result);
        if (autoLink) {
          autoLinkRows.push({
            eventId: prepared.result.id,
            eventType: input.eventType,
            meta: prepared.meta,
            ts: prepared.result.ts
          });
        }
      }
    });
    for (const row of spanRows) {
      queueEvidenceEventSpan(row);
    }

    if (autoLink) {
      for (const row of autoLinkRows) {
        this.autoLinkEvidenceToOpenIncidents(row);
      }
    }

    return results;
  }

  appendEvidence(input: AppendEvidenceInput): string {
    return this.appendEvidenceDetailed(input).id;
  }

  appendEvidenceWithReceipt(input: AppendEvidenceWithReceiptInput): AppendEvidenceResult & {
    receipt: string;
    receiptId: string;
    receiptSha256: string;
  } {
    this.assertTrustedWriter();
    const id = input.id ?? randomUUID();
    const ts = input.ts ?? Date.now();
    const policy = loadOpsPolicy(this.workspace);
    const payload = input.payload;
    let payloadPath: string | null = null;
    let payloadInline: string | null = null;
    let blobRef: string | null = null;
    let payloadSha256 = sha256Hex(Buffer.alloc(0));

    if (input.payloadPath) {
      const materialized = this.materializePayloadPath(input.payloadPath, payload, policy.opsPolicy.retention.maxBlobBytes);
      payloadPath = materialized.relativePath;
      payloadSha256 = sha256Hex(materialized.bytes);
    } else if (payload !== undefined) {
      const bytes = typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
      if (bytes.byteLength > policy.opsPolicy.retention.maxPayloadBytesPerEvent) {
        throw new Error(
          `payload exceeds max bytes per event (${bytes.byteLength} > ${policy.opsPolicy.retention.maxPayloadBytesPerEvent})`
        );
      }
      payloadSha256 = sha256Hex(bytes);
      if (input.inline) {
        payloadInline = bytes.toString("utf8");
      } else {
        const blob = this.storeBlob(bytes, input.payloadExt ?? "txt");
        payloadPath = blob.path;
        blobRef = blob.blobRef;
      }
    }

    const canonicalPayloadPath = payloadPath;
    const canonicalPayloadInline = payloadInline;

    const prepared = this.runImmediateTransaction(() => {
      const receiptId = randomUUID();
      const baseMeta = {
        ...(input.meta ?? {}),
        receipt_id: receiptId
      };
      const baseMetaJson = JSON.stringify(baseMeta);
      const prevHash = this.latestEventHash();
      const baseCanonicalMetadata = canonicalMetadataForHash({
        id,
        ts,
        sessionId: input.sessionId,
        runtime: input.runtime,
        eventType: input.eventType,
        payloadPath,
        payloadInline,
        metaJson: baseMetaJson
      });
      const eventHash = sha256Hex(`${prevHash}${baseCanonicalMetadata}${payloadSha256}`);
      const minted = mintReceipt({
        kind: input.receipt.kind,
        ts,
        agentId: input.receipt.agentId,
        providerId: input.receipt.providerId,
        model: input.receipt.model,
        eventHash,
        bodySha256: input.receipt.bodySha256,
        sessionId: input.sessionId,
        privateKeyPem: this.monitorPrivateKey(),
        receiptId
      });

      const metaJson = JSON.stringify({
        ...baseMeta,
        receipt_sha256: minted.receiptSha256,
        receipt: minted.receipt
      });
      const canonicalMetadata = canonicalMetadataForHash({
        id,
        ts,
        sessionId: input.sessionId,
        runtime: input.runtime,
        eventType: input.eventType,
        payloadPath,
        payloadInline,
        metaJson
      });
      const recalculated = sha256Hex(`${prevHash}${canonicalMetadata}${payloadSha256}`);
      const writerSig = signHexDigest(recalculated, this.monitorPrivateKey());

      const row = {
        id,
        ts,
        session_id: input.sessionId,
        runtime: input.runtime,
        event_type: input.eventType,
        payload_path: payloadPath,
        payload_inline: payloadInline,
        payload_sha256: payloadSha256,
        meta_json: metaJson,
        prev_event_hash: prevHash,
        event_hash: recalculated,
        writer_sig: writerSig,
        canonical_payload_path: canonicalPayloadPath,
        canonical_payload_inline: canonicalPayloadInline,
        blob_ref: blobRef,
        archived: 0,
        archive_segment_id: null,
        archive_manifest_sha256: null,
        payload_pruned: 0,
        payload_pruned_ts: null
      };
      this.db
        .prepare(EVIDENCE_EVENT_INSERT_SQL)
        .run(row);

      return {
        row,
        baseMeta,
        result: {
          id,
          ts,
          payloadSha256,
          eventHash: recalculated,
          writerSig,
          receipt: minted.receipt,
          receiptId: minted.payload.receipt_id,
          receiptSha256: minted.receiptSha256
        }
      };
    });

    queueEvidenceEventSpan(prepared.row as unknown as EvidenceEvent);

    this.autoLinkEvidenceToOpenIncidents({
      eventId: id,
      eventType: input.eventType,
      meta: prepared.baseMeta,
      ts
    });

    return prepared.result;
  }

  appendOutcomeEvent(input: AppendOutcomeEventInput): {
    outcomeEventId: string;
    eventHash: string;
    signature: string;
    receiptId: string;
    receipt: string;
    payloadSha256: string;
  } {
    this.assertTrustedWriter();
    const outcomeEventId = randomUUID();
    const ts = input.ts ?? Date.now();
    const sessionId = input.sessionId ?? `outcome-${input.agentId}`;
    const metaJson = JSON.stringify(input.meta ?? {});
    const payloadText =
      input.payload ??
      canonicalize({
        metricId: input.metricId,
        value: input.value,
        unit: input.unit ?? null,
        meta: input.meta ?? {}
      });
    const payloadSha256 = sha256Hex(Buffer.from(payloadText, "utf8"));
    return this.runImmediateTransaction(() => {
      const prevHash = this.latestOutcomeEventHash();
      const eventHash = sha256Hex(
        `${prevHash}${canonicalize({
          outcome_event_id: outcomeEventId,
          ts,
          agent_id: input.agentId,
          work_order_id: input.workOrderId ?? null,
          category: input.category,
          metric_id: input.metricId,
          value: input.value,
          unit: input.unit ?? null,
          trust_tier: input.trustTier,
          source: input.source,
          meta_json: metaJson,
          payload_sha256: payloadSha256
        })}`
      );
      const signature = signHexDigest(eventHash, this.monitorPrivateKey());
      const minted = mintReceipt({
        kind: "guard_check",
        ts,
        agentId: input.agentId,
        providerId: "outcomes",
        model: null,
        eventHash,
        bodySha256: payloadSha256,
        sessionId,
        privateKeyPem: this.monitorPrivateKey()
      });

      this.db
        .prepare(
          `INSERT INTO outcome_events
          (outcome_event_id, ts, agent_id, work_order_id, category, metric_id, value, unit, trust_tier, source, meta_json, prev_event_hash, event_hash, signature, receipt_id, receipt, payload_sha256)
          VALUES (@outcome_event_id, @ts, @agent_id, @work_order_id, @category, @metric_id, @value, @unit, @trust_tier, @source, @meta_json, @prev_event_hash, @event_hash, @signature, @receipt_id, @receipt, @payload_sha256)`
        )
        .run({
          outcome_event_id: outcomeEventId,
          ts,
          agent_id: input.agentId,
          work_order_id: input.workOrderId ?? null,
          category: input.category,
          metric_id: input.metricId,
          value: JSON.stringify(input.value),
          unit: input.unit ?? null,
          trust_tier: input.trustTier,
          source: input.source,
          meta_json: metaJson,
          prev_event_hash: prevHash,
          event_hash: eventHash,
          signature,
          receipt_id: minted.payload.receipt_id,
          receipt: minted.receipt,
          payload_sha256: payloadSha256
        });

      return {
        outcomeEventId,
        eventHash,
        signature,
        receiptId: minted.payload.receipt_id,
        receipt: minted.receipt,
        payloadSha256
      };
    });
  }

  insertOutcomeContract(record: Omit<OutcomeContractRecord, "created_ts"> & { createdTs?: number }): void {
    this.assertTrustedWriter();
    this.db
      .prepare(
        `INSERT INTO outcome_contracts
        (contract_id, agent_id, file_path, sha256, sig_valid, created_ts, signer_fpr)
        VALUES (@contract_id, @agent_id, @file_path, @sha256, @sig_valid, @created_ts, @signer_fpr)`
      )
      .run({
        contract_id: record.contract_id,
        agent_id: record.agent_id,
        file_path: record.file_path,
        sha256: record.sha256,
        sig_valid: record.sig_valid,
        created_ts: record.createdTs ?? Date.now(),
        signer_fpr: record.signer_fpr
      });
  }

  startSession(params: {
    sessionId: string;
    runtime: RuntimeName;
    binaryPath: string;
    binarySha256: string;
  }): void {
    this.assertTrustedWriter();
    this.db
      .prepare(
        `INSERT INTO sessions
        (session_id, started_ts, ended_ts, runtime, binary_path, binary_sha256, session_final_event_hash, session_seal_sig)
        VALUES (@session_id, @started_ts, NULL, @runtime, @binary_path, @binary_sha256, NULL, NULL)`
      )
      .run({
        session_id: params.sessionId,
        started_ts: Date.now(),
        runtime: params.runtime,
        binary_path: params.binaryPath,
        binary_sha256: params.binarySha256
      });
  }

  sealSession(sessionId: string): void {
    this.assertTrustedWriter();
    const row = this.db
      .prepare(
        `SELECT event_hash FROM evidence_events
         WHERE session_id = ?
         ORDER BY rowid DESC
         LIMIT 1`
      )
      .get(sessionId) as { event_hash: string } | undefined;

    const finalHash = row?.event_hash ?? sha256Hex("EMPTY_SESSION");
    const sealSig = this.signMonitorDigest(finalHash);

    this.db
      .prepare(
        `UPDATE sessions
         SET ended_ts = @ended_ts,
             session_final_event_hash = @session_final_event_hash,
             session_seal_sig = @session_seal_sig
         WHERE session_id = @session_id`
      )
      .run({
        ended_ts: Date.now(),
        session_final_event_hash: finalHash,
        session_seal_sig: sealSig,
        session_id: sessionId
      });
  }

  insertRun(record: Omit<RunRecord, "ts"> & { ts?: number }): void {
    this.assertTrustedWriter();
    this.db
      .prepare(
        `INSERT INTO runs
         (run_id, ts, window_start_ts, window_end_ts, target_profile_id, report_json_sha256, run_seal_sig, status)
         VALUES (@run_id, @ts, @window_start_ts, @window_end_ts, @target_profile_id, @report_json_sha256, @run_seal_sig, @status)`
      )
      .run({
        run_id: record.run_id,
        ts: record.ts ?? Date.now(),
        window_start_ts: record.window_start_ts,
        window_end_ts: record.window_end_ts,
        target_profile_id: record.target_profile_id,
        report_json_sha256: record.report_json_sha256,
        run_seal_sig: record.run_seal_sig,
        status: record.status
      });
  }

  insertAssuranceRun(
    record: Omit<AssuranceRunRecord, "ts"> & { ts?: number }
  ): void {
    this.assertTrustedWriter();
    this.db
      .prepare(
        `INSERT INTO assurance_runs
         (assurance_run_id, agent_id, ts, window_start_ts, window_end_ts, mode, pack_ids_json, report_json_sha256, run_seal_sig, status)
         VALUES (@assurance_run_id, @agent_id, @ts, @window_start_ts, @window_end_ts, @mode, @pack_ids_json, @report_json_sha256, @run_seal_sig, @status)`
      )
      .run({
        assurance_run_id: record.assurance_run_id,
        agent_id: record.agent_id,
        ts: record.ts ?? Date.now(),
        window_start_ts: record.window_start_ts,
        window_end_ts: record.window_end_ts,
        mode: record.mode,
        pack_ids_json: record.pack_ids_json,
        report_json_sha256: record.report_json_sha256,
        run_seal_sig: record.run_seal_sig,
        status: record.status
      });
  }

  signRunHash(hashHex: string): string {
    return this.signAuditorDigest(hashHex);
  }

  getEventsBetween(startTs: number, endTs: number): EvidenceEvent[] {
    return this.db
      .prepare(
        `SELECT * FROM evidence_events WHERE ts >= ? AND ts <= ? ORDER BY rowid ASC`
      )
      .all(startTs, endTs) as EvidenceEvent[];
  }

  getSessionsBetween(startTs: number, endTs: number): SessionRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM sessions WHERE started_ts <= ? AND COALESCE(ended_ts, started_ts) >= ? ORDER BY started_ts ASC`
      )
      .all(endTs, startTs) as SessionRecord[];
  }

  getRun(runId: string): RunRecord | null {
    const row = this.db.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId) as RunRecord | undefined;
    return row ?? null;
  }

  getEventById(eventId: string): EvidenceEvent | null {
    const row = this.db
      .prepare("SELECT * FROM evidence_events WHERE id = ?")
      .get(eventId) as EvidenceEvent | undefined;
    return row ?? null;
  }

  listRuns(): RunRecord[] {
    return this.db.prepare("SELECT * FROM runs ORDER BY ts DESC").all() as RunRecord[];
  }

  getAssuranceRun(assuranceRunId: string): AssuranceRunRecord | null {
    const row = this.db
      .prepare("SELECT * FROM assurance_runs WHERE assurance_run_id = ?")
      .get(assuranceRunId) as AssuranceRunRecord | undefined;
    return row ?? null;
  }

  listAssuranceRuns(agentId?: string): AssuranceRunRecord[] {
    if (agentId && agentId.length > 0) {
      return this.db
        .prepare("SELECT * FROM assurance_runs WHERE agent_id = ? ORDER BY ts DESC")
        .all(agentId) as AssuranceRunRecord[];
    }
    return this.db
      .prepare("SELECT * FROM assurance_runs ORDER BY ts DESC")
      .all() as AssuranceRunRecord[];
  }

  getAllEvents(): EvidenceEvent[] {
    return this.db.prepare("SELECT * FROM evidence_events ORDER BY rowid ASC").all() as EvidenceEvent[];
  }

  getRetentionEligibleEvents(params: {
    archiveBeforeTs: number;
    pruneBeforeTs: number;
  }): {
    archive: EvidenceEvent[];
    prune: EvidenceEvent[];
  } {
    const archive = this.db
      .prepare(
        `SELECT * FROM evidence_events
         WHERE ts < ? AND archived = 0
         ORDER BY rowid ASC`
      )
      .all(params.archiveBeforeTs) as EvidenceEvent[];
    const prune = this.db
      .prepare(
        `SELECT * FROM evidence_events
         WHERE ts < ? AND payload_pruned = 0
         ORDER BY rowid ASC`
      )
      .all(params.pruneBeforeTs) as EvidenceEvent[];
    return { archive, prune };
  }

  markEventsArchived(eventIds: string[], segmentId: string, manifestSha256: string): void {
    if (eventIds.length === 0) {
      return;
    }
    const stmt = this.db.prepare(
      `UPDATE evidence_events
       SET archived = 1,
           archive_segment_id = ?,
           archive_manifest_sha256 = ?
       WHERE id = ?`
    );
    const tx = this.db.transaction((ids: string[]) => {
      for (const id of ids) {
        stmt.run(segmentId, manifestSha256, id);
      }
    });
    tx(eventIds);
  }

  pruneEventPayloadColumns(eventIds: string[], prunedTs: number): void {
    if (eventIds.length === 0) {
      return;
    }
    const stmt = this.db.prepare(
      `UPDATE evidence_events
       SET payload_path = NULL,
           payload_inline = NULL,
           payload_pruned = 1,
           payload_pruned_ts = ?
       WHERE id = ?`
    );
    const tx = this.db.transaction((ids: string[]) => {
      for (const id of ids) {
        stmt.run(prunedTs, id);
      }
    });
    tx(eventIds);
  }

  listBlobReferences(): Array<{
    id: string;
    ts: number;
    blob_ref: string | null;
    canonical_payload_path: string | null;
    payload_pruned: number;
    payload_pruned_ts: number | null;
  }> {
    return this.db
      .prepare(
        `SELECT id, ts, blob_ref, canonical_payload_path, payload_pruned, payload_pruned_ts
         FROM evidence_events
         WHERE blob_ref IS NOT NULL AND blob_ref != ''
         ORDER BY ts ASC, id ASC`
      )
      .all() as Array<{
      id: string;
      ts: number;
      blob_ref: string | null;
      canonical_payload_path: string | null;
      payload_pruned: number;
      payload_pruned_ts: number | null;
    }>;
  }

  dbSizeBytes(): number {
    const pageCount = Number(this.db.pragma("page_count", { simple: true }) ?? 0);
    const pageSize = Number(this.db.pragma("page_size", { simple: true }) ?? 0);
    return pageCount * pageSize;
  }

  getAllSessions(): SessionRecord[] {
    return this.db.prepare("SELECT * FROM sessions ORDER BY started_ts ASC").all() as SessionRecord[];
  }

  getAllRuns(): RunRecord[] {
    return this.db.prepare("SELECT * FROM runs ORDER BY ts ASC").all() as RunRecord[];
  }

  getAllAssuranceRuns(): AssuranceRunRecord[] {
    return this.db
      .prepare("SELECT * FROM assurance_runs ORDER BY ts ASC")
      .all() as AssuranceRunRecord[];
  }

  getOutcomeEventsBetween(startTs: number, endTs: number, agentId?: string): OutcomeEvent[] {
    if (agentId && agentId.length > 0) {
      return this.db
        .prepare(
          `SELECT * FROM outcome_events
           WHERE ts >= ? AND ts <= ? AND agent_id = ?
           ORDER BY rowid ASC`
        )
        .all(startTs, endTs, agentId) as OutcomeEvent[];
    }
    return this.db
      .prepare(
        `SELECT * FROM outcome_events
         WHERE ts >= ? AND ts <= ?
         ORDER BY rowid ASC`
      )
      .all(startTs, endTs) as OutcomeEvent[];
  }

  getAllOutcomeEvents(): OutcomeEvent[] {
    return this.db
      .prepare("SELECT * FROM outcome_events ORDER BY rowid ASC")
      .all() as OutcomeEvent[];
  }

  listOutcomeContracts(agentId?: string): OutcomeContractRecord[] {
    if (agentId && agentId.length > 0) {
      return this.db
        .prepare("SELECT * FROM outcome_contracts WHERE agent_id = ? ORDER BY created_ts DESC")
        .all(agentId) as OutcomeContractRecord[];
    }
    return this.db
      .prepare("SELECT * FROM outcome_contracts ORDER BY created_ts DESC")
      .all() as OutcomeContractRecord[];
  }
}

// Verification lives in ledgerVerification.ts (P2.1 decomposition). Re-exported
// here so the ~10 existing importers keep their import path; the split is about
// where the code lives and what it reports, not about churning call sites.
export {
  verifyLedgerIntegrity,
  verifyEvidenceEventIntegrity,
  type VerifyResult,
  type LedgerVerifyOptions
} from "./ledgerVerification.js";

export function openLedger(workspacePath: string): Ledger {
  return new Ledger(workspacePath);
}


export function hashBinaryOrPath(binaryPath: string, versionOutput: string | null): string {
  if (pathExists(binaryPath)) {
    try {
      const bytes = readFileSync(binaryPath);
      return sha256Hex(bytes);
    } catch {
      // fallback below
    }
  }
  return sha256Hex(`${binaryPath}|${versionOutput ?? "unknown"}`);
}

export function detectTrustBoundaryViolation(workspace: string, config: AMCConfig): {
  violated: boolean;
  message: string | null;
} {
  if (config.security.trustBoundaryMode !== "isolated") {
    return {
      violated: true,
      message:
        "trust boundary violated: runtime and signing keys are not marked isolated (set security.trustBoundaryMode=isolated only when monitor/auditor keys are isolated from evaluated agent)"
    };
  }

  // An "isolated" claim is only worth the signature behind it. amc.config.yaml
  // was the one root config without one, so this assurance could be granted by
  // editing plain YAML — exactly the kind of self-asserted claim AMC exists to
  // reject. An unsigned or tampered config no longer clears the boundary.
  const signature = verifyAmcConfigSignature(workspace);
  if (!signature.valid) {
    return {
      violated: true,
      message: signature.signatureExists
        ? `trust boundary violated: amc.config.yaml signature is not valid (${signature.reason ?? "unknown"})`
        : "trust boundary violated: amc.config.yaml is unsigned, so its trustBoundaryMode=isolated claim is unverifiable (sign it with: amc verify --sign-config)"
    };
  }

  return { violated: false, message: null };
}
