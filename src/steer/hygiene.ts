/**
 * STM v2 — Generic Response Hygiene (AMC-426)
 *
 * Composable text transforms that strip filler from LLM responses:
 * - Hedge stripping: removes "I think", "Basically,", "It's worth noting", etc.
 * - Preamble stripping: removes "Sure! Here is…", "Of course!", "Great question!" openers
 * - Direct mode: applies both in sequence
 *
 * Integrates as a SteerStage for the runtime pipeline (AMC-421).
 */

import type { SteerStage, SteerResponseContext } from "./types.js";

// ── Hedge patterns ─────────────────────────────────────────────────────────

const HEDGE_PATTERNS: Array<[RegExp, string]> = [
  [/\bI think\b\s*/gi, ""],
  [/\bI believe\b\s*/gi, ""],
  [/\bI would say\b\s*/gi, ""],
  [/\bIt's important to note that\b\s*/gi, ""],
  [/\bIt's worth mentioning that\b\s*/gi, ""],
  [/\bIt's worth noting that\b\s*/gi, ""],
  [/\bIt should be noted that\b\s*/gi, ""],
  [/\bBasically,?\s*/gi, ""],
  [/\bActually,?\s*/gi, ""],
  [/\bEssentially,?\s*/gi, ""],
  [/\bIn my opinion,?\s*/gi, ""],
  [/\bAs far as I know,?\s*/gi, ""],
  [/\bTo be honest,?\s*/gi, ""],
  [/\bQuite frankly,?\s*/gi, ""],
  [/\bIf I'm being honest,?\s*/gi, ""],
  [/\bAs a matter of fact,?\s*/gi, ""],
];

// ── Preamble patterns ──────────────────────────────────────────────────────

const PREAMBLE_PATTERNS: RegExp[] = [
  /^Sure[!.,]?\s*(?:Here (?:is|are)[^:\n]*[:.!]?\s*)?(?:I'd be happy to help[.!]?\s*)?/i,
  /^Of course[!.,]?\s*(?:I'd be happy to help[.!]?\s*)?/i,
  /^Absolutely[!.,]?\s*(?:I'd be happy to help[.!]?\s*)?/i,
  /^Great question[!.,]?\s*/i,
  /^Good question[!.,]?\s*/i,
  /^That's a great question[!.,]?\s*/i,
  /^Certainly[!.,]?\s*(?:I'd be happy to help[.!]?\s*)?/i,
  /^Glad you asked[!.,]?\s*/i,
  /^Thanks for asking[!.,]?\s*/i,
  /^Happy to help[!.,]?\s*/i,
  /^I'd be happy to help[!.,]?\s*(?:with that[.!]?\s*)?/i,
  /^No problem[!.,]?\s*/i,
];

// ── Core transforms ────────────────────────────────────────────────────────

/**
 * Remove hedging language from text.
 */
export function stripHedges(text: string): string {
  let result = text;
  for (const [pattern, replacement] of HEDGE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  // Clean up double spaces left behind
  result = result.replace(/ {2,}/g, " ").trim();
  // Capitalize first letter of each sentence that may have lost its capital
  result = result.replace(/(?:^|[.!?]\s+)([a-z])/g, (match) => match.toUpperCase());
  return result;
}

/**
 * Remove filler preambles ("Sure! Here is…", "Of course!", etc.).
 * Strips the preamble line(s) and any blank lines immediately after.
 */
export function stripPreamble(text: string): string {
  let result = text;
  // Try each preamble pattern
  for (const pattern of PREAMBLE_PATTERNS) {
    result = result.replace(pattern, "");
  }
  // Strip leading blank lines that remain after preamble removal
  result = result.replace(/^\s*\n+/, "");
  return result.trim() || text;
}

/**
 * Direct mode: preamble strip first, then hedge strip.
 */
export function directMode(text: string): string {
  return stripHedges(stripPreamble(text));
}

// ── Steer stage integration ────────────────────────────────────────────────

export interface HygieneOptions {
  hedges?: boolean;
  preamble?: boolean;
}

function transformText(text: string, options: HygieneOptions): string {
  let result = text;
  if (options.preamble) {
    result = stripPreamble(result);
  }
  if (options.hedges) {
    result = stripHedges(result);
  }
  return result;
}

async function transformResponseBody(
  response: Response,
  options: HygieneOptions,
): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return response;
  }

  const body = (await response.json()) as Record<string, unknown>;

  // OpenAI format: choices[].message.content
  if (Array.isArray(body.choices)) {
    for (const choice of body.choices as Array<Record<string, unknown>>) {
      const message = choice.message as
        | Record<string, unknown>
        | undefined;
      if (message && typeof message.content === "string") {
        message.content = transformText(message.content, options);
      }
    }
  }

  // Anthropic format: content[].text
  if (Array.isArray(body.content)) {
    for (const block of body.content as Array<Record<string, unknown>>) {
      if (block.type === "text" && typeof block.text === "string") {
        block.text = transformText(block.text, options);
      }
    }
  }

  return new Response(JSON.stringify(body), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Create a SteerStage that applies response hygiene transforms.
 */
export function createHygieneStage(options: HygieneOptions): SteerStage {
  return {
    id: "stm-hygiene",
    enabled: true,
    onResponse: async (
      context: SteerResponseContext,
    ): Promise<SteerResponseContext> => {
      if (!options.hedges && !options.preamble) {
        return context;
      }
      const transformed = await transformResponseBody(
        context.response,
        options,
      );
      return { ...context, response: transformed };
    },
  };
}
