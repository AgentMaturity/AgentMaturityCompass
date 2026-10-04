import { describe, expect, test } from "vitest";
import { getIndustryPacksByStation } from "../src/domains/industryPacks.js";
import { getDeepQuestionsByStation } from "../src/domains/deepIndustryPacks.js";
import {
  PACK_QUESTION_FLOOR,
  resolveRegulatoryInstrument,
  resolveRegulatoryRefParts,
  validatePackRegulatoryCurrency,
} from "../src/domains/packs/regulatorySchema.js";

/** Governance station, round-2 content (2026-10-04): round2/content/governance + Fable review.json. */
const packs = getIndustryPacksByStation("governance");
const questions = packs.flatMap((p) => p.questions.map((q) => ({ pack: p.id, ...q })));
const AS_OF = new Date("2026-10-04T00:00:00Z");

describe("governance station packs (round 2)", () => {
  test("five packs, each at or above the question floor and passing the currency validator", () => {
    expect(packs.map((p) => p.id).sort()).toEqual(
      ["citizen-services", "dance-of-democracy", "digital-citizens-rights", "petition-to-law", "public-private-collaboration"],
    );
    for (const pack of packs) {
      expect(pack.questions.length, pack.id).toBeGreaterThanOrEqual(PACK_QUESTION_FLOOR);
      expect(validatePackRegulatoryCurrency(pack, AS_OF), pack.id).toEqual([]);
    }
  });

  test("merged and dropped questions are gone", () => {
    const gone = [
      "GOV-DCR-1", "GOV-DCR-13", "GOV-DCR-14", "GOV-DD-2", "GOV-DD-3", "GOV-DD-5", "GOV-DD-9", "GOV-DD-15",
      "GOV-PL-2", "GOV-PL-3", "GOV-PL-14", "GOV-CS-12", "GOV-PPC-2", "GOV-PPC-5", "GOV-PPC-12", "GOV-PPC-15",
    ];
    const ids = new Set(questions.map((q) => q.id));
    expect(gone.filter((id) => ids.has(id))).toEqual([]);
  });

  test("known mis-citations are corrected", () => {
    const all = questions.map((q) => `${q.id}: ${q.text} | ${q.regulatoryRef}`);
    const offending = (re: RegExp) => all.filter((line) => re.test(line));
    expect(offending(/eIDAS[^|]*Art(?:icle|\.)\s*6a/i), "eIDAS has no Art. 6a; the wallet is Art. 5a").toEqual([]);
    expect(offending(/Annex III §8/), "identity and benefits are Annex III points 1(a)/5(a), not 8").toEqual([]);
    expect(offending(/5\(1\)\(d\)/), "social scoring is Art. 5(1)(c)").toEqual([]);
    expect(offending(/2003\/98/), "Directive 2003/98/EC is repealed").toEqual([]);
    expect(offending(/Code of Practice on Disinformation 2022|G20|CISA Election Security|Liability Directive/)).toEqual([]);
    expect(offending(/§1194\.22/), "36 CFR 1194.22 no longer exists").toEqual([]);
    for (const pack of packs) {
      expect(pack.regulatoryBasis.join(" "), pack.id).not.toMatch(/Annex III §8|2003\/98|G20|Venice Commission/);
    }
  });

  test("weights sit on the 8-15 scale and every Art. 5 prohibition question weighs 15", () => {
    for (const q of questions) {
      expect(q.weight, q.id).toBeGreaterThanOrEqual(8);
      expect(q.weight, q.id).toBeLessThanOrEqual(15);
      if (/^EU AI Act Art\. 5\(1\)/.test(q.regulatoryRef)) expect(q.weight, q.id).toBe(15);
    }
  });

  test("no regulatoryRef part dangles: ';' separates instruments, never points of one instrument", () => {
    const dangling = questions.flatMap((q) =>
      resolveRegulatoryRefParts(q.regulatoryRef).filter((p) => /^(Art\.|assurance level)/.test(p.part)).map((p) => `${q.id}: ${p.part}`),
    );
    expect(dangling).toEqual([]);
  });

  test("instruments added for this station resolve to sourced catalogue entries", () => {
    for (const text of [
      "NIST SP 800-63B-4", "52 U.S.C. 30124", "HAVA 52 U.S.C. §21081", "FEC interpretive rule 89 FR 78785",
      "Code of Conduct on Disinformation (DSA framework, 2025)", "Code of Practice on Transparency of AI-generated Content",
    ]) {
      const inst = resolveRegulatoryInstrument(text);
      expect(inst, text).toBeDefined();
      expect(inst!.status, text).toBe("in-force");
      expect(inst!.retrievedAt, text).toBe("2026-10-04");
    }
  });
});

describe("governance deep questions (round 2)", () => {
  const deep = getDeepQuestionsByStation("governance");
  const ROUND2 = ["gov-deep-51", "gov-deep-52", "gov-deep-53", "gov-deep-54", "gov-deep-55", "gov-deep-56"];

  test("continue the gov-deep numbering, each with a verified source read on 2026-10-04", () => {
    for (const id of ROUND2) {
      const q = deep.find((d) => d.id === id);
      expect(q, id).toBeDefined();
      expect(q!.source.verified, id).toBe(true);
      expect(q!.source.retrievedAt, id).toBe("2026-10-04");
      expect(q!.packIds?.length, id).toBeGreaterThan(0);
    }
  });
});
