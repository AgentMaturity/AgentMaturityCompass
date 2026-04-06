/**
 * AMC-439: Feedback collection pipeline — observation ingestion from actual responses
 */
import { describe, expect, test } from "vitest";
import {
  createFeedbackCollectionStage,
  extractFeedbackObservation,
  createFeedbackLoopState,
  getFeedbackAdjustedProfile,
  type FeedbackObservation,
} from "../src/steer/feedbackLoop.js";
import { createSteerPipeline } from "../src/steer/pipeline.js";
import { wrapFetch } from "../src/runtime/wrapFetch.js";
import { getAutotuneProfile } from "../src/steer/autotune.js";

describe("extractFeedbackObservation", () => {
  test("extracts positive observation from response header", async () => {
    const response = new Response(
      JSON.stringify({ choices: [{ message: { content: "helpful answer" } }] }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-amc-feedback-rating": "1",
        },
      },
    );

    const observation = await extractFeedbackObservation({
      response,
      metadata: {
        autotune: {
          contextType: "code",
          profile: { temperature: 0.2, topP: 0.8 },
        },
      },
    });

    expect(observation).toMatchObject({
      contextType: "code",
      rating: 1,
      profile: { temperature: 0.2, topP: 0.8 },
    });
  });

  test("extracts negative observation from response body feedback block", async () => {
    const response = new Response(
      JSON.stringify({
        choices: [{ message: { content: "bad answer" } }],
        amc_feedback: { rating: -1 },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );

    const observation = await extractFeedbackObservation({
      response,
      metadata: {
        autotune: {
          contextType: "analytical",
          profile: { temperature: 0.4, topP: 0.85 },
        },
      },
    });

    expect(observation).toMatchObject({
      contextType: "analytical",
      rating: -1,
      profile: { temperature: 0.4, topP: 0.85 },
    });
  });

  test("returns null when no feedback signal exists", async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    const observation = await extractFeedbackObservation({
      response,
      metadata: {
        autotune: {
          contextType: "code",
          profile: { temperature: 0.2, topP: 0.8 },
        },
      },
    });

    expect(observation).toBeNull();
  });

  test("returns null when autotune metadata is missing", async () => {
    const response = new Response(JSON.stringify({ amc_feedback: { rating: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    const observation = await extractFeedbackObservation({
      response,
      metadata: {},
    });

    expect(observation).toBeNull();
  });
});

describe("feedback collection stage", () => {
  test("ingests feedback observation into shared state on response", async () => {
    let state = createFeedbackLoopState();
    const stage = createFeedbackCollectionStage({
      getState: () => state,
      setState: (next) => {
        state = next;
      },
    });

    const response = new Response(JSON.stringify({ amc_feedback: { rating: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await stage.onResponse!({
      agentId: "test-agent",
      providerId: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      init: { method: "POST" },
      response,
      metadata: {
        autotune: {
          contextType: "code",
          profile: { temperature: 0.15, topP: 0.78 },
        },
      },
    });

    expect(state.buckets.code.sampleCount).toBe(1);
    expect(state.buckets.code.positive.temperatureEma).toBe(0.15);
  });

  test("wrapFetch pipeline updates feedback state from actual response", async () => {
    let state = createFeedbackLoopState({
      alpha: 0.3,
      minSamplesToApply: 1,
      maxWeight: 0.25,
      samplesForMaxWeight: 20,
    });

    const pipeline = createSteerPipeline({
      stages: [
        {
          id: "seed-autotune",
          onRequest: async (context) => ({
            ...context,
            metadata: {
              ...context.metadata,
              autotune: {
                contextType: "code",
                profile: { temperature: 0.2, topP: 0.8 },
              },
            },
          }),
        },
        createFeedbackCollectionStage({
          getState: () => state,
          setState: (next) => {
            state = next;
          },
        }),
      ],
    });

    const originalFetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "great answer" } }],
          amc_feedback: { rating: 1 },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );

    const wrapped = wrapFetch(originalFetch as typeof fetch, {
      agentId: "test-agent",
      gatewayBaseUrl: "https://gateway.example.com/openai",
      forceBaseUrl: false,
      steerPipeline: pipeline,
    });

    await wrapped("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
    });

    expect(state.buckets.code.sampleCount).toBe(1);
    expect(state.buckets.code.positive.topPEma).toBe(0.8);
  });

  test("learned observation affects future profile adjustment", async () => {
    let state = createFeedbackLoopState({
      alpha: 0.3,
      minSamplesToApply: 1,
      maxWeight: 0.25,
      samplesForMaxWeight: 20,
    });

    const stage = createFeedbackCollectionStage({
      getState: () => state,
      setState: (next) => {
        state = next;
      },
    });

    await stage.onResponse!({
      agentId: "test-agent",
      providerId: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      init: { method: "POST" },
      response: new Response(JSON.stringify({ amc_feedback: { rating: -1 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      metadata: {
        autotune: {
          contextType: "code",
          profile: { temperature: 0.95, topP: 0.98 },
        },
      },
    });

    const base = getAutotuneProfile("code", 0.9);
    const adjusted = getFeedbackAdjustedProfile(state, "code", base);
    expect(adjusted.metadata.feedbackApplied).toBe(true);
    expect(adjusted.temperature).toBeLessThanOrEqual(base.temperature);
  });
});
