/**
 * P1-33: the pack admission checker. tests/fixtures/catalog/admission/complete-pack is a synthetic catalog whose one
 * pack claims reviewed support; its review records are signed here by the P1-34 fixture reviewers, over the digests of
 * whatever variant a case builds. Each broken case edits one thing in memory and must be refused with its code. The
 * shipped Layer 0 pack and experimental drafts are reported truthfully and never fail the check for being experimental.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterAll, describe, expect, it } from "vitest";
import { catalogReviewAuthority, checkPackAdmission, renderCatalogCheck, runCatalogCheck } from "../../../src/catalog/admission/index.js";
import type { GuardHarness } from "../../../src/catalog/admission/fixtureRunner.js";
import { reportDigest, writeAdmissionReport } from "../../../src/catalog/admission/report.js";
import type { AdmissionReport } from "../../../src/catalog/admission/types.js";
import { registerCatalogCommands } from "../../../src/catalog/catalogCli.js";
import { packDigest } from "../../../src/catalog/digest.js";
import { signReviewRecord, type ReviewRecord } from "../../../src/catalog/governance/reviewRecord.js";
import { defaultCatalogRoot, loadCatalog, type LoadedCatalog } from "../../../src/catalog/loader.js";
import type { ControlRecord, FixtureEnvelope, PackManifest, ProducerRecord } from "../../../src/catalog/types.js";
import { author, AUTHOR, authority, keyA, keyB, keyC, keyLegal, operatorHome, ROSTER, sign, type Key } from "../governance/reviewers.js";

const FIXTURE = join(__dirname, "..", "..", "fixtures", "catalog", "admission", "complete-pack");
const ROOT = join(FIXTURE, "catalog");
const PACK = "amc.l1.fixture";
const ID = "L1-FIX-01";
const HOME = operatorHome();
const temps: string[] = [];
afterAll(() => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); });

type Edit = (cat: LoadedCatalog) => LoadedCatalog;
const same: Edit = (cat) => cat;
const fresh = (): LoadedCatalog => loadCatalog({ root: ROOT });
const controlOf = (cat: LoadedCatalog): ControlRecord => cat.controls.get(ID)!;
const packOf = (cat: LoadedCatalog): PackManifest => cat.packs.get(PACK)!.manifest;

const editControl = (fn: (c: ControlRecord) => ControlRecord): Edit => (cat) =>
  ({ ...cat, controls: new Map([...cat.controls, [ID, fn(controlOf(cat))]]) });
const editPack = (over: Partial<PackManifest>): Edit => (cat) => {
  const entry = cat.packs.get(PACK)!;
  return { ...cat, packs: new Map([...cat.packs, [PACK, { ...entry, manifest: { ...entry.manifest, ...over } }]]) };
};
const editFixture = (ref: string, fn: (e: FixtureEnvelope) => FixtureEnvelope): Edit => (cat) => {
  const f = cat.fixtures.get(ref)!;
  return { ...cat, fixtures: new Map([...cat.fixtures, [ref, { ...f, envelope: fn(f.envelope!) }]]) };
};
const editProducer = (id: string, over: Partial<ProducerRecord>): Edit => (cat) =>
  ({ ...cat, producers: cat.producers.map((p) => (p.id === id ? { ...p, ...over } : p)) });
const both = (...edits: Edit[]): Edit => (cat) => edits.reduce((c, e) => e(c), cat);

/** A pack sign-off over `cat`'s current pack digest, signed with `key`. */
function signPack(cat: LoadedCatalog, key: Key, userId: string, role: ReviewRecord["role"], over: Record<string, unknown> = {}): ReviewRecord {
  const manifest = packOf(cat);
  return signReviewRecord({
    recordVersion: 1, id: `rr-${PACK}-${role}`, subject: { kind: "pack", id: PACK, version: manifest.version, digest: packDigest(cat, manifest) },
    role, reviewer: { name: `Fixture ${userId}`, credential: "fixture credential", affiliation: "fixture", conflictsDeclared: "none (fixture)",
      identity: { userId, kind: "human" } },
    decision: "approve", scope: ["statement", "citations", "tests", "evidence"], aiInputs: [], notes: "", decidedAt: "2026-10-15",
    nextReviewDue: "2027-01-13", ...over
  } as Omit<ReviewRecord, "signature">, key);
}

