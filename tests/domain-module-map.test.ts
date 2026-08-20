import { describe, expect, test } from "vitest";
import {
  DOMAIN_MODULE_MAP,
  TOTAL_MODULE_COUNT,
  findModuleProfile,
  getDomainModuleActivations
} from "../src/domains/domainModuleMap.js";

describe("domain module map", () => {
  test("maps all 161 modules", () => {
    expect(TOTAL_MODULE_COUNT).toBe(161);
    expect(DOMAIN_MODULE_MAP.length).toBe(161);
  });

  test("every module has domain coverage entries", () => {
    for (const profile of DOMAIN_MODULE_MAP) {
      expect(profile.domains.length).toBe(9);
      expect(profile.moduleId.length).toBeGreaterThan(0);
      expect(profile.moduleName.length).toBeGreaterThan(0);
    }
  });

  test("category counts match expected architecture", () => {
    const counts = DOMAIN_MODULE_MAP.reduce<Record<string, number>>((acc, profile) => {
      acc[profile.category] = (acc[profile.category] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts.shield).toBe(16);
    expect(counts.enforce).toBe(35);
    expect(counts.vault).toBe(14);
    expect(counts.watch).toBe(10);
    expect(counts.product).toBe(86);
  });

  test("critical module overrides are preserved", () => {
    const s10 = findModuleProfile("S10");
    expect(s10).toBeDefined();
    expect(s10?.domains.every((entry) => entry.relevance === "critical")).toBe(true);

    const e23 = findModuleProfile("E23");
    expect(e23?.domains.find((entry) => entry.domain === "wealth")?.relevance).toBe("critical");
    expect(e23?.domains.find((entry) => entry.domain === "wealth")?.relevance).toBe("critical");
    expect(e23?.domains.find((entry) => entry.domain === "health")?.relevance).toBe("high");

    const v4 = findModuleProfile("V4");
    expect(v4?.domains.find((entry) => entry.domain === "health")?.relevance).toBe("critical");
    expect(v4?.domains.find((entry) => entry.domain === "education")?.relevance).toBe("critical");
    expect(v4?.domains.find((entry) => entry.domain === "wealth")?.relevance).toBe("critical");

    const e19 = findModuleProfile("E19");
    expect(e19?.domains.find((entry) => entry.domain === "health")?.relevance).toBe("critical");
    expect(e19?.domains.find((entry) => entry.domain === "wealth")?.relevance).toBe("critical");
    expect(e19?.domains.find((entry) => entry.domain === "governance")?.relevance).toBe("critical");
  });

  test("domain activation view returns all modules", () => {
    const healthcareModules = getDomainModuleActivations("health");
    const technologyModules = getDomainModuleActivations("technology");

    expect(healthcareModules.length).toBe(161);
    expect(technologyModules.length).toBe(161);
    expect(technologyModules[0]?.relevance).toBe("critical");
  });
});
