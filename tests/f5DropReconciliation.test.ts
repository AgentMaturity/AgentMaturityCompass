import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { getPackById, listIndustryPacks, type IndustryPackQuestion } from "../src/domains/industryPacks.js";

/**
 * P1-42: the round-2 candidate content removed all 30 questions F5 proposed to drop. Landing it must keep
 * exactly the ones P0-26 did not confirm as a drop, restored byte for byte from main with P0-24's corrections
 * (tests/fixtures/f5-restored-questions.json), and remove exactly the confirmed drops.
 */
interface Decision { id: string; decision: "keep" | "drop" | "defer" }
const readJson = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(process.cwd(), ...parts), "utf8")) as T;
const decisions = readJson<{ items: Decision[] }>("docs", "program", "f5", "decisions.json").items;
const restored = readJson<{ items: Array<{ packId: string; question: IndustryPackQuestion }> }>("tests", "fixtures", "f5-restored-questions.json").items;
const registryIds = new Set(listIndustryPacks().flatMap((pack) => pack.questions.map((q) => q.id)));

describe("F5 drop reconciliation (P1-42)", () => {
  test("the present and absent ids among the 30 are exactly P0-26's keep/defer and drop sets", () => {
    const ids = decisions.map((d) => d.id);
    expect(ids).toHaveLength(30);
    expect(ids.filter((id) => registryIds.has(id)).sort())
      .toEqual(decisions.filter((d) => d.decision !== "drop").map((d) => d.id).sort());
    expect(ids.filter((id) => !registryIds.has(id)).sort())
      .toEqual(decisions.filter((d) => d.decision === "drop").map((d) => d.id).sort());
  });

  test("each kept or deferred question is main's question, with P0-24's corrections, in its own pack", () => {
    expect(restored.map((r) => r.question.id).sort()).toEqual(decisions.map((d) => d.id).sort());
    for (const { packId, question } of restored) {
      if (decisions.find((d) => d.id === question.id)!.decision === "drop") continue;
      expect(getPackById(packId)?.questions.find((q) => q.id === question.id), question.id).toEqual(question);
    }
  });
});
