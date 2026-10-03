import { describe, expect, test } from "vitest";
import { listIndustryPacks, type IndustryPack } from "../src/domains/industryPacks.js";
import {
  PACK_QUESTION_FLOOR,
  normalizeComplianceFrameworkLabel,
  resolveRegulatoryInstrument,
  resolveRegulatoryRefParts,
  validatePackRegulatoryCurrency,
  validateRegulatoryInstrument,
  type RegulatoryInstrument,
} from "../src/domains/industryPackRegulatorySchema.js";
import { REGULATORY_CATALOGUE } from "../src/domains/packs/regulatoryCatalogue.js";

const packs = listIndustryPacks();
const AS_OF = new Date("2026-10-03T00:00:00Z");

describe("industry pack regulatory currency", () => {
  test("every pack passes the regulatory-currency validator", () => {
    const errors = packs.flatMap((pack) => validatePackRegulatoryCurrency(pack, new Date()));
    expect(errors).toEqual([]);
  });

  test("every pack records a lastReviewed date from the October 2026 refresh", () => {
    for (const pack of packs) {
      expect(pack.lastReviewed, pack.id).toMatch(/^2026-10-0\d$/);
    }
  });

  test("every catalogued instrument is valid: a source url or status unverified", () => {
    const errors = REGULATORY_CATALOGUE.flatMap((inst) => validateRegulatoryInstrument(inst, new Date()));
    expect(errors).toEqual([]);
    for (const inst of REGULATORY_CATALOGUE) {
      expect(inst.status === "unverified" || Boolean(inst.url), inst.id).toBe(true);
    }
    const ids = REGULATORY_CATALOGUE.map((inst) => inst.id);
    expect(new Set(ids).size).toBe(ids.length);
    const unverifiedCount = REGULATORY_CATALOGUE.filter((inst) => inst.status === "unverified").length;
    process.stdout.write(`instruments=${ids.length} sourced=${ids.length - unverifiedCount} unverified=${unverifiedCount}\n`);
  });

  test("every regulatory reference attached to a pack carries currency", () => {
    for (const pack of packs) {
      expect(pack.regulatoryReferences, pack.id).toHaveLength(pack.regulatoryBasis.length);
      for (const ref of pack.regulatoryReferences ?? []) {
        expect(ref.instrumentId, `${pack.id}: ${ref.text}`).not.toBeNull();
        expect(ref.status === "unverified" || Boolean(ref.url), `${pack.id}: ${ref.text}`).toBe(true);
        expect(ref.lastReviewed, `${pack.id}: ${ref.text}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  test("every complianceFrameworks string normalizes to a built-in framework or a catalogued external one", () => {
    const labels = [...new Set(packs.flatMap((pack) => pack.complianceFrameworks))];
    const unresolved = labels.filter((label) => {
      const ref = normalizeComplianceFrameworkLabel(label);
      return ref.frameworkId === null && ref.instrumentId === null;
    });
    expect(unresolved).toEqual([]);
    const builtIn = labels.filter((label) => normalizeComplianceFrameworkLabel(label).frameworkId !== null);
    process.stdout.write(`frameworkLabels=${labels.length} builtIn=${builtIn.length} external=${labels.length - builtIn.length}\n`);
  });

  test("question regulatoryRef coverage is measured and never cites a superseded instrument", () => {
    const parts = packs.flatMap((pack) => pack.questions.flatMap((q) => resolveRegulatoryRefParts(q.regulatoryRef)));
    const resolved = parts.filter((p) => p.instrument);
    process.stdout.write(`questionRefParts=${parts.length} resolved=${resolved.length} unresolved=${parts.length - resolved.length}\n`);
    expect(resolved.filter((p) => p.instrument!.status === "superseded" || p.instrument!.status === "repealed")).toEqual([]);
  });

  test("no pack falls below the question-depth floor", () => {
    const thin = packs.filter((pack) => pack.questions.length < PACK_QUESTION_FLOOR).map((p) => `${p.id}=${p.questions.length}`);
    expect(thin).toEqual([]);
  });
});

describe("regulatory-currency validator", () => {
  const pack = (): IndustryPack => packs.find((p) => p.id === "farm-to-fork")!;
  const verified: RegulatoryInstrument = {
    id: "x", citation: "X", jurisdiction: "EU", kind: "law", status: "in-force",
    lastReviewed: "2026-10-03", url: "https://publications.europa.eu/x", retrievedAt: "2026-10-03", aliases: ["X"],
  };

  test("a pack without lastReviewed is rejected", () => {
    const { lastReviewed: _omit, ...rest } = pack();
    expect(validatePackRegulatoryCurrency(rest as IndustryPack, AS_OF).join("\n")).toMatch(/lastReviewed is missing/);
  });

  test("a stale or future lastReviewed is rejected", () => {
    expect(validatePackRegulatoryCurrency({ ...pack(), lastReviewed: "2025-01-01" }, AS_OF).join("\n")).toMatch(/review due/);
    expect(validatePackRegulatoryCurrency({ ...pack(), lastReviewed: "2027-01-01" }, AS_OF).join("\n")).toMatch(/in the future/);
  });

  test("an unknown framework label is rejected", () => {
    const errors = validatePackRegulatoryCurrency({ ...pack(), complianceFrameworks: ["Totally Made Up Framework 9000"] }, AS_OF);
    expect(errors.join("\n")).toMatch(/neither normalizes/);
  });

  test("a thin pack is rejected", () => {
    const errors = validatePackRegulatoryCurrency({ ...pack(), questions: pack().questions.slice(0, 3) }, AS_OF);
    expect(errors.join("\n")).toMatch(/below the floor/);
  });

  test("a verified status needs a source; unverified does not", () => {
    expect(validateRegulatoryInstrument(verified, AS_OF)).toEqual([]);
    expect(validateRegulatoryInstrument({ ...verified, url: undefined }, AS_OF).join("\n")).toMatch(/requires an https source url/);
    expect(validateRegulatoryInstrument({ ...verified, retrievedAt: undefined }, AS_OF).join("\n")).toMatch(/retrievedAt is missing/);
    expect(validateRegulatoryInstrument({ ...verified, status: "unverified", url: undefined, retrievedAt: undefined }, AS_OF)).toEqual([]);
    expect(validateRegulatoryInstrument({ ...verified, status: "superseded" }, AS_OF).join("\n")).toMatch(/requires supersededBy/);
  });

  test("alias resolution matches whole citations only", () => {
    expect(resolveRegulatoryInstrument("GDPR Art. 9 (sensitive data)")?.id).toBe("eu-gdpr");
    expect(resolveRegulatoryInstrument("GDPRX")).toBeUndefined();
    expect(normalizeComplianceFrameworkLabel("ISO/IEC 42001:2023").frameworkId).toBe("ISO_42001");
    expect(normalizeComplianceFrameworkLabel("HIPAA").frameworkId).toBe("HIPAA");
  });
});
