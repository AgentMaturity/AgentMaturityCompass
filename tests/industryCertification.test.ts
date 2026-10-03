import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import { openLedger } from "../src/ledger/ledger.js";
import { getAgentPaths } from "../src/fleet/paths.js";
import { canonicalize } from "../src/utils/json.js";
import { sha256Hex } from "../src/utils/hash.js";
import { getAssurancePack } from "../src/assurance/packs/index.js";
import {
  startAssuranceSession,
  writeScenarioPrompt,
  writeScenarioResponse,
  writeScenarioTestResult
} from "../src/assurance/evidenceWriters.js";
import { getDomainPackQuestions } from "../src/score/domainPacks.js";
import { getIndustryPacksByStation } from "../src/domains/industryPacks.js";
import type { AssurancePackResult, AssuranceReport, AssuranceScenarioResult } from "../src/types.js";
import {
  CertificationProvenanceError,
  DEFAULT_SCENARIO_PACK_IDS,
  certificationStatusFrom,
  composeCertificationRun,
  deriveStationRequirements,
  parseCertificationExport,
  renderCertificationJson,
  renderCertificationMarkdown,
  resolveSourceCommit,
  runIndustryCertification,
  verifyCertificationExport,
  type CertificationRequirement,
  type PackResponseEvidence
} from "../src/domains/certification/index.js";

/**
 * A certification run composes three evidence sources — sector pack responses,
 * the station's required assurance packs, and the scenario (red-team) packs —
 * into one sealed result with an explicit PASS / FAIL / NOT_EVALUATED per
 * requirement. The rules pinned here:
 *
 *  - NOT_EVALUATED is never a pass: one missing requirement means NOT_CERTIFIED
 *    and the missing requirement is named.
 *  - Evidence without provenance (no ledger session, no ledger event ids) is
 *    refused, not scored.
 *  - The export round-trips through JSON, carries the boundary of the result
 *    (source commit, environment) and the evidence ids per requirement, and
 *    its seal voids on any edit.
 */

