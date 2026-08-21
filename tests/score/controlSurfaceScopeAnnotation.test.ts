import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreGamingResistance } from "../../src/score/gamingResistance.js";
import { scoreMonitorBypassResistance } from "../../src/score/monitorBypassResistance.js";
import { scoreOWASPLLMCoverage } from "../../src/score/owaspLLMCoverage.js";

/**
 * These three scorers grade AMC's own control surface by probing for AMC source
 * files. Pointed at any other directory they previously returned a low score
 * with nothing marking it as meaningless, so an API consumer or a report could
 * present "0/10 OWASP risks covered" as a finding about the customer's agent.
 *
 * The contract asserted here: outside an AMC checkout the result must carry
 * applicable:false plus a reason, and inside one it must score normally.
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
    ["monitorBypassResistance", () => scoreMonitorBypassResistance(foreign)],
    ["owaspLLMCoverage", () => scoreOWASPLLMCoverage(foreign)]
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
    ["gamingResistance", () => scoreGamingResistance(process.cwd())],
    ["monitorBypassResistance", () => scoreMonitorBypassResistance(process.cwd())],
    ["owaspLLMCoverage", () => scoreOWASPLLMCoverage(process.cwd())]
  ] as const;

  for (const [name, run] of inRepo) {
    it(`${name} still scores normally inside the AMC checkout`, () => {
      const result = run();
      expect(result.applicable).toBe(true);
      expect(result.notApplicableReason).toBeUndefined();
      expect(result.score).toBeGreaterThan(0);
    });
  }
});
