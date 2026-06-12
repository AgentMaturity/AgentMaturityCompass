import { performance } from "node:perf_hooks";
import { describe, expect, test } from "vitest";
import { computeMaturityScore, type EvidenceArtifact } from "../../src/score/formalSpec.js";

function buildEvidenceForAgent(agentIndex: number, artifactsPerAgent = 32): EvidenceArtifact[] {
  const now = Date.now();
  const out: EvidenceArtifact[] = [];
  for (let i = 0; i < artifactsPerAgent; i += 1) {
    const dimension = (i % 8) + 1;
    out.push({
      qid: `AMC-${dimension}.${(i % 5) + 1}`,
      kind: i % 3 === 0 ? "observed" : i % 3 === 1 ? "attested" : "self_reported",
      trust: ((agentIndex + i) % 10) / 10,
      payload: { agentIndex, seq: i },
      timestamp: new Date(now - ((agentIndex + i) % 90) * 86_400_000)
    });
  }
  return out;
}

function scoreManyAgents(agentCount: number, artifactsPerAgent = 32): { elapsedMs: number; checksum: number } {
  const started = performance.now();
  let checksum = 0;
  for (let agent = 0; agent < agentCount; agent += 1) {
    const score = computeMaturityScore(buildEvidenceForAgent(agent, artifactsPerAgent));
    checksum += score.overallScore;
  }
  return {
    elapsedMs: performance.now() - started,
    checksum
  };
}

describe("performance: scoring engine", () => {
  test("scales from 1 to 100 to 10,000 agents without superlinear blow-up", () => {
    scoreManyAgents(10); // Warm the JIT so tiny one-agent timings are less noisy.

    const one = scoreManyAgents(1);
    const hundred = scoreManyAgents(100);
    const tenThousand = scoreManyAgents(10_000);

    expect(one.checksum).toBeGreaterThanOrEqual(0);
    expect(hundred.checksum).toBeGreaterThan(one.checksum);
    expect(tenThousand.checksum).toBeGreaterThan(hundred.checksum);

    expect(one.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(hundred.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(tenThousand.elapsedMs).toBeGreaterThan(Math.max(one.elapsedMs, hundred.elapsedMs));

    // Keep the benchmark robust to local machine variance while catching obvious O(n^2+) regressions.
    expect(hundred.elapsedMs / Math.max(one.elapsedMs, 0.01)).toBeLessThan(2_000);
    expect(tenThousand.elapsedMs / Math.max(hundred.elapsedMs, 0.01)).toBeLessThan(400);

    console.info("[perf][scoring]", {
      oneAgentMs: Number(one.elapsedMs.toFixed(3)),
      hundredAgentsMs: Number(hundred.elapsedMs.toFixed(3)),
      tenThousandAgentsMs: Number(tenThousand.elapsedMs.toFixed(3)),
      perAgentMsAt100: Number((hundred.elapsedMs / 100).toFixed(6)),
      perAgentMsAt10000: Number((tenThousand.elapsedMs / 10_000).toFixed(6))
    });
  });
});
