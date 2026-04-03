import type { AutotuneProfile, SteerContextType } from "./autotune.js";

export interface FeedbackLoopConfig {
  alpha: number;
  minSamplesToApply: number;
  maxWeight: number;
  samplesForMaxWeight: number;
}

export interface FeedbackObservation {
  contextType: SteerContextType;
  rating: 1 | -1;
  profile: {
    temperature: number;
    topP: number;
  };
  ts: number;
}

interface FeedbackMetricBucket {
  temperatureEma: number;
  topPEma: number;
}

interface FeedbackContextBucket {
  sampleCount: number;
  positive: FeedbackMetricBucket;
  negative: FeedbackMetricBucket;
  lastUpdatedTs: number | null;
}

export interface FeedbackLoopState {
  config: FeedbackLoopConfig;
  buckets: Record<SteerContextType, FeedbackContextBucket>;
}

export interface FeedbackAdjustedAutotuneProfile extends AutotuneProfile {
  metadata: AutotuneProfile["metadata"] & {
    feedbackApplied: boolean;
    feedbackWeight: number;
  };
}

export interface FeedbackCollectionContext {
  response: Response;
  metadata: Record<string, unknown>;
}

export interface FeedbackCollectionStageOptions {
  getState: () => FeedbackLoopState;
  setState: (state: FeedbackLoopState) => void;
}

function blankMetricBucket(): FeedbackMetricBucket {
  return {
    temperatureEma: 0,
    topPEma: 0,
  };
}

function blankContextBucket(): FeedbackContextBucket {
  return {
    sampleCount: 0,
    positive: blankMetricBucket(),
    negative: blankMetricBucket(),
    lastUpdatedTs: null,
  };
}

export function defaultFeedbackLoopConfig(): FeedbackLoopConfig {
  return {
    alpha: 0.3,
    minSamplesToApply: 3,
    maxWeight: 0.5,
    samplesForMaxWeight: 20,
  };
}

export function createFeedbackLoopState(
  config: FeedbackLoopConfig = defaultFeedbackLoopConfig()
): FeedbackLoopState {
  return {
    config,
    buckets: {
      code: blankContextBucket(),
      analytical: blankContextBucket(),
      creative: blankContextBucket(),
      conversational: blankContextBucket(),
      adversarial: blankContextBucket(),
    },
  };
}

function updateEma(current: number, value: number, alpha: number): number {
  if (current === 0) {
    return value;
  }
  return Number((alpha * value + (1 - alpha) * current).toFixed(6));
}

export function applyFeedbackObservation(
  state: FeedbackLoopState,
  observation: FeedbackObservation
): FeedbackLoopState {
  const bucket = state.buckets[observation.contextType];
  const target = observation.rating > 0 ? bucket.positive : bucket.negative;
  const updatedTarget: FeedbackMetricBucket = {
    temperatureEma: updateEma(
      target.temperatureEma,
      observation.profile.temperature,
      state.config.alpha
    ),
    topPEma: updateEma(target.topPEma, observation.profile.topP, state.config.alpha),
  };

  const nextBucket: FeedbackContextBucket = {
    ...bucket,
    sampleCount: bucket.sampleCount + 1,
    lastUpdatedTs: observation.ts,
    positive: observation.rating > 0 ? updatedTarget : bucket.positive,
    negative: observation.rating < 0 ? updatedTarget : bucket.negative,
  };

  return {
    ...state,
    buckets: {
      ...state.buckets,
      [observation.contextType]: nextBucket,
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getFeedbackAdjustedProfile(
  state: FeedbackLoopState,
  contextType: SteerContextType,
  baseProfile: AutotuneProfile
): FeedbackAdjustedAutotuneProfile {
  const bucket = state.buckets[contextType];
  if (!bucket || bucket.sampleCount < state.config.minSamplesToApply) {
    return {
      ...baseProfile,
      metadata: {
        ...baseProfile.metadata,
        feedbackApplied: false,
        feedbackWeight: 0,
      },
    };
  }

  const weight = Math.min(
    state.config.maxWeight,
    (bucket.sampleCount / state.config.samplesForMaxWeight) * state.config.maxWeight
  );

  const positiveTemp = bucket.positive.temperatureEma || baseProfile.temperature;
  const negativeTemp = bucket.negative.temperatureEma || baseProfile.temperature;
  const positiveTopP = bucket.positive.topPEma || baseProfile.topP;
  const negativeTopP = bucket.negative.topPEma || baseProfile.topP;

  const adjustedTemperature = clamp(
    Number((baseProfile.temperature + weight * ((positiveTemp - baseProfile.temperature) - (negativeTemp - baseProfile.temperature))).toFixed(4)),
    0,
    2,
  );
  const adjustedTopP = clamp(
    Number((baseProfile.topP + weight * ((positiveTopP - baseProfile.topP) - (negativeTopP - baseProfile.topP))).toFixed(4)),
    0,
    1,
  );

  return {
    ...baseProfile,
    temperature: adjustedTemperature,
    topP: adjustedTopP,
    metadata: {
      ...baseProfile.metadata,
      feedbackApplied: true,
      feedbackWeight: Number(weight.toFixed(4)),
    },
  };
}

function parseJsonBody(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readAutotuneMetadata(metadata: Record<string, unknown>): {
  contextType: SteerContextType;
  profile: { temperature: number; topP: number };
} | null {
  const autotune = metadata.autotune as Record<string, unknown> | undefined;
  if (!autotune) {
    return null;
  }

  const contextType = autotune.contextType;
  const profile = autotune.profile as Record<string, unknown> | undefined;
  if (
    typeof contextType !== "string" ||
    !profile ||
    typeof profile.temperature !== "number" ||
    typeof profile.topP !== "number"
  ) {
    return null;
  }

  return {
    contextType: contextType as SteerContextType,
    profile: {
      temperature: profile.temperature,
      topP: profile.topP,
    },
  };
}

export async function extractFeedbackObservation(
  context: FeedbackCollectionContext,
): Promise<FeedbackObservation | null> {
  const autotune = readAutotuneMetadata(context.metadata);
  if (!autotune) {
    return null;
  }

  const headerRating = context.response.headers.get("x-amc-feedback-rating");
  if (headerRating === "1" || headerRating === "-1") {
    return {
      contextType: autotune.contextType,
      rating: Number(headerRating) as 1 | -1,
      profile: autotune.profile,
      ts: Date.now(),
    };
  }

  const contentType = context.response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  const cloned = context.response.clone();
  const bodyText = await cloned.text();
  const body = parseJsonBody(bodyText);
  const feedback = body?.amc_feedback as Record<string, unknown> | undefined;
  const rating = feedback?.rating;
  if (rating === 1 || rating === -1) {
    return {
      contextType: autotune.contextType,
      rating,
      profile: autotune.profile,
      ts: Date.now(),
    };
  }

  return null;
}

export function createFeedbackCollectionStage(
  options: FeedbackCollectionStageOptions,
) {
  return {
    id: "feedback-collection",
    enabled: true,
    onResponse: async (context: {
      agentId: string;
      providerId: string;
      url: string;
      init: RequestInit;
      response: Response;
      metadata: Record<string, unknown>;
    }) => {
      const observation = await extractFeedbackObservation({
        response: context.response,
        metadata: context.metadata,
      });

      if (!observation) {
        return context;
      }

      const nextState = applyFeedbackObservation(options.getState(), observation);
      options.setState(nextState);
      return {
        ...context,
        metadata: {
          ...context.metadata,
          feedbackObservation: observation,
        },
      };
    },
  };
}
