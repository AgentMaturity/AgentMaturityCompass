import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { getPrivateKeyPem, signHexDigest } from "../src/crypto/keys.js";
import { generateAuditPacket } from "../src/evidence/auditPacket.js";
import { collectVerifierEvidence } from "../src/evidence/exporter.js";
import { createIncidentStore, computeIncidentHash } from "../src/incidents/incidentStore.js";
import type { Incident } from "../src/incidents/incidentTypes.js";
import { openLedger } from "../src/ledger/ledger.js";
import { initWorkspace } from "../src/workspace.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { initCorrectionTables, insertCorrection, updateCorrectionVerification } from "../src/corrections/correctionStore.js";
import type { CorrectionEvent } from "../src/corrections/correctionTypes.js";

const roots: string[] = [];

function freshWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-evidence-audit-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

function listZipEntries(zipBytes: Buffer): string[] {
  const eocdSig = 0x06054b50;
  const centralSig = 0x02014b50;
  let eocdIndex = -1;
  for (let index = zipBytes.length - 22; index >= 0; index -= 1) {
    if (zipBytes.readUInt32LE(index) === eocdSig) {
      eocdIndex = index;
      break;
    }
  }
  if (eocdIndex < 0) {
    return [];
  }
  const count = zipBytes.readUInt16LE(eocdIndex + 10);
  const centralOffset = zipBytes.readUInt32LE(eocdIndex + 16);
  const names: string[] = [];
  let cursor = centralOffset;
  for (let i = 0; i < count; i += 1) {
    if (zipBytes.readUInt32LE(cursor) !== centralSig) {
      break;
    }
    const nameLen = zipBytes.readUInt16LE(cursor + 28);
    const extraLen = zipBytes.readUInt16LE(cursor + 30);
    const commentLen = zipBytes.readUInt16LE(cursor + 32);
    const name = zipBytes.subarray(cursor + 46, cursor + 46 + nameLen).toString("utf8");
    names.push(name);
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

function createOpenIncident(params: {
  workspace: string;
  db: import("better-sqlite3").Database;
  agentId: string;
  incidentId: string;
  questionId: string;
}): Incident {
  const store = createIncidentStore(params.db);
  store.initTables();
  const now = Date.now();
  const base: Omit<Incident, "incident_hash" | "signature"> = {
    incidentId: params.incidentId,
    agentId: params.agentId,
    severity: "WARN",
    state: "OPEN",
    title: "Test incident",
    description: "Test incident for evidence auto-linking",
    triggerType: "MANUAL",
    triggerId: `trigger-${params.incidentId}`,
    rootCauseClaimIds: [],
    affectedQuestionIds: [params.questionId],
    causalEdges: [],
    timelineEventIds: [],
    createdTs: now,
    updatedTs: now,
    resolvedTs: null,
    postmortemRef: null,
    prev_incident_hash: store.getLastIncidentHash(params.agentId)
  };
  const incidentHash = computeIncidentHash(base);
  const payload = canonicalize({
    ...base,
    incident_hash: incidentHash
  });
  const digest = sha256Hex(payload);
  const signature = signHexDigest(digest, getPrivateKeyPem(params.workspace, "monitor"));
  const incident: Incident = {
    ...base,
    incident_hash: incidentHash,
    signature
  };
  store.insertIncident(incident);
  return incident;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("evidence export + audit trail closure", () => {
  test("auto-links new evidence to matching open incidents and exports verifier fields", () => {
    const workspace = freshWorkspace();
    const agentId = "agent-a";
    const questionId = "AMC-2.1";
    const ledger = openLedger(workspace);
    try {
      const db = (ledger as unknown as { db: import("better-sqlite3").Database }).db;
      const incident = createOpenIncident({
        workspace,
        db,
        agentId,
        incidentId: "inc_auto_link",
        questionId
      });

      ledger.startSession({
        sessionId: "s_auto",
        runtime: "unknown",
        binaryPath: "bin",
        binarySha256: "hash"
      });
      const eventId = ledger.appendEvidence({
        sessionId: "s_auto",
        runtime: "unknown",
        eventType: "audit",
        inline: true,
        payload: JSON.stringify({ ok: true }),
        meta: {
          agentId,
          actorId: "owner-user-1",
          questionId,
          rationale: "Link this evidence to open incident"
        }
      });
      ledger.sealSession("s_auto");

      const linkRows = db
        .prepare("SELECT event_id, incident_id FROM evidence_incident_links WHERE event_id = ?")
        .all(eventId) as Array<{ event_id: string; incident_id: string }>;
      expect(linkRows.length).toBe(1);
      expect(linkRows[0]?.incident_id).toBe(incident.incidentId);

      const dataset = collectVerifierEvidence({
        workspace,
        agentId,
        includeChain: true,
        includeRationale: true
      });
      const record = dataset.records.find((row) => row.eventId === eventId);
      expect(record).toBeTruthy();
      expect(record?.incidentIds).toContain(incident.incidentId);
      expect(record?.actorId).toBe("owner-user-1");
      expect(record?.rationale).toBe("Link this evidence to open incident");
      expect(record?.writerSignature.length).toBeGreaterThan(16);
      expect(record?.eventHash.length).toBe(64);
      expect(typeof record?.chainValid).toBe("boolean");
      expect(record?.isoTs).toContain("T");
    } finally {
      ledger.close();
    }
  });

  test("correction verification marks linked evidence as corrected", () => {
    const workspace = freshWorkspace();
    const agentId = "agent-b";
    const questionId = "AMC-3.4";
    const ledger = openLedger(workspace);
    try {
      const db = (ledger as unknown as { db: import("better-sqlite3").Database }).db;
      const incident = createOpenIncident({
        workspace,
        db,
        agentId,
        incidentId: "inc_correction_link",
        questionId
      });

      ledger.startSession({
        sessionId: "s_corr",
        runtime: "unknown",
        binaryPath: "bin",
        binarySha256: "hash"
      });
      const eventId = ledger.appendEvidence({
        sessionId: "s_corr",
        runtime: "unknown",
        eventType: "review",
        inline: true,
        payload: "evidence payload",
        meta: {
          agentId,
          questionId,
          rationale: "Evidence before correction"
        }
      });
      ledger.sealSession("s_corr");

      initCorrectionTables(db);
      const correction: CorrectionEvent = {
        correctionId: "corr_verify_1",
        agentId,
        triggerType: "INCIDENT_RESPONSE",
        triggerId: incident.incidentId,
        questionIds: [questionId],
        correctionDescription: "Patch incident handling",
        appliedAction: "Updated control logic",
        status: "APPLIED",
        baselineRunId: "run_before",
        baselineLevels: { [questionId]: 2 },
        verificationRunId: null,
        verificationLevels: null,
        effectivenessScore: null,
        verifiedTs: null,
        verifiedBy: null,
        createdTs: Date.now(),
        updatedTs: Date.now(),
        prev_correction_hash: "GENESIS_CORRECTION",
        correction_hash: "hash-initial",
        signature: "sig-initial"
      };
      insertCorrection(db, correction);

      updateCorrectionVerification(
        db,
        correction.correctionId,
        "run_after",
        { [questionId]: 4 },
        0.75,
        "VERIFIED_EFFECTIVE",
        Date.now(),
        "run_after",
        "hash-verified",
        "sig-verified",
        { workspace }
      );

      const correctionLinks = db
        .prepare("SELECT evidence_event_id, correction_id, status FROM evidence_corrections WHERE correction_id = ?")
        .all(correction.correctionId) as Array<{ evidence_event_id: string; correction_id: string; status: string }>;
      expect(correctionLinks.some((row) => row.evidence_event_id === eventId)).toBe(true);
      expect(correctionLinks.some((row) => row.status === "VERIFIED_EFFECTIVE")).toBe(true);

      const dataset = collectVerifierEvidence({ workspace, agentId });
      const record = dataset.records.find((row) => row.eventId === eventId);
      expect(record).toBeTruthy();
      expect(record?.corrected).toBe(true);
      expect(record?.correctionIds).toContain(correction.correctionId);
    } finally {
      ledger.close();
    }
  });

  test("audit packet generator creates zip with verifier artifacts", async () => {
    const workspace = freshWorkspace();
    const ledger = openLedger(workspace);
    try {
      ledger.startSession({
        sessionId: "s_packet",
        runtime: "unknown",
        binaryPath: "bin",
        binarySha256: "hash"
      });
      ledger.appendEvidence({
        sessionId: "s_packet",
        runtime: "unknown",
        eventType: "stdout",
        inline: true,
        payload: "hello",
        meta: { agentId: "agent-c", rationale: "packet evidence" }
      });
      ledger.sealSession("s_packet");
    } finally {
      ledger.close();
    }

    const result = await generateAuditPacket({
      workspace,
      outputFile: "./audit-test.zip",
      includeChain: true,
      includeRationale: true
    });

    expect(existsSync(result.outFile)).toBe(true);
    expect(result.fileCount).toBeGreaterThan(5);
    expect(result.eventCount).toBeGreaterThan(0);

    const names = listZipEntries(readFileSync(result.outFile));
    expect(names).toContain("evidence/evidence.json");
    expect(names).toContain("evidence/evidence.csv");
    expect(names).toContain("evidence/evidence.pdf");
    expect(names).toContain("integrity/ledger-verify.json");
    expect(names).toContain("meta/manifest.json");
    expect(names).toContain("meta/manifest.sig.json");
  });
});
