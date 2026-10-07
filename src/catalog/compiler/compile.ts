/**
 * `compilePlan` (P1-10): deterministic. Profile lists are sorted (primary station first), every output list has a
 * stable order, and the clock is never read: `asOf` comes from the caller. The catalog must validate as of `asOf`,
 * every parameter must map to an enforcement point, and every exception must name a real control. Unknown facts stay
 * unknown; a mandatory control left unresolved, or an unresolved conflict, blocks the plan.
 */
import { canonicalize } from "../../utils/json.js";
import { sha256Hex } from "../../utils/hash.js";
import { amcVersion } from "../../version.js";
import { digestOf } from "../digest.js";
import { buildCatalogLock } from "../lockfile.js";
import { FACT_NAMES } from "../schema.js";
import type { FactName } from "../types.js";
import { validateCatalog } from "../validate.js";
import { checkExceptions, decideApplicability } from "./applicability.js";
import { buildEvidencePlan, plannedProducers } from "./evidencePlan.js";
import { mergeParameters } from "./merge.js";
import { absentEnforcement, buildRuntimePolicy, checkParameters } from "./runtimePolicy.js";
import {
  CompileError, deploymentProfileSchema, type CompileInput, type CompiledPlan, type DeploymentProfile, type Fact, type FactProvenance,
  type UnsupportedControl
} from "./types.js";

const sorted = <T extends string>(values: T[]): T[] => [...new Set(values)].sort();
const list = <T extends string>(f: Fact<T[]>): Fact<T[]> => (f.value === null ? f : { ...f, value: sorted(f.value) });

/** Parses the profile strictly and puts every list in a stable order, so shuffled input gives the same plan. */
export function parseDeploymentProfile(raw: unknown): DeploymentProfile {
  const parsed = deploymentProfileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CompileError("PROFILE_INVALID", parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
  }
  const p = parsed.data;
  const primary = p.primaryStation.value;
  const stations = p.stations.value === null ? p.stations
    : { ...p.stations, value: sorted(p.stations.value).sort((a, b) => Number(b === primary) - Number(a === primary)) };
  return {
    ...p,
    deployment: { ...p.deployment, agentIds: sorted(p.deployment.agentIds) },
    stations,
    domains: list(p.domains), jurisdictions: list(p.jurisdictions), roles: list(p.roles), entityTypes: list(p.entityTypes),
    useCases: list(p.useCases), dataClasses: list(p.dataClasses),
    exceptions: [...p.exceptions].sort((a, b) => (a.id < b.id ? -1 : 1))
  };
}

const order = (a: UnsupportedControl, b: UnsupportedControl): number =>
  canonicalize([a.controlId, a.reason, a.detail]) < canonicalize([b.controlId, b.reason, b.detail]) ? -1 : 1;

export function compilePlan(input: CompileInput): CompiledPlan {
  const asOfMs = Date.parse(input.asOf);
  if (Number.isNaN(asOfMs)) throw new CompileError("PROFILE_INVALID", `asOf ${input.asOf} is not a time`);
  const profile = parseDeploymentProfile(input.profile);
  const cat = input.catalog;
  const validation = validateCatalog(cat, { asOf: new Date(asOfMs) });
  if (!validation.ok) {
    const first = validation.errors[0];
    throw new CompileError("CATALOG_INVALID", `${validation.errors.length} catalog errors; first: ${first?.file} ${first?.code} ${first?.message}`);
  }
  const lock = buildCatalogLock(cat);
  checkParameters(cat);
  checkExceptions(profile, cat);
  const { requirements, retired } = decideApplicability(profile, cat, asOfMs);
  const active = requirements.filter((r) => r.applicability !== "not_applicable").flatMap((r) => cat.controls.get(r.controlId) ?? []);
  const { parameters, conflicts } = mergeParameters(active, profile.exceptions.filter((e) => Date.parse(e.expiresAt) > asOfMs));
  const blocked = conflicts.some((c) => c.resolution === "unresolved") || requirements.some((r) => r.mandatory && r.applicability === "unresolved");
  const factProvenance = Object.fromEntries(FACT_NAMES.map((name) => {
    const fact = profile[name] as Fact<unknown>;
    return [name, fact.value === null ? "unknown" : fact.provenance];
  })) as Record<FactName, FactProvenance | "unknown">;
  const body: Omit<CompiledPlan, "digest"> = {
    planVersion: 1,
    compiler: { name: "amc-catalog-compiler", version: amcVersion },
    profile: { profileId: profile.profileId, sha256: sha256Hex(canonicalize(profile)), factProvenance },
    lock,
    status: blocked ? "blocked" : "ready",
    requirements,
    conflicts,
    unsupported: [...retired, ...absentEnforcement(active), ...plannedProducers(active, cat.producers)].sort(order),
    crosswalkLinks: active.flatMap((c) => c.crosswalk.map((x) => ({ controlId: c.id, framework: x.framework, clause: x.clause, relation: x.relation }))),
    runtimePolicy: buildRuntimePolicy(parameters, profile.deployment.agentIds),
    evidencePlan: buildEvidencePlan(active)
  };
  return { ...body, digest: digestOf(body) };
}
