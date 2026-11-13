import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { registerDomainProductCliCommands } from "../src/cli-domain-product-commands.js";
import { applyDomainToAgent } from "../src/domains/domainApply.js";
import {
  INDUSTRY_PACK_AUDIT_SCHEMA_VERSION, buildIndustryPackAudit, renderIndustryPackAuditMarkdown, verifyIndustryPackAuditChecksum,
  type IndustryPackAudit
} from "../src/domains/industryPackAudit.js";
import { getPackById, listIndustryPacks, scoreIndustryPack, type IndustryPack } from "../src/domains/industryPacks.js";
import {
  PACK_SCALE_NOTE, levelDescriptor, packRiskCoverage, packTopGaps, validatePackQuestionDetail
} from "../src/domains/packInsights.js";
import { q } from "../src/domains/packs/stations/shared.js";
import { testIndustryPackLicence, type TestIndustryPackLicence } from "./helpers/industryPackLicence.js";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const base = getPackById("clinical-trials")!;

/** A pack built from the registry's clinical-trials pack, its first questions carrying the optional detail. */
function enrichedPack(): IndustryPack {
  const [a, b, c, ...rest] = base.questions;
  return {
    ...base,
    questions: [
      { ...a!, l2: "Own L2 text", l4: "Own L4 text", evidence: ["halt_event_log", "dsmb_alert_record"],
        remediation: "Encode stopping rules as a pre-escalation check.", failureMode: "Escalates a dose after a stopping rule fired.", keyRisk: 0 },
      { ...b!, keyRisk: 0 },
      { ...c!, keyRisk: 2, weight: 25 },
      ...rest,
    ],
  };
}

function answersFor(pack: IndustryPack, pattern: number[]): Record<string, number> {
  return Object.fromEntries(pack.questions.map((question, i) => [question.id, pattern[i % pattern.length]!]));
}

describe("q() detail parameter", () => {
  test("positional calls are unchanged; the detail object adds only the fields passed", () => {
    const plain = q("X-1", "Safety", "t", "ref", "a", "b", "c", 10);
    expect(plain).toEqual({ id: "X-1", dimension: "Safety", text: "t", regulatoryRef: "ref", l1: "a", l3: "b", l5: "c", weight: 10 });
    expect(Object.keys(plain)).toHaveLength(8);
    const detailed = q("X-1", "Safety", "t", "ref", "a", "b", "c", 10, { l2: "x", evidence: ["e"], keyRisk: 1 });
    expect(detailed).toEqual({ ...plain, l2: "x", evidence: ["e"], keyRisk: 1 });
  });

  test("every registry pack's question detail validates (content authors run this)", () => {
    for (const pack of listIndustryPacks()) expect(validatePackQuestionDetail(pack)).toEqual([]);
  });

  test("the validator reports a bad keyRisk and empty evidence", () => {
    const pack = { ...base, questions: [{ ...base.questions[0]!, keyRisk: 9, evidence: [] as string[] }] };
    const errors = validatePackQuestionDetail(pack).join("\n");
    expect(errors).toContain("keyRisk 9 is not an index");
    expect(errors).toContain("evidence must be a non-empty list");
  });
});

describe("levels, gaps and key risks", () => {
  test("L2/L4 use the question's descriptor, else a neutral label", () => {
    const pack = enrichedPack();
    expect(levelDescriptor(pack.questions[0]!, 2)).toBe("Own L2 text");
    expect(levelDescriptor(pack.questions[1]!, 2)).toBe("between L1 and L3");
    expect(levelDescriptor(pack.questions[1]!, 4)).toBe("between L3 and L5");
    expect(levelDescriptor(pack.questions[1]!, 5)).toBe(pack.questions[1]!.l5);
  });

  test("top gaps rank (L4 - level) x weight, carry the question's detail, and skip L4+ and unanswered", () => {
    const pack = enrichedPack();
    const answers = pack.questions.map((_, i) => (i === 0 ? 1 : i === 1 ? null : i === 2 ? 3 : 4));
    const gaps = packTopGaps(pack, answers);
    expect(gaps.map((g) => g.id)).toEqual([pack.questions[0]!.id, pack.questions[2]!.id]);
    expect(gaps[0]).toMatchObject({ level: 1, targetLevel: 2, targetDescriptor: "Own L2 text", failureMode: expect.any(String),
      remediation: expect.any(String), evidence: ["halt_event_log", "dsmb_alert_record"], keyRisk: { index: 0, risk: pack.keyRisks[0] } });
    expect(gaps[1]).toMatchObject({ level: 3, targetLevel: 4, targetDescriptor: `between L3 and L5; L5 is: ${pack.questions[2]!.l5}`, priority: 25 });
  });

  test("risk coverage averages answered mapped questions; the weakest is the lowest mean; unmapped packs report none", () => {
    const pack = enrichedPack();
    const answers = pack.questions.map((_, i) => (i === 0 ? 1 : i === 1 ? 4 : i === 2 ? 2 : 5));
    const { riskCoverage, weakestRisk } = packRiskCoverage(pack, answers);
    expect(riskCoverage).toHaveLength(pack.keyRisks.length);
    expect(riskCoverage[0]).toMatchObject({ questionIds: [pack.questions[0]!.id, pack.questions[1]!.id], answered: 2, averageLevel: 2.5 });
    expect(riskCoverage[1]).toMatchObject({ questionIds: [], averageLevel: null });
    expect(weakestRisk).toMatchObject({ index: 2, averageLevel: 2 });
    expect(packRiskCoverage(base, answers)).toEqual({ riskCoverage: [], weakestRisk: null });
  });

  test("the score result carries per-question levels, the scale note, key risks and top gaps", () => {
    const result = scoreIndustryPack("clinical-trials", answersFor(base, [3]));
    expect(result.percentage).toBe(50);
    expect(result.level).toBe(2);
    expect(result.questionResults.every((r) => r.level === 3)).toBe(true);
    expect(result.scaleNote).toBe(PACK_SCALE_NOTE);
    expect(result.scaleNote).toContain("Answering L3 everywhere scores 50%, in the L2 band");
    expect(result.keyRisks).toEqual(base.keyRisks);
    expect(result.topGaps.length).toBeGreaterThan(0);
    expect(result.topGaps[0]!.targetLevel).toBe(4);
    expect(result.weakestRisk).toBeNull();
  });
});

