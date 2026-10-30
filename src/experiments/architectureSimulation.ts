import type { ArchitectureProbe, ArchitectureSpec, ProbeOutcome, ProbeOutcomeVerdict } from "./architectureExperiment.js";

/**
 * DETERMINISTIC TEST DOUBLE — does not invoke any model.
 *
 * Produces reproducible pseudo-random probe outcomes from a seed so tests can
 * exercise the experiment pipeline. This was previously the default probe
 * runner, which meant every architecture comparison reported invented scores,
 * tokens and latencies. Callers must now opt into it explicitly; production
 * runs must supply a probeRunner that invokes the real model.
 */
export function simulateProbeOutcomes(
  spec: ArchitectureSpec,
  probes: ArchitectureProbe[],
  seed: number,
): ProbeOutcome[] {
  const outcomes: ProbeOutcome[] = [];
  let rngState = seed;

  function nextRng(): number {
    // Simple LCG for deterministic output
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return (rngState >>> 0) / 0xFFFFFFFF;
  }

  for (const probe of probes) {
    const rng1 = nextRng();
    const rng2 = nextRng();
    const rng3 = nextRng();
    const rng4 = nextRng();

    // Architecture-specific bias: different spec artifacts produce different outcomes
    const specBias = parseInt(spec.artifactSha256.slice(0, 8), 16) / 0xFFFFFFFF;

    const score = Math.min(1, Math.max(0, 0.5 + (rng1 - 0.5) * 0.8 + specBias * 0.15));

    let verdict: ProbeOutcomeVerdict;
    if (score >= 0.7) verdict = "PASS";
    else if (score >= 0.4) verdict = "PARTIAL";
    else verdict = "FAIL";

    outcomes.push({
      probeId: probe.probeId,
      specId: spec.specId,
      verdict,
      score: Number(score.toFixed(4)),
      toolCallCount: Math.floor(rng2 * 10),
      tokenCount: Math.floor(500 + rng3 * 2000),
      latencyMs: Math.floor(100 + rng4 * 2000),
      choiceAwareness: rng1 > 0.4,
      observations: [
        `SIMULATED probe ${probe.category}/${probe.measureDimension}: score=${score.toFixed(3)}`,
      ],
      ts: Date.now(),
      simulated: true,
    });
  }

  return outcomes;
}
