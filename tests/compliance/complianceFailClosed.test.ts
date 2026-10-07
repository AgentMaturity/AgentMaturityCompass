import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../../src/workspace.js";
import { openLedger } from "../../src/ledger/ledger.js";
import { getAgentPaths } from "../../src/fleet/paths.js";
import { canonicalize } from "../../src/utils/json.js";
import { sha256Hex } from "../../src/utils/hash.js";
import { generateComplianceReport, initComplianceMaps } from "../../src/compliance/complianceEngine.js";
import { frameworkChoices, type ComplianceFramework } from "../../src/compliance/frameworks.js";
import { defaultComplianceMapsFile } from "../../src/compliance/builtInMappings.js";
import type { ComplianceEvidenceRequirement, ComplianceMapsFile } from "../../src/compliance/mappingSchema.js";
import type { EvidenceEventType } from "../../src/types.js";

/**
 * P0-17 / gap G21: a compliance category may only report a result when evidence
 * belonging to that control, that subject, an admitted producer and the window
 * exists. Everything else is NOT_EVALUATED, never PARTIAL and never a score.
 */

const roots: string[] = [];
const AGENT_A = "agent-a";
const AGENT_B = "agent-b";
const DAY_MS = 24 * 60 * 60 * 1000;

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-compliance-fail-closed-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "compliance-fail-closed-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/** Ledger helper in the pattern of tests/federationComplianceIntegrationMerkle.test.ts. */
function appendEvent(workspace: string, opts: {
  meta: Record<string, unknown>;
  sessionId?: string;
  eventType?: EvidenceEventType;
  auditType?: string;
  ts?: number;
}): void {
  const ledger = openLedger(workspace);
  const sessionId = opts.sessionId ?? `test-${randomUUID()}`;
  const ownSession = sessionId !== "system";
  try {
    if (ownSession) {
      ledger.startSession({ sessionId, runtime: "unknown", binaryPath: "vitest", binarySha256: "vitest" });
    }
    ledger.appendEvidence({
      sessionId,
      runtime: "unknown",
      eventType: opts.eventType ?? "audit",
      payload: JSON.stringify({ auditType: opts.auditType ?? "FIXTURE_SIGNAL", info: "fixture" }),
      payloadExt: "json",
      inline: true,
      meta: { trustTier: "OBSERVED", ...opts.meta },
      ts: opts.ts
    });
    if (ownSession) ledger.sealSession(sessionId);
  } finally {
    ledger.close();
  }
}

const NO_AUDIT: ComplianceEvidenceRequirement = { type: "requires_no_audit", auditTypesDenylist: ["DENIED_SIGNAL"] };
const EVENT: ComplianceEvidenceRequirement = { type: "requires_evidence_event", eventTypes: ["audit", "metric"], minObservedRatio: 0.5 };
const PACK: ComplianceEvidenceRequirement = { type: "requires_assurance_pack", packId: "toolGovernance", minScore: 50, maxSucceeded: 5 };

function fixtureMapping(id: string, evidenceRequirements: ComplianceEvidenceRequirement[],
  extra: Record<string, unknown> = {}): ComplianceMapsFile["complianceMaps"]["mappings"][number] {
  return {
    id,
    framework: "SOC2",
    category: id,
    description: `fixture mapping ${id}`,
    evidenceRequirements,
    related: { questions: [], packs: [], configs: [] },
    ...extra
  };
}

const FIXTURE_MAPS: ComplianceMapsFile = {
  complianceMaps: {
    version: 1,
    mappings: [
      fixtureMapping("fx_no_audit", [NO_AUDIT]),
      fixtureMapping("fx_event", [EVENT]),
      fixtureMapping("fx_workspace_event", [EVENT], { binding: { scope: "workspace" } }),
      fixtureMapping("fx_pack", [PACK]),
      fixtureMapping("fx_full", [EVENT, PACK, NO_AUDIT])
    ]
  }
};

function report(workspace: string, agentId: string, framework: ComplianceFramework = "SOC2", window = "14d") {
  return generateComplianceReport({ workspace, framework, window, agentId });
}

function category(workspace: string, agentId: string, id: string, framework: ComplianceFramework = "SOC2") {
  const row = report(workspace, agentId, framework).categories.find((entry) => entry.id === id);
  if (!row) throw new Error(`category ${id} missing`);
  return row;
}