const roots: string[] = [];
const AGENT = "default";
const STATION = "health";
const COMMIT = "8f57ce63d8331f1bef1c2a18fde82a7e8f4511da";

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-industry-cert-test-"));
  roots.push(dir);
  process.env.AMC_VAULT_PASSPHRASE = "industry-cert-test-passphrase";
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function assuranceReportsDir(workspace: string): string {
  const dir = join(getAgentPaths(workspace, AGENT).reportsDir, "assurance");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Every sector-pack and domain question of the station answered at L4 with session provenance. */
function fullPackResponses(sessionId = "pack-session-1"): PackResponseEvidence[] {
  const out: PackResponseEvidence[] = [];
  for (const pack of getIndustryPacksByStation(STATION)) {
    for (const question of pack.questions) {
      out.push({ questionId: question.id, level: 4, sessionId, responseId: `resp-${question.id}` });
    }
  }
  for (const question of getDomainPackQuestions(STATION)) {
    out.push({ questionId: question.id, level: 4, sessionId, responseId: `resp-${question.id}` });
  }
  return out;
}

const HEALTH_ASSURANCE_PACKS = ["healthcarePHI", "safetyCriticalSIL", ...DEFAULT_SCENARIO_PACK_IDS];

interface WrittenReport {
  report: AssuranceReport;
  file: string;
}

/**
 * Writes an assurance report the way the runner does: real ledger session,
 * real prompt/response/test events per scenario, canonical hash, auditor seal.
 */
function writeSealedAssuranceReport(
  workspace: string,
  params: {
    packIds: string[];
    now: number;
    runId?: string;
    failScenarioOf?: string;
    dropScenarioOf?: string;
    mutateReport?: (report: Record<string, unknown>) => void;
    mutateBeforeSeal?: (report: AssuranceReport) => AssuranceReport;
  }
): WrittenReport {
  const ledger = openLedger(workspace);
  try {
    const sessionId = startAssuranceSession({
      ledger,
      mode: "supervise",
      agentId: AGENT,
      packIds: params.packIds,
      trustTier: "OBSERVED"
    });
    const packResults: AssurancePackResult[] = params.packIds.map((packId) => {
      const pack = getAssurancePack(packId);
      const scenarioResults: AssuranceScenarioResult[] = [];
      for (const scenario of pack.scenarios) {
        if (params.dropScenarioOf === packId && scenario === pack.scenarios[0]) continue;
        const pass = !(params.failScenarioOf === packId && scenario === pack.scenarios[0]);
        const prompt = `prompt:${scenario.id}`;
        const response = `response:${scenario.id}`;
        const common = { ledger, sessionId, runtime: "unknown" as const, trustTier: "OBSERVED" as const, packId, scenarioId: scenario.id, agentId: AGENT };
        const promptEventId = writeScenarioPrompt({ ...common, prompt });
        const responseEventId = writeScenarioResponse({ ...common, response });
        const testEventId = writeScenarioTestResult({
          ...common,
          score0to100: pass ? 100 : 0,
          pass,
          reasons: pass ? [] : ["fixture failure"],
          correlatedRequestIds: []
        });
        scenarioResults.push({
          scenarioId: scenario.id,
          title: scenario.title,
          category: scenario.category,
          riskTier: "all",
          prompt,
          response,
          pass,
          score0to5: pass ? 5 : 0,
          score0to100: pass ? 100 : 0,
          reasons: pass ? [] : ["fixture failure"],
          correlatedRequestIds: [],
          evidenceEventIds: [promptEventId, responseEventId, testEventId],
          auditEventTypes: [],
          responseTransport: "direct"
        });
      }
      const failCount = scenarioResults.filter((row) => !row.pass).length;
      return {
        packId,
        title: pack.title,
        scenarioCount: scenarioResults.length,
        passCount: scenarioResults.length - failCount,
        failCount,
        score0to100: scenarioResults.length === 0 ? 0 : Math.round(((scenarioResults.length - failCount) / scenarioResults.length) * 100),
        trustTier: "OBSERVED",
        scenarioResults
      };
    });
    ledger.sealSession(sessionId);

    let base: AssuranceReport = {
      assuranceRunId: params.runId ?? `run-${sha256Hex(params.packIds.join(",") + String(params.now)).slice(0, 12)}`,
      agentId: AGENT,
      sessionId,
      ts: params.now,
      mode: "supervise",
      windowStartTs: params.now - 1000,
      windowEndTs: params.now,
      trustTier: "OBSERVED",
      status: "VALID",
      verificationPassed: true,
      packResults,
      overallScore0to100: 100,
      integrityIndex: 1,
      trustLabel: "HIGH TRUST",
      reportJsonSha256: "",
      runSealSig: "",
      evidenceStatus: "MEASURED",
      inconclusiveScenarioCount: 0,
      target: { transport: "direct", endpoint: "fixture", model: "fixture-model", providerTemplateId: "fixture" }
    };
    if (params.mutateBeforeSeal) base = params.mutateBeforeSeal(base);
    const hash = sha256Hex(canonicalize(base));
    const sig = ledger.signRunHash(hash);
    const report: AssuranceReport = { ...base, reportJsonSha256: hash, runSealSig: sig };
    const record = report as unknown as Record<string, unknown>;
    if (params.mutateReport) params.mutateReport(record);
    const file = join(assuranceReportsDir(workspace), `${report.assuranceRunId}.json`);
    writeFileSync(file, JSON.stringify(record, null, 2));
    return { report: record as unknown as AssuranceReport, file };
  } finally {
    ledger.close();
  }
}

function statusOf(requirements: CertificationRequirement[], id: string): CertificationRequirement["status"] {
  const found = requirements.find((row) => row.id === id);
  if (!found) throw new Error(`requirement ${id} missing from run`);
  return found.status;
}

describe("industry certification — requirement derivation", () => {
  test("health station requirements come from the sector packs, the domain pack, the registry's assurance packs and the scenario baseline", () => {
    const specs = deriveStationRequirements(STATION);
    const kinds = new Set(specs.map((spec) => spec.kind));
    expect(kinds).toEqual(new Set(["industry-pack-question", "domain-question", "assurance-pack", "scenario-pack"]));
    const sectorQuestionCount = getIndustryPacksByStation(STATION).reduce((sum, pack) => sum + pack.questions.length, 0);
    expect(specs.filter((spec) => spec.kind === "industry-pack-question")).toHaveLength(sectorQuestionCount);
    expect(specs.filter((spec) => spec.kind === "domain-question")).toHaveLength(getDomainPackQuestions(STATION).length);
    expect(specs.filter((spec) => spec.kind === "assurance-pack").map((spec) => spec.packId)).toEqual(["healthcarePHI", "safetyCriticalSIL"]);
    expect(specs.filter((spec) => spec.kind === "scenario-pack").map((spec) => spec.packId)).toEqual([...DEFAULT_SCENARIO_PACK_IDS]);
    expect(new Set(specs.map((spec) => spec.id)).size).toBe(specs.length);
  });

  test("a station profile adds packs without duplicating registry packs across kinds", () => {
    const specs = deriveStationRequirements(STATION, {
      id: "health-profile-fixture",
      source: "test",
      requiredAssurancePacks: ["hipaaCompliance", "healthcarePHI"],
      requiredScenarioPacks: ["exfiltration", "healthcarePHI"]
    });
    expect(specs.filter((spec) => spec.kind === "assurance-pack").map((spec) => spec.packId)).toEqual(["healthcarePHI", "safetyCriticalSIL", "hipaaCompliance"]);
    expect(specs.filter((spec) => spec.kind === "scenario-pack").map((spec) => spec.packId)).toEqual(["injection", "exfiltration"]);
  });
});

describe("industry certification — status is a function of requirement statuses", () => {
  test("NOT_EVALUATED never counts as pass: one unanswered requirement is NOT_CERTIFIED and named", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    const { report } = writeSealedAssuranceReport(workspace, { packIds: HEALTH_ASSURANCE_PACKS, now });
    const responses = fullPackResponses();
    const dropped = responses[0]!;
    const run = composeCertificationRun({
      station: STATION,
      agentId: AGENT,
      packResponses: responses.slice(1),
      assuranceReports: [report],
      sourceCommit: COMMIT,
      nowTs: now
    });
    expect(run.status).toBe("NOT_CERTIFIED");
    expect(run.counts.notEvaluated).toBe(1);
    expect(run.counts.fail).toBe(0);
    expect(run.counts.pass).toBe(run.counts.total - 1);
    expect(run.notEvaluatedRequirementIds).toHaveLength(1);
    expect(run.notEvaluatedRequirementIds[0]).toContain(dropped.questionId);
    const missing = run.requirements.find((row) => row.id === run.notEvaluatedRequirementIds[0]);
    expect(missing?.status).toBe("NOT_EVALUATED");
    expect(missing?.evidence).toEqual([]);
  });

  test("every requirement evaluated and passing is CERTIFIED", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    const { report } = writeSealedAssuranceReport(workspace, { packIds: HEALTH_ASSURANCE_PACKS, now });
    const run = composeCertificationRun({
      station: STATION,
      agentId: AGENT,
      packResponses: fullPackResponses(),
      assuranceReports: [report],
      sourceCommit: COMMIT,
      nowTs: now
    });
    expect(run.status).toBe("CERTIFIED");
    expect(run.counts).toEqual({ total: run.requirements.length, pass: run.requirements.length, fail: 0, notEvaluated: 0 });
    expect(run.failedRequirementIds).toEqual([]);
    expect(run.notEvaluatedRequirementIds).toEqual([]);
  });

  test("a failed assurance scenario is FAIL for its pack and NOT_CERTIFIED overall", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    const { report } = writeSealedAssuranceReport(workspace, { packIds: HEALTH_ASSURANCE_PACKS, now, failScenarioOf: "healthcarePHI" });
    const run = composeCertificationRun({
      station: STATION,
      agentId: AGENT,
      packResponses: fullPackResponses(),
      assuranceReports: [report],
      sourceCommit: COMMIT,
      nowTs: now
    });
    expect(run.status).toBe("NOT_CERTIFIED");
    expect(run.failedRequirementIds).toEqual(["assurance-pack:healthcarePHI"]);
    expect(statusOf(run.requirements, "assurance-pack:safetyCriticalSIL")).toBe("PASS");
  });

  test("a pack with a scenario never measured is NOT_EVALUATED, not a partial pass", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    const { report } = writeSealedAssuranceReport(workspace, { packIds: HEALTH_ASSURANCE_PACKS, now, dropScenarioOf: "injection" });
    const run = composeCertificationRun({
      station: STATION,
      agentId: AGENT,
      packResponses: fullPackResponses(),
      assuranceReports: [report],
      sourceCommit: COMMIT,
      nowTs: now
    });
    expect(run.status).toBe("NOT_CERTIFIED");
    expect(run.notEvaluatedRequirementIds).toEqual(["scenario-pack:injection"]);
    const requirement = run.requirements.find((row) => row.id === "scenario-pack:injection");
    expect(requirement?.reason).toContain(getAssurancePack("injection").scenarios[0]!.id);
  });

  test("a sector-pack response below L3 and a domain question below its required level are FAIL", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    const { report } = writeSealedAssuranceReport(workspace, { packIds: HEALTH_ASSURANCE_PACKS, now });
    const sectorQuestion = getIndustryPacksByStation(STATION)[0]!.questions[0]!;
    const responses = fullPackResponses().map((row) => {
      if (row.questionId === sectorQuestion.id) return { ...row, level: 2 };
      if (row.questionId === "HC-1") return { ...row, level: 3 };
      return row;
    });
    const run = composeCertificationRun({
      station: STATION,
      agentId: AGENT,
      packResponses: responses,
      assuranceReports: [report],
      sourceCommit: COMMIT,
      nowTs: now
    });
    expect(run.status).toBe("NOT_CERTIFIED");
    expect(run.failedRequirementIds).toHaveLength(2);
    expect(run.failedRequirementIds.some((id) => id.endsWith(`:${sectorQuestion.id}`))).toBe(true);
    expect(run.failedRequirementIds).toContain("domain-question:health:HC-1");
  });

  test("certificationStatusFrom is not an average: many passes do not outweigh one NOT_EVALUATED", () => {
    const pass = (id: string): CertificationRequirement => ({
      id, kind: "industry-pack-question", title: id, source: "fixture", criterion: "fixture", status: "PASS", observed: "L4", reason: "fixture", evidence: [{ kind: "ledger-session", id: "s" }]
    });
    const many = Array.from({ length: 99 }, (_, index) => pass(`req-${index}`));
    const withGap = [...many, { ...pass("req-gap"), status: "NOT_EVALUATED" as const, observed: null, evidence: [] }];
    expect(certificationStatusFrom(many).status).toBe("CERTIFIED");
    expect(certificationStatusFrom(withGap).status).toBe("NOT_CERTIFIED");
    expect(certificationStatusFrom(withGap).notEvaluatedRequirementIds).toEqual(["req-gap"]);
    expect(certificationStatusFrom([]).status).toBe("NOT_CERTIFIED");
  });
});

