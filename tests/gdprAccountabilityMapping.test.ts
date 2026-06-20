import { describe, expect, test } from "vitest";
import { builtInComplianceMappings } from "../src/compliance/builtInMappings.js";
import { complianceFrameworkFamilies } from "../src/compliance/frameworks.js";

describe("GDPR accountability compliance mapping", () => {
  test("includes GDPR Article 5(2) accountability in built-in mappings and framework categories", () => {
    const mapping = builtInComplianceMappings.find((row) => row.id === "gdpr_art5_accountability");
    const gdpr = complianceFrameworkFamilies.find((row) => row.framework === "GDPR");

    expect(mapping).toBeDefined();
    expect(mapping?.framework).toBe("GDPR");
    expect(mapping?.category).toBe("Art. 5 Accountability");
    expect(mapping?.description).toMatch(/demonstrable compliance/i);
    expect(mapping?.evidenceRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "requires_evidence_event",
          eventTypes: expect.arrayContaining(["artifact", "audit", "review", "metric"]),
          minObservedRatio: 0.6,
        }),
      ])
    );
    expect(mapping?.related.questions).toEqual(expect.arrayContaining(["AMC-1.7", "AMC-2.4", "AMC-4.5"]));
    expect(gdpr?.categories).toContain("Art. 5 Accountability");
  });
});