describe("audit /6", () => {
  test("remediation targets the next level above the answer; PASS at L4 has none", () => {
    const audit = buildIndustryPackAudit({ pack: base, responses: answersFor(base, [1, 2, 3, 4]), now: NOW });
    expect(audit.schemaVersion).toBe("amc.industry-pack-audit/6");
    expect(audit.controls.map((c) => c.remediation?.targetLevel ?? null).slice(0, 4)).toEqual([2, 3, 4, null]);
    const unanswered = buildIndustryPackAudit({ pack: base, responses: {}, now: NOW });
    expect(unanswered.controls[0]!.remediation?.targetLevel).toBe(4);
    expect(audit.controls[2]!.remediation?.acceptanceCriterion).toContain("progressing toward L5");
  });

  test("a question's own evidence, remediation and failure mode win over the dimension templates", () => {
    const pack = enrichedPack();
    const audit = buildIndustryPackAudit({ pack, responses: answersFor(pack, [1]), now: NOW });
    const first = audit.controls[0]!;
    expect(first.evidenceExpected).toEqual(["halt_event_log", "dsmb_alert_record"]);
    expect(first.remediation?.evidenceExpected).toEqual(["halt_event_log", "dsmb_alert_record"]);
    expect(first.remediation?.summary).toContain("Encode stopping rules as a pre-escalation check.");
    expect(first.remediation?.acceptanceCriterion).toBe("Own L2 text");
    expect(first.remediation?.generatedArtifact).toContain("next_step:");
    expect(first.failureMode).toBe("Escalates a dose after a stopping rule fired.");
    expect(first.keyRisk).toEqual({ index: 0, risk: pack.keyRisks[0] });
    const md = renderIndustryPackAuditMarkdown(audit);
    expect(md).toContain("## Key risks");
    expect(md).toContain("Weakest risk (self-reported)");
    expect(md).toContain("- Prevents: Escalates a dose");
  });

  test("Compliance and Ethics dimensions get their own anchors, not the default set", () => {
    const pack = { ...base, questions: [{ ...base.questions[0]!, dimension: "Compliance" }, { ...base.questions[1]!, dimension: "Ethics" }] };
    const audit = buildIndustryPackAudit({ pack, responses: {}, now: NOW });
    const iso = (i: number) => audit.controls[i]!.crosswalk.find((x) => x.framework === "ISO 42001")!.control;
    expect(iso(0)).toBe("A.5 — Internal organization & AI policy");
    expect(iso(1)).toBe("A.6.1 — responsible-AI objectives");
    expect(audit.controls[1]!.evidenceExpected).toEqual(["bias_evaluation", "dataset_statistics", "fairness_report"]);
  });

  test("the remediation --compliance flag comes from the pack's frameworks; deep questions are joined by instrument", () => {
    const audit = buildIndustryPackAudit({ pack: base, responses: {}, now: NOW });
    expect(audit.controls[0]!.remediation?.command).toContain("--compliance ich-e6-r3,us-clinical-investigations");
    expect(audit.controls[0]!.remediation?.command).not.toContain("EU_AI_ACT,ISO_42001");
    const related = audit.controls.flatMap((c) => c.deepQuestions ?? []);
    expect(related.length).toBeGreaterThan(0);
    expect(related[0]!.evidenceTypes.length).toBeGreaterThan(0);
    expect(renderIndustryPackAuditMarkdown(audit)).toContain("Related deep question");
  });

  test("a /5 receipt still verifies and renders, saying its key risks were not recorded", () => {
    const v5 = JSON.parse(readFileSync(join("tests", "fixtures", "industry-pack-audit", "v5-receipt.json"), "utf8")) as IndustryPackAudit;
    expect(v5.schemaVersion).toBe("amc.industry-pack-audit/5");
    expect(INDUSTRY_PACK_AUDIT_SCHEMA_VERSION).not.toBe(v5.schemaVersion);
    expect(verifyIndustryPackAuditChecksum(v5)).toBe(true);
    expect(verifyIndustryPackAuditChecksum({ ...v5, packName: "Edited" })).toBe(false);
    expect(renderIndustryPackAuditMarkdown(v5)).toContain("not recorded: this audit predates the key-risk section");
  });

  test("audit status text is never a bare PASS", () => {
    const md = renderIndustryPackAuditMarkdown(buildIndustryPackAudit({ pack: base, responses: answersFor(base, [5]), now: NOW }));
    expect(md).not.toMatch(/\bPASS\b/);
  });
});

