import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * src/enterprise/gates.ts defined licence-tier gates for pdf-export, badges,
 * compliance-reports, api-access, fleet-governance and thirteen more — while
 * docs/PRICING.md states "No feature gating on the trust stack itself" and
 * docs/PRODUCT_EDITIONS.md that AMC gates only Industry Packs.
 *
 * Nothing imported it, so it enforced nothing; the hazard was that it sat there
 * looking wired, ready for someone to connect and quietly break the published
 * promise. Its sibling packRegistry.ts hardcoded every Industry Pack to
 * ENTERPRISE, contradicting the $9.99/month model in the README, and duplicated
 * the wired src/domains/industryPackEntitlement.ts.
 *
 * Both are removed. This test keeps the published model and the code aligned.
 */
describe("no tier gating on the trust stack", () => {
  it("the contradictory gate modules stay removed", () => {
    expect(existsSync(join(process.cwd(), "src/enterprise/gates.ts"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/enterprise/packRegistry.ts"))).toBe(false);
  });

  it("entitlement still runs through the single wired path", () => {
    expect(existsSync(join(process.cwd(), "src/domains/industryPackEntitlement.ts"))).toBe(true);
  });

  it("the published promise this protects is still the published promise", () => {
    // If AMC ever does decide to gate the trust stack, this fails first and the
    // docs get updated deliberately rather than drifting apart again.
    const pricing = readFileSync(join(process.cwd(), "docs/PRICING.md"), "utf8");
    expect(pricing).toMatch(/No feature gating on the trust stack/i);
  });

  it("keeps one SCIM surface mounted, with the other marked for embedders", () => {
    const adapter = readFileSync(join(process.cwd(), "src/integrations/scimAdapter.ts"), "utf8");
    expect(adapter).toMatch(/deliberately NOT mounted/);
    const served = readdirSync(join(process.cwd(), "src/identity/scim"));
    expect(served).toContain("scimRoutes.ts");
  });
});
