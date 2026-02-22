import { generateKeyPairSync, sign } from "node:crypto";
import Database from "better-sqlite3";
import { describe, expect, test } from "vitest";
import {
  VALID_INCIDENT_TRANSITIONS,
  createIncidentStore,
  computeIncidentHash,
  verifyIncidentSignature,
  IncidentGraph,
  IncidentTimeline,
  assembleFromDrift,
  assembleFromAssuranceFailure,
  assembleFromFreeze,
  assembleFromBudgetExceed,
  autoDetectAndAssemble,
  inferCausalLinks,
  rankCausalHypotheses,
  explainIncidentCausality,
  identifyRootCauses,
  traceImpactChain,
  type Incident,
  type IncidentState,
  type CausalEdge
} from "../src/incidents/index.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import type { AssuranceReport, EvidenceEvent } from "../src/types.js";

function freshDb(): Database.Database {
  return new Database(":memory:");
}

function signFn(digest: string): string {
  return `sig_${digest.slice(0, 12)}`;
}

function makeEvidenceEvent(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  const ts = overrides.ts ?? Date.now();
  return {
    id: overrides.id ?? `ev_${Math.random().toString(36).slice(2, 10)}`,
    ts,
    session_id: overrides.session_id ?? "session-1",
    runtime: overrides.runtime ?? "mock",
    event_type: overrides.event_type ?? "audit",
    payload_path: overrides.payload_path ?? null,
    payload_inline: overrides.payload_inline ?? null,
    payload_sha256: overrides.payload_sha256 ?? "a".repeat(64),
    meta_json: overrides.meta_json ?? "{}",
    prev_event_hash: overrides.prev_event_hash ?? "GENESIS",
    event_hash: overrides.event_hash ?? `hash_${Math.random().toString(36).slice(2, 10)}`,
    writer_sig: overrides.writer_sig ?? "writer-sig"
  };
}

function makeAssuranceReport(overrides: Partial<AssuranceReport> = {}): AssuranceReport {
  const ts = overrides.ts ?? Date.now();
  return {
    assuranceRunId: overrides.assuranceRunId ?? "assurance-1",
    agentId: overrides.agentId ?? "agent-1",
    ts,
    mode: overrides.mode ?? "supervise",
    windowStartTs: overrides.windowStartTs ?? ts - 3_600_000,
    windowEndTs: overrides.windowEndTs ?? ts,
    trustTier: overrides.trustTier ?? "OBSERVED",
    status: overrides.status ?? "VALID",
    verificationPassed: overrides.verificationPassed ?? false,
    packResults: overrides.packResults ?? [],
    overallScore0to100: overrides.overallScore0to100 ?? 45,
    integrityIndex: overrides.integrityIndex ?? 0.45,
    trustLabel: overrides.trustLabel ?? "LOW TRUST",
    reportJsonSha256: overrides.reportJsonSha256 ?? "r".repeat(64),
    runSealSig: overrides.runSealSig ?? "seal"
  };
}

function makeIncident(overrides: Partial<Incident> = {}): Incident {
  const now = overrides.createdTs ?? Date.now();
  const base: Incident = {
    incidentId: overrides.incidentId ?? `inc_${Math.random().toString(36).slice(2, 10)}`,
    agentId: overrides.agentId ?? "agent-1",
    severity: overrides.severity ?? "WARN",
    state: overrides.state ?? "OPEN",
    title: overrides.title ?? "Incident",
    description: overrides.description ?? "Incident description",
    triggerType: overrides.triggerType ?? "DRIFT",
    triggerId: overrides.triggerId ?? "trigger-1",
    rootCauseClaimIds: overrides.rootCauseClaimIds ?? [],
    affectedQuestionIds: overrides.affectedQuestionIds ?? [],
    causalEdges: overrides.causalEdges ?? [],
    timelineEventIds: overrides.timelineEventIds ?? [],
    createdTs: now,
    updatedTs: overrides.updatedTs ?? now,
    resolvedTs: overrides.resolvedTs ?? null,
    postmortemRef: overrides.postmortemRef ?? null,
    prev_incident_hash: overrides.prev_incident_hash ?? "GENESIS_INCIDENT",
    incident_hash: "",
    signature: overrides.signature ?? "sig"
  };

  if (overrides.incident_hash) {
    base.incident_hash = overrides.incident_hash;
  } else {
    base.incident_hash = computeIncidentHash(base);
  }

  return base;
}