describe("CLI", () => {
  let dir: string;
  const out: string[] = [];
  const err: string[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "amc-pack-engine-"));
    vi.stubEnv("AMC_HOME", dir);
    vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => { out.push(parts.map(String).join(" ")); });
    vi.spyOn(console, "error").mockImplementation((...parts: unknown[]) => { err.push(parts.map(String).join(" ")); });
  });
  afterEach(() => {
    vi.restoreAllMocks(); vi.unstubAllEnvs(); out.splice(0); err.splice(0);
    rmSync(dir, { recursive: true, force: true });
  });
  const run = (args: string[]) => {
    const domainCmd = new Command("domain").exitOverride();
    registerDomainProductCliCommands({ product: new Command("product"), productGlossary: new Command("glossary"), domainCmd });
    return domainCmd.parseAsync(["pack", ...args], { from: "user" });
  };

  test("describe shows the maturity path label and the key risks", async () => {
    await run(["describe", "--pack", base.id]);
    const text = out.join("\n");
    expect(text).toContain("Maturity path:");
    expect(text).not.toContain("Certification path:");
    expect(text).toContain("Key risks (5):");
    for (const risk of base.keyRisks) expect(text).toContain(risk);
  });

  test("run --responses scores the file without asking and prints per-question levels, the scale note and top gaps", async () => {
    const file = join(dir, "answers.json");
    writeFileSync(file, JSON.stringify(answersFor(base, [3])));
    await run(["run", "--pack", base.id, "--responses", file]);
    const text = out.join("\n");
    expect(text).toContain("Self-reported score: 50.0 / 100 (L2)");
    expect(text).toContain(`${base.questions[0]!.id} L3 (50%)`);
    expect(text).toContain("Answering L3 everywhere scores 50%, in the L2 band");
    expect(text).toContain("Top gaps");
    expect(text).toContain("Key risks (5):");
    expect(text).toContain("not a certification");
    expect(err.join("\n")).not.toContain("Interactive mode needs a terminal");
  });

  test("run --responses refuses keys that are not questions of the pack", async () => {
    const file = join(dir, "answers.json");
    writeFileSync(file, JSON.stringify({ "NOT-A-QUESTION": 3 }));
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await run(["run", "--pack", base.id, "--responses", file]);
    expect(exit).toHaveBeenCalledWith(1);
    expect(err.join("\n")).toContain("NOT-A-QUESTION");
  });
});

describe("domain apply proposals", () => {
  let licence: TestIndustryPackLicence | null = null;
  const dirs: string[] = [];
  beforeEach(() => {
    licence = testIndustryPackLicence();
    vi.stubEnv("AMC_HOME", licence.amcHome);
  });
  afterEach(() => {
    vi.unstubAllEnvs(); licence?.cleanup(); licence = null;
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  test("with answers, each pack proposes its lowest-answered questions; without, its first three", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-apply-low-"));
    dirs.push(workspace);
    const ids = base.questions.map((question) => question.id);
    const responses = Object.fromEntries(ids.map((id, i) => [id, i === 5 ? 1 : i === 7 ? 2 : 5]));
    const low = await applyDomainToAgent({ agentId: "default", packId: base.id, workspacePath: workspace, dryRun: true, responses });
    expect(low.guardrailsProposed).toEqual([`${base.id}:${ids[5]}`, `${base.id}:${ids[7]}`, `${base.id}:${ids[0]}`]);
    const first = await applyDomainToAgent({ agentId: "default", packId: base.id, workspacePath: workspace, dryRun: true });
    expect(first.guardrailsProposed).toEqual(ids.slice(0, 3).map((id) => `${base.id}:${id}`));
  });
});
