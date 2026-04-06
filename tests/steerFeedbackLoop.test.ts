import { describe, expect, test } from "vitest";
import {
  applyFeedbackObservation,
  createFeedbackLoopState,
  defaultFeedbackLoopConfig,
  getFeedbackAdjustedProfile,
  type FeedbackLoopState,
} from "../src/steer/feedbackLoop.js";
import { getAutotuneProfile } from "../src/steer/autotune.js";

function learn(
  state: FeedbackLoopState,
  observations: Array<{ rating: 1 | -1; temperature: number; topP: number }>
): FeedbackLoopState {
  let current = state;
  for (const observation of observations) {
    current = applyFeedbackObservation(current, {
      contextType: "code",
      rating: observation.rating,
      profile: {
        temperature: observation.temperature,
        topP: observation.topP,
      },
      ts: Date.now(),
    });
  }
  return current;
}

describe("feedback loop state", () => {
  test("tracks sample counts and EMAs per context bucket", () => {
    let state = createFeedbackLoopState();
    state = applyFeedbackObservation(state, {
      contextType: "code",
      rating: 1,
      profile: { temperature: 0.2, topP: 0.82 },
      ts: 1,
    });
    state = applyFeedbackObservation(state, {
      contextType: "code",
      rating: -1,
      profile: { temperature: 0.8, topP: 0.95 },
      ts: 2,
    });

    const bucket = state.buckets.code;
    expect(bucket.sampleCount).toBe(2);
    expect(bucket.positive.temperatureEma).toBeGreaterThan(0);
    expect(bucket.negative.temperatureEma).toBeGreaterThan(0);
  });

  test("does not apply adjustments before minimum sample threshold", () => {
    const state = learn(createFeedbackLoopState(), [
      { rating: 1, temperature: 0.2, topP: 0.82 },
      { rating: -1, temperature: 0.8, topP: 0.95 },
    ]);
    const base = getAutotuneProfile("code", 0.9);
    const adjusted = getFeedbackAdjustedProfile(state, "code", base);
    expect(adjusted.temperature).toBe(base.temperature);
    expect(adjusted.topP).toBe(base.topP);
    expect(adjusted.metadata.feedbackApplied).toBe(false);
  });

  test("applies learned adjustment after enough samples", () => {
    const state = learn(createFeedbackLoopState(), [
      { rating: 1, temperature: 0.18, topP: 0.8 },
      { rating: 1, temperature: 0.2, topP: 0.82 },
      { rating: -1, temperature: 0.9, topP: 0.97 },
      { rating: -1, temperature: 0.85, topP: 0.95 },
    ]);
    const base = getAutotuneProfile("code", 0.9);
    const adjusted = getFeedbackAdjustedProfile(state, "code", base);
    expect(adjusted.temperature).toBeLessThan(base.temperature);
    expect(adjusted.topP).toBeLessThan(base.topP);
    expect(adjusted.metadata.feedbackApplied).toBe(true);
  });

  test("caps feedback influence weight", () => {
    let state = createFeedbackLoopState({
      ...defaultFeedbackLoopConfig(),
      minSamplesToApply: 1,
      maxWeight: 0.25,
    });
    for (let i = 0; i < 20; i += 1) {
      state = applyFeedbackObservation(state, {
        contextType: "code",
        rating: 1,
        profile: { temperature: 0.1, topP: 0.75 },
        ts: i,
      });
    }
    const base = getAutotuneProfile("code", 0.9);
    const adjusted = getFeedbackAdjustedProfile(state, "code", base);
    expect(adjusted.metadata.feedbackWeight).toBeLessThanOrEqual(0.25);
  });

  test("keeps unrelated context buckets isolated", () => {
    let state = createFeedbackLoopState();
    state = applyFeedbackObservation(state, {
      contextType: "creative",
      rating: 1,
      profile: { temperature: 1.15, topP: 0.96 },
      ts: 1,
    });
    const base = getAutotuneProfile("code", 0.9);
    const adjusted = getFeedbackAdjustedProfile(state, "code", base);
    expect(adjusted.temperature).toBe(base.temperature);
    expect(adjusted.metadata.feedbackApplied).toBe(false);
  });
});