/** The control's domain lead and legal reviewer, and the pack's domain lead, legal reviewer and risk owner. */
function records(cat: LoadedCatalog): ReviewRecord[] {
  const control = controlOf(cat);
  return [sign(control, keyA, "fixture-reviewer-a"), sign(control, keyLegal, "fixture-legal", { role: "legal_reviewer" }),
    signPack(cat, keyA, "fixture-reviewer-a", "domain_lead"), signPack(cat, keyLegal, "fixture-legal", "legal_reviewer"),
    signPack(cat, keyB, "fixture-reviewer-b", "risk_owner")];
}

interface Case { edit?: Edit; records?: (cat: LoadedCatalog) => unknown[]; experts?: typeof ROSTER; harnesses?: Record<string, GuardHarness> }
async function check({ edit = same, records: recordsFor = records, experts, harnesses }: Case = {}): Promise<AdmissionReport> {
  return checkPackAdmission({ packId: PACK, load: () => edit(fresh()), repoRoot: FIXTURE, harnesses,
    authority: authority(HOME, recordsFor(edit(fresh())), experts ? { experts } : {}) });
}
const codes = (report: AdmissionReport, criterion: number): string[] => report.criteria[criterion - 1]!.findings.map((f) => f.code);
const statuses = (report: AdmissionReport) => report.criteria.map((c) => c.status);

const VALID = "L1-FIX-01/positive/evidence-valid.json";
const validSetup = () => fresh().fixtures.get(VALID)!.envelope!.setup;

