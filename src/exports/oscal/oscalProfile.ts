/**
 * A compiled control plan (P1-10) as an OSCAL profile (P1-28). The profile imports the exported catalog and includes
 * exactly the plan's applicable controls by id: no modifications, no merge directives. Exclusions with their reasons,
 * unresolved controls, conflicts, unsupported controls and crosswalk links go into AMC props and the loss report; the
 * plan and lockfile digests go into metadata props and back-matter. A plan is planning, never a compliance claim.
 */
import type { CompiledPlan, SignedPlan } from "../../catalog/compiler/types.js";
import { jsonProp, oscalMetadata, oscalUuid, prop } from "./oscalIds.js";
import { loss, type OscalLoss } from "./oscalLoss.js";

const REMARKS = "An experimental AMC control plan from amc catalog compile: which catalog controls apply to one deployment profile. "
  + "Planning for evidence of conformity, never a compliance statement. Only applicable controls are included; every "
  + "other requirement decision is an AMC prop requirement. metadata.last-modified is the plan's compiledAt, which the "
  + "plan signature does not cover.";

/** The compiled plan as a back-matter resource; the assessment results reference the same resource. */
export function planResource(plan: CompiledPlan) {
  return {
    uuid: oscalUuid("plan", plan.digest),
    title: `AMC compiled control plan ${plan.profile.profileId}`,
    props: [prop("plan-digest", plan.digest), prop("policy-digest", plan.runtimePolicy.policyDigest), prop("plan-status", plan.status)],
    remarks: "plan.json from amc catalog compile. plan-digest is sha256 over the canonical JSON (sorted keys) of the plan "
      + "without its digest field; plan.sig.json signs that digest as CONTROL_PLAN."
  };
}

function lockResource(plan: CompiledPlan) {
  return {
    uuid: oscalUuid("catalog-lock", plan.lock.catalog.digest),
    title: "AMC catalog lockfile (catalog.lock.json)",
    props: [prop("catalog-digest", plan.lock.catalog.digest), jsonProp("catalog-lock", plan.lock)]
  };
}

function profileLosses(signed: SignedPlan): OscalLoss[] {
  const plan = signed.plan;
  const p = (field: string, count: number, note: string) => loss("profile", field, count, "prop", note);
  const decisions = plan.requirements.filter((r) => r.applicability !== "applicable").map((r) => p(`requirements[${r.controlId}]`, 1,
    r.applicability === "not_applicable"
      ? `not applicable, absent from include-controls; excluded by ${r.exclusion?.source ?? "predicate"}${r.exclusion?.exceptionId ? ` ${r.exclusion.exceptionId}` : ""}: ${r.exclusion?.reason ?? r.reasons.join("; ")}`
      : `unresolved, absent from include-controls; missing facts: ${r.missingFacts.join(", ") || "none recorded"}`));
  return [
    ...decisions,
    p("requirements[]", plan.requirements.length, "one AMC prop requirement per decision (applicability, reasons, exclusion, missing facts, citations in scope, pulledInBy), as canonical JSON"),
    p("conflicts[]", plan.conflicts.length, "one AMC prop conflict per parameter conflict, as canonical JSON"),
    p("unsupported[]", plan.unsupported.length, "one AMC prop unsupported per unsupported control, as canonical JSON"),
    p("crosswalkLinks[]", plan.crosswalkLinks.length, "one AMC prop crosswalk-link each, as canonical JSON; informational, a crosswalk never satisfies its target"),
    p("profile", 1, "AMC props deployment-profile-id, deployment-profile-sha256 and fact-provenance"),
    p("compiler", 1, "AMC prop compiler"),
    p("status", 1, "AMC prop plan-status"),
    p("lock", 1, "back-matter resource with AMC props catalog-digest and catalog-lock (the whole lockfile as canonical JSON)"),
    p("digest", 1, "AMC prop plan-digest; also metadata.version"),
    loss("profile", "runtimePolicy", 1, "omitted", "v0 emits no profile modifications; AMC prop policy-digest pins the effective runtime policy in plan.json"),
    loss("profile", "evidencePlan", 1, "omitted", "AMC prop plan-digest pins the evidence plan in plan.json"),
    loss("profile", "signature.signature", 1, "omitted", "the export verifies plan.sig.json against this workspace's auditor keys (a local audit trail) and does not carry the signature"),
    loss("profile", "signature.review", 1, "omitted", "the review status in plan.sig.json is not covered by the plan signature, so it is not exported"),
    loss("profile", "signature.diff", Number(signed.diff !== null), "omitted", "the diff against the previous plan is not exported")
  ];
}

/**
 * Null document when the plan has no applicable control: OSCAL include-controls needs at least one id. The caller
 * verifies the signed plan (digest and CONTROL_PLAN signature) before passing it.
 */
export function toOscalProfile(signed: SignedPlan, catalogHref: string): { document: object | null; losses: OscalLoss[] } {
  const plan = signed.plan;
  const applicable = plan.requirements.filter((r) => r.applicability === "applicable").map((r) => r.controlId);
  if (applicable.length === 0) {
    return { document: null, losses: [loss("profile", "requirements[]", Math.max(plan.requirements.length, 1), "omitted",
      "the plan has no applicable control and OSCAL include-controls needs at least one id, so profile.json is not written")] };
  }
  const props = [
    prop("plan-digest", plan.digest), prop("policy-digest", plan.runtimePolicy.policyDigest), prop("plan-status", plan.status),
    prop("deployment-profile-id", plan.profile.profileId), prop("deployment-profile-sha256", plan.profile.sha256),
    jsonProp("fact-provenance", plan.profile.factProvenance), prop("compiler", `${plan.compiler.name} ${plan.compiler.version}`),
    prop("catalog-digest", plan.lock.catalog.digest),
    ...plan.requirements.map((r) => jsonProp("requirement", r)),
    ...plan.conflicts.map((c) => jsonProp("conflict", c)),
    ...plan.unsupported.map((u) => jsonProp("unsupported", u)),
    ...plan.crosswalkLinks.map((x) => jsonProp("crosswalk-link", x))
  ];
  const document = {
    profile: {
      uuid: oscalUuid("profile", plan.digest),
      metadata: oscalMetadata(`AMC control plan ${plan.profile.profileId}`, signed.compiledAt, plan.digest, props, REMARKS),
      imports: [{ href: catalogHref, "include-controls": [{ "with-ids": [...applicable].sort() }] }],
      "back-matter": { resources: [planResource(plan), lockResource(plan)] }
    }
  };
  return { document, losses: profileLosses(signed) };
}
