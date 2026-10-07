/**
 * Which controls a profile pulls in, and the decision for each (P1-10). Candidates: every Layer 0 control; Layer 1 to 3
 * controls whose stations meet the profile's stations; packs with jurisdictions only where those meet the profile's;
 * Layer 3 controls only where their own predicate is not false. Candidacy is itself evaluated three-valued, so an
 * unknown station or jurisdiction pulls a control in as unresolved instead of dropping it. Each control appears once,
 * with every source in `pulledInBy`. Crosswalks are never read here: a control enters only through its own predicate.
 */
import { controlDigest } from "../digest.js";
import type { LoadedCatalog } from "../loader.js";
import type { ControlRecord, FactName, PackManifest, Predicate } from "../types.js";
import { evaluatePredicate } from "./evaluatePredicate.js";
import { CompileError, type DeploymentProfile, type RequirementDecision, type UnsupportedControl } from "./types.js";

/** Unknown controls and parameters, and any exclusion of a mandatory Layer 0 control, are refused (expired or not). */
export function checkExceptions(profile: DeploymentProfile, cat: LoadedCatalog): void {
  for (const e of profile.exceptions) {
    const control = cat.controls.get(e.controlId);
    if (!control) throw new CompileError("EXCEPTION_UNKNOWN_CONTROL", `exception ${e.id} names control ${e.controlId}, which the catalog does not hold`);
    if (e.parameter === null && control.layer === 0 && control.mandatory) {
      throw new CompileError("EXCEPTION_ON_LAYER0", `exception ${e.id} would exclude ${control.id}, a mandatory Layer 0 control; no exception may`);
    }
    if (e.parameter !== null && !control.binding.parameters.some((p) => p.name === e.parameter)) {
      throw new CompileError("EXCEPTION_UNKNOWN_PARAMETER", `exception ${e.id} names parameter ${e.parameter}, which ${control.id} does not bind`);
    }
  }
}

function scopeOf(control: ControlRecord, pack: PackManifest): Predicate[] {
  const scope: Predicate[] = [];
  if (control.layer > 0) scope.push({ fact: "stations", includesAny: control.stations });
  if (pack.jurisdictions.length > 0) scope.push({ fact: "jurisdictions", includesAny: pack.jurisdictions });
  return scope;
}

function pulledInBy(control: ControlRecord, pack: PackManifest, profile: DeploymentProfile): string[] {
  const out = control.layer === 0 ? ["layer0"] : [];
  const stations = profile.stations.value;
  if (stations !== null) out.push(...stations.filter((s) => control.stations.includes(s)).map((s) => `station:${s}`));
  else if (control.layer > 0) out.push("station:unknown");
  if (pack.jurisdictions.length > 0) {
    const jurisdictions = profile.jurisdictions.value;
    if (jurisdictions === null) out.push("jurisdiction:unknown");
    else out.push(...jurisdictions.filter((j) => pack.jurisdictions.includes(j)).map((j) => `jurisdiction:${j}`));
  }
  if (control.layer === 3) out.push(`profile:${pack.id}`);
  return out;
}

function decide(control: ControlRecord, pack: PackManifest, profile: DeploymentProfile, asOfMs: number): RequirementDecision {
  const decided = evaluatePredicate({ all: [...scopeOf(control, pack), control.applicability.predicate] }, profile);
  const exclusions = control.applicability.exclusions.map((x) => ({ x, r: evaluatePredicate(x.when, profile) }));
  const hit = exclusions.find((e) => e.r.value === "true");
  const mine = profile.exceptions.filter((e) => e.controlId === control.id);
  const live = (e: { expiresAt: string }) => Date.parse(e.expiresAt) > asOfMs;
  const waiver = mine.find((e) => e.parameter === null && live(e));
  const reasons = [
    ...control.applicability.reasons.map((r) => `catalog: ${r}`),
    ...decided.clauses.map((c) => `predicate: ${c}`),
    ...exclusions.map((e) => `exclusion "${e.x.reason}": ${e.r.value} (${e.r.clauses.join("; ")})`),
    ...mine.filter((e) => !live(e)).map((e) => `reviewer exception ${e.id} expired at ${e.expiresAt}; ignored`)
  ];
  let applicability: RequirementDecision["applicability"] = "applicable";
  let exclusion: RequirementDecision["exclusion"] = null;
  let missingFacts: FactName[] = [];
  if (decided.value === "false") {
    applicability = "not_applicable";
    exclusion = { reason: "applicability predicate is false", source: "predicate", exceptionId: null };
  } else if (hit) {
    applicability = "not_applicable";
    exclusion = { reason: hit.x.reason, source: "predicate", exceptionId: null };
  } else if (waiver) {
    applicability = "not_applicable";
    exclusion = { reason: waiver.reason, source: "reviewer_exception", exceptionId: waiver.id };
  } else if (decided.value === "unknown") {
    applicability = "unresolved";
    missingFacts = [...new Set([...decided.missingFacts, ...exclusions.flatMap((e) => e.r.missingFacts)])].sort();
  } else if (exclusions.some((e) => e.r.value === "unknown")) {
    // Applying the control is the conservative direction when only an exclusion is unknown.
    reasons.push("an exclusion is unknown, so the control is applied");
  }
  const citationsInScope = control.citations
    .filter((c) => c.appliesWhen === null || evaluatePredicate(c.appliesWhen, profile).value === "true")
    .map((c) => c.key)
    .sort();
  return {
    controlId: control.id, controlVersion: control.version, controlDigest: controlDigest(control), layer: control.layer,
    applicability, reasons, missingFacts, exclusion, citationsInScope,
    mandatory: control.mandatory, support: control.support, pulledInBy: pulledInBy(control, pack, profile)
  };
}

/** Requirements sorted by control id, plus the retired candidates (listed as unsupported, never decided). */
export function decideApplicability(profile: DeploymentProfile, cat: LoadedCatalog, asOfMs: number): {
  requirements: RequirementDecision[];
  retired: UnsupportedControl[];
} {
  const packOf = new Map([...cat.packs.values()].flatMap(({ manifest }) => manifest.controls.map((id): [string, PackManifest] => [id, manifest])));
  const requirements: RequirementDecision[] = [];
  const retired: UnsupportedControl[] = [];
  for (const control of [...cat.controls.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const pack = packOf.get(control.id);
    if (!pack) throw new CompileError("CATALOG_INVALID", `control ${control.id} belongs to no pack`);
    const scope = scopeOf(control, pack);
    if (scope.length > 0 && evaluatePredicate({ all: scope }, profile).value === "false") continue;
    if (control.layer === 3 && evaluatePredicate(control.applicability.predicate, profile).value === "false") continue;
    if (control.support === "retired") {
      retired.push({ controlId: control.id, reason: "retired", detail: `${control.id} ${control.version} is retired in the catalog` });
      continue;
    }
    requirements.push(decide(control, pack, profile, asOfMs));
  }
  return { requirements, retired };
}
