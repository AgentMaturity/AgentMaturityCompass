/**
 * Control results (P1-11) as OSCAL assessment results (P1-28). One OSCAL result per assessment window, one observation
 * per control result carrying its claim kind and five status dimensions as AMC props and its evidence by digest, and a
 * finding only where OSCAL has a state that keeps the claim: an AMC pass with claim kind `observed` is satisfied, a fail
 * is not-satisfied. A not-evaluated result, or a pass that is only self-reported, gets no finding, because OSCAL's
 * finding status has no state for it that is not a pass. The export carries claims and never creates or upgrades one.
 */
import { z } from "zod";
import type { CompiledPlan } from "../../catalog/compiler/types.js";
import { digestOf } from "../../catalog/digest.js";
import type { ControlResult } from "../../catalog/evidence/types.js";
import type { LoadedCatalog } from "../../catalog/loader.js";
import { claimEnvelopeSchema, statusDimensionsSchema } from "../../claims/eligibility/index.js";
import { sha256Hex } from "../../utils/hash.js";
import { canonicalize } from "../../utils/json.js";
import { jsonProp, line, nonEmpty, oscalMetadata, oscalUuid, prop, utc } from "./oscalIds.js";
import { loss, type OscalLoss } from "./oscalLoss.js";
import { planResource } from "./oscalProfile.js";

const text = z.string().min(1);
const time = z.iso.datetime({ offset: true });
const ref = z.strictObject({
  kind: z.enum(["ledger_event", "receipt", "external", "signed_config", "review_record", "assurance_report"]),
  id: text,
  sha256: z.string().regex(/^[0-9a-f]{64}$/)
});
const tier = z.enum(["OBSERVED", "OBSERVED_HARDENED", "ATTESTED", "SELF_REPORTED"]);
/** P1-11's ControlResult, strict. evaluateControl never derives independently_reviewed, so a file that says so is refused. */
const controlResultSchema = z.strictObject({
  resultVersion: z.literal(1),
  controlId: text,
  controlVersion: text,
  controlDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  planDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/).nullable(),
  subject: z.strictObject({ tenantId: z.string().nullable(), workspaceId: z.string(), deploymentId: z.string().nullable(), agentId: z.string().nullable(), subjectId: z.string().nullable() }),
  window: z.strictObject({ start: time, end: time }),
  dimensions: statusDimensionsSchema,
  claimKind: z.enum(["synthetic_example", "self_reported", "observed"]),
  claimReasons: claimEnvelopeSchema.shape.reasons,
  admitted: z.array(z.strictObject({ ref, producerId: text, trustTier: tier })),
  rejected: z.array(z.strictObject({
    ref,
    reason: z.enum(["producer_not_admitted", "producer_unverified", "binding_missing", "binding_mismatch", "cross_tenant",
      "outside_window", "stale", "replayed", "invalidated"]),
    detail: z.string()
  })),
  reasons: z.array(z.string()),
  evaluatedAt: time,
  evaluator: z.strictObject({ name: z.literal("amc"), version: text }),
  digest: z.string().regex(/^[0-9a-f]{64}$/)
});

/** The digest evaluateControl records: the canonical result without evaluatedAt and digest, with review pending. */
const recomputedDigest = ({ evaluatedAt: _at, digest: _digest, ...rest }: ControlResult): string =>
  sha256Hex(canonicalize({ ...rest, dimensions: { ...rest.dimensions, review: "pending" } }));

/**
 * Parses a results file and refuses it whole, as an integrity failure, unless every result has the P1-11 shape and
 * digest, names a catalog control at the digest this catalog has, was evaluated under this (verified) plan with the
 * plan's applicability, and is internally coherent (synthetic is never a result; a pass needs applicable, sufficient). The digest is
 * unkeyed: it shows a result is unchanged since it was hashed, not who produced it.
 */
