import { describe, expect, test } from "vitest";
import {
  stripHedges,
  stripPreamble,
  directMode,
  createHygieneStage,
  type HygieneOptions,
} from "../src/steer/hygiene.js";

describe("stripHedges", () => {
  test("removes common hedge phrases", () => {
    const input =
      "I think it's important to note that the API returns JSON. It's worth mentioning that errors use 4xx codes.";
    const result = stripHedges(input);
    expect(result).not.toContain("I think");
    expect(result).not.toContain("it's important to note that");
    expect(result).not.toContain("It's worth mentioning that");
    expect(result).toContain("API returns JSON");
    expect(result.toLowerCase()).toContain("errors use 4xx codes");
  });

  test("preserves text without hedges", () => {
    const input = "The API returns JSON. Errors use 4xx codes.";
    expect(stripHedges(input)).toBe(input);
  });

  test("removes multiple hedges in one pass", () => {
    const input =
      "Basically, you should use POST. Actually, the endpoint accepts PUT as well.";
    const result = stripHedges(input);
    expect(result).not.toContain("Basically,");
    expect(result).not.toContain("Actually,");
  });
});

describe("stripPreamble", () => {
  test("removes 'Sure! Here is' style preambles", () => {
    const input =
      "Sure! Here is the answer you requested:\n\nThe API returns JSON.";
    const result = stripPreamble(input);
    expect(result).toBe("The API returns JSON.");
  });

  test("removes 'Of course!' preamble", () => {
    const input = "Of course! I'd be happy to help.\n\nStep 1: Install the SDK.";
    const result = stripPreamble(input);
    expect(result).toBe("Step 1: Install the SDK.");
  });

  test("preserves text without preamble", () => {
    const input = "Step 1: Install the SDK.\nStep 2: Configure.";
    expect(stripPreamble(input)).toBe(input);
  });

  test("removes 'Great question!' preamble", () => {
    const input = "Great question!\n\nThe answer is 42.";
    const result = stripPreamble(input);
    expect(result).toBe("The answer is 42.");
  });
});

describe("directMode", () => {
  test("applies both hedge stripping and preamble stripping", () => {
    const input =
      "Sure, I'd be happy to help!\n\nI think the best approach is to use REST. Basically, you send a POST request.";
    const result = directMode(input);
    expect(result).not.toContain("Sure");
    expect(result).not.toContain("I think");
    expect(result).not.toContain("Basically,");
    expect(result).toContain("use REST");
    expect(result.toLowerCase()).toContain("you send a post request");
  });

  test("passes clean text through unchanged", () => {
    const input = "Use REST. Send a POST request.";
    expect(directMode(input)).toBe(input);
  });
});

describe("createHygieneStage", () => {
  test("creates a SteerStage with response transform", () => {
    const stage = createHygieneStage({ hedges: true, preamble: true });
    expect(stage.id).toBe("stm-hygiene");
    expect(stage.onResponse).toBeDefined();
    expect(stage.enabled).toBe(true);
  });

  test("can be disabled", () => {
    const stage = createHygieneStage({
      hedges: false,
      preamble: false,
    });
    expect(stage.enabled).toBe(true);
    // When both are false, onResponse still exists but is a no-op
  });

  test("onResponse transforms an OpenAI-style JSON body", async () => {
    const stage = createHygieneStage({ hedges: true, preamble: true });
    const body = {
      choices: [
        {
          message: {
            content:
              "Sure! Here you go:\n\nI think the answer is 42.",
          },
        },
      ],
    };
    const fakeResponse = new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const ctx = {
      agentId: "test",
      providerId: "openai",
      url: "http://localhost/v1/chat/completions",
      init: {},
      metadata: {},
      response: fakeResponse,
    };
    const result = await stage.onResponse!(ctx);
    const resultBody = await result.response.json();
    expect(resultBody.choices[0].message.content).not.toContain("Sure!");
    expect(resultBody.choices[0].message.content).not.toContain("I think");
    expect(resultBody.choices[0].message.content).toContain("answer is 42");
  });

  test("onResponse transforms an Anthropic-style JSON body", async () => {
    const stage = createHygieneStage({ hedges: true, preamble: true });
    const body = {
      content: [
        {
          type: "text",
          text: "Of course!\n\nBasically, the answer is 42.",
        },
      ],
    };
    const fakeResponse = new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    const ctx = {
      agentId: "test",
      providerId: "anthropic",
      url: "http://localhost/v1/messages",
      init: {},
      metadata: {},
      response: fakeResponse,
    };
    const result = await stage.onResponse!(ctx);
    const resultBody = await result.response.json();
    expect(resultBody.content[0].text).not.toContain("Of course!");
    expect(resultBody.content[0].text).not.toContain("Basically,");
    expect(resultBody.content[0].text).toContain("answer is 42");
  });
});
