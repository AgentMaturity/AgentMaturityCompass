import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * G1-02: the red-team runner scored a hardcoded `syntheticResponse()` that
 * always refused, so "no vulnerabilities found" was guaranteed before the run.
 * It now attacks the real agent under test.
 */
describe("red-team runner attacks a real agent", () => {
  const source = readFileSync(new URL("../src/redteam/runner.ts", import.meta.url), "utf8");

  it("no longer contains a synthetic response generator", () => {
    expect(source).not.toContain("function syntheticResponse");
    expect(source).not.toContain("syntheticResponse(attackPrompt)");
  });

  it("invokes the shared real-agent responder", () => {
    expect(source).toContain("resolveAgentResponder");
    expect(source).toContain("responder.respond(attackPrompt)");
  });

  it("never reports a perfect score when nothing was attacked", () => {
    // The previous implementation returned 100 for zero scenarios, so a run
    // that attacked nothing looked flawlessly secure.
    expect(source).not.toContain("totalScenarios === 0 ? 100");
    expect(source).toContain('totalScenarios === 0 ? "INSUFFICIENT_EVIDENCE" : "MEASURED"');
    expect(source).toContain("totalScenarios === 0 ? 0");
  });

  it("excludes unreached attacks from pass/fail totals", () => {
    expect(source).toContain("inconclusiveCount += 1");
    expect(source).toContain("inconclusive: true");
    // The inconclusive branch must `continue` before totals are incremented.
    const branch = source.slice(source.indexOf("inconclusiveCount += 1"));
    const continueIdx = branch.indexOf("continue;");
    const passIdx = branch.indexOf("totalPass++");
    expect(continueIdx).toBeGreaterThan(-1);
    expect(continueIdx).toBeLessThan(passIdx);
  });

  it("records which target was actually attacked", () => {
    expect(source).toContain("evidenceStatus");
    expect(source).toContain("responder.target.endpoint");
  });
});

describe("red-team CLI fails closed", () => {
  const cli = readFileSync(new URL("../src/cli-late-stage-commands.ts", import.meta.url), "utf8");

  it("aborts with remediation instead of reporting a clean run", () => {
    expect(cli).toContain("AgentResponderUnavailableError");
    expect(cli).toContain("Red-team run aborted");
    expect(cli).toContain("error.remediation");
  });
});
