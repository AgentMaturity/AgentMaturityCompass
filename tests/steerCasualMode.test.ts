import { describe, it, expect } from "vitest";
import { casualMode, createHygieneStage } from "../src/steer/hygiene.js";

describe("casual mode", () => {
  it("replaces formal conjunctions with casual equivalents", () => {
    expect(casualMode("However, the system failed.")).toBe(
      "But the system failed.",
    );
    expect(casualMode("Therefore, we must act.")).toBe("So we must act.");
    expect(casualMode("Furthermore, there are risks.")).toBe(
      "Also there are risks.",
    );
    expect(casualMode("Nevertheless, it works.")).toBe("Still it works.");
    expect(casualMode("Moreover, costs increased.")).toBe(
      "Plus costs increased.",
    );
  });

  it("replaces formal verbs with informal equivalents", () => {
    expect(casualMode("You should utilize this tool.")).toBe(
      "You should use this tool.",
    );
    expect(casualMode("We need to facilitate the process.")).toBe(
      "We need to help with the process.",
    );
    expect(casualMode("Please endeavor to complete it.")).toBe(
      "Please try to complete it.",
    );
    expect(casualMode("We must ascertain the cause.")).toBe(
      "We must figure out the cause.",
    );
  });

  it("replaces formal adjectives/adverbs", () => {
    expect(casualMode("This is a significant improvement.")).toBe(
      "This is a big improvement.",
    );
    expect(casualMode("It is exceedingly difficult.")).toBe(
      "It is really difficult.",
    );
    expect(casualMode("The results are sufficient.")).toBe(
      "The results are enough.",
    );
  });

  it("replaces formal phrases", () => {
    expect(casualMode("In order to succeed, plan ahead.")).toBe(
      "To succeed, plan ahead.",
    );
    expect(casualMode("With regard to your question, yes.")).toBe(
      "About your question, yes.",
    );
    expect(casualMode("In the event that it fails, retry.")).toBe(
      "If it fails, retry.",
    );
    expect(casualMode("At this point in time, we wait.")).toBe(
      "Right now we wait.",
    );
    expect(casualMode("Due to the fact that it broke, we stopped.")).toBe(
      "Because it broke, we stopped.",
    );
  });

  it("handles multiple replacements in one string", () => {
    const formal =
      "However, you should utilize this tool. Furthermore, it is a significant improvement.";
    const casual =
      "But you should use this tool. Also it is a big improvement.";
    expect(casualMode(formal)).toBe(casual);
  });

  it("is case-insensitive and preserves sentence structure", () => {
    expect(casualMode("HOWEVER, we proceed.")).toBe("But we proceed.");
    expect(casualMode("however, we proceed.")).toBe("But we proceed.");
  });

  it("does not modify text without formal language", () => {
    const text = "The quick brown fox jumps over the lazy dog.";
    expect(casualMode(text)).toBe(text);
  });

  it("integrates with HygieneOptions via createHygieneStage", () => {
    const stage = createHygieneStage({
      hedges: false,
      preamble: false,
      casual: true,
    });
    expect(stage.id).toBe("stm-hygiene");
    expect(stage.enabled).toBe(true);
  });
});
