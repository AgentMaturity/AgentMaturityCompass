/**
 * The A4 full walk (2026-11-17): at Activate the form offered "Where and how will it run?" (deploymentNeeds, carried
 * from Adapt, which had no answer for it) as an empty field. What a person typed there was silently dropped by the next
 * Understand, and "How will it be deployed?" (target, which depends on it) and the answers that depend on target were
 * then reported stale. A person's own answer to a carried question now stays when the earlier stage gave it no value.
 */
import { describe, expect, test } from "vitest";
import { QUESTIONS } from "../../src/a4/spec/activate.js";
import { answerValues, askGaps, dependencyDigest, mergeCarried } from "../../src/a4/spec/aspire.js";
import type { A4Answer } from "../../src/a4/a4Schema.js";

const CARRIED = ["deploymentNeeds"];
const dependsOn = (id: string) => QUESTIONS.find((question) => question.id === id)?.dependsOn ?? [];

/** Answers as the answers route stamps them: each digest over the values given at the same time. */
function given(values: Record<string, string>, source: A4Answer["source"] = "user"): A4Answer[] {
  const map = new Map(Object.entries(values));
  return Object.entries(values).map(([questionId, value]) => ({ questionId, value, source, answeredAtRevision: 1,
    dependencyDigest: dependencyDigest(dependsOn(questionId), map) }));
}

describe("Understand's carry keeps a person's own answer when nothing is carried", () => {
  test("nothing carried from Adapt: the typed answer stays and nothing goes stale", () => {
    const merged = mergeCarried(QUESTIONS, given({ deploymentNeeds: "One office server", target: "helm", hostHint: "agents" }), CARRIED, new Map(), 2);
    expect(answerValues(merged).get("deploymentNeeds")).toBe("One office server");
    expect(askGaps(QUESTIONS, merged).stale).toEqual([]);
  });

  test("a value carried from Adapt still wins over the one typed here", () => {
    const merged = mergeCarried(QUESTIONS, given({ deploymentNeeds: "typed here", target: "helm" }), CARRIED, new Map([["deploymentNeeds", "from Adapt"]]), 2);
    expect(merged.find((answer) => answer.questionId === "deploymentNeeds")).toMatchObject({ value: "from Adapt", source: "carried" });
  });

  test("an old carried row whose value Adapt no longer has is dropped", () => {
    const merged = mergeCarried(QUESTIONS, given({ deploymentNeeds: "carried earlier" }, "carried"), CARRIED, new Map(), 2);
    expect(answerValues(merged).has("deploymentNeeds")).toBe(false);
  });
});
