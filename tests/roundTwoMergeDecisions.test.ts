import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { getPackById, listIndustryPacks, type IndustryPackQuestion } from "../src/domains/industryPacks.js";

/**
 * P1-42 review: round 2 merged 47 int questions into others with no target in any commit. Sid's rule: no content
 * leaves before he confirms. Each stays exactly as on main while its decision is defer or keep; only a merge Sid
 * reviewed may remove it, and then its proposed target must exist.
 */
interface Item { id: string; packId: string; proposedInto: string; decision: "defer" | "keep" | "merge" }
const readJson = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(process.cwd(), ...parts), "utf8")) as T;
const decisions = readJson<{ reviewedBy: string | null; reviewedAt: string | null; items: Item[] }>("docs", "program", "round2", "merge-decisions.json");
const kept = readJson<{ items: Array<{ packId: string; question: IndustryPackQuestion }> }>("tests", "fixtures", "round2-merge-kept-questions.json").items;
const registry = new Map(listIndustryPacks().flatMap((pack) => pack.questions.map((q) => [q.id, pack.id] as const)));

describe("round-2 merge decisions (P1-42 review)", () => {
  test("47 proposed merges, each with a target and a decision", () => {
    expect(decisions.items).toHaveLength(47);
    expect(new Set(decisions.items.map((i) => i.id)).size).toBe(47);
    for (const item of decisions.items) {
      expect(["defer", "keep", "merge"], item.id).toContain(item.decision);
      expect(item.proposedInto, item.id).toMatch(/^[A-Z]+-[A-Z0-9]+-\d+$/);
    }
    expect(kept.map((k) => k.question.id).sort()).toEqual(decisions.items.map((i) => i.id).sort());
  });

  test("a merge is applied only with Sid's logged review, and its target then exists in the same pack", () => {
    for (const item of decisions.items.filter((i) => i.decision === "merge")) {
      expect(decisions.reviewedBy, item.id).toBe("Sid");
      expect(decisions.reviewedAt, item.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(registry.get(item.proposedInto), `${item.id} -> ${item.proposedInto}`).toBe(item.packId);
    }
  });

  test("every question not merged by Sid is in its pack exactly as on main", () => {
    for (const { packId, question } of kept) {
      const decision = decisions.items.find((i) => i.id === question.id)!.decision;
      const found = getPackById(packId)?.questions.find((q) => q.id === question.id);
      if (decision === "merge") expect(found, question.id).toBeUndefined();
      else expect(found, question.id).toEqual(question);
    }
  });
});
