import { describe, it, expect } from "vitest";
import { parseInput, getSuggestions, getCompletions } from "../src/repl/replParser.js";
import { createReplContext, updateContextFromOutput, formatStatusLine } from "../src/repl/replContext.js";

describe("REPL parser", () => {
  it("parses 'score my agent' as quickscore", () => {
    const r = parseInput("score my agent");
    expect(r.command).toBe("quickscore");
    expect(r.natural).toBe(true);
  });

  it("parses 'what are my gaps?' as evidence gaps", () => {
    const r = parseInput("what are my gaps?");
    expect(r.command).toBe("evidence gaps");
    expect(r.natural).toBe(true);
  });

  it("parses 'am I HIPAA ready?' as health domain assess", () => {
    const r = parseInput("am I HIPAA ready?");
    expect(r.command).toBe("domain assess --domain health");
    expect(r.natural).toBe(true);
  });

  it("parses 'explain AMC-1.1' with capture group", () => {
    const r = parseInput("explain AMC-1.1");
    expect(r.command).toBe("explain AMC-1.1");
    expect(r.natural).toBe(true);
  });

  it("parses exact amc commands as passthrough", () => {
    const r = parseInput("assurance run sycophancy");
    expect(r.command).toBe("assurance run sycophancy");
    expect(r.natural).toBe(false);
  });

  it("strips 'amc ' prefix", () => {
    const r = parseInput("amc quickscore");
    expect(r.command).toBe("quickscore");
    expect(r.natural).toBe(true);
  });

  it("returns empty for blank input", () => {
    const r = parseInput("");
    expect(r.command).toBe("");
  });

  it("parses 'improve' as guide", () => {
    const r = parseInput("improve");
    expect(r.command).toBe("guide");
    expect(r.natural).toBe(true);
  });

  it("parses 'doctor' as doctor", () => {
    const r = parseInput("doctor");
    expect(r.command).toBe("doctor");
    expect(r.natural).toBe(true);
  });

  it("parses 'guardrails' as guardrails list", () => {
    const r = parseInput("guardrails");
    expect(r.command).toBe("guardrails list");
    expect(r.natural).toBe(true);
  });

  it("parses domain queries", () => {
    expect(parseInput("am I GDPR ready?").command).toBe("domain assess --domain education");
    expect(parseInput("governance").command).toBe("domain assess --domain governance");
    expect(parseInput("fintech").command).toBe("domain assess --domain wealth");
  });

  it("parses 'run tests' as assurance list", () => {
    const r = parseInput("run tests");
    expect(r.command).toBe("assurance list");
    expect(r.natural).toBe(true);
  });

  it("parses 'history' as history", () => {
    const r = parseInput("history");
    expect(r.command).toBe("history");
    expect(r.natural).toBe(true);
  });
});

describe("REPL context", () => {
  it("creates context with defaults", () => {
    const ctx = createReplContext();
    expect(ctx.agentId).toBe("default");
    expect(ctx.score).toBeNull();
    expect(ctx.commandCount).toBe(0);
  });

  it("creates context with custom agent", () => {
    const ctx = createReplContext("my-agent");
    expect(ctx.agentId).toBe("my-agent");
  });

  it("updates score from output", () => {
    const ctx = createReplContext();
    updateContextFromOutput(ctx, "quickscore", "Overall score: 3.2 / 5");
    expect(ctx.score).toBe(3.2);
    expect(ctx.commandCount).toBe(1);
  });

  it("updates trust label from output", () => {
    const ctx = createReplContext();
    updateContextFromOutput(ctx, "quickscore", "Trust: HIGH TRUST (L3)");
    expect(ctx.trustLabel).toBe("HIGH TRUST");
    expect(ctx.level).toBe(3);
  });

  it("updates gap count from output", () => {
    const ctx = createReplContext();
    updateContextFromOutput(ctx, "evidence gaps", "Found 12 evidence gaps");
    expect(ctx.gaps).toBe(12);
  });

  it("formats status line", () => {
    const ctx = createReplContext();
    ctx.score = 3.2;
    ctx.trustLabel = "HIGH TRUST";
    ctx.gaps = 5;
    const line = formatStatusLine(ctx);
    expect(line).toContain("default");
    expect(line).toContain("3.2/5");
    expect(line).toContain("HIGH TRUST");
    expect(line).toContain("5 gaps");
  });
});

describe("REPL suggestions", () => {
  it("suggests scoring when no score exists", () => {
    const sugs = getSuggestions(null, null, 0);
    expect(sugs).toContain("score my agent");
  });

  it("suggests improvement when gaps exist", () => {
    const sugs = getSuggestions(3.2, 12, 5);
    expect(sugs).toContain("what are my gaps?");
    expect(sugs).toContain("improve");
  });

  it("suggests testing when no gaps", () => {
    const sugs = getSuggestions(4.5, 0, 5);
    expect(sugs).toContain("run tests");
  });
});

describe("REPL completions", () => {
  it("returns a non-empty array of completions", () => {
    const c = getCompletions();
    expect(c.length).toBeGreaterThan(10);
    expect(c).toContain("quickscore");
    expect(c).toContain("help");
    expect(c).toContain("exit");
  });
});