describe("pack admission checker (P1-33)", () => {
  it("admits the complete pack as reviewed, with all ten criteria met and a reproducible digest", async () => {
    const report = await check();
    expect(report.criteria.map((c) => c.criterion)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(statuses(report)).toEqual(Array(10).fill("met"));
    expect(report).toMatchObject({ reportVersion: 1, checker: { name: "amc-catalog-check" }, decision: "admit", maxAdmissibleSupport: "reviewed",
      pack: { id: PACK, version: "1.0.0", declaredSupport: "reviewed" } });
    expect(report.fixtureRun).toEqual({ mandatoryControls: 1, fixtures: 8, falseMandatoryPasses: 0, failures: [] });
    expect(report.criteria[8]!.evidence.map((e) => e.ref).sort(), "the pack's three sign-offs and the control's two counted records")
      .toEqual([`rr-${ID}-fixture-legal`, `rr-${ID}-fixture-reviewer-a`, `rr-${PACK}-domain_lead`, `rr-${PACK}-legal_reviewer`, `rr-${PACK}-risk_owner`]);
    expect(report.digest).toBe(reportDigest(report));
    expect((await check()).digest, "two runs give the same report digest").toBe(report.digest);
  });

  const authorLegal: Case = {
    experts: new Map([...ROSTER, [AUTHOR, { domains: ["legal"], identities: [AUTHOR] }]]),
    records: (cat) => [sign(controlOf(cat), keyA, "fixture-reviewer-a"), sign(controlOf(cat), author, AUTHOR, { role: "legal_reviewer" }), ...records(cat).slice(2)]
  };
  let tick = 0;
  const broken: Array<[number, string, string, Case]> = [
    [1, "ADM1_LICENCE_MISSING", "a pack without a licence", { edit: editPack({ licence: "" }) }],
    [1, "ADM1_DIGEST_NOT_REPRODUCIBLE", "a digest that changes between loads (injected timestamp)",
      { edit: (cat) => editPack({ title: `Admission fixture pack (loaded at tick ${tick++})` })(cat) }],
    [2, "ADM2_CITATION_UNVERIFIED", "an unverified citation in a reviewed pack",
      { edit: editControl((c) => ({ ...c, citations: c.citations.map((x) => ({ ...x, retrieval: { state: "unverified" as const, reason: "not fetched" } })) })) }],
    [2, "ADM2_LEGAL_REVIEW_UNVERIFIED", "a legal reviewer who authored the control", authorLegal],
    [3, "ADM3_EXCLUSIONS_MISSING", "empty exclusions with a non-trivial predicate",
      { edit: editControl((c) => ({ ...c, applicability: { ...c.applicability, predicate: { fact: "jurisdictions", includesAny: ["US"] } } })) }],
    [4, "ADM4_MANUAL_DUTY_INCOMPLETE", "a manual binding without an owner",
      { edit: editControl((c) => ({ ...c, binding: { kind: "manual", points: [], mechanism: "a person checks", parameters: [],
        manualDuty: { duty: "check approvals", ownerRole: "", cadence: "monthly", evidenceOfPerformance: "signed checklist" } } })) }],
    [5, "ADM5_ORACLE_MISMATCH", "a runtime_enforced test with a human_assessor oracle",
      { edit: editControl((c) => ({ ...c, tests: c.tests.map((t) => ({ ...t, oracle: { ...t.oracle, kind: "human_assessor" as const } })) })) }],
    [6, "ADM6_NEGATIVE_CLASS_MISSING", "no cross_tenant fixture",
      { edit: editControl((c) => ({ ...c, tests: c.tests.map((t) => ({ ...t, fixtures: { ...t.fixtures,
        negative: t.fixtures.negative.filter((ref) => !ref.includes("cross-tenant")) } })) })) }],
    [6, "ADM6_FALSE_MANDATORY_PASS", "a negative fixture that passes",
      { edit: editFixture("L1-FIX-01/negative/evidence-stale.json", (e) => ({ ...e, setup: validSetup(), expected: { result: "pass", reasonCode: null } })) }],
    [7, "ADM7_PRODUCER_NOT_AVAILABLE", "a planned evidence producer",
      { edit: editProducer("amc.toolPipeline.receipt", { status: "planned", plannedBy: "P1-99" }) }],
    [8, "ADM8_UNKNOWN_FIXTURE_PASSED", "an unknown-authority fixture that passes",
      { edit: editFixture("L1-FIX-01/negative/unknown-authority.json", (e) => ({ ...e, setup: validSetup(), expected: { result: "pass", reasonCode: null } })) }],
    [8, "ADM8_UNKNOWN_FACTS_DECIDED", "a control the compiler excludes with every fact unknown",
      { edit: editControl((c) => ({ ...c, applicability: { ...c.applicability, exclusions: [{ when: { always: true }, reason: "never applies" }] } })) }],
    [9, "ADM9_AGENT_SIGNER", "a sign-off signed by an agent identity",
      { records: (cat) => [...records(cat).slice(0, 4), signPack(cat, keyB, "fixture-reviewer-b", "risk_owner",
        { reviewer: { name: "Fixture agent", credential: "none", affiliation: "fixture", conflictsDeclared: "none", identity: { userId: "fixture-reviewer-b", kind: "agent" } } })] }],
    [9, "ADM9_SIGNOFF_NOT_DISTINCT", "a risk owner who is also the domain lead",
      { records: (cat) => [...records(cat).slice(0, 4), signPack(cat, keyA, "fixture-reviewer-a", "risk_owner")] }],
    [9, "ADM9_SIGNOFF_MISSING", "a domain lead not credentialed for the pack's stations",
      { records: (cat) => [...records(cat).slice(0, 2), signPack(cat, keyB, "fixture-reviewer-b", "domain_lead"),
        signPack(cat, keyLegal, "fixture-legal", "legal_reviewer"), signPack(cat, keyC, "fixture-reviewer-c", "risk_owner")] }],
    [9, "ADM9_AI_DRAFT_UNAPPROVED", "an AI-drafted control without a human approval of the draft",
      { records: (cat) => [sign(controlOf(cat), keyA, "fixture-reviewer-a", { aiInputs: [] }),
        sign(controlOf(cat), keyLegal, "fixture-legal", { role: "legal_reviewer", aiInputs: [] }), ...records(cat).slice(2)] }],
    [10, "ADM10_COVERAGE_SECTION_MISSING", "a coverage document without an Unsupported behaviour section",
      { edit: (cat) => editPack({ stewardship: { ...packOf(cat).stewardship, coverageDoc: "docs/coverage-incomplete.md" } })(cat) }]
  ];
  for (const [criterion, code, label, broke] of broken) {
    it(`refuses ${label}: criterion ${criterion}, ${code}`, async () => {
      const report = await check(broke);
      expect(report.decision).toBe("refuse");
      expect(report.maxAdmissibleSupport).toBe("experimental");
      expect(report.criteria[criterion - 1]!.status).toBe("not_met");
      expect(codes(report, criterion)).toContain(code);
      expect(report.reasons.join("\n")).toContain(`criterion ${criterion} not met`);
    });
  }

  it("names the self-review behind the legal reviewer refusal, and counts a passing negative fixture", async () => {
    const legal = await check(authorLegal);
    expect(legal.criteria[1]!.findings.find((f) => f.code === "ADM2_LEGAL_REVIEW_UNVERIFIED")?.message).toContain("GOV_REVIEW_SELF_REVIEW");
    const falsePass = await check(broken.find(([, code]) => code === "ADM6_FALSE_MANDATORY_PASS")![3]);
    expect(falsePass.fixtureRun).toMatchObject({ falseMandatoryPasses: 1 });
  });

  it("refuses a qualified claim with all ten criteria met: no qualification rule is defined", async () => {
    const report = await check({ edit: editPack({ support: "qualified" }) });
    expect(statuses(report)).toEqual(Array(10).fill("met"));
    expect(report).toMatchObject({ decision: "refuse", maxAdmissibleSupport: "reviewed", pack: { declaredSupport: "qualified" } });
    expect(report.reasons).toContain("qualification rule not defined");
  });

  it("runs a guard fixture only through a registered harness, and otherwise leaves criterion 6 not evaluated, never met", async () => {
    const ref = "L1-FIX-01/negative/guard-denied.json";
    const guard: Edit = (cat) => ({
      ...editControl((c) => ({ ...c, tests: c.tests.map((t) => ({ ...t, fixtures: { ...t.fixtures, negative: [...t.fixtures.negative, ref] } })) }))(cat),
      fixtures: new Map([...cat.fixtures, [ref, { path: `fixtures/${ref}`, sha256: "0".repeat(64), envelope: { fixtureVersion: 1, controlId: ID,
        polarity: "negative", evidenceClass: "violation", setup: { harness: "fixture_guard" }, expected: { result: "deny", reasonCode: "fixture_denied" } } }]])
    });
    const unregistered = await check({ edit: guard });
    expect(unregistered.criteria[5]).toMatchObject({ status: "not_evaluated" });
    expect(codes(unregistered, 6)).toContain("ADM6_HARNESS_NOT_REGISTERED");
    expect(unregistered.decision).toBe("refuse");
    const denies = await check({ edit: guard, harnesses: { fixture_guard: async () => ({ result: "deny", reasonCode: "fixture_denied" }) } });
    expect(denies.criteria[5]!.status).toBe("met");
    expect(denies.decision).toBe("admit");
    const allows = await check({ edit: guard, harnesses: { fixture_guard: async () => ({ result: "allow", reasonCode: null }) } });
    expect(allows.fixtureRun).toMatchObject({ falseMandatoryPasses: 1 });
    expect(codes(allows, 6)).toContain("ADM6_FALSE_MANDATORY_PASS");
  });

  it("reports the shipped Layer 0 pack as experimental with criteria 2, 9 and 10 not met, and 6 not evaluated", async () => {
    const cat = loadCatalog();
    const report = await checkPackAdmission({ packId: "amc.l0.baseline", load: loadCatalog, authority: catalogReviewAuthority(cat, join(defaultCatalogRoot(), "..")) });
    expect(report.criteria).toHaveLength(10);
    expect(report).toMatchObject({ decision: "admit", maxAdmissibleSupport: "experimental", pack: { declaredSupport: "experimental" } });
    for (const n of [2, 9, 10]) expect(report.criteria[n - 1]!.status, `criterion ${n}`).toBe("not_met");
    expect(report.criteria[5]!.status).toBe("not_evaluated");
    expect(codes(report, 6)).toContain("ADM6_HARNESS_NOT_REGISTERED");
    expect(report.reasons.join(" ")).toMatch(/experimental.*unreviewed/);
  });
});

describe("support gating in the loader (P1-33)", () => {
  const copy = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "amc-admission-"));
    temps.push(dir);
    cpSync(FIXTURE, dir, { recursive: true });
    return dir;
  };
  const supportOf = (root: string, enforceAdmission: boolean) => {
    const cat = loadCatalog({ root, enforceAdmission });
    return { support: cat.packs.get(PACK)!.manifest.support, downgraded: cat.issues.filter((i) => i.code === "ADM_SUPPORT_DOWNGRADED") };
  };

  it("downgrades a pack declaring reviewed with no report to experimental, in memory only", () => {
    const yaml = readFileSync(join(ROOT, "layers/l1-fixture/pack.yaml"));
    expect(supportOf(ROOT, false)).toEqual({ support: "reviewed", downgraded: [] });
    const gated = supportOf(ROOT, true);
    expect(gated.support).toBe("experimental");
    expect(gated.downgraded).toEqual([expect.objectContaining({ severity: "warning", file: "layers/l1-fixture/pack.yaml" })]);
    expect(readFileSync(join(ROOT, "layers/l1-fixture/pack.yaml")).equals(yaml), "the YAML is never edited").toBe(true);
  });

  it("keeps reviewed only with a current, intact report that admits it", async () => {
    const dir = copy();
    const root = join(dir, "catalog");
    writeAdmissionReport(root, await check());
    expect(supportOf(root, true)).toEqual({ support: "reviewed", downgraded: [] });
    const file = join(root, "admission", `${PACK}-1.0.0.json`);
    const report = JSON.parse(readFileSync(file, "utf8")) as AdmissionReport;
    writeFileSync(file, JSON.stringify({ ...report, reasons: ["edited by hand"] }));
    expect(supportOf(root, true).support, "a report whose digest does not verify").toBe("experimental");
    const refusing = await checkPackAdmission({ packId: PACK, load: () => loadCatalog({ root }), repoRoot: dir, authority: authority(HOME, []) });
    expect(refusing.decision).toBe("refuse");
    writeAdmissionReport(root, refusing);
    expect(supportOf(root, true).support, "a current report that refuses").toBe("experimental");
    writeAdmissionReport(root, report);
    const pack = join(root, "layers/l1-fixture/pack.yaml");
    writeFileSync(pack, readFileSync(pack, "utf8").replace("title: Admission fixture pack", "title: Admission fixture pack, edited"));
    expect(supportOf(root, true).support, "a stale report").toBe("experimental");
  });
});

