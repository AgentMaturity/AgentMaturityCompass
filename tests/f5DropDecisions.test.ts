import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { listIndustryPacks } from "../src/domains/industryPacks.js";

/**
 * P0-26: Sid's decisions on F5's 30 drop recommendations. A question may leave
 * the registry only with a logged "drop"; kept and deferred questions must stay
 * in their pack, including when P1-42 lands the candidate content that removed all 30.
 */
interface DropItem { id: string; packId: string }
interface Decision { id: string; decision: string; note: string }
interface Decisions { reviewedBy: string | null; reviewedAt: string | null; floorPolicy: string | null; items: Decision[] }

const readJson = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(process.cwd(), ...parts), "utf8")) as T;
const drops = readJson<{ items: DropItem[] }>("docs", "program", "f5", "drops.json").items;
const decisions = readJson<Decisions>("docs", "program", "f5", "decisions.json");
const packOfQuestion = new Map(listIndustryPacks().flatMap((pack) => pack.questions.map((q) => [q.id, pack.id] as const)));

describe("F5 drop decisions (P0-26)", () => {
  test("one decision for each of F5's 30 drop recommendations", () => {
    expect(new Set(drops.map((d) => d.id)).size).toBe(30);
    expect(decisions.items.map((i) => i.id).sort()).toEqual(drops.map((d) => d.id).sort());
    for (const item of decisions.items) expect(["keep", "drop", "defer"], item.id).toContain(item.decision);
  });

  test("a keep or drop exists only with Sid's logged review and floor policy", () => {
    if (decisions.items.every((i) => i.decision === "defer")) return;
    expect(decisions.reviewedBy).toBe("Sid");
    expect(decisions.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(["retire-floor", "defer-below-floor-drops"]).toContain(decisions.floorPolicy);
  });

  test("kept and deferred questions stay in their pack; only confirmed drops are gone", () => {
    for (const drop of drops) {
      const { decision } = decisions.items.find((i) => i.id === drop.id)!;
      expect(packOfQuestion.get(drop.id), `${drop.id} (${decision})`).toBe(decision === "drop" ? undefined : drop.packId);
    }
  });

  test("the latest P0-26 receipt carries the same decisions P1-42 reads", () => {
    const receipts = readdirSync(join(process.cwd(), "qualification")).filter((d) => d.endsWith("-P0-26")).sort();
    expect(receipts.length).toBeGreaterThan(0);
    expect(readJson<Decisions>("qualification", receipts.at(-1)!, "decisions.json")).toEqual(decisions);
  });
});
