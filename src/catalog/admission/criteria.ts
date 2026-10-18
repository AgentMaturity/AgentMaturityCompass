/**
 * The ten pack admission criteria v1 (P1-33; strategy "Pack admission criteria"; docs/catalog/ADMISSION.md), each over
 * the pack's mandatory controls unless stated. Mechanical criteria read the records and run fixtures; record criteria
 * (2's legal review, 9) read only P1-34's verified results (effectiveSupport, packSignoffs, the shown* helpers), never a
 * declared review field. A met record criterion shows that signed records exist, not that the reviewer was right.
 */
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import semver from "semver";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { amcVersion } from "../../version.js";
import { validateCitation } from "../citations.js";
import { decideApplicability } from "../compiler/applicability.js";
import { parseDeploymentProfile } from "../compiler/compile.js";
import { controlDigest, packDigest } from "../digest.js";
import { evaluateControl } from "../evidence/evaluate.js";
import { shownLegalReview, shownReviewBlocks, type PackSignoffs, type SupportResult } from "../governance/support.js";
import { buildCatalogLock } from "../lockfile.js";
import type { LoadedCatalog } from "../loader.js";
import { parsePredicate, validatePredicate } from "../predicate.js";
import { FACT_NAMES, SCOPE_FIELDS } from "../schema.js";
import type { ControlRecord, FixtureEnvelope, OracleKind, PackManifest, Predicate, TestType } from "../types.js";
import { isFalsePass, type FixtureOutcome } from "./fixtureRunner.js";
import type { AdmissionFinding, CriterionResult, FixtureRun } from "./types.js";

/** Everything the criteria read; built once per check by checkPackAdmission. */
export interface PackContext {
  /** The first load; every criterion but 1's reproducibility reads it. */
  cat: LoadedCatalog;
  /** A second, independent load (criterion 1). */
  second: LoadedCatalog;
  manifest: PackManifest;
  /** The pack.yaml path, catalog-relative. */
  file: string;
  /** The pack's mandatory controls, in manifest order. */
  controls: readonly ControlRecord[];
  /** effectiveSupport's result for each mandatory control. */
  support: ReadonlyMap<string, SupportResult>;
  signoffs: PackSignoffs;
  /** Raw review records, read only to name agent signers (a refusal, never a promotion). */
  records: readonly unknown[];
  outcomes: readonly FixtureOutcome[];
  run: FixtureRun;
  /** Where the pack's coverageDoc resolves. */
  repoRoot: string;
}

type Evidence = CriterionResult["evidence"][number];
type CriterionNo = CriterionResult["criterion"];

/** Codes that leave a criterion not evaluated (the check could not run), never met. */
export const NOT_EVALUATED_CODES: ReadonlySet<string> = new Set(["ADM_TRUST_UNAVAILABLE", "ADM6_HARNESS_NOT_REGISTERED", "ADM8_HARNESS_NOT_REGISTERED"]);

const hex = (digest: string): string => digest.replace(/^sha256:/, "");
const blank = (value: string | null | undefined): boolean => value == null || !/\S/.test(value);
const isTrust = (reason: string): boolean => reason.startsWith("GOV_REVIEW_TRUST_INVALID");
/** The lock row a criterion examined: the control's P1-09 digest. */
const lockRow = (control: ControlRecord): Evidence => ({ kind: "lockfile", ref: `controls[${control.id}]`, sha256: hex(controlDigest(control)) });

function finish(criterion: CriterionNo, title: string, kind: CriterionResult["kind"], checked: number, findings: AdmissionFinding[],
  evidence: Evidence[]): CriterionResult {
  const notMet = findings.some((f) => f.severity === "error" && !NOT_EVALUATED_CODES.has(f.code));
  const pending = findings.some((f) => NOT_EVALUATED_CODES.has(f.code));
  return { criterion, title, kind, status: notMet ? "not_met" : pending ? "not_evaluated" : "met", checked, findings, evidence };
}