describe("industry certification — provenance refusal", () => {
  test("an assurance report without a ledger session is refused", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    const { report } = writeSealedAssuranceReport(workspace, {
      packIds: HEALTH_ASSURANCE_PACKS,
      now,
      mutateBeforeSeal: (base) => {
        const { sessionId: _sessionId, ...rest } = base;
        return rest as AssuranceReport;
      }
    });
    expect(() =>
      composeCertificationRun({ station: STATION, agentId: AGENT, packResponses: fullPackResponses(), assuranceReports: [report], sourceCommit: COMMIT, nowTs: now })
    ).toThrow(CertificationProvenanceError);
  });

  test("a measured scenario without ledger event ids is refused", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    const { report } = writeSealedAssuranceReport(workspace, {
      packIds: HEALTH_ASSURANCE_PACKS,
      now,
      mutateBeforeSeal: (base) => ({
        ...base,
        packResults: base.packResults.map((pack) => ({
          ...pack,
          scenarioResults: pack.scenarioResults.map((scenario) => ({ ...scenario, evidenceEventIds: [] }))
        }))
      })
    });
    expect(() =>
      composeCertificationRun({ station: STATION, agentId: AGENT, packResponses: fullPackResponses(), assuranceReports: [report], sourceCommit: COMMIT, nowTs: now })
    ).toThrow(/evidenceEventIds/);
  });

  test("a pack response without a session id is refused", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    const { report } = writeSealedAssuranceReport(workspace, { packIds: HEALTH_ASSURANCE_PACKS, now });
    const responses = fullPackResponses().map((row, index) => (index === 3 ? { ...row, sessionId: "" } : row));
    expect(() =>
      composeCertificationRun({ station: STATION, agentId: AGENT, packResponses: responses, assuranceReports: [report], sourceCommit: COMMIT, nowTs: now })
    ).toThrow(CertificationProvenanceError);
  });

  test("a red-team report shape (no sessionId, empty evidenceEventIds) is refused rather than scored", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    const pack = getAssurancePack("injection");
    const redTeamShaped = {
      runId: "rt-1",
      agentId: AGENT,
      ts: now,
      verification: { status: "UNSIGNED_VALID" },
      packResults: [
        {
          packId: "injection",
          title: pack.title,
          scenarioCount: pack.scenarios.length,
          passCount: pack.scenarios.length,
          failCount: 0,
          score0to100: 100,
          trustTier: "OBSERVED",
          scenarioResults: pack.scenarios.map((scenario) => ({
            scenarioId: scenario.id, title: scenario.title, category: scenario.category, riskTier: "all", prompt: "p", response: "r",
            pass: true, score0to5: 5, score0to100: 100, reasons: [], correlatedRequestIds: [], evidenceEventIds: [], auditEventTypes: []
          }))
        }
      ]
    } as unknown as AssuranceReport;
    expect(() =>
      composeCertificationRun({ station: STATION, agentId: AGENT, packResponses: fullPackResponses(), assuranceReports: [redTeamShaped], sourceCommit: COMMIT, nowTs: now })
    ).toThrow(CertificationProvenanceError);
    expect(workspace.length).toBeGreaterThan(0);
  });
});

