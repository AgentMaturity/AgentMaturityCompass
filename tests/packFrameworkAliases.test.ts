import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { listIndustryPacks } from "../src/domains/industryPacks.js";
import { classifyFrameworkString, frameworkChoices, getFrameworkFamily, normalizeFrameworkName } from "../src/compliance/frameworks.js";

const unresolvedFixture = JSON.parse(
  readFileSync(new URL("./fixtures/packFrameworkStrings.unresolved.json", import.meta.url), "utf8")
) as { reason: string; strings: string[] };

// Every string below was taken verbatim from an industry pack's complianceFrameworks
// at 8f57ce63 and names a framework AMC has control mappings for.
const PACK_STRINGS_FOR_SUPPORTED_FRAMEWORKS: Record<string, string> = {
  "EU AI Act": "EU_AI_ACT",
  "EU AI Act 2024/1689": "EU_AI_ACT",
  "EU AI Act Annex III": "EU_AI_ACT",
  "EU AI Act Annex III §3": "EU_AI_ACT",
  "EU AI Act Annex III §5/8": "EU_AI_ACT",
  "EU AI Act Annex III §8": "EU_AI_ACT",
  "EU AI Act Art. 26": "EU_AI_ACT",
  "EU AI Act Art. 5(1)(a)": "EU_AI_ACT",
  "GDPR": "GDPR",
  "GDPR Art. 20": "GDPR",
  "GDPR Art. 22": "GDPR",
  "GDPR Art. 44-49": "GDPR",
  "GDPR Art. 5/25/32": "GDPR",
  "GDPR Art. 6(1)(e)": "GDPR",
  "GDPR Art. 6/9/22": "GDPR",
  "GDPR Art. 9": "GDPR",
  "EU GDPR Art. 9(d)": "GDPR",
  "HIPAA": "HIPAA",
  "HIPAA 45 CFR §164": "HIPAA",
  "HIPAA Privacy Rule": "HIPAA",
  "HIPAA §164.312": "HIPAA",
  "ISO 27001:2022": "ISO_27001",
  "ISO/IEC 27001:2022": "ISO_27001",
  "ISO/IEC 42001:2023": "ISO_42001",
  "NIST AI RMF 1.0": "NIST_AI_RMF",
  "OWASP API Top 10 2023": "OWASP_API_TOP10",
  "PCI DSS v4.0": "PCI_DSS",
  "SOC 2 Type II": "SOC2",
  "EU DORA Art. 9": "DORA",
  "EU NIS2 2022/2555": "NIS2",
  "ONC 45 CFR §170": "HHS_HTI_1",
};

// Pack strings that look close to a supported framework but are different instruments.
const MUST_NOT_RESOLVE = [
  "NIST CSF 2.0",
  "NIST SP 800-161r1-upd1",
  "ISO/IEC 27701:2019",
  "ISO 27799:2016",
  "ISO/IEC 20000-1:2018",
  "HITECH Act",
  "21st Century Cures Act",
  "EU Data Act 2023/2854",
  "CCPA/CPRA",
];

// Names an operator or a future pack may use for the families added for the stations.
const STATION_FAMILY_NAMES: Record<string, string> = {
  "NIST AI 600-1": "NIST_AI_600_1",
  "Colorado AI Act": "CO_AI_ACT",
  "SB26-189": "CO_AI_ACT",
  "Texas HB 149": "TX_TRAIGA",
  "TRAIGA": "TX_TRAIGA",
  "California SB 53": "CA_AI_LAWS",
  "AB 2013": "CA_AI_LAWS",
  "CCPA ADMT regulations": "CA_AI_LAWS",
  "Korea AI Basic Act": "KR_AI_BASIC_ACT",
  "HHS HTI-1": "HHS_HTI_1",
  "PCI DSS v4.0.1": "PCI_DSS",
};

