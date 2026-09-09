/** Runtime limits for one delegation, including its continued turns. */
export type SubagentStopConditionsResult =
  | {
      readonly ok: true;
      readonly conditions: readonly string[];
      /** Initial executor invocation plus accepted continuation invocations. */
      readonly maxTurns?: number;
      /** One lifetime from announcement, including time idle between turns. */
      readonly timeoutMs?: number;
    }
  | { readonly ok: false; readonly reason: string };

/** Node timers cannot represent a larger delay without overflowing to 1ms. */
export const MAX_SUBAGENT_TIMEOUT_MS = 2_147_483_647;

/**
 * Parse, validate and snapshot the exact strings that will be signed. No I/O.
 * Omitted/empty means no additional bound; prose is never treated as policy.
 */
export function parseSubagentStopConditions(
  conditions: readonly string[] | undefined
): SubagentStopConditionsResult {
  if (conditions !== undefined && !Array.isArray(conditions)) {
    return { ok: false, reason: "stopConditions must be an array of max-turns:N or timeout-ms:N conditions" };
  }
  const snapshot = [...(conditions ?? [])];
  let maxTurns: number | undefined;
  let timeoutMs: number | undefined;
  for (const condition of snapshot) {
    const match = typeof condition === "string" ? /^(max-turns|timeout-ms):([1-9][0-9]*)$/.exec(condition) : null;
    if (match === null || match[0] !== condition) {
      return { ok: false, reason: "invalid stop condition; expected max-turns:N or timeout-ms:N with a positive canonical decimal integer" };
    }
    const value = Number(match[2]);
    if (!Number.isSafeInteger(value)) {
      return { ok: false, reason: `invalid ${match[1]} stop condition: value must be a positive safe integer` };
    }
    if (match[1] === "max-turns") {
      if (maxTurns !== undefined) return { ok: false, reason: "duplicate max-turns stop condition" };
      maxTurns = value;
    } else {
      if (timeoutMs !== undefined) return { ok: false, reason: "duplicate timeout-ms stop condition" };
      if (value > MAX_SUBAGENT_TIMEOUT_MS) {
        return { ok: false, reason: `timeout-ms stop condition exceeds the ${MAX_SUBAGENT_TIMEOUT_MS}ms timer limit` };
      }
      timeoutMs = value;
    }
  }
  return Object.freeze({ ok: true, conditions: Object.freeze(snapshot),
    ...(maxTurns === undefined ? {} : { maxTurns }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }) });
}
