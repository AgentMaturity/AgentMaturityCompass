import { describe, expect, test } from "vitest";
import * as environment from "../src/domains/packs/stations/environment.js";
import type { IndustryPack } from "../src/domains/industryPacks.js";
import { PACK_QUESTION_FLOOR, resolveRegulatoryRefParts } from "../src/domains/packs/regulatorySchema.js";

/**
 * Round-2 content rules for the environment station
 * (AMC_OS/RESEARCH/2026-10-03-regulated-platform-program/apply/environment/).
 */
const packs = Object.values(environment) as IndustryPack[];

/** Level wording that cannot be decided from evidence. */
const ASPIRATIONAL = /\b(autonomous(ly)?|predict(ive|s|ion)?|cryptographic(ally)?|blockchain|AI-powered|self-evolving|fully automated|immutable|sub-second)\b/i;
/** "Self-evolving behaviour" is the Machinery Regulation (EU) 2023/1230 Annex III term ENV-MM-10 asks about. */
const ASPIRATIONAL_ALLOWED = new Set(["ENV-MM-10"]);

describe("environment station packs (round-2 content)", () => {
  test("six packs, each at or above the question floor", () => {
    expect(packs.map((p) => p.id).sort()).toEqual(
      ["farm-to-fork", "material-to-machines", "sip-to-sanitation", "source-to-sustenance", "ubiquity-to-utility", "weave-to-wear"]
    );
    for (const pack of packs) expect(pack.questions.length, pack.id).toBeGreaterThanOrEqual(PACK_QUESTION_FLOOR);
  });

  test("every question scores a single instrument", () => {
    const compound = packs.flatMap((p) => p.questions).filter((q) => resolveRegulatoryRefParts(q.regulatoryRef).length !== 1);
    expect(compound.map((q) => `${q.id}: ${q.regulatoryRef}`)).toEqual([]);
  });

  test("level wording is decidable from evidence", () => {
    const vague = packs
      .flatMap((p) => p.questions)
      .filter((q) => !ASPIRATIONAL_ALLOWED.has(q.id) && [q.l1, q.l3, q.l5].some((l) => ASPIRATIONAL.test(l)));
    expect(vague.map((q) => q.id)).toEqual([]);
  });

  test("ids are unique, prefixed per pack, and weights stay in the 8-15 band", () => {
    const ids = packs.flatMap((p) => p.questions.map((q) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const pack of packs) {
      const prefix = pack.questions[0]!.id.replace(/\d+$/, "");
      for (const q of pack.questions) {
        expect(q.id.startsWith(prefix), q.id).toBe(true);
        expect(q.weight, q.id).toBeGreaterThanOrEqual(8);
        expect(q.weight, q.id).toBeLessThanOrEqual(15);
      }
    }
  });

  test("merged and dropped questions are gone; retired citations do not return", () => {
    const ids = new Set(packs.flatMap((p) => p.questions.map((q) => q.id)));
    for (const gone of ["ENV-FF-2", "ENV-WW-13", "ENV-SS-5", "ENV-SS-14", "ENV-SS-15", "ENV-UU-15", "ENV-STS-4"]) {
      expect(ids.has(gone), gone).toBe(false);
    }
    const refs = packs.flatMap((p) => p.questions.map((q) => `${q.id} ${q.regulatoryRef}`)).join("\n");
    expect(refs).not.toMatch(/Order 887|CIP-013-1|CAC\/RCP 1-1969|Farm to Fork Strategy|Rev\. CoP19|91\/271\/EEC Art/);
  });
});
