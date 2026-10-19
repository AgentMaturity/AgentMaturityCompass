import { fallbackSchema, sameBinding, type LocalOutcome } from "./protocol.js";

interface FallbackOutcome extends LocalOutcome { deploymentReleases: string[]; reachedAt: string | null; deadlineAt: string | null; observedSamples: number }
/** Synthetic trajectory arithmetic only, not a driving controller or a fleet safety case. */
export function runVehicleSimulator(value: unknown): FallbackOutcome {
  const outcome: FallbackOutcome = { result: "not_evaluated", reasonCode: "invalid_input", claimKind: "synthetic_example", deploymentReleases: [], reachedAt: null, deadlineAt: null, observedSamples: 0 };
  const stop = (result: LocalOutcome["result"], reasonCode: string): FallbackOutcome => ({ ...outcome, result, reasonCode });
  const parsed = fallbackSchema.safeParse(value);
  if (!parsed.success) return outcome;
  const input = parsed.data;
  outcome.observedSamples = input.trajectory.length;
  if (input.profile === null) return stop("not_evaluated", "minimal_risk_profile_unavailable");
  if (!sameBinding(input.context, input.profile.binding) || input.profile.vehicleId !== input.vehicleId) return stop("fail", "minimal_risk_profile_mismatch");
  const crash = Date.parse(input.crashAt), now = Date.parse(input.at);
  const deadline = crash + input.profile.maxResponseMs;
  if (crash > now || !Number.isSafeInteger(deadline) || Math.abs(deadline) > 8_640_000_000_000_000) return stop("not_evaluated", "minimal_risk_time_invalid");
  outcome.deadlineAt = new Date(deadline).toISOString();
  let previous = crash - 1;
  for (const sample of input.trajectory) {
    const at = Date.parse(sample.at);
    if (!sameBinding(input.context, sample.binding) || sample.vehicleId !== input.vehicleId) return stop("fail", "trajectory_binding_mismatch");
    if (at < crash || at > now || at <= previous) return stop("fail", "trajectory_time_invalid");
    previous = at;
  }
  const reached = input.trajectory.find(sample => sample.speedMps === 0 && sample.insideSafeArea && sample.controller === "independent_fallback");
  if (!reached) return stop("fail", "minimal_risk_not_reached");
  outcome.reachedAt = reached.at;
  if (Date.parse(reached.at) > deadline) return stop("fail", "minimal_risk_late");
  outcome.deploymentReleases.push(input.vehicleId);
  return stop("pass", "minimal_risk_reached");
}