function assuranceReportsDir(workspace: string, agentId: string): string {
  const dir = join(getAgentPaths(workspace, agentId).reportsDir, "assurance");
  mkdirSync(dir, { recursive: true });
  return dir;
}

type ScenarioRow = { auditEventTypes: string[]; inconclusive?: boolean };
const ONE_MEASURED: ScenarioRow[] = [{ auditEventTypes: ["TOOL_GOVERNANCE_SUCCEEDED"] }];

function assuranceReport(agentId: string, now: number, score: number, scenarioResults: ScenarioRow[] = ONE_MEASURED) {
  return {
    assuranceRunId: `run-${randomUUID()}`,
    agentId,
    ts: now,
    mode: "supervise",
    windowStartTs: now - 1000,
    windowEndTs: now,
    trustTier: "OBSERVED",
    status: "VALID",
    verificationPassed: true,
    sessionId: "session-fixture",
    evidenceStatus: "MEASURED",
    packResults: [
      { packId: "toolGovernance", score0to100: score, scenarioResults }
    ],
    overallScore0to100: score,
    integrityIndex: 1,
    trustLabel: "MEASURED",
    reportJsonSha256: "",
    runSealSig: ""
  };
}

/** Seal the way the assurance runner does: hash the canonical report with empty seal fields, sign as auditor. */
function writeSealedAssuranceReport(workspace: string, agentId: string, score: number, scenarioResults?: ScenarioRow[]): void {
  const base = assuranceReport(agentId, Date.now(), score, scenarioResults);
  const hash = sha256Hex(canonicalize(base));
  const ledger = openLedger(workspace);
  const sig = ledger.signRunHash(hash);
  ledger.close();
  writeFileSync(join(assuranceReportsDir(workspace, agentId), `${base.assuranceRunId}.json`),
    JSON.stringify({ ...base, reportJsonSha256: hash, runSealSig: sig }, null, 2));
}