export function parseControlResults(raw: unknown, plan: CompiledPlan, cat: LoadedCatalog): ControlResult[] {
  const parsed = z.array(controlResultSchema).safeParse(raw);
  if (!parsed.success) {
    throw new Error(`the results file is not a list of version 1 control results: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
  }
  const seen = new Set<string>();
  for (const r of parsed.data as ControlResult[]) {
    const what = `result ${r.controlId} (${r.digest.slice(0, 12)})`;
    const record = cat.controls.get(r.controlId);
    const decision = plan.requirements.find((q) => q.controlId === r.controlId);
    const d = r.dimensions;
    const failure = recomputedDigest(r) !== r.digest ? "does not match its digest (edited after evaluation)"
      : seen.has(r.digest) ? "appears twice"
      : !record ? "names no control in the shipped catalog"
      : r.controlVersion !== record.version || r.controlDigest !== digestOf(record) ? `is for another version of ${r.controlId} than the shipped catalog holds`
      : r.planDigest !== plan.digest ? `was evaluated under plan ${r.planDigest ?? "none"}, not ${plan.digest}`
      : !decision || decision.applicability !== d.applicability.state ? `says applicability ${d.applicability.state}, the plan says ${decision?.applicability ?? "nothing"}`
      : (r.claimKind === "synthetic_example" && d.result !== "not_evaluated") || (d.result === "pass" && (d.applicability.state !== "applicable" || d.evidence !== "sufficient"))
        ? `is a ${d.result} evaluateControl cannot produce (synthetic values are never a result; a pass needs applicable and sufficient)`
      : null;
    if (failure) throw new Error(`${what} ${failure}; nothing was exported`);
    seen.add(r.digest);
  }
  return parsed.data as ControlResult[];
}

/** satisfied only for a pass with claim kind observed; null when OSCAL has no state that keeps the claim. */
const findingState = (r: ControlResult): "satisfied" | "not-satisfied" | null =>
  r.dimensions.result === "fail" ? "not-satisfied" : r.dimensions.result === "pass" && r.claimKind === "observed" ? "satisfied" : null;

function resultProps(r: ControlResult) {
  const d = r.dimensions;
  const why = d.applicability.state === "not_applicable" ? d.applicability.rationale : d.applicability.state === "unresolved" ? d.applicability.reason : "";
  return [
    prop("control-id", r.controlId), prop("result", d.result), prop("claim-kind", r.claimKind),
    prop("applicability", d.applicability.state, why ? { remarks: why } : {}), prop("evidence", d.evidence),
    prop("enforcement", d.enforcement.state), ...(d.enforcement.state === "enforced" ? [prop("enforcement-boundary", d.enforcement.boundary)] : []),
    prop("review", d.review), ...r.claimReasons.map((c) => prop("claim-reason", c)),
    prop("control-version", r.controlVersion), prop("control-digest", r.controlDigest), prop("plan-digest", r.planDigest ?? "none"),
    prop("result-digest", r.digest), jsonProp("subject", r.subject), prop("evaluator", `${r.evaluator.name} ${r.evaluator.version}`)
  ];
}

const evidenceProps = (ref: ControlResult["admitted"][number]["ref"]) =>
  [prop("evidence-kind", ref.kind), prop("evidence-id", ref.id), prop("evidence-sha256", ref.sha256)];

function observation(r: ControlResult) {
  return {
    uuid: oscalUuid("observation", r.digest),
    title: line(`${r.controlId} ${r.dimensions.result} (${r.claimKind})`),
    description: r.reasons.length > 0 ? r.reasons.join("\n") : `AMC control result for ${r.controlId}.`,
    props: resultProps(r),
    methods: ["EXAMINE"],
    ...nonEmpty("relevant-evidence", [
      ...r.admitted.map((a) => ({ description: line(`${a.ref.kind} ${a.ref.id} admitted from ${a.producerId} (${a.trustTier})`),
        props: [...evidenceProps(a.ref), prop("admission", "admitted"), prop("producer", a.producerId), prop("trust-tier", a.trustTier)] })),
      ...r.rejected.map((x) => ({ description: line(`${x.ref.kind} ${x.ref.id} rejected as ${x.reason}`),
        props: [...evidenceProps(x.ref), prop("admission", "rejected"), prop("rejection-reason", x.reason)], ...(x.detail ? { remarks: x.detail } : {}) }))
    ]),
    collected: utc(r.evaluatedAt)
  };
}

function finding(r: ControlResult, state: "satisfied" | "not-satisfied") {
  return {
    uuid: oscalUuid("finding", r.digest),
    title: line(`${r.controlId} ${state}`),
    description: `AMC result ${r.dimensions.result} with claim kind ${r.claimKind}; the AMC props carry all five status dimensions.`,
    props: resultProps(r),
    target: { type: "statement-id", "target-id": `${r.controlId}_smt`, status: { state, reason: r.dimensions.result } },
    "related-observations": [{ "observation-uuid": oscalUuid("observation", r.digest) }]
  };
}

const REMARKS = "AMC control results as evidence of conformity, never a compliance statement. Every observation and finding "
  + "carries the AMC claim kind and five status dimensions as AMC props. A finding is satisfied only for an AMC pass with "
  + "claim kind observed and not-satisfied for a fail; a not-evaluated result, or a pass that is only self-reported, has an "
  + "observation and no finding. Control results are not signed: the export checked each result's digest, control digest "
  + "and plan binding, but that digest is unkeyed and does not show who produced the result.";

function resultLosses(results: ControlResult[]): OscalLoss[] {
  const ids = (rows: ControlResult[]) => [...new Set(rows.map((r) => r.controlId))].sort().join(", ");
  const notEvaluated = results.filter((r) => r.dimensions.result === "not_evaluated");
  const selfReportedPass = results.filter((r) => r.dimensions.result === "pass" && findingState(r) === null);
  const p = (field: string, count: number, note: string) => loss("assessment-results", field, count, "prop", note);
  const n = results.length;
  return [
    p("results[].dimensions.result=not_evaluated", notEvaluated.length,
      `OSCAL finding status is satisfied or not-satisfied only: no finding; an observation with AMC prop result=not_evaluated (${ids(notEvaluated)})`),
    p("results[].dimensions.result=pass (self_reported)", selfReportedPass.length,
      `a satisfied finding would upgrade a self-reported claim: no finding; an observation with AMC props result=pass and claim-kind (${ids(selfReportedPass)})`),
    p("results[].claimKind", n, "AMC prop claim-kind on every observation and finding"),
    p("results[].dimensions", n, "AMC props result, applicability (reason in remarks), evidence, enforcement (+ enforcement-boundary) and review"),
    p("results[].claimReasons", results.reduce((s, r) => s + r.claimReasons.length, 0), "one AMC prop claim-reason each"),
    p("results[].admitted", results.reduce((s, r) => s + r.admitted.length, 0), "relevant-evidence with AMC props evidence-kind, evidence-id, evidence-sha256, producer, trust-tier; evidence content is never embedded"),
    p("results[].rejected", results.reduce((s, r) => s + r.rejected.length, 0), "relevant-evidence with AMC props admission=rejected and rejection-reason, detail in remarks"),
    p("results[].subject", n, "AMC prop subject, as canonical JSON; OSCAL subjects reference SSP components AMC does not export"),
    p("results[].controlVersion, controlDigest, planDigest, digest", n, "AMC props control-version, control-digest, plan-digest, result-digest"),
    p("results[].evaluator", n, "AMC prop evaluator; AMC exports no OSCAL party or component for itself"),
    loss("assessment-results", "plan (as assessment plan)", 1, "remarks",
      "AMC has no OSCAL assessment plan: import-ap references the compiled plan's back-matter resource, and says so in its remarks")
  ];
}

/** Null document for no results: nothing is evaluated, so nothing is exported as a result. */
export function toOscalAssessmentResults(results: readonly ControlResult[], plan: CompiledPlan): { document: object | null; losses: OscalLoss[] } {
  if (results.length === 0) return { document: null, losses: [] };
  const sorted = [...results].sort((a, b) => (a.controlId === b.controlId ? (a.digest < b.digest ? -1 : 1) : a.controlId < b.controlId ? -1 : 1));
  const windows = [...new Set(sorted.map((r) => `${utc(r.window.start)}|${utc(r.window.end)}`))].sort();
  const oscalResults = windows.map((key) => {
    const [start, end] = key.split("|") as [string, string];
    const rows = sorted.filter((r) => `${utc(r.window.start)}|${utc(r.window.end)}` === key);
    return {
      uuid: oscalUuid("result", `${plan.digest}|${key}`),
      title: `AMC control results ${start} to ${end}`,
      description: "Control results evaluated by AMC on admitted evidence for this assessment window.",
      start, end,
      props: [prop("plan-digest", plan.digest)],
      "reviewed-controls": { "control-selections": [{ "include-controls": [...new Set(rows.map((r) => r.controlId))].map((id) => ({ "control-id": id })) }] },
      observations: rows.map(observation),
      ...nonEmpty("findings", rows.flatMap((r) => { const state = findingState(r); return state ? [finding(r, state)] : []; }))
    };
  });
  const inputsDigest = digestOf({ plan: plan.digest, results: sorted.map((r) => r.digest) });
  const resource = planResource(plan);
  const document = {
    "assessment-results": {
      uuid: oscalUuid("assessment-results", inputsDigest),
      metadata: oscalMetadata("AMC control results (experimental)", sorted.map((r) => utc(r.evaluatedAt)).sort().at(-1) as string, inputsDigest,
        [prop("plan-digest", plan.digest)], REMARKS),
      "import-ap": { href: `#${resource.uuid}`, remarks: "AMC has no OSCAL assessment plan. This references the compiled AMC control plan the results were evaluated under, in back-matter." },
      results: oscalResults,
      "back-matter": { resources: [resource] }
    }
  };
  return { document, losses: resultLosses(sorted) };
}
