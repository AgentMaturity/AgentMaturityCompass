/**
 * A4-17 (2026-11-15): Adapt asked for "catalog terms" but never listed them, and took any word. A term the catalog does not
 * know matches no record, so it compiled to nothing in silence. The terms now come from catalog/vocabulary.yaml, are
 * listed to the member, and an unknown one is refused by name.
 */
import { describe, expect, test } from "vitest";
import { answerGaps, catalogTerms } from "../../src/a4/spec/adapt.js";

const answer = (questionId: string, value: unknown, source: "user" | "carried" = "user") =>
  ({ questionId, value, source, answeredAtRevision: 1, dependencyDigest: "0".repeat(64) });

describe("Adapt's catalog terms", () => {
  test("come from the shipped vocabulary", () => {
    const terms = catalogTerms();
    expect(terms?.entityTypes).toContain("hipaa_covered_entity");
    expect(terms?.roles).toEqual(["provider", "deployer"]);
  });

  test("a term the catalog does not know is refused; known terms and unknown are taken", () => {
    const invalid = (answers: ReturnType<typeof answer>[]) => answerGaps(answers, new Map()).invalid;
    expect(invalid([answer("entityTypes", "financial_institution"), answer("dataClasses", "payment_card_data")])).toEqual(["entityTypes", "dataClasses"]);
    expect(invalid([answer("entityTypes", "bank"), answer("roles", "deployer"), answer("useCases", "unknown")])).toEqual([]);
  });

  test("markets carried from Aspire are not checked here: they are changed at Aspire", () => {
    expect(answerGaps([answer("markets", "Atlantis", "carried")], new Map()).invalid).toEqual([]);
  });
});