describe("compliance fails closed (P0-17)", () => {
  test("empty ledger with signed maps: every category NOT_EVALUATED, evidence incomplete, score null", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace);
    const mappings = new Map(defaultComplianceMapsFile().complianceMaps.mappings.map((row) => [row.id, row]));
    for (const framework of frameworkChoices()) {
      const out = report(workspace, "default", framework);
      expect(out.configTrusted).toBe(true);
      expect(out.categories.length).toBeGreaterThan(0);
      for (const row of out.categories) {
        expect({ id: row.id, status: row.status, result: row.result, evidence: row.evidence })
          .toEqual({ id: row.id, status: "NOT_EVALUATED", result: "not_evaluated", evidence: "incomplete" });
        expect(row.notEvaluatedReasons.length).toBeGreaterThan(0);
        // Every requirement is unevaluated on an empty ledger, a vacuous "no violations" included.
        if (mappings.get(row.id)?.evidenceRequirements.some((req) => req.type === "requires_no_audit")) {
          expect(row.notEvaluatedReasons).toContain("no agent activity in window; absence of violations proves nothing");
        }
      }
      expect(out.coverage.score).toBeNull();
      expect(out.coverage.evaluated).toBe(0);
      expect(out.coverage.notEvaluated).toBe(out.categories.length);
      expect(out.coverage.partial).toBe(0);
    }
  });

  test("runtime events for agent A and no denied audits: requires_no_audit passes", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace, FIXTURE_MAPS);
    appendEvent(workspace, { eventType: "metric", meta: { agentId: AGENT_A } });
    const row = category(workspace, AGENT_A, "fx_no_audit");
    expect(row.status).toBe("SATISFIED");
    expect(row.result).toBe("pass");
    expect(row.evidence).toBe("sufficient");
  });

  test("imported review rows carrying agent A's id are not agent activity for requires_no_audit", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace, FIXTURE_MAPS);
    appendEvent(workspace, { eventType: "review", meta: { agentId: AGENT_A, source: "chatgpt" } });
    appendEvent(workspace, { eventType: "metric", meta: { agentId: AGENT_A, source: "eval_import" } });
    const row = category(workspace, AGENT_A, "fx_no_audit");
    expect({ status: row.status, result: row.result, evidence: row.evidence })
      .toEqual({ status: "NOT_EVALUATED", result: "not_evaluated", evidence: "incomplete" });
    expect(row.notEvaluatedReasons.join(" ")).toContain("absence of violations proves nothing");
  });

  test("no activity for agent A: requires_no_audit is not evaluated, absence of violations proves nothing", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace, FIXTURE_MAPS);
    appendEvent(workspace, { eventType: "metric", meta: { agentId: AGENT_B } });
    const row = category(workspace, AGENT_A, "fx_no_audit");
    expect(row.status).toBe("NOT_EVALUATED");
    expect(row.notEvaluatedReasons.join(" ")).toContain("absence of violations proves nothing");
  });

  test("a bound event for agent B only leaves agent A's category NOT_EVALUATED", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace, FIXTURE_MAPS);
    appendEvent(workspace, { meta: { agentId: AGENT_B, controlIds: ["fx_event"] } });
    expect(category(workspace, AGENT_A, "fx_event").status).toBe("NOT_EVALUATED");
    expect(category(workspace, AGENT_B, "fx_event").status).toBe("SATISFIED");
  });

  test("a bound positive event in session system: agent-scoped NOT_EVALUATED, workspace-scoped SATISFIED", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace, FIXTURE_MAPS);
    appendEvent(workspace, { sessionId: "system", meta: { controlIds: ["fx_event", "fx_workspace_event"] } });
    const agentScoped = category(workspace, AGENT_A, "fx_event");
    expect(agentScoped.status).toBe("NOT_EVALUATED");
    expect(agentScoped.result).toBe("not_evaluated");
    expect(category(workspace, AGENT_A, "fx_workspace_event").status).toBe("SATISFIED");
  });

  test("a denied audit type in session system fails agent A's requires_no_audit", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace, FIXTURE_MAPS);
    appendEvent(workspace, { sessionId: "system", auditType: "DENIED_SIGNAL", meta: {} });
    const row = category(workspace, AGENT_A, "fx_no_audit");
    expect(row.result).toBe("fail");
    expect(row.status).toBe("MISSING");
    expect(row.evidenceRefs.length).toBe(1);
  });

  test("an event bound to soc2_availability does not satisfy nist_map", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace);
    appendEvent(workspace, { auditType: "NIST_MAP_SIGNAL", meta: { agentId: "default", controlIds: ["soc2_availability"] } });
    const nistMap = category(workspace, "default", "nist_map", "NIST_AI_RMF");
    expect(nistMap.status).toBe("NOT_EVALUATED");
    expect(nistMap.notEvaluatedReasons.join(" ")).toContain("no control-bound evidence for nist_map in window");
    expect(category(workspace, "default", "soc2_availability", "SOC2").status).toBe("SATISFIED");
  });

  test("a bound event from eval_import is NOT_EVALUATED with untrusted evidence", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace, FIXTURE_MAPS);
    appendEvent(workspace, { meta: { agentId: AGENT_A, controlIds: ["fx_event"], source: "eval_import" } });
    const row = category(workspace, AGENT_A, "fx_event");
    expect(row.status).toBe("NOT_EVALUATED");
    expect(row.evidence).toBe("untrusted");
  });

  test("bound events below the observed ratio are NOT_EVALUATED with untrusted evidence", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace, FIXTURE_MAPS);
    appendEvent(workspace, { meta: { agentId: AGENT_A, controlIds: ["fx_event"], trustTier: "SELF_REPORTED" } });
    const row = category(workspace, AGENT_A, "fx_event");
    expect(row.status).toBe("NOT_EVALUATED");
    expect(row.evidence).toBe("untrusted");
  });

  test("a bound event without meta.agentId is not credited to default", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace, FIXTURE_MAPS);
    appendEvent(workspace, { meta: { controlIds: ["fx_event"] } });
    expect(category(workspace, "default", "fx_event").status).toBe("NOT_EVALUATED");
  });

  test("an event outside the window is not counted", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace, FIXTURE_MAPS);
    appendEvent(workspace, { meta: { agentId: AGENT_A, controlIds: ["fx_event"] }, ts: Date.now() - 30 * DAY_MS });
    const row = category(workspace, AGENT_A, "fx_event");
    expect(row.status).toBe("NOT_EVALUATED");
    expect(row.evidence).toBe("incomplete");
  });

  test("a tampered maps signature makes every category NOT_EVALUATED and untrusted, never PARTIAL", () => {
    const workspace = newWorkspace();
    const { path } = initComplianceMaps(workspace);
    appendEvent(workspace, { meta: { agentId: "default", controlIds: ["soc2_availability", "nist_map"] } });
    appendFileSync(path, "\n# tampered after signing\n");
    for (const framework of ["SOC2", "NIST_AI_RMF", "HIPAA"] as ComplianceFramework[]) {
      const out = report(workspace, "default", framework);
      expect(out.configTrusted).toBe(false);
      for (const row of out.categories) {
        expect({ status: row.status, result: row.result, evidence: row.evidence })
          .toEqual({ status: "NOT_EVALUATED", result: "not_evaluated", evidence: "untrusted" });
      }
      expect(out.coverage.score).toBeNull();
    }
  });

  test("a hand-written assurance report JSON leaves requires_assurance_pack NOT_EVALUATED and untrusted", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace, FIXTURE_MAPS);
    const forged = { ...assuranceReport(AGENT_A, Date.now(), 100), reportJsonSha256: "0".repeat(64), runSealSig: "forged" };
    writeFileSync(join(assuranceReportsDir(workspace, AGENT_A), "forged.json"), JSON.stringify(forged, null, 2));
    const row = category(workspace, AGENT_A, "fx_pack");
    expect(row.status).toBe("NOT_EVALUATED");
    expect(row.evidence).toBe("untrusted");
  });

  test("a sealed run below minScore fails requires_assurance_pack", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace, FIXTURE_MAPS);
    writeSealedAssuranceReport(workspace, AGENT_A, 20);
    const row = category(workspace, AGENT_A, "fx_pack");
    expect(row.result).toBe("fail");
    expect(row.status).toBe("MISSING");
  });

  test("a sealed run whose pack scenarios were all inconclusive leaves requires_assurance_pack NOT_EVALUATED", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace, FIXTURE_MAPS);
    const inconclusive = { auditEventTypes: [], inconclusive: true };
    writeSealedAssuranceReport(workspace, AGENT_A, 0, [inconclusive, inconclusive]);
    const row = category(workspace, AGENT_A, "fx_pack");
    expect({ status: row.status, result: row.result, evidence: row.evidence })
      .toEqual({ status: "NOT_EVALUATED", result: "not_evaluated", evidence: "incomplete" });
  });

  test("a passing pack score with inconclusive scenarios is NOT_EVALUATED, not a pass on a partial measurement", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace, FIXTURE_MAPS);
    const inconclusive = { auditEventTypes: [], inconclusive: true };
    writeSealedAssuranceReport(workspace, AGENT_A, 100, [...ONE_MEASURED, inconclusive, inconclusive, inconclusive]);
    const row = category(workspace, AGENT_A, "fx_pack");
    expect({ status: row.status, result: row.result, evidence: row.evidence })
      .toEqual({ status: "NOT_EVALUATED", result: "not_evaluated", evidence: "incomplete" });
    expect(row.notEvaluatedReasons.join(" ")).toContain("3 of 4 scenarios inconclusive");
  });

  test("bound runtime OBSERVED events, a sealed passing run and no violations: SATISFIED", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace, FIXTURE_MAPS);
    appendEvent(workspace, { meta: { agentId: AGENT_A, controlIds: ["fx_full"] } });
    writeSealedAssuranceReport(workspace, AGENT_A, 88);
    const out = report(workspace, AGENT_A);
    const row = out.categories.find((entry) => entry.id === "fx_full");
    expect(row?.status).toBe("SATISFIED");
    expect(row?.result).toBe("pass");
    expect(row?.evidence).toBe("sufficient");
    expect(row?.notEvaluatedReasons).toEqual([]);
    expect(out.coverage.evaluated).toBeGreaterThan(0);
    expect(out.coverage.score).toBeTypeOf("number");
  });

  test("a failing requirement next to a passing one is PARTIAL; PARTIAL never comes from not evaluated", () => {
    const workspace = newWorkspace();
    initComplianceMaps(workspace, FIXTURE_MAPS);
    appendEvent(workspace, { meta: { agentId: AGENT_A, controlIds: ["fx_full"] } });
    appendEvent(workspace, { auditType: "DENIED_SIGNAL", meta: { agentId: AGENT_A } });
    writeSealedAssuranceReport(workspace, AGENT_A, 88);
    const out = report(workspace, AGENT_A);
    expect(out.categories.find((entry) => entry.id === "fx_full")?.status).toBe("PARTIAL");
    for (const row of out.categories.filter((entry) => entry.status === "PARTIAL")) {
      expect(row.result).toBe("fail");
    }
    expect(out.categories.find((entry) => entry.id === "fx_workspace_event")?.status).toBe("NOT_EVALUATED");
  });
});