describe("industry certification — workspace run, seal and export", () => {
  test("fixture health run with one evidence item missing is NOT_CERTIFIED, names the requirement, and the export carries the boundary", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    writeSealedAssuranceReport(workspace, { packIds: ["healthcarePHI", "safetyCriticalSIL"], now });
    const result = runIndustryCertification({
      workspace,
      agentId: AGENT,
      station: STATION,
      packResponses: fullPackResponses(),
      sourceCommit: COMMIT,
      nowTs: now
    });
    expect(result.run.status).toBe("NOT_CERTIFIED");
    expect(result.run.notEvaluatedRequirementIds).toEqual(["scenario-pack:injection"]);
    expect(result.run.failedRequirementIds).toEqual([]);
    expect(result.run.sourceCommit).toBe(COMMIT);
    expect(result.run.environment).toEqual({ platform: process.platform, arch: process.arch, node: process.version });
    expect(result.run.inputs.assuranceRuns).toHaveLength(1);
    expect(result.run.inputs.assuranceRuns[0]!.sessionId.length).toBeGreaterThan(0);

    const phi = result.run.requirements.find((row) => row.id === "assurance-pack:healthcarePHI");
    expect(phi?.status).toBe("PASS");
    expect(phi?.evidence.some((ref) => ref.kind === "assurance-run")).toBe(true);
    expect(phi?.evidence.some((ref) => ref.kind === "ledger-session")).toBe(true);
    expect(phi?.evidence.filter((ref) => ref.kind === "ledger-event").length).toBe(getAssurancePack("healthcarePHI").scenarios.length * 3);
    const sector = result.run.requirements.find((row) => row.kind === "industry-pack-question");
    expect(sector?.evidence).toEqual([
      { kind: "ledger-session", id: "pack-session-1" },
      { kind: "pack-response", id: `resp-${sector!.id.split(":").pop()}` }
    ]);

    const written = JSON.parse(readFileSync(result.jsonPath, "utf8")) as Record<string, unknown>;
    expect(written.sourceCommit).toBe(COMMIT);
    expect(written.environment).toEqual(result.run.environment);
    expect(verifyCertificationExport(workspace, written)).toEqual({ ok: true, errors: [] });
    const markdown = readFileSync(result.markdownPath, "utf8");
    expect(markdown).toContain("NOT_CERTIFIED");
    expect(markdown).toContain("scenario-pack:injection");
    expect(markdown).toContain(COMMIT);
  });

  test("a report whose seal does not verify, or whose events are not in the ledger, is refused and listed — not scored", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    writeSealedAssuranceReport(workspace, {
      packIds: ["healthcarePHI"],
      now,
      runId: "tampered",
      mutateReport: (report) => {
        (report.packResults as Array<{ score0to100: number }>)[0]!.score0to100 = 1;
      }
    });
    writeSealedAssuranceReport(workspace, {
      packIds: ["safetyCriticalSIL"],
      now,
      runId: "phantom-events",
      mutateBeforeSeal: (base) => ({
        ...base,
        packResults: base.packResults.map((pack) => ({
          ...pack,
          scenarioResults: pack.scenarioResults.map((scenario) => ({ ...scenario, evidenceEventIds: ["evt-does-not-exist"] }))
        }))
      })
    });
    writeSealedAssuranceReport(workspace, { packIds: ["injection"], now, runId: "good" });
    const result = runIndustryCertification({
      workspace,
      agentId: AGENT,
      station: STATION,
      packResponses: fullPackResponses(),
      sourceCommit: COMMIT,
      nowTs: now
    });
    expect(result.run.refusedInputs.map((row) => row.source.split("/").pop())).toEqual(["phantom-events.json", "tampered.json"]);
    expect(result.run.refusedInputs[0]!.reason).toContain("evt-does-not-exist");
    expect(result.run.refusedInputs[1]!.reason).toContain("seal");
    expect(result.run.inputs.assuranceRuns.map((row) => row.assuranceRunId)).toEqual(["good"]);
    expect(statusOf(result.run.requirements, "assurance-pack:healthcarePHI")).toBe("NOT_EVALUATED");
    expect(statusOf(result.run.requirements, "assurance-pack:safetyCriticalSIL")).toBe("NOT_EVALUATED");
    expect(statusOf(result.run.requirements, "scenario-pack:injection")).toBe("PASS");
    expect(result.run.status).toBe("NOT_CERTIFIED");
  });

  test("export round-trips through JSON, verifies against the auditor key, and voids on edit", () => {
    const workspace = newWorkspace();
    const now = Date.now();
    writeSealedAssuranceReport(workspace, { packIds: HEALTH_ASSURANCE_PACKS, now });
    const result = runIndustryCertification({
      workspace,
      agentId: AGENT,
      station: STATION,
      packResponses: fullPackResponses(),
      sourceCommit: COMMIT,
      nowTs: now
    });
    expect(result.run.status).toBe("CERTIFIED");
    const json = renderCertificationJson(result.run);
    const parsed = parseCertificationExport(json);
    expect(parsed).toEqual(result.run);
    expect(parseCertificationExport(renderCertificationJson(parsed))).toEqual(parsed);
    expect(verifyCertificationExport(workspace, parsed)).toEqual({ ok: true, errors: [] });

    const edited = { ...parsed, status: "CERTIFIED", requirements: parsed.requirements.map((row, index) => (index === 0 ? { ...row, status: "NOT_EVALUATED" as const } : row)) };
    const verdict = verifyCertificationExport(workspace, edited);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join(" ")).toMatch(/seal/);
    expect(verdict.errors.join(" ")).toMatch(/status/);

    const unsealed = { ...parsed, runSealSig: "unsigned" };
    expect(verifyCertificationExport(workspace, unsealed).ok).toBe(false);
    expect(renderCertificationMarkdown(parsed)).toContain("CERTIFIED");
  });

  test("resolveSourceCommit returns a full sha or an explicit unknown, never a guess", () => {
    expect(resolveSourceCommit(COMMIT)).toEqual({ sourceCommit: COMMIT, resolution: "explicit" });
    expect(() => resolveSourceCommit("abc")).toThrow(/sourceCommit/);
    const resolved = resolveSourceCommit();
    expect(resolved.sourceCommit === "unknown" || /^[0-9a-f]{40}$/.test(resolved.sourceCommit)).toBe(true);
    expect(resolved.resolution.length).toBeGreaterThan(0);
  });
});
