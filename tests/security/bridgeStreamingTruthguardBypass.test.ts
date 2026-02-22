import { describe, expect, test } from "vitest";
import { shouldBlockStreamingForTruthguard } from "../../src/bridge/bridgeServer.js";
import { defaultPromptPolicy } from "../../src/prompt/promptPolicySchema.js";

describe("security: streaming truthguard bypass", () => {
  test("treats streaming + truthguard ENFORCE as a hard conflict", () => {
    const policy = defaultPromptPolicy();
    policy.promptPolicy.truth.requireTruthguardForBridgeResponses = true;
    policy.promptPolicy.truth.enforcementMode = "ENFORCE";

    expect(
      shouldBlockStreamingForTruthguard({
        streamPassthrough: true,
        promptPolicy: policy
      })
    ).toBe(true);
  });

  test("allows streaming when truthguard mode is WARN", () => {
    const policy = defaultPromptPolicy();
    policy.promptPolicy.truth.requireTruthguardForBridgeResponses = true;
    policy.promptPolicy.truth.enforcementMode = "WARN";

    expect(
      shouldBlockStreamingForTruthguard({
        streamPassthrough: true,
        promptPolicy: policy
      })
    ).toBe(false);
  });

  test("allows non-streaming requests in ENFORCE mode", () => {
    const policy = defaultPromptPolicy();
    policy.promptPolicy.truth.requireTruthguardForBridgeResponses = true;
    policy.promptPolicy.truth.enforcementMode = "ENFORCE";

    expect(
      shouldBlockStreamingForTruthguard({
        streamPassthrough: false,
        promptPolicy: policy
      })
    ).toBe(false);
  });
});
