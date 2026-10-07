import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lintCitations, type CitationLintInput } from "../../src/compliance/citations/lint.js";
import { SHARED_OFFICIAL_HOSTS } from "../../src/compliance/citations/officialHosts.js";
import { FRAMEWORK_REFERENCE_TABLES } from "../../src/compliance/citations/frameworkIds.js";
import { OFFICIAL_SOURCE_HOSTS } from "../../src/domains/packs/regulatorySchema.js";
import { REGULATORY_REGISTER } from "../../src/compliance/regulatory/index.js";
import type { RegulatoryInstrument } from "../../src/domains/packs/regulatorySchema.js";

type Expected = { rule: string; zeroTolerance: boolean };
type Case = {
  name: string;
  record?: false;
  recordPatch?: Record<string, unknown>;
  input: Partial<CitationLintInput>;
  expect: Expected[];
};
const fixture = JSON.parse(readFileSync("tests/fixtures/citations/cases.json", "utf8")) as {
  completeRecord: RegulatoryInstrument;
  cases: Case[];
};

const EMPTY: CitationLintInput = {
  records: [],
  textRefs: [],
  frameworkIds: [],
  packRefs: [],
  knownPackIds: [],
  referenceTables: { atlas: [], nistAiRmf: [], iso42001AnnexA: [] },
};

function buildInput(c: Case): CitationLintInput {
  const records: Array<CitationLintInput["records"][number]> = [];
  if (c.record !== false) {
    const record: Record<string, unknown> = { ...fixture.completeRecord };
    for (const [key, value] of Object.entries(c.recordPatch ?? {})) {
      if (value === null) delete record[key];
      else record[key] = value;
    }
    records.push({ file: "src/domains/packs/catalogueUs.ts", record: record as unknown as RegulatoryInstrument });
  }
  return { ...EMPTY, records, ...c.input };
}

describe("lintCitations fixtures", () => {
  it("covers the thirteen issue fixtures", () => {
    expect(fixture.cases).toHaveLength(13);
  });

  it.each(fixture.cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const findings = lintCitations(buildInput(c));
    const got = findings.map((f) => ({ rule: f.rule, zeroTolerance: f.zeroTolerance }));
    expect(got).toEqual(c.expect);
    for (const f of findings) {
      expect(f.file).toMatch(/\S/);
      expect(f.location).toMatch(/\S/);
      expect(f.message).toMatch(/\S/);
    }
  });

  it("names the replacement when a citation is superseded", () => {
    const c = fixture.cases.find((row) => row.name.startsWith("SR 11-7 reference"))!;
    const [finding] = lintCitations(buildInput(c));
    expect(finding.message).toContain("SR 11-7");
    expect(finding.message).toContain("SR 26-2");
  });

  it("suggests the registered id for a near-miss pack reference", () => {
    const c = fixture.cases.find((row) => row.name.includes("pii_detection_leakage"))!;
    const [finding] = lintCitations(buildInput(c));
    expect(finding.message).toContain('"pii_detection_leakage"');
    expect(finding.message).toContain('"pii-detection-leakage"');
  });

  it("accepts a related.packs entry that matches after ignoring case, - and _", () => {
    const findings = lintCitations({
      ...EMPTY,
      knownPackIds: ["sandboxBoundary", "compoundThreat"],
      packRefs: [
        { file: "f", location: "related.packs", id: "sandbox_boundary", match: "normalized" },
        { file: "f", location: "related.packs", id: "compound_threats", match: "normalized" },
      ],
    });
    expect(findings.map((f) => f.message)).toEqual([expect.stringContaining('"compound_threats"')]);
  });

  it("flags a citation that must resolve but matches no catalogue record", () => {
    const findings = lintCitations({
      ...EMPTY,
      textRefs: [{ file: "src/domains/domainRegistry.ts", location: "wealth regulatoryBasis", text: "Unknown Act 1999", mustResolve: true }],
    });
    expect(findings).toEqual([expect.objectContaining({ rule: "CIT004", zeroTolerance: false })]);
  });
});

describe("shared official host list", () => {
  it("contains every register host and every pack-catalogue host", () => {
    const shared = new Set<string>(SHARED_OFFICIAL_HOSTS);
    expect(REGULATORY_REGISTER.policy.officialHosts.filter((h) => !shared.has(h))).toEqual([]);
    for (const host of ["govinfo.gov", "w3.org", "consort-spirit.org", "federalreserve.gov", "whitehouse.gov", "eeoc.gov"]) {
      expect(shared.has(host)).toBe(true);
    }
  });

  it("is the list the pack catalogue validates against", () => {
    expect(OFFICIAL_SOURCE_HOSTS).toBe(SHARED_OFFICIAL_HOSTS);
  });
});

describe("framework reference tables", () => {
  it("records where each filled table came from", () => {
    for (const table of [FRAMEWORK_REFERENCE_TABLES.nistAiRmf, FRAMEWORK_REFERENCE_TABLES.atlas]) {
      expect(table.source?.url).toMatch(/^https:\/\//);
      expect(table.source?.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(table.source?.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(table.entries.length).toBeGreaterThan(0);
    }
    expect(FRAMEWORK_REFERENCE_TABLES.nistAiRmf.entries).toHaveLength(72);
    expect(FRAMEWORK_REFERENCE_TABLES.iso42001AnnexA.entries).toEqual([]);
  });
});
