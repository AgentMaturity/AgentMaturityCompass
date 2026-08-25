/**
 * The reference context plugin: what time it is, sampled at the step boundary.
 *
 * WHY A CLOCK IS THE REFERENCE PLUGIN. It is the smallest contribution that
 * exercises every property the contract has to have, and it is the one where
 * getting them wrong is most obvious. A clock is the reason context exists at
 * all: a model cannot know the time, and a time baked into the SYSTEM PROMPT
 * would be wrong within a second and would invalidate the prompt (and the
 * provider's cache of it) at every step. So the clock is a context — a durable,
 * superseded snapshot in history — and never a section.
 *
 * ELAPSED TIME IS THE PART THAT EARNS ITS TOKENS. A bare timestamp tells a model
 * little; "it has been 40 minutes since the last message" tells it that the
 * human walked away, that a build it started has had time to finish, that a
 * cached fact may be stale. dsh's time-context reports the same gap, and it is
 * kept for the same reason.
 *
 * THE CLOCK IS INJECTED. `now` is a parameter, not `Date.now()` reached for at
 * the point of use, because this text is committed to a signed event and a test
 * that cannot pin it can only assert that SOMETHING was written. Production
 * leaves it out.
 *
 * AN INVALID ZONE FAILS AT CONSTRUCTION. `Intl.DateTimeFormat` accepts a zone or
 * throws, and it throws where the deployment can still be named — at composition
 * — rather than at the first step of a real turn. A zone that fell back to UTC
 * on a typo would put a confidently wrong time in front of the model forever.
 */
import { TIME_CONTEXT, TIME_CONTEXT_ORDER, type ContextCollectInput, type ContextPlugin } from "./contextTypes.js";

/** The fields the durable reading is built from. */
type TimestampPart = "day" | "hour" | "minute" | "month" | "second" | "timeZoneName" | "year";

export interface TimeContextOptions {
  /** Epoch milliseconds. Injected so a test can pin what the signed row says. */
  readonly now?: () => number;
  /** IANA zone for the displayed reading. Defaults to the process zone. */
  readonly timeZone?: string;
  /**
   * The last model-visible moment, for the elapsed reading.
   *
   * Supplied by the caller because the plugin has no view of the session log —
   * the loop does. Returning `undefined` (nothing has been said yet, or the
   * caller does not track it) renders "unavailable", which is honest; rendering
   * a zero would claim a measurement nobody took.
   */
  readonly previousMessageAt?: (input: ContextCollectInput) => number | undefined;
}

/**
 * The exact formatter durable readings use.
 *
 * `hourCycle: "h23"` and 2-digit fields keep the shape stable across locales,
 * and `longOffset` carries the UTC offset so the reading is unambiguous even if
 * the zone label means nothing to the reader.
 */
function createTimestampFormatter(timeZone?: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    ...(timeZone === undefined ? {} : { timeZone }),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset"
  });
}

/** An ISO-shaped local time with its offset and the zone that produced it. */
function formatTimestamp(now: number, formatter: Intl.DateTimeFormat, timeZone: string): string {
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value])
  ) as Record<TimestampPart, string>;
  // "GMT" alone means a zero offset; every other value is "GMT±HH:MM".
  const offset = parts.timeZoneName.replace(/^GMT$/, "GMT+00:00").slice(3);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}[${timeZone}]`;
}

/** Whole-second units, largest first, with seconds always present. */
export function formatElapsed(elapsedMs: number): string {
  let seconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  const days = Math.floor(seconds / 86_400);
  seconds %= 86_400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

/**
 * The clock plugin.
 *
 * @param options - clock, display zone, and the optional elapsed-time source.
 * @returns a plugin registrable on a {@link import("./contextHost.js").ContextPluginHost}.
 * @throws Error when `timeZone` is not a zone `Intl` can resolve.
 */
export function createTimeContextPlugin(options: TimeContextOptions = {}): ContextPlugin {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = createTimestampFormatter(options.timeZone);
  } catch (error: unknown) {
    const message =
      options.timeZone === undefined
        ? "time context: the system time zone could not be resolved"
        : `time context: invalid IANA time zone ${JSON.stringify(options.timeZone)}`;
    throw new Error(message, { cause: error });
  }
  const timeZone = formatter.resolvedOptions().timeZone;
  const now = options.now ?? ((): number => Date.now());

  return {
    name: TIME_CONTEXT,
    order: TIME_CONTEXT_ORDER,
    collect(input: ContextCollectInput): Promise<string> {
      const sampled = now();
      const previous = options.previousMessageAt?.(input);
      const elapsed =
        previous === undefined ? "unavailable" : formatElapsed(sampled - previous);
      return Promise.resolve(
        `Time sampled while preparing turn ${input.turn}, step ${input.step}: ` +
          `${formatTimestamp(sampled, formatter, timeZone)}\n` +
          `Elapsed since the preceding model-visible message: ${elapsed}.`
      );
    }
  };
}
