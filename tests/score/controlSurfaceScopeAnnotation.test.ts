import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreGamingResistance } from "../../src/score/gamingResistance.js";
import { scoreMonitorBypassResistance } from "../../src/score/monitorBypassResistance.js";

/**
 * These scorers grade AMC's own control surface by probing for AMC source
 * files. (OWASP LLM coverage was one; since P0-15 it is not evaluated anywhere,
 * see tests/pathScorersNotEvaluated.test.ts.) Pointed at any other directory they previously returned a low score
 * with nothing marking it as meaningless, so an API consumer or a report could
 * present "0/10 OWASP risks covered" as a finding about the customer's agent.
 *
 * Outside an AMC checkout the result must carry applicable:false plus a
 * reason. Gaming resistance is unmeasured even inside an AMC checkout; its
 * source inventory is explicitly separate from a behavioral assessment.
 */
describe("control-surface scorers declare when they do not apply", () => {
  let foreign: string;

  beforeAll(() => {
    foreign = mkdtempSync(join(tmpdir(), "amc-not-a-checkout-"));
    mkdirSync(join(foreign, "src"), { recursive: true });
    writeFileSync(join(foreign, "src", "app.js"), "console.log(1)\n");
  });

  afterAll(() => rmSync(foreign, { recursive: true, force: true }));

  const scorers = [
    ["gamingResistance", () => scoreGamingResistance(foreign)],
    ["monitorBypassResistance", () => scoreMonitorBypassResistance(foreign)]
  ] as const;

  for (const [name, run] of scorers) {
    it(`${name} reports not-applicable outside an AMC checkout`, () => {
      const result = run();
      expect(result.applicable).toBe(false);
      expect(result.notApplicableReason).toBeTruthy();
      // The reason has to steer the reader somewhere useful, not just say no.
      expect(result.notApplicableReason).toMatch(/amc run|amc score/);
    });
  }

  const inRepo = [
    ["monitorBypassResistance", () => scoreMonitorBypassResistance(process.cwd())]
  ] as const;

  for (const [name, run] of inRepo) {
    it(`${name} still scores normally inside the AMC checkout`, () => {
      const result = run();
      expect(result.applicable).toBe(true);
      expect(result.notApplicableReason).toBeUndefined();
      expect(result.score).toBeGreaterThan(0);
    });
  }

  it("gaming resistance remains unmeasured inside the AMC checkout", () => {
    const result = scoreGamingResistance(process.cwd());
    expect(result.applicable).toBe(false);
    expect(result.assessmentStatus).toBe("not_measured");
    expect(result.score).toBeNull();
    expect(result.controlInventory.applicable).toBe(true);
    expect(result.controlInventory.flooding.presentPaths.length).toBeGreaterThan(0);
  });
});
