import type { SteerRequestContext, SteerStage } from "./types.js";

export type SteerContextType =
  | "code"
  | "analytical"
  | "creative"
  | "conversational"
  | "adversarial";

export interface SteerContextClassification {
  contextType: SteerContextType;
  confidence: number;
  scores: Record<SteerContextType, number>;
}

export interface AutotuneProfile {
  temperature: number;
  topP: number;
  topK?: number;
  metadata: {
    strategy: "precise" | "balanced" | "creative" | "guarded";
    blended: boolean;
  };
}

export interface CreateAutotuneStageOptions {
  enforce?: boolean;
}

const CONTEXT_PATTERNS: Record<SteerContextType, RegExp[]> = {
  code: [
    /\b(code|function|typescript|javascript|python|sql|json|regex|compile|debug|refactor|class|interface)\b/i,
    /```/,
  ],
  analytical: [
    /\b(analy[sz]e|trade-?off|reason|compare|evaluate|explain|decision|step by step|why)\b/i,
  ],
  creative: [
    /\b(story|poem|creative|fantasy|sci-?fi|imagery|novel|lyric|character)\b/i,
  ],
  conversational: [
    /\b(hey|hello|help me|reply to|message|polite|chat|talk|thanks)\b/i,
  ],
  adversarial: [
    /\b(ignore previous instructions|bypass|override|disable safety|hidden prompt|jailbreak|exploit|circumvent)\b/i,
  ],
};

const PROFILE_MAP: Record<SteerContextType, AutotuneProfile> = {
  code: {
    temperature: 0.2,
    topP: 0.82,
    topK: 25,
    metadata: { strategy: "precise", blended: false },
  },
  analytical: {
    temperature: 0.4,
    topP: 0.88,
    topK: 40,
    metadata: { strategy: "precise", blended: false },
  },
  creative: {
    temperature: 1.15,
    topP: 0.96,
    topK: 80,
    metadata: { strategy: "creative", blended: false },
  },
  conversational: {
    temperature: 0.75,
    topP: 0.9,
    topK: 50,
    metadata: { strategy: "balanced", blended: false },
  },
  adversarial: {
    temperature: 0.3,
    topP: 0.78,
    topK: 20,
    metadata: { strategy: "guarded", blended: false },
  },
};

const BALANCED_PROFILE: AutotuneProfile = {
  temperature: 0.7,
  topP: 0.9,
  topK: 50,
  metadata: { strategy: "balanced", blended: false },
};

function blend(a: number, b: number, weight: number): number {
  return Number((a * weight + b * (1 - weight)).toFixed(4));
}

function readUserText(body: Record<string, unknown>): string {
  if (Array.isArray(body.messages)) {
    return body.messages
      .map((entry) => {
        if (typeof entry === "object" && entry !== null) {
          const row = entry as Record<string, unknown>;
          if (typeof row.content === "string") {
            return row.content;
          }
          if (Array.isArray(row.content)) {
            return row.content
              .map((part) => {
                if (typeof part === "object" && part !== null && typeof (part as Record<string, unknown>).text === "string") {
                  return String((part as Record<string, unknown>).text);
                }
                return "";
              })
              .join(" ");
          }
        }
        return "";
      })
      .join(" ");
  }
  if (Array.isArray(body.input)) {
    return body.input.map((entry) => JSON.stringify(entry)).join(" ");
  }
  return "";
}

export function classifySteerContext(prompt: string): SteerContextClassification {
  const scores = {
    code: 0,
    analytical: 0,
    creative: 0,
    conversational: 0,
    adversarial: 0,
  } satisfies Record<SteerContextType, number>;

  for (const [contextType, patterns] of Object.entries(CONTEXT_PATTERNS) as Array<[SteerContextType, RegExp[]]>) {
    for (const pattern of patterns) {
      if (pattern.test(prompt)) {
        scores[contextType] += 1;
      }
    }
  }

  let contextType: SteerContextType = "conversational";
  let bestScore = -1;
  for (const [candidate, score] of Object.entries(scores) as Array<[SteerContextType, number]>) {
    if (score > bestScore) {
      contextType = candidate;
      bestScore = score;
    }
  }

  const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const confidence = total === 0 ? 0.2 : Math.max(0.2, bestScore / total);
  return { contextType, confidence, scores };
}

export function getAutotuneProfile(
  contextType: SteerContextType,
  confidence: number
): AutotuneProfile {
  const base = PROFILE_MAP[contextType];
  if (confidence >= 0.6) {
    return { ...base, metadata: { ...base.metadata, blended: false } };
  }
  const weight = confidence / 0.6;
  return {
    temperature: blend(base.temperature, BALANCED_PROFILE.temperature, weight),
    topP: blend(base.topP, BALANCED_PROFILE.topP, weight),
    topK: Math.round(blend(base.topK ?? 50, BALANCED_PROFILE.topK ?? 50, weight)),
    metadata: { strategy: BALANCED_PROFILE.metadata.strategy, blended: true },
  };
}

function parseJsonBody(init: RequestInit): Record<string, unknown> | null {
  if (typeof init.body !== "string") {
    return null;
  }
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function serializeBody(body: Record<string, unknown>, init: RequestInit): RequestInit {
  return {
    ...init,
    body: JSON.stringify(body),
  };
}

function applyOpenAIProfile(body: Record<string, unknown>, profile: AutotuneProfile, enforce: boolean): Record<string, unknown> {
  const next = { ...body };
  if (enforce || next.temperature === undefined) {
    next.temperature = profile.temperature;
  }
  if (enforce || next.top_p === undefined) {
    next.top_p = profile.topP;
  }
  return next;
}

function applyAnthropicProfile(body: Record<string, unknown>, profile: AutotuneProfile, enforce: boolean): Record<string, unknown> {
  const next = { ...body };
  if (enforce || next.temperature === undefined) {
    next.temperature = profile.temperature;
  }
  if (enforce || next.top_p === undefined) {
    next.top_p = profile.topP;
  }
  return next;
}

export function createAutotuneStage(options: CreateAutotuneStageOptions = {}): SteerStage {
  const enforce = options.enforce !== false;
  return {
    id: "autotune",
    enabled: true,
    onRequest(context: SteerRequestContext): SteerRequestContext {
      const body = parseJsonBody(context.init);
      if (!body) {
        return context;
      }
      const prompt = readUserText(body);
      const classification = classifySteerContext(prompt);
      const profile = getAutotuneProfile(classification.contextType, classification.confidence);

      let nextBody = body;
      if (context.providerId === "openai") {
        nextBody = applyOpenAIProfile(body, profile, enforce);
      } else if (context.providerId === "anthropic") {
        nextBody = applyAnthropicProfile(body, profile, enforce);
      } else {
        return {
          ...context,
          metadata: {
            ...context.metadata,
            autotune: {
              contextType: classification.contextType,
              confidence: classification.confidence,
              mode: enforce ? "enforce" : "observe",
              profile,
              skipped: true,
            },
          },
        };
      }

      return {
        ...context,
        init: serializeBody(nextBody, context.init),
        metadata: {
          ...context.metadata,
          autotune: {
            contextType: classification.contextType,
            confidence: classification.confidence,
            mode: enforce ? "enforce" : "observe",
            profile,
          },
        },
      };
    },
  };
}
