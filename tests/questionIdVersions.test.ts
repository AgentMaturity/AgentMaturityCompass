import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { getPackById, listIndustryPacks, scoreIndustryPack, type IndustryPackId } from "../src/domains/industryPacks.js";

/**
 * P1-42 review: a rewrite that changes a question's dimension is a different question, so it takes a new id version
 * (docs/program/round2/question-id-versions.json). Answers stored under the old id then read not evaluated for the new
 * question instead of attaching to it silently. Every other id keeps the dimension it has on int.
 */
const readJson = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(process.cwd(), ...parts), "utf8")) as T;
const versions = readJson<{ items: Array<{ packId: string; oldId: string; newId: string; dimensionBefore: string; dimensionAfter: string }> }>(
  "docs", "program", "round2", "question-id-versions.json").items;
const intDimensions = readJson<{ items: Record<string, { packId: string; dimension: string }> }>(
  "tests", "fixtures", "industry-packs", "int-question-dimensions.json").items;
const current = new Map(listIndustryPacks().flatMap((pack) => pack.questions.map((q) => [q.id, { packId: pack.id, dimension: q.dimension }] as const)));

describe("question id versions (P1-42 review)", () => {
  test("no question keeps its int id under a different dimension", () => {
    const changed = Object.entries(intDimensions)
      .filter(([id, was]) => current.has(id) && current.get(id)!.dimension !== was.dimension)
      .map(([id, was]) => `${id}: ${was.dimension} -> ${current.get(id)!.dimension}`);
    expect(changed).toEqual([]);
  });

  test("each versioned question replaces its old id in the same pack with the recorded dimension", () => {
    expect(versions).toHaveLength(18);
    for (const v of versions) {
      expect(current.has(v.oldId), v.oldId).toBe(false);
      expect(v.newId).toBe(`${v.oldId}-v2`);
      expect(intDimensions[v.oldId], v.oldId).toEqual({ packId: v.packId, dimension: v.dimensionBefore });
      expect(current.get(v.newId), v.newId).toEqual({ packId: v.packId, dimension: v.dimensionAfter });
    }
  });

  test("answers stored under the old ids leave the new questions not evaluated", () => {
    for (const packId of new Set(versions.map((v) => v.packId))) {
      const pack = getPackById(packId)!;
      const stored = Object.fromEntries(pack.questions.map((q) => [versions.find((v) => v.newId === q.id)?.oldId ?? q.id, 3]));
      const result = scoreIndustryPack(packId as IndustryPackId, stored);
      expect(result.notEvaluatedQuestionIds.sort(), packId).toEqual(versions.filter((v) => v.packId === packId).map((v) => v.newId).sort());
      expect(result.percentage, packId).toBeNull();
    }
  });
});
