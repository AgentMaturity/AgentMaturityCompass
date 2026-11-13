import { describe, expect, it } from "vitest";
import { INDUSTRY_PACKS } from "../src/domains/industryPacks.js";
import { PACK_QUESTION_DETAIL } from "../src/domains/packs/detail/index.js";
import { validatePackQuestionDetail } from "../src/domains/packInsights.js";

const FIELDS = ["l2", "l4", "evidence", "remediation", "failureMode", "keyRisk"] as const;
const BANNED = /certif|compliant|guarantee|reviewed by an expert/i;

describe("industry pack question detail", () => {
  it("has a detail file for every pack and no detail for a question that does not exist", () => {
    expect(Object.keys(PACK_QUESTION_DETAIL).sort()).toEqual(Object.keys(INDUSTRY_PACKS).sort());
    for (const [packId, detail] of Object.entries(PACK_QUESTION_DETAIL)) {
      const ids = new Set(INDUSTRY_PACKS[packId as keyof typeof INDUSTRY_PACKS].questions.map((q) => q.id));
      expect(Object.keys(detail).filter((id) => !ids.has(id)), packId).toEqual([]);
    }
  });

  for (const pack of Object.values(INDUSTRY_PACKS)) {
    it(`${pack.id}: every question carries all six detail fields, valid and specific`, () => {
      expect(validatePackQuestionDetail(pack)).toEqual([]);
      const missing = pack.questions.flatMap((q) => FIELDS.filter((field) => q[field] === undefined).map((field) => `${q.id}.${field}`));
      expect(missing).toEqual([]);
      for (const q of pack.questions) {
        const text = [q.l2, q.l4, q.remediation, q.failureMode, ...(q.evidence ?? [])].join(" ");
        expect(text, q.id).not.toMatch(BANNED);
        expect(new Set([q.l1, q.l2, q.l3, q.l4, q.l5]).size, `${q.id} levels must differ`).toBe(5);
        expect(q.evidence!.length, `${q.id} evidence`).toBeGreaterThanOrEqual(2);
      }
      // No boilerplate: a remediation or failure mode may not repeat across the pack's questions.
      for (const field of ["remediation", "failureMode"] as const) {
        const values = pack.questions.map((q) => q[field]);
        expect(new Set(values).size, `${pack.id} ${field} must be unique per question`).toBe(values.length);
      }
      // Every key risk is covered by at least one question.
      expect(pack.keyRisks.map((_, index) => index).filter((index) => !pack.questions.some((q) => q.keyRisk === index))).toEqual([]);
    });
  }
});
