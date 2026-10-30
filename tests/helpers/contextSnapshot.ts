import { expect } from "vitest";
import { isContextSnapshot } from "../../src/prompt/assembly/interpolate.js";

/**
 * GAP-WP39: every native surface appends the runtime-context snapshot (instruction files, time) after the user's own
 * input on each step. Asserts it is there, last, and returns the user's input parts for an exact comparison.
 */
export function withoutContextSnapshot<T>(parts: readonly T[]): T[] {
  const last = parts.at(-1) as { text?: unknown } | undefined;
  expect(typeof last?.text === "string" && isContextSnapshot(last.text), "the runtime-context snapshot follows the user's input").toBe(true);
  return parts.slice(0, -1);
}