describe("amc catalog check and check:catalog-admission (P1-33)", () => {
  const draft = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "amc-admission-draft-"));
    temps.push(dir);
    cpSync(FIXTURE, dir, { recursive: true });
    for (const rel of ["catalog/layers/l1-fixture/pack.yaml", "catalog/layers/l1-fixture/controls/L1-FIX-01.yaml"]) {
      writeFileSync(join(dir, rel), readFileSync(join(dir, rel), "utf8").replace("support: reviewed", "support: experimental"));
    }
    return join(dir, "catalog");
  };

  it("reports an experimental, unreviewed draft without failing", async () => {
    const result = await runCatalogCheck({ catalogRoot: draft() });
    expect(result.exitCode).toBe(0);
    expect(result.reports[0]).toMatchObject({ decision: "admit", maxAdmissibleSupport: "experimental", pack: { declaredSupport: "experimental" } });
    expect(result.reports[0]!.criteria[8]!.status).toBe("not_met");
    const text = renderCatalogCheck(result).join("\n");
    expect(text).toContain("experimental, unreviewed");
    expect(text).not.toMatch(/certif|compliant/i);
  });

  it("fails a pack that claims reviewed support it does not meet", async () => {
    const result = await runCatalogCheck({ catalogRoot: ROOT });
    expect(result.exitCode).toBe(1);
    expect(result.reports[0]).toMatchObject({ decision: "refuse", pack: { declaredSupport: "reviewed" } });
    expect(renderCatalogCheck(result).join("\n")).toContain("REFUSED");
  });

  it("fails a malformed committed admission report, and the loader admits the admission folder", async () => {
    const root = draft();
    mkdirSync(join(root, "admission"));
    writeFileSync(join(root, "admission", `${PACK}-1.0.0.json`), JSON.stringify({ reportVersion: 1 }));
    expect(loadCatalog({ root }).issues.filter((i) => i.code === "CAT_STRAY_FILE")).toEqual([]);
    const result = await runCatalogCheck({ catalogRoot: root });
    expect(result.exitCode).toBe(1);
    expect(result.problems).toEqual([expect.objectContaining({ code: "ADM_REPORT_MALFORMED", file: `admission/${PACK}-1.0.0.json` })]);
  });

  it("registers amc catalog check with --pack, --catalog, --json and --write", () => {
    const program = new Command();
    registerCatalogCommands(program);
    const check = program.commands.find((c) => c.name() === "catalog")?.commands.find((c) => c.name() === "check");
    expect(check?.options.map((o) => o.long)).toEqual(["--pack", "--catalog", "--json", "--write"]);
  });
});