describe("normalizeFrameworkName", () => {
  test.each(Object.entries(PACK_STRINGS_FOR_SUPPORTED_FRAMEWORKS))("%s -> %s", (input, expected) => {
    expect(normalizeFrameworkName(input)).toBe(expected);
  });

  test.each(MUST_NOT_RESOLVE)("%s stays external", (input) => {
    expect(normalizeFrameworkName(input)).toBeNull();
  });

  test("keeps exact ids and legacy aliases working", () => {
    for (const id of frameworkChoices()) expect(normalizeFrameworkName(id)).toBe(id);
    expect(normalizeFrameworkName("soc-2")).toBe("SOC2");
    expect(normalizeFrameworkName("eu-ai-act")).toBe("EU_AI_ACT");
    expect(normalizeFrameworkName("pci-dss")).toBe("PCI_DSS");
    expect(normalizeFrameworkName("dora")).toBe("DORA");
    expect(normalizeFrameworkName("nis2")).toBe("NIS2");
    expect(normalizeFrameworkName("hti-1")).toBe("HHS_HTI_1");
    expect(normalizeFrameworkName("nis-2")).toBe("NIS2");
    expect(normalizeFrameworkName("onc-hti-1")).toBe("HHS_HTI_1");
    expect(normalizeFrameworkName("ONC_HTI_1")).toBe("HHS_HTI_1");
  });

  test.each(Object.entries(STATION_FAMILY_NAMES))("%s -> %s", (input, expected) => {
    expect(normalizeFrameworkName(input)).toBe(expected);
  });

  test("new frameworks are first-class families", () => {
    for (const id of ["DORA", "NIS2", "HHS_HTI_1", "NIST_AI_600_1", "CO_AI_ACT", "TX_TRAIGA", "CA_AI_LAWS", "KR_AI_BASIC_ACT"]) {
      expect(frameworkChoices()).toContain(id);
      expect(getFrameworkFamily(id).categories.length).toBeGreaterThan(0);
    }
  });
});

describe("classifyFrameworkString", () => {
  test("says how each string resolved", () => {
    expect(classifyFrameworkString("DORA")).toEqual({ framework: "DORA", reason: "exact" });
    expect(classifyFrameworkString("soc-2")).toEqual({ framework: "SOC2", reason: "alias" });
    expect(classifyFrameworkString("SOC 2 Type II")).toEqual({ framework: "SOC2", reason: "pattern" });
    expect(classifyFrameworkString("NIST CSF 2.0")).toEqual({ framework: null, reason: "sector-standard-not-modelled" });
  });
});

describe("industry pack framework strings", () => {
  test("the unresolved set equals the committed fixture, each classified as not modelled", () => {
    const strings = new Set(listIndustryPacks().flatMap((pack) => pack.complianceFrameworks));
    const unresolved = [...strings].filter((value) => classifyFrameworkString(value).framework === null).sort();
    expect(unresolvedFixture.reason).toBe("sector-standard-not-modelled");
    expect(unresolved).toEqual([...unresolvedFixture.strings].sort());
    for (const value of unresolved) expect(classifyFrameworkString(value).reason).toBe("sector-standard-not-modelled");
  });

  test("every pack string either resolves to a supported framework or is reported as external", () => {
    const citedBy = new Map<string, string[]>();
    for (const pack of listIndustryPacks()) {
      for (const value of pack.complianceFrameworks) {
        citedBy.set(value, [...(citedBy.get(value) ?? []), pack.id]);
      }
    }
    const unresolved = [...citedBy.keys()].filter((value) => normalizeFrameworkName(value) === null).sort();
    const resolved = [...citedBy.keys()].filter((value) => normalizeFrameworkName(value) !== null);

    console.log(`unresolvedPackFrameworkStrings=${unresolved.length} resolvedPackFrameworkStrings=${resolved.length} distinct=${citedBy.size}`);
    for (const value of unresolved) {
      console.log(`external: ${JSON.stringify(value)} citedBy=${citedBy.get(value)!.join(",")} (no AMC control mappings; official source not catalogued)`);
    }

    for (const value of resolved) {
      expect(frameworkChoices()).toContain(normalizeFrameworkName(value));
    }
    for (const [value, expected] of Object.entries(PACK_STRINGS_FOR_SUPPORTED_FRAMEWORKS)) {
      if (citedBy.has(value)) expect(normalizeFrameworkName(value)).toBe(expected);
    }
  });
});