function signIncident(incident: Incident, privateKeyPem: string): Incident {
  const payload = {
    incidentId: incident.incidentId,
    agentId: incident.agentId,
    severity: incident.severity,
    state: incident.state,
    title: incident.title,
    description: incident.description,
    triggerType: incident.triggerType,
    triggerId: incident.triggerId,
    rootCauseClaimIds: incident.rootCauseClaimIds,
    affectedQuestionIds: incident.affectedQuestionIds,
    causalEdges: incident.causalEdges,
    timelineEventIds: incident.timelineEventIds,
    createdTs: incident.createdTs,
    updatedTs: incident.updatedTs,
    resolvedTs: incident.resolvedTs,
    postmortemRef: incident.postmortemRef,
    prev_incident_hash: incident.prev_incident_hash,
    incident_hash: incident.incident_hash
  };
  const digest = sha256Hex(canonicalize(payload));
  const signature = sign(null, Buffer.from(digest, "hex"), privateKeyPem).toString("base64");
  return { ...incident, signature };
}

describe("incidents subsystem", () => {
  test("valid transitions include expected reopen and terminal behavior", () => {
    expect(VALID_INCIDENT_TRANSITIONS.OPEN).toContain("INVESTIGATING");
    expect(VALID_INCIDENT_TRANSITIONS.RESOLVED).toContain("OPEN");
    expect(VALID_INCIDENT_TRANSITIONS.POSTMORTEM).toEqual([]);
  });

  test("incident store initializes and returns genesis hash for empty agent", () => {
    const db = freshDb();
    const store = createIncidentStore(db);
    store.initTables();
    expect(store.getLastIncidentHash("agent-1")).toBe("GENESIS_INCIDENT");
    db.close();
  });

  test("store round-trips incident payload with arrays and nullable fields", () => {
    const db = freshDb();
    const store = createIncidentStore(db);
    store.initTables();

    const incident = makeIncident({
      incidentId: "inc-roundtrip",
      rootCauseClaimIds: ["c-1"],
      affectedQuestionIds: ["AMC-2.5"],
      timelineEventIds: ["ev-1", "ev-2"],
      postmortemRef: "postmortems/inc-roundtrip.md"
    });
    store.insertIncident(incident);

    const loaded = store.getIncident("inc-roundtrip");
    expect(loaded).not.toBeNull();
    expect(loaded?.rootCauseClaimIds).toEqual(["c-1"]);
    expect(loaded?.affectedQuestionIds).toEqual(["AMC-2.5"]);
    expect(loaded?.timelineEventIds).toEqual(["ev-1", "ev-2"]);
    expect(loaded?.postmortemRef).toBe("postmortems/inc-roundtrip.md");
    db.close();
  });

  test("getIncidentsByAgent sorts by createdTs desc and supports state filter", () => {
    const db = freshDb();
    const store = createIncidentStore(db);
    store.initTables();
    store.insertIncident(makeIncident({ incidentId: "inc-old", createdTs: 1000, state: "OPEN" }));
    store.insertIncident(makeIncident({ incidentId: "inc-new", createdTs: 2000, state: "RESOLVED" }));

    const all = store.getIncidentsByAgent("agent-1");
    expect(all.map((i) => i.incidentId)).toEqual(["inc-new", "inc-old"]);

    const open = store.getIncidentsByAgent("agent-1", "OPEN");
    expect(open).toHaveLength(1);
    expect(open[0]?.incidentId).toBe("inc-old");
    db.close();
  });

  test("getOpenIncidents only returns OPEN/INVESTIGATING/MITIGATED", () => {
    const db = freshDb();
    const store = createIncidentStore(db);
    store.initTables();
    store.insertIncident(makeIncident({ incidentId: "inc-open", state: "OPEN" }));
    store.insertIncident(makeIncident({ incidentId: "inc-investigating", state: "INVESTIGATING" }));
    store.insertIncident(makeIncident({ incidentId: "inc-mitigated", state: "MITIGATED" }));
    store.insertIncident(makeIncident({ incidentId: "inc-resolved", state: "RESOLVED" }));

    const open = store.getOpenIncidents("agent-1");
    expect(open.map((i) => i.incidentId).sort()).toEqual(["inc-investigating", "inc-mitigated", "inc-open"]);
    db.close();
  });

  test("store returns transitions and causal edges in chronological order", () => {
    const db = freshDb();
    const store = createIncidentStore(db);
    store.initTables();
    store.insertIncident(makeIncident({ incidentId: "inc-order" }));

    store.insertIncidentTransition({
      transitionId: "t2",
      incidentId: "inc-order",
      fromState: "OPEN",
      toState: "INVESTIGATING",
      reason: "late",
      ts: 2000,
      signature: "sig"
    });
    store.insertIncidentTransition({
      transitionId: "t1",
      incidentId: "inc-order",
      fromState: "INVESTIGATING",
      toState: "MITIGATED",
      reason: "early",
      ts: 1000,
      signature: "sig"
    });

    store.insertCausalEdge("inc-order", {
      edgeId: "e2",
      fromEventId: "ev2",
      toEventId: "ev3",
      relationship: "CAUSED",
      confidence: 0.7,
      evidence: ["ev2"],
      addedTs: 2000,
      addedBy: "AUTO",
      signature: "sig"
    });
    store.insertCausalEdge("inc-order", {
      edgeId: "e1",
      fromEventId: "ev1",
      toEventId: "ev2",
      relationship: "ENABLED",
      confidence: 0.5,
      evidence: ["ev1"],
      addedTs: 1000,
      addedBy: "AUTO",
      signature: "sig"
    });

    expect(store.getIncidentTransitions("inc-order").map((t) => t.transitionId)).toEqual(["t1", "t2"]);
    expect(store.getCausalEdges("inc-order").map((e) => e.edgeId)).toEqual(["e1", "e2"]);
    db.close();
  });

  test("computeIncidentHash is deterministic for same logical payload", () => {
    const a = makeIncident({ incidentId: "inc-hash", signature: "a" });
    const b = makeIncident({ ...a, signature: "b" });
    expect(computeIncidentHash(a)).toBe(computeIncidentHash(b));
  });

  test("verifyIncidentSignature accepts valid ed25519 signature", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

    const signed = signIncident(makeIncident({ incidentId: "inc-signed" }), privatePem);
    expect(verifyIncidentSignature(".", signed, [publicPem])).toBe(true);
  });

  test("verifyIncidentSignature rejects tampered incident payload", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

    const signed = signIncident(makeIncident({ incidentId: "inc-tamper" }), privatePem);
    const tampered = { ...signed, title: "Tampered title" };
    expect(verifyIncidentSignature(".", tampered, [publicPem])).toBe(false);
  });

  test("IncidentGraph validates DAG and detects cycles", () => {
    const incident = makeIncident({
      incidentId: "inc-graph",
      causalEdges: [
        { edgeId: "e1", fromEventId: "a", toEventId: "b", relationship: "CAUSED", confidence: 0.8, evidence: [], addedTs: 1, addedBy: "AUTO", signature: "s" },
        { edgeId: "e2", fromEventId: "b", toEventId: "c", relationship: "CAUSED", confidence: 0.7, evidence: [], addedTs: 2, addedBy: "AUTO", signature: "s" }
      ]
    });
    expect(IncidentGraph.validateCausalDAG(incident).valid).toBe(true);
    expect(IncidentGraph.getCausalDepth(incident)).toBe(2);

    const cyclic = makeIncident({
      incidentId: "inc-cycle",
      causalEdges: [
        { edgeId: "e1", fromEventId: "a", toEventId: "b", relationship: "CAUSED", confidence: 0.8, evidence: [], addedTs: 1, addedBy: "AUTO", signature: "s" },
        { edgeId: "e2", fromEventId: "b", toEventId: "a", relationship: "CAUSED", confidence: 0.7, evidence: [], addedTs: 2, addedBy: "AUTO", signature: "s" }
      ]
    });
    const validation = IncidentGraph.validateCausalDAG(cyclic);
    expect(validation.valid).toBe(false);
    expect(validation.cycles.length).toBeGreaterThan(0);
    expect(IncidentGraph.getCausalDepth(cyclic)).toBe(-1);
  });

  test("IncidentGraph root cause and impact chain helpers follow edge direction", () => {
    const incident = makeIncident({
      incidentId: "inc-chain",
      causalEdges: [
        { edgeId: "e1", fromEventId: "root", toEventId: "mid", relationship: "CAUSED", confidence: 0.9, evidence: [], addedTs: 1, addedBy: "AUTO", signature: "s" },
        { edgeId: "e2", fromEventId: "mid", toEventId: "leaf", relationship: "CAUSED", confidence: 0.8, evidence: [], addedTs: 2, addedBy: "AUTO", signature: "s" },
        { edgeId: "e3", fromEventId: "other", toEventId: "leaf", relationship: "CORRELATED", confidence: 0.4, evidence: [], addedTs: 3, addedBy: "AUTO", signature: "s" }
      ]
    });

    expect(IncidentGraph.getRootCauses(incident)).toEqual(["root"]);
    expect(IncidentGraph.getImpactChain(incident, "root")).toEqual(["root", "mid", "leaf"]);
  });

  test("IncidentTimeline builds markdown/json with links and roots", () => {
    const eventA = makeEvidenceEvent({ id: "ev-a", ts: 1000, event_type: "audit" });
    const eventB = makeEvidenceEvent({ id: "ev-b", ts: 2000, event_type: "audit" });
    const events = new Map<string, EvidenceEvent>([
      ["ev-a", eventA],
      ["ev-b", eventB]
    ]);

    const incident = makeIncident({
      incidentId: "inc-timeline",
      title: "Timeline incident",
      description: "desc",
      timelineEventIds: ["ev-b", "ev-a"],
      affectedQuestionIds: ["AMC-2.5"],
      causalEdges: [
        { edgeId: "edge-1", fromEventId: "ev-a", toEventId: "ev-b", relationship: "CAUSED", confidence: 0.7, evidence: [], addedTs: 1000, addedBy: "AUTO", signature: "sig" }
      ]
    });

    const md = IncidentTimeline.formatTimelineMd(incident, events);
    expect(md).toContain("## Incident: Timeline incident");
    expect(md).toContain("### Timeline");
    expect(md).toContain("CAUSED");

    const json = IncidentTimeline.formatTimelineJson(incident, events);
    expect(json.entries[0]?.eventId).toBe("ev-a");
    expect(json.rootCauses).toEqual(["ev-a"]);
  });

  test("assembleFromDrift derives severity, affected questions, and causal edges", () => {
    const db = freshDb();
    createIncidentStore(db).initTables();
    const trigger = makeEvidenceEvent({ id: "drift-trigger", ts: 5000, meta_json: JSON.stringify({ auditType: "DRIFT_REGRESSION_DETECTED" }) });
    const enabling = makeEvidenceEvent({ id: "ev-config", ts: 4000, meta_json: JSON.stringify({ auditType: "CONFIG_UNSIGNED" }) });

    const incident = assembleFromDrift(
      db,
      "agent-1",
      {
        metric: "amc-2.5-truthfulness",
        baseline: 0.9,
        latest: 0.5,
        delta: -0.4,
        severity: "CRITICAL",
        evidenceRefs: [trigger.id]
      },
      [trigger, enabling],
      signFn,
      6000
    );

    expect(incident.severity).toBe("CRITICAL");
    expect(incident.triggerType).toBe("DRIFT");
    expect(incident.affectedQuestionIds).toContain("amc-2.5-truthfulness");
    expect(incident.causalEdges.some((e) => e.relationship === "ENABLED")).toBe(true);
    db.close();
  });

  test("assembleFromAssuranceFailure returns null on clean pass and incident on failure", () => {
    const db = freshDb();
    createIncidentStore(db).initTables();
    const event = makeEvidenceEvent({ id: "ev-assurance", ts: 1000, meta_json: JSON.stringify({ auditType: "CONFIG_SIGNATURE_INVALID" }) });

    const passing = makeAssuranceReport({
      assuranceRunId: "run-pass",
      overallScore0to100: 90,
      packResults: [{ packId: "safe-pack", title: "safe", scenarioCount: 1, passCount: 1, failCount: 0, score0to100: 100, trustTier: "OBSERVED", scenarioResults: [] }]
    });
    expect(assembleFromAssuranceFailure(db, "agent-1", passing, [event], signFn, 2000)).toBeNull();

    const failing = makeAssuranceReport({
      assuranceRunId: "run-fail",
      overallScore0to100: 35,
      packResults: [{ packId: "unsafe-tooling-pack", title: "unsafe", scenarioCount: 2, passCount: 0, failCount: 2, score0to100: 10, trustTier: "OBSERVED", scenarioResults: [] }]
    });
    const incident = assembleFromAssuranceFailure(db, "agent-1", failing, [event], signFn, 2000);
    expect(incident).not.toBeNull();
    expect(incident?.severity).toBe("CRITICAL");
    expect(incident?.affectedQuestionIds).toContain("AMC-3.4");
    db.close();
  });

  test("assembleFromFreeze and assembleFromBudgetExceed build expected incident forms", () => {
    const db = freshDb();
    createIncidentStore(db).initTables();

    const driftRegression = makeEvidenceEvent({ id: "ev-reg", ts: 1000, event_type: "audit", meta_json: JSON.stringify({ auditType: "DRIFT_REGRESSION_DETECTED" }) });
    const freeze = assembleFromFreeze(
      db,
      "agent-1",
      "freeze-incident-id",
      { overallDrop: 0.4, integrityDrop: 0.3, correlationDrop: 0.2, maxLayerDrop: 0.5 },
      [driftRegression],
      signFn,
      2000
    );
    expect(freeze.severity).toBe("CRITICAL");
    expect(freeze.causalEdges.some((e) => e.relationship === "CAUSED")).toBe(true);

    const metricUsage = makeEvidenceEvent({ id: "m1", ts: 1000, event_type: "metric", meta_json: JSON.stringify({ metricName: "token_count" }) });
    const budgetEvent = makeEvidenceEvent({ id: "audit-budget", ts: 2000, event_type: "audit", meta_json: JSON.stringify({ auditType: "BUDGET_EXCEEDED", budgetType: "tokens" }) });
    const budget = assembleFromBudgetExceed(db, "agent-1", budgetEvent, [metricUsage, budgetEvent], signFn, 3000);
    expect(budget.triggerType).toBe("BUDGET_EXCEEDED");
    expect(budget.title).toContain("Budget Exceeded");
    expect(budget.causalEdges).toHaveLength(1);
    db.close();
  });

  test("autoDetectAndAssemble deduplicates open incidents by trigger id", () => {
    const db = freshDb();
    const store = createIncidentStore(db);
    store.initTables();
    store.insertIncident(makeIncident({ incidentId: "existing", triggerId: "drift-dup", state: "OPEN" }));

    const driftEvent = makeEvidenceEvent({
      id: "audit-1",
      event_type: "audit",
      meta_json: JSON.stringify({
        auditType: "DRIFT_REGRESSION_DETECTED",
        driftAdvisoryId: "drift-dup",
        metric: "amc-2.1",
        baseline: 0.9,
        latest: 0.4,
        delta: -0.5
      })
    });

    const incidents = autoDetectAndAssemble(db, "agent-1", [driftEvent], signFn, 5000);
    expect(incidents).toHaveLength(0);
    db.close();
  });

  test("inferCausalLinks + rankCausalHypotheses applies rules, filters low confidence, and dedupes", () => {
    const trigger = makeEvidenceEvent({
      id: "trigger-ev",
      ts: 10_000,
      event_type: "audit",
      meta_json: JSON.stringify({ auditType: "DRIFT_REGRESSION_DETECTED" })
    });
    const incident = makeIncident({
      incidentId: "inc-infer",
      triggerId: trigger.id,
      triggerType: "DRIFT",
      affectedQuestionIds: ["AMC-2.5"]
    });
    const policyViolation = makeEvidenceEvent({ id: "ev-policy", ts: 9_000, event_type: "audit", meta_json: JSON.stringify({ auditType: "POLICY_VIOLATION" }) });
    const assuranceFail = makeEvidenceEvent({
      id: "ev-assurance",
      ts: 9_950,
      event_type: "audit",
      meta_json: JSON.stringify({ auditType: "ASSURANCE_FAILURE", failedQuestions: ["AMC-2.5"] })
    });

    const raw = inferCausalLinks(incident, [policyViolation, assuranceFail, trigger], 24 * 60 * 60 * 1000, signFn, 11_000);
    expect(raw.some((e) => e.relationship === "CAUSED")).toBe(true);
    expect(raw.some((e) => e.relationship === "CORRELATED")).toBe(true);

    const duplicate: CausalEdge = {
      ...raw[0]!,
      edgeId: "dup-edge",
      confidence: 0.2
    };
    const ranked = rankCausalHypotheses([...raw, duplicate]);
    expect(ranked.every((e) => e.confidence >= 0.3)).toBe(true);
    expect(ranked[0]!.confidence).toBeGreaterThanOrEqual(ranked[ranked.length - 1]!.confidence);
  });

  test("explanation and root/impact helpers produce readable causal narratives", () => {
    const from = makeEvidenceEvent({ id: "ev-1", ts: 1000, event_type: "audit", meta_json: JSON.stringify({ auditType: "CONFIG_UNSIGNED" }) });
    const to = makeEvidenceEvent({ id: "ev-2", ts: 1500, event_type: "audit", meta_json: JSON.stringify({ auditType: "DRIFT_REGRESSION_DETECTED" }) });
    const edge: CausalEdge = {
      edgeId: "edge-1",
      fromEventId: from.id,
      toEventId: to.id,
      relationship: "ENABLED",
      confidence: 0.7,
      evidence: [from.id],
      addedTs: 2000,
      addedBy: "AUTO",
      signature: "sig"
    };
    const incident = makeIncident({
      incidentId: "inc-explain",
      triggerId: to.id,
      causalEdges: [edge, { ...edge, edgeId: "edge-2", fromEventId: to.id, toEventId: "ev-3", relationship: "CAUSED" }],
      timelineEventIds: [from.id, to.id, "ev-3"]
    });
    const other = makeEvidenceEvent({ id: "ev-3", ts: 1800, event_type: "audit", meta_json: "{}" });

    const explanation = explainIncidentCausality(incident, [from, to, other]);
    expect(explanation).toContain("enabled");
    const roots = identifyRootCauses(incident);
    expect(roots).toContain(from.id);
    const chain = traceImpactChain(incident, to.id);
    expect(chain).toContain("ev-3");

    const emptyExplanation = explainIncidentCausality({ ...incident, causalEdges: [] }, [from, to, other]);
    expect(emptyExplanation).toBe("No causal relationships identified.");
  });

  test("IncidentGraph add/remove causal edge clamps confidence and supports cleanup", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const incident = makeIncident({ incidentId: "inc-add-remove", causalEdges: [] });
    const added = IncidentGraph.addCausalEdge(incident, {
      fromEventId: "ev-1",
      toEventId: "ev-2",
      relationship: "CAUSED",
      confidence: 7,
      evidence: ["ev-1"],
      addedBy: "OWNER",
      privateKeyPem: privatePem
    });

    expect(added.confidence).toBe(1);
    const withEdge = { ...incident, causalEdges: [added] };
    const removed = IncidentGraph.removeCausalEdge(withEdge, added.edgeId);
    expect(removed.causalEdges).toHaveLength(0);
    expect(removed.updatedTs).toBeGreaterThanOrEqual(withEdge.updatedTs);
  });

  test("getIncidentsByAgent state accepts all IncidentState values", () => {
    const db = freshDb();
    const store = createIncidentStore(db);
    store.initTables();
    const states: IncidentState[] = ["OPEN", "INVESTIGATING", "MITIGATED", "RESOLVED", "POSTMORTEM"];
    for (const [idx, state] of states.entries()) {
      store.insertIncident(makeIncident({ incidentId: `inc-state-${state}`, state, createdTs: idx + 1 }));
    }
    for (const state of states) {
      const list = store.getIncidentsByAgent("agent-1", state);
      expect(list).toHaveLength(1);
      expect(list[0]!.state).toBe(state);
    }
    db.close();
  });
});