/** A finding builder bound to one control's file (or the pack file when `control` is null). */
function at(ctx: PackContext, findings: AdmissionFinding[]) {
  return (code: string, control: ControlRecord | null, pointer: string, message: string, severity: AdmissionFinding["severity"] = "error") => {
    const file = control ? ctx.cat.controlFiles.get(control.id) ?? null : ctx.file;
    findings.push({ code, severity, controlId: control?.id ?? null, path: file === null ? null : `${file}${pointer ? `#/${pointer}` : ""}`, message });
  };
}

/** Why a control's declared support did not stand, from effectiveSupport's result. */
const notStanding = (res: SupportResult): string => res.reasons.length === 0 ? `its effective support is ${res.support}, so no review is verified`
  : `support did not stand (${res.reasons.join(", ")}${res.rejected.length ? `; records not counted: ${res.rejected.map((r) => `#${r.index} ${r.reason}`).join(", ")}` : ""})`;

/** 1. Manifest metadata and a reproducible digest. */
function manifestAndDigest(ctx: PackContext): CriterionResult {
  const findings: AdmissionFinding[] = [];
  const add = at(ctx, findings);
  const m = ctx.manifest;
  if (!/^[a-z][a-z0-9]*(\.[a-z0-9][a-z0-9-]*)+$/.test(m.id)) add("ADM1_ID_INVALID", null, "id", `"${m.id}" is not a dotted lowercase pack id`);
  if (semver.valid(m.version) === null) add("ADM1_VERSION_INVALID", null, "version", `"${m.version}" is not a semver version`);
  if (semver.validRange(m.compilerCompat) === null || !semver.satisfies(amcVersion, m.compilerCompat)) {
    add("ADM1_COMPILER_INCOMPATIBLE", null, "compilerCompat", `compilerCompat "${m.compilerCompat}" is not satisfied by the running compiler ${amcVersion}`);
  }
  if (blank(m.publisher)) add("ADM1_PUBLISHER_MISSING", null, "publisher", "no publisher");
  if (!m.maintainers.some((x) => !blank(x.name))) add("ADM1_MAINTAINER_MISSING", null, "maintainers", "no maintainer");
  if (!/^[A-Za-z0-9.+-]+$/.test(m.licence)) add("ADM1_LICENCE_MISSING", null, "licence", "no SPDX licence id");
  const first = packDigest(ctx.cat, m);
  const again = ctx.second.packs.get(m.id)?.manifest;
  const second = again ? packDigest(ctx.second, again) : "(absent)";
  let locked = "(absent)";
  try {
    locked = buildCatalogLock(ctx.second).packs.find((p) => p.id === m.id)?.digest ?? locked;
  } catch (error) {
    add("ADM1_LOCK_UNAVAILABLE", null, "", `the catalog lock cannot be built: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (first !== second || (locked !== "(absent)" && locked !== first)) {
    add("ADM1_DIGEST_NOT_REPRODUCIBLE", null, "", `two loads and the lock give different pack digests (${first}, ${second}, lock ${locked})`);
  }
  return finish(1, "Manifest metadata and a reproducible digest", "mechanical", 7, findings, [{ kind: "lockfile", ref: `packs[${m.id}]`, sha256: hex(first) }]);
}

/** 2. Citations complete, verified and resolvable; each declared legal review backed by a verified legal reviewer. */
function citations(ctx: PackContext): CriterionResult {
  const findings: AdmissionFinding[] = [];
  const add = at(ctx, findings);
  const today = new Date().toISOString().slice(0, 10);
  const evidence: Evidence[] = [];
  let checked = 0;
  for (const control of ctx.controls) {
    const res = ctx.support.get(control.id)!;
    const file = ctx.cat.controlFiles.get(control.id) ?? "";
    if (control.citations.length > 0) evidence.push(lockRow(control), ...(res.promotion?.recordDigests ?? []).map((d, i) =>
      ({ kind: "review_record" as const, ref: res.promotion!.recordIds[i]!, sha256: hex(d) })));
    control.citations.forEach((c, i) => {
      checked += 1;
      const pointer = `citations/${i}`;
      if (blank(c.clause) || blank(c.edition)) add("ADM2_CITATION_INCOMPLETE", control, pointer, `${c.key}: needs a clause and an edition`);
      if ((c.effectiveDate === null || c.complianceDueDate === null) && blank(c.dateNote)) add("ADM2_CITATION_INCOMPLETE", control, pointer, `${c.key}: a null date needs a dateNote`);
      for (const issue of validateCitation(c, { file, controlId: control.id, support: "reviewed", path: `citations.${i}`, asOf: today, publisherHosts: ctx.cat.publisherHosts })) {
        if (issue.severity === "error") add("ADM2_CITATION_INVALID", control, pointer, `${issue.code}: ${issue.message}`);
      }
      if (c.retrieval.state !== "verified") add("ADM2_CITATION_UNVERIFIED", control, pointer, `${c.key}: retrieval is not verified with a content hash`);
      const shown = shownLegalReview(c, res.support);
      if (shown === "none") add("ADM2_LEGAL_REVIEW_MISSING", control, pointer, `${c.key}: no legal review is declared`);
      else if (shown === "unverified") {
        if (res.reasons.some(isTrust)) add("ADM_TRUST_UNAVAILABLE", control, pointer, `${c.key}: review records cannot be verified: ${res.reasons.filter(isTrust).join("; ")}`);
        else add("ADM2_LEGAL_REVIEW_UNVERIFIED", control, pointer, `${c.key}: no verified legal reviewer independent of the author: ${notStanding(res)}`);
      }
    });
  }
  return finish(2, "Citations verified and legally reviewed", "mixed", checked, findings, evidence);
}

const isAlways = (p: Predicate): boolean => canonicalize(p) === canonicalize({ always: true });

/** 3. Predicates parse; reasons given; empty exclusions only with `{ always: true }`. */
function applicability(ctx: PackContext): CriterionResult {
  const findings: AdmissionFinding[] = [];
  const add = at(ctx, findings);
  const vocabulary = ctx.cat.vocabulary;
  for (const control of ctx.controls) {
    const a = control.applicability;
    const predicates: Array<[string, Predicate]> = [["applicability/predicate", a.predicate],
      ...a.exclusions.map((x, i): [string, Predicate] => [`applicability/exclusions/${i}/when`, x.when]),
      ...control.citations.flatMap((c, i): Array<[string, Predicate]> => (c.appliesWhen ? [[`citations/${i}/appliesWhen`, c.appliesWhen]] : []))];
    for (const [pointer, p] of predicates) {
      try {
        parsePredicate(p);
        const issues = vocabulary ? validatePredicate(p, vocabulary) : [{ message: "no vocabulary loaded" }];
        for (const issue of issues) add("ADM3_PREDICATE_INVALID", control, pointer, issue.message);
      } catch (error) {
        add("ADM3_PREDICATE_INVALID", control, pointer, error instanceof Error ? error.message : String(error));
      }
    }
    if (!a.reasons.some((r) => !blank(r))) add("ADM3_REASONS_MISSING", control, "applicability/reasons", "no applicability reason");
    if (a.exclusions.length === 0 && !isAlways(a.predicate)) {
      add("ADM3_EXCLUSIONS_MISSING", control, "applicability/exclusions", "empty exclusions are allowed only with predicate { always: true }");
    }
  }
  return finish(3, "Applicability predicates, reasons and exclusions", "mechanical", ctx.controls.length,
    findings, ctx.controls.map((c) => lockRow(c)));
}

/** 4. An enforcement point with points, or a manual duty with duty, owner role, cadence and evidence of performance. */
function binding(ctx: PackContext): CriterionResult {
  const findings: AdmissionFinding[] = [];
  const add = at(ctx, findings);
  for (const control of ctx.controls) {
    const b = control.binding;
    if (b.kind === "enforcement_point" && b.points.length === 0) add("ADM4_BINDING_POINTS_MISSING", control, "binding/points", "an enforcement point binding names no point");
    const duty = b.manualDuty;
    if (b.kind === "manual" && (!duty || [duty.duty, duty.ownerRole, duty.cadence, duty.evidenceOfPerformance].some(blank))) {
      add("ADM4_MANUAL_DUTY_INCOMPLETE", control, "binding/manualDuty", "a manual binding needs a duty, an owner role, a cadence and evidence of performance");
    }
  }
  return finish(4, "Binding to an enforcement point or an owned manual duty", "mechanical", ctx.controls.length,
    findings, ctx.controls.map((c) => lockRow(c)));
}

/** Which oracle kinds observe the effect of each test type. */
const ORACLES: Readonly<Record<TestType, readonly OracleKind[]>> = {
  runtime_enforced: ["enforcement_receipt", "ledger_state"],
  executed_adversarial: ["external_observer", "system_of_record"],
  drill: ["ledger_state", "system_of_record"],
  configuration_check: ["signed_config"],
  document_review: ["human_assessor"]
};

/** 5. Tests whose oracle observes the effect, with type and oracle agreeing. */
function tests(ctx: PackContext): CriterionResult {
  const findings: AdmissionFinding[] = [];
  const add = at(ctx, findings);
  let checked = 0;
  for (const control of ctx.controls) {
    if (control.tests.length === 0) add("ADM5_TEST_MISSING", control, "tests", "no test");
    control.tests.forEach((t, i) => {
      checked += 1;
      if (blank(t.oracle.observes)) add("ADM5_ORACLE_UNOBSERVED", control, `tests/${i}/oracle/observes`, `${t.id}: the oracle names nothing it observes`);
      if (!ORACLES[t.type].includes(t.oracle.kind)) {
        add("ADM5_ORACLE_MISMATCH", control, `tests/${i}/oracle/kind`, `${t.id}: a ${t.type} test needs a ${ORACLES[t.type].join(" or ")} oracle, not ${t.oracle.kind}`);
      }
    });
  }
  return finish(5, "Tests with an oracle that observes the effect", "mechanical", checked, findings, ctx.controls.map((c) => lockRow(c)));
}

const REQUIRED_NEGATIVE: readonly FixtureEnvelope["evidenceClass"][] = ["stale", "replayed", "contradictory", "cross_tenant", "empty"];
const runEvidence = (ctx: PackContext): Evidence => ({ kind: "fixture_run", ref: "fixtureRun", sha256: sha256Hex(canonicalize(ctx.run)) });

/** Guard fixtures nothing ran, one finding per pack: the criterion is then not evaluated, never met. */
function notRun(ctx: PackContext, outcomes: readonly FixtureOutcome[], code: string, add: ReturnType<typeof at>): void {
  const harnesses = [...new Set(outcomes.filter((o) => o.actual === null).map((o) => o.harness))].sort();
  const count = outcomes.filter((o) => o.actual === null).length;
  if (count > 0) {
    add(code, null, "", `${count} fixture(s) name guard harnesses this process has not registered (${harnesses.join(", ")}); they run in the test suite, not here`, "warning");
  }
}

/** 6. Negative fixtures of the five classes exist; every fixture runs and matches; no false mandatory pass. */
function fixtures(ctx: PackContext): CriterionResult {
  const findings: AdmissionFinding[] = [];
  const add = at(ctx, findings);
  for (const control of ctx.controls) {
    const own = ctx.outcomes.filter((o) => o.controlId === control.id && o.envelope.polarity === "negative").map((o) => o.envelope.evidenceClass);
    const missing = REQUIRED_NEGATIVE.filter((c) => !own.includes(c));
    if (missing.length > 0) add("ADM6_NEGATIVE_CLASS_MISSING", control, "tests", `no negative fixture of class ${missing.join(", ")}`);
  }
  for (const f of ctx.run.failures) {
    add("ADM6_FIXTURE_MISMATCH", ctx.cat.controls.get(f.controlId) ?? null, "", `${f.fixture}: expected ${f.expected}, got ${f.actual}`);
  }
  for (const o of ctx.outcomes.filter(isFalsePass)) {
    add("ADM6_FALSE_MANDATORY_PASS", ctx.cat.controls.get(o.controlId) ?? null, "", `${o.fixture}: a negative fixture gave ${o.actual}`);
  }
  notRun(ctx, ctx.outcomes, "ADM6_HARNESS_NOT_REGISTERED", add);
  return finish(6, "Negative fixtures run with no false mandatory pass", "mechanical", ctx.outcomes.length, findings, [runEvidence(ctx)]);
}

/** 7. Evidence contracts name an available producer, scoped binding fields, freshness and sampling; invalidation set. */
function evidenceContracts(ctx: PackContext): CriterionResult {
  const findings: AdmissionFinding[] = [];
  const add = at(ctx, findings);
  let checked = 0;
  for (const control of ctx.controls) {
    if (control.evidence.length === 0) add("ADM7_EVIDENCE_MISSING", control, "evidence", "no evidence contract");
    if (control.invalidatedBy.length === 0) add("ADM7_INVALIDATION_MISSING", control, "invalidatedBy", "no invalidation trigger");
    control.evidence.forEach((e, i) => {
      checked += 1;
      const producer = ctx.cat.producers.find((p) => p.id === e.producer);
      if (!producer) add("ADM7_PRODUCER_UNKNOWN", control, `evidence/${i}/producer`, `${e.id}: producer ${e.producer} is not in producers.yaml`);
      else if (producer.status !== "available") add("ADM7_PRODUCER_NOT_AVAILABLE", control, `evidence/${i}/producer`, `${e.id}: producer ${e.producer} is ${producer.status}${producer.plannedBy ? ` (${producer.plannedBy})` : ""}`);
      if (!e.bindingFields.includes("controlId") || !e.bindingFields.some((f) => (SCOPE_FIELDS as readonly string[]).includes(f))) {
        add("ADM7_BINDING_FIELDS", control, `evidence/${i}/bindingFields`, `${e.id}: binding fields need controlId and one of ${SCOPE_FIELDS.join(", ")}`);
      }
      if (!(e.freshness.maxAgeDays >= 1) || !e.sampling.method) add("ADM7_FRESHNESS_SAMPLING", control, `evidence/${i}`, `${e.id}: needs freshness and sampling`);
    });
  }
  return finish(7, "Evidence contracts with an available producer", "mechanical", checked, findings, ctx.controls.map((c) => lockRow(c)));
}

const UNKNOWN_FACT = { value: null, provenance: "asserted", source: "admission check: every fact unknown", reviewedBy: null };
const UNKNOWN_PROFILE = parseDeploymentProfile({ profileVersion: 1, profileId: "admission-unknown-facts",
  deployment: { tenantId: "admission", workspaceId: "admission", deploymentId: "admission", agentIds: ["admission"] },
  ...Object.fromEntries(FACT_NAMES.map((name) => [name, UNKNOWN_FACT])), euRoleRecord: null, art63Record: null, operatingProfile: null, exceptions: [] });
/** The unknown-fact fixture class each enforcement point needs: authority for approvals, a hold for deletion, residency for egress. */
const UNKNOWN_CLASS: Readonly<Record<string, FixtureEnvelope["evidenceClass"]>> = { approvals: "unknown_authority", deletion_executor: "unknown_hold", egress: "unknown_residency" };

/** 8. Unknown facts fail closed: the compiler leaves them unresolved, the evaluator not evaluated, unknown-fact fixtures deny. */
function unknownFacts(ctx: PackContext): CriterionResult {
  const findings: AdmissionFinding[] = [];
  const add = at(ctx, findings);
  let decided: ReturnType<typeof decideApplicability>["requirements"] = [];
  try {
    decided = decideApplicability(UNKNOWN_PROFILE, ctx.cat, Date.now()).requirements;
  } catch (error) {
    add("ADM8_COMPILER_ERROR", null, "", `the compiler failed on the unknown-facts profile: ${error instanceof Error ? error.message : String(error)}`);
  }
  const unknownOutcomes = ctx.outcomes.filter((o) => o.envelope.evidenceClass.startsWith("unknown_"));
  for (const control of ctx.controls) {
    const row = decided.find((r) => r.controlId === control.id);
    if (decided.length > 0 && (!row || row.applicability === "not_applicable")) {
      add("ADM8_UNKNOWN_FACTS_DECIDED", control, "applicability", `with every profile fact unknown the compiler ${row ? `decided not applicable (${row.exclusion?.reason ?? "no reason"})` : "dropped the control"}; it must stay unresolved or apply`);
    }
    const result = evaluateControl(control, [], { subject: { tenantId: "admission", workspaceId: "admission", deploymentId: "admission", agentId: "admission", subjectId: null },
      window: { start: "1970-01-01T00:00:00.000Z", end: "1970-01-01T00:00:00.000Z" }, invalidations: [], reviews: [], producers: ctx.cat.producers,
      plan: { digest: "sha256:admission", policyDigest: "sha256:admission", applicability: { state: "unresolved", reason: "every profile fact unknown" }, mode: "enforce" } });
    if (result.dimensions.result !== "not_evaluated") add("ADM8_EVALUATOR_NOT_FAIL_CLOSED", control, "", `with applicability unresolved the evaluator gave ${result.dimensions.result}`);
    const own = unknownOutcomes.filter((o) => o.controlId === control.id);
    const needed = [...new Set(control.binding.points.flatMap((p) => UNKNOWN_CLASS[p] ?? []))];
    for (const cls of needed.filter((c) => !own.some((o) => o.envelope.evidenceClass === c))) {
      add("ADM8_UNKNOWN_FIXTURE_MISSING", control, "tests", `bound to ${control.binding.points.join(", ")} but has no ${cls} fixture`);
    }
    for (const o of own.filter((x) => x.actual !== null && x.actual !== "deny" && x.actual !== "not_evaluated")) {
      add(o.actual === "pass" || o.actual === "allow" ? "ADM8_UNKNOWN_FIXTURE_PASSED" : "ADM8_UNKNOWN_FIXTURE_UNEXPECTED", control, "",
        `${o.fixture} (${o.envelope.evidenceClass}) gave ${o.actual}; an unknown fact must deny or stay not evaluated`);
    }
  }
  notRun(ctx, unknownOutcomes, "ADM8_HARNESS_NOT_REGISTERED", add);
  return finish(8, "Unknown facts fail closed", "mechanical", ctx.controls.length + unknownOutcomes.length, findings, [runEvidence(ctx)]);
}

const SIGNOFF_CODES: Readonly<Record<string, [string, string]>> = {
  GOV_SIGNOFF_DOMAIN_LEAD: ["ADM9_SIGNOFF_MISSING", "no verified domain lead sign-off credentialed for the pack's stations"],
  GOV_SIGNOFF_LEGAL_REVIEWER: ["ADM9_SIGNOFF_MISSING", "no verified legal reviewer sign-off"],
  GOV_SIGNOFF_RISK_OWNER: ["ADM9_SIGNOFF_MISSING", "no verified risk owner sign-off"],
  GOV_SIGNOFF_THREE_HUMANS: ["ADM9_SIGNOFF_NOT_DISTINCT", "the domain lead, legal reviewer and risk owner are not three distinct people"],
  GOV_QUORUM_OBJECTION: ["ADM9_OBJECTION", "a verified reviewer rejected or asked for changes"],
  GOV_REVERIFY_OPEN: ["ADM9_REVERIFY_OPEN", "a control cites an instrument an open re-verify item affects"]
};

/** The raw records naming this pack whose reviewer declares an agent identity; AI agents never approve (truth rule 8). */
function agentSigners(ctx: PackContext): number[] {
  return ctx.records.flatMap((raw, index) => {
    const r = raw as { subject?: { kind?: unknown; id?: unknown }; reviewer?: { identity?: { kind?: unknown } } } | null;
    return r?.subject?.kind === "pack" && r.subject.id === ctx.manifest.id && r.reviewer?.identity?.kind !== "human" ? [index] : [];
  });
}

/** 9. Three distinct human sign-offs bound to the pack digest; every mandatory control's review stands, AI drafts approved. */
function signoffs(ctx: PackContext): CriterionResult {
  const findings: AdmissionFinding[] = [];
  const add = at(ctx, findings);
  for (const index of agentSigners(ctx)) add("ADM9_AGENT_SIGNER", null, "", `review record #${index} names a signer that is not a human identity; agents never approve`);
  for (const reason of ctx.signoffs.reasons) {
    const [code, message] = isTrust(reason) ? ["ADM_TRUST_UNAVAILABLE", `pack sign-offs cannot be verified: ${reason}`] : SIGNOFF_CODES[reason] ?? ["ADM9_SIGNOFF_MISSING", reason];
    add(code, null, "", message);
  }
  for (const r of ctx.signoffs.rejected) add("ADM9_SIGNOFF_REJECTED", null, "", `review record #${r.index} for the pack did not count: ${r.reason}`, "warning");
  const evidence: Evidence[] = ctx.signoffs.signers.map((s) => ({ kind: "review_record", ref: s.recordId, sha256: hex(s.recordDigest) }));
  for (const control of ctx.controls) {
    const res = ctx.support.get(control.id)!;
    // Read through shownReviewBlocks: the declared approver is shown only where support stood.
    const { draftedBy, approvedBy } = shownReviewBlocks(control, res.support).provenance;
    if (res.promotion === null) {
      if (res.reasons.includes("GOV_QUORUM_AI_DRAFT")) add("ADM9_AI_DRAFT_UNAPPROVED", control, "provenance", `AI-drafted with no human approval confirming the draft: ${notStanding(res)}`);
      else if (res.reasons.some(isTrust)) add("ADM_TRUST_UNAVAILABLE", control, "", `review records cannot be verified: ${res.reasons.filter(isTrust).join("; ")}`);
      else add("ADM9_CONTROL_UNREVIEWED", control, "support", notStanding(res));
    } else if (draftedBy === "ai" && (approvedBy === null || !res.promotion.reviewers.includes(approvedBy))) {
      add("ADM9_AI_DRAFT_UNAPPROVED", control, "provenance/approvedBy", `approvedBy ${approvedBy ?? "(none)"} is not a reviewer whose record counted (${res.promotion.reviewers.join(", ")})`);
    }
    if (res.promotion) evidence.push(...res.promotion.recordDigests.map((d, i) => ({ kind: "review_record" as const, ref: res.promotion!.recordIds[i]!, sha256: hex(d) })));
  }
  return finish(9, "Signed human sign-offs; AI drafts approved by a human", "record", ctx.controls.length + 1, findings, evidence);
}

const UNSUPPORTED_HEADING = /^#{1,6}[ \t]+Unsupported behaviour[ \t]*#*[ \t]*$/im;

/** 10. Stewardship: partner, update plan (owner and funding), triage target and a coverage document. Presence, not truth. */
function stewardship(ctx: PackContext): CriterionResult {
  const findings: AdmissionFinding[] = [];
  const add = at(ctx, findings);
  const s = ctx.manifest.stewardship;
  const evidence: Evidence[] = [];
  if (blank(s.partner)) add("ADM10_PARTNER_MISSING", null, "stewardship/partner", "no stewardship partner");
  else if (s.partner!.trim().toLowerCase() === "confidential") {
    add("ADM10_PARTNER_ATTESTATION_MISSING", null, "stewardship/partner", "a confidential partner needs a signed partner attestation reference, which the pack format cannot carry yet");
  }
  if (blank(s.updatePlan) || !/\bowner\b/i.test(s.updatePlan!) || !/\bfunding\b/i.test(s.updatePlan!)) {
    add("ADM10_UPDATE_PLAN_INCOMPLETE", null, "stewardship/updatePlan", "the update plan must name an owner and funding (\"owner: ...; funding: ...\")");
  }
  if (s.triageTargetDays === null) add("ADM10_TRIAGE_TARGET_MISSING", null, "stewardship/triageTargetDays", "no triage target");
  if (blank(s.coverageDoc)) add("ADM10_COVERAGE_DOC_MISSING", null, "stewardship/coverageDoc", "no coverage document");
  else {
    const path = resolve(ctx.repoRoot, s.coverageDoc!);
    const inside = !isAbsolute(s.coverageDoc!) && !relative(ctx.repoRoot, path).startsWith("..");
    const stat = inside ? lstatSync(path, { throwIfNoEntry: false }) : undefined;
    if (!stat?.isFile()) add("ADM10_COVERAGE_DOC_MISSING", null, "stewardship/coverageDoc", `${s.coverageDoc} is not a regular file inside ${ctx.repoRoot}`);
    else {
      const bytes = readFileSync(path);
      evidence.push({ kind: "file", ref: s.coverageDoc!, sha256: sha256Hex(bytes) });
      if (!UNSUPPORTED_HEADING.test(bytes.toString("utf8"))) add("ADM10_COVERAGE_SECTION_MISSING", null, "stewardship/coverageDoc", `${s.coverageDoc} has no section titled "Unsupported behaviour"`);
    }
  }
  return finish(10, "Stewardship and coverage document", "record", 4, findings, evidence);
}

/** The ten criteria in order. */
export const CRITERIA: ReadonlyArray<(ctx: PackContext) => CriterionResult> = [
  manifestAndDigest, citations, applicability, binding, tests, fixtures, evidenceContracts, unknownFacts, signoffs, stewardship
];
