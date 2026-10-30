/**
 * What the stage producers share (src/a4/stages/<stage>.ts, and the stage modules beside them such as assembleBuild.ts
 * and adaptPolicy.ts): the refusal they throw, a workspace-relative ref path, a fact reader that records an error's code
 * instead of the fact, Explain's step result and the refusal of a step that builds on a stale Understand.
 */
import { relative, sep } from "node:path";
import { explain, type A4ExplainFact, type A4ExplainLevel } from "../a4Explain.js";
import type { A4ProducerResult } from "../a4RouterStages.js";
import type { A4Answer, A4Stage } from "../a4Schema.js";
import { A4StoreError } from "../a4Store.js";
import { errorCodeOf } from "../aspireUnderstand.js";
import { understandingCurrent } from "../spec/aspire.js";

export const fail = (status: number, code: string, message: string, detail?: unknown): A4StoreError => new A4StoreError(status, code, message, detail);
export const relPath = (workspace: string, path: string): string => relative(workspace, path).split(sep).join("/");

/** One reader's answer, or the error's code: a fact that cannot be read is recorded as such, never as "fine". */
export function attempt<T>(read: () => T): T | { error: string } {
  try {
    return read();
  } catch (error) {
    return { error: errorCodeOf(error, "UNREADABLE") };
  }
}

/** Explain and Propose build on Understand's facts: 409 UNDERSTANDING_STALE unless Understand ran on these answers. */
export function assertUnderstood(spec: Record<string, unknown>, answers: readonly A4Answer[]): void {
  if (!understandingCurrent(spec, answers)) {
    throw fail(409, "A4_NOT_READY", "Understand has not run on the current answers; run Understand again, then confirm it.", { reasonCodes: ["UNDERSTANDING_STALE"] });
  }
}

/** Explain's result at `stage`: the facts rendered at `level` (one recommendation output), and the facts kept on the spec for every level. */
export function explanationResult(stage: A4Stage, spec: Record<string, unknown>, facts: readonly A4ExplainFact[], level: A4ExplainLevel): A4ProducerResult {
  const items = explain(facts, level);
  return { outputs: [{ output: "explanation", label: `${stage} explain at the ${level} level`, lane: "recommendation", method: null, body: { level, items } }],
    spec: { ...spec, explanation: { level, facts } }, response: { explanation: { level, items } } };
}
