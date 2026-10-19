import { canonicalize } from "../../../../src/utils/json.js";
import { sameBinding, screeningSchema, unique, type LocalOutcome } from "./protocol.js";

interface ScreeningOutcome extends LocalOutcome { noticeReleases: string[]; evaluatedPairs: string[] }
/** Paired synthetic observations; every notice remains withheld until every pair passes. */
export function runScreeningLog(value: unknown): ScreeningOutcome {
  const outcome: ScreeningOutcome = { result: "not_evaluated", reasonCode: "invalid_input", claimKind: "synthetic_example", noticeReleases: [], evaluatedPairs: [] };
  const stop = (result: LocalOutcome["result"], reasonCode: string): ScreeningOutcome => ({ ...outcome, result, reasonCode });
  const parsed = screeningSchema.safeParse(value);
  if (!parsed.success) return outcome;
  const input = parsed.data;
  const now = Date.parse(input.at);
  const isProxy = (id: string) => ["name", "zip", "zipcode"].includes(id.toLowerCase().replace(/[\s_-]/g, ""));
  if (!unique(input.permittedFeatureIds) || input.permittedFeatureIds.some(isProxy)) return stop("fail", "proxy_feature_not_permitted");
  const applications = input.pairs.flatMap(pair => [pair.baseline, pair.counterfactual]);
  if (!unique(input.pairs.map(pair => pair.pairId)) || !unique(applications.map(application => application.applicationId))) return stop("fail", "duplicate_screening_identity");
  const featureShape = (features: typeof applications[number]["features"]) => canonicalize(features.map(row => [row.featureId, row.value]).sort((a, b) => String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0));
  const reasonShape = (reasons: NonNullable<typeof applications[number]["reasons"]>) => canonicalize(reasons.map(reason => ({ code: reason.code, sourceFeatureIds: [...reason.sourceFeatureIds].sort() }))
    .sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  for (const pair of input.pairs) {
    const { baseline, counterfactual } = pair;
    for (const application of [baseline, counterfactual]) {
      if (!sameBinding(input.context, application.binding) || application.pairId !== pair.pairId || Date.parse(application.recordedAt) > now) return stop("fail", "application_binding_mismatch");
      if (!unique(application.features.map(feature => feature.featureId))
        || (application.reasons !== null && (!unique(application.reasons.map(reason => reason.code)) || application.reasons.some(reason => !unique(reason.sourceFeatureIds))))) return stop("fail", "duplicate_screening_identity");
    }
    const onlyNamedFieldChanged = pair.changedField === "name"
      ? baseline.name !== counterfactual.name && baseline.zipCode === counterfactual.zipCode
      : baseline.zipCode !== counterfactual.zipCode && baseline.name === counterfactual.name;
    if (!onlyNamedFieldChanged || featureShape(baseline.features) !== featureShape(counterfactual.features)
      || baseline.features.length !== input.permittedFeatureIds.length || baseline.features.some(feature => !input.permittedFeatureIds.includes(feature.featureId))) return stop("fail", "invalid_counterfactual_pair");
    if (baseline.reasons === null || counterfactual.reasons === null) return stop("not_evaluated", "reason_lineage_unavailable");
    const lineagePermitted = [...baseline.reasons, ...counterfactual.reasons].every(reason => reason.sourceFeatureIds.every(id => !isProxy(id) && input.permittedFeatureIds.includes(id)
      && baseline.features.some(feature => feature.featureId === id) && counterfactual.features.some(feature => feature.featureId === id)));
    const reasonsAcceptable = lineagePermitted && reasonShape(baseline.reasons) === reasonShape(counterfactual.reasons);
    const sameDecision = baseline.decision === counterfactual.decision;
    outcome.evaluatedPairs.push(pair.pairId);
    if (!sameDecision || !reasonsAcceptable) return stop("fail", !sameDecision ? "paired_decision_difference" : !lineagePermitted ? "proxy_reason_source" : "paired_reasons_difference");
  }
  outcome.noticeReleases = applications.filter(application => application.decision === "deny").map(application => application.applicationId);
  return stop("pass", "paired_reasons_permitted");
}
