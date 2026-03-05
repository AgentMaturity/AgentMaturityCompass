import { describe, it, expect } from "vitest";
import { parseInput, getSuggestions, getCompletions, fuzzyMatch, findClosest } from "../src/repl/replParser.js";
import { createReplContext, updateContextFromOutput, formatStatusLine } from "../src/repl/replContext.js";

describe("REPL parser — scoring", () => {
  it("parses 'score my agent' as quickscore", () => {
    const r = parseInput("score my agent");
    expect(r.command).toBe("quickscore");
    expect(r.natural).toBe(true);
  });

  it("parses 'how am i doing' as quickscore", () => {
    expect(parseInput("how am i doing").command).toBe("quickscore");
  });

  it("parses 'qs' as quickscore", () => {
    expect(parseInput("qs").command).toBe("quickscore");
  });

  it("parses 'what is my score' as quickscore", () => {
    expect(parseInput("what is my score").command).toBe("quickscore");
  });

  it("parses 'how mature is my agent' as quickscore", () => {
    expect(parseInput("how mature is my agent").command).toBe("quickscore");
  });
});

describe("REPL parser — gaps & diagnosis", () => {
  it("parses 'what are my gaps?' as evidence gaps", () => {
    expect(parseInput("what are my gaps?").command).toBe("mechanic gap");
  });

  it("parses 'show gaps' as evidence gaps", () => {
    expect(parseInput("show gaps").command).toBe("mechanic gap");
  });

  it("parses 'where do I fail' as evidence gaps", () => {
    expect(parseInput("where do I fail").command).toBe("mechanic gap");
  });

  it("parses 'biggest gaps' as mechanic gap", () => {
    expect(parseInput("biggest gaps").command).toBe("mechanic gap");
  });

  it("parses 'why is my score low' as mechanic gap", () => {
    expect(parseInput("why is my score low").command).toBe("mechanic gap");
  });
});

describe("REPL parser — improvement", () => {
  it("parses 'improve' as guide", () => {
    expect(parseInput("improve").command).toBe("guide");
  });

  it("parses 'how can I improve' as guide", () => {
    expect(parseInput("how can I improve").command).toBe("guide");
  });

  it("parses 'what should I do' as guide", () => {
    expect(parseInput("what should I do").command).toBe("guide");
  });

  it("parses 'apply guide' as guide --apply", () => {
    expect(parseInput("apply guide").command).toBe("guide --apply");
  });

  it("parses 'next steps' as guide", () => {
    expect(parseInput("next steps").command).toBe("guide");
  });
});

describe("REPL parser — assurance", () => {
  it("parses exact command as passthrough", () => {
    const r = parseInput("assurance run sycophancy");
    expect(r.command).toBe("assurance run sycophancy");
    expect(r.natural).toBe(false);
  });

  it("parses 'run all tests' as assurance run --all", () => {
    expect(parseInput("run all tests").command).toBe("assurance run --all");
  });

  it("parses 'run sycophancy' as assurance run sycophancy", () => {
    expect(parseInput("run sycophancy").command).toBe("assurance run sycophancy");
  });

  it("parses 'check hallucination' as assurance run hallucination", () => {
    expect(parseInput("check hallucination").command).toBe("assurance run hallucination");
  });

  it("parses 'run toxicity' as assurance run toxicity", () => {
    expect(parseInput("run toxicity").command).toBe("assurance run toxicity");
  });

  it("parses 'run security' as assurance run security", () => {
    expect(parseInput("run security").command).toBe("assurance run security");
  });

  it("parses 'run tests' as assurance list", () => {
    const r = parseInput("run tests");
    expect(r.command).toBe("assurance list");
    expect(r.natural).toBe(true);
  });

  it("parses 'packs' as assurance list", () => {
    expect(parseInput("packs").command).toBe("assurance list");
  });

  it("parses 'what packs are available' as assurance list", () => {
    expect(parseInput("what packs are available").command).toBe("assurance list");
  });
});

describe("REPL parser — evidence", () => {
  it("parses 'collect evidence' as evidence collect", () => {
    expect(parseInput("collect evidence").command).toBe("evidence collect");
  });

  it("parses 'ingest' as evidence ingest", () => {
    expect(parseInput("ingest").command).toBe("evidence ingest");
  });

  it("parses 'evidence' as evidence gaps", () => {
    expect(parseInput("evidence").command).toBe("mechanic gap");
  });
});

describe("REPL parser — domains & compliance", () => {
  it("parses 'am I HIPAA ready?' as health domain", () => {
    expect(parseInput("am I HIPAA ready?").command).toBe("domain assess --domain health");
  });

  it("parses 'GDPR' as education domain", () => {
    expect(parseInput("GDPR").command).toBe("domain assess --domain education");
  });

  it("parses 'fintech' as wealth domain", () => {
    expect(parseInput("fintech").command).toBe("domain assess --domain wealth");
  });

  it("parses 'EU AI Act' as technology domain", () => {
    expect(parseInput("EU AI Act").command).toBe("domain assess --domain technology");
  });

  it("parses 'ESG' as environment domain", () => {
    expect(parseInput("ESG").command).toBe("domain assess --domain environment");
  });

  it("parses 'governance' as governance domain", () => {
    expect(parseInput("governance").command).toBe("domain assess --domain governance");
  });

  it("parses 'transport' as mobility domain", () => {
    expect(parseInput("transport").command).toBe("domain assess --domain mobility");
  });

  it("parses 'domains' as domain list", () => {
    expect(parseInput("domains").command).toBe("domain list");
  });

  it("parses 'compliance' as domain list", () => {
    expect(parseInput("compliance").command).toBe("domain list");
  });

  it("parses 'check banking' as wealth domain", () => {
    expect(parseInput("check banking").command).toBe("domain assess --domain wealth");
  });
});

describe("REPL parser — guardrails", () => {
  it("parses 'guardrails' as guardrails list", () => {
    expect(parseInput("guardrails").command).toBe("guardrails list");
  });

  it("parses 'enable prompt-injection' as guardrails enable", () => {
    expect(parseInput("enable prompt-injection").command).toBe("guardrails enable prompt-injection");
  });

  it("parses 'disable rate-limiter' as guardrails disable", () => {
    expect(parseInput("disable rate-limiter").command).toBe("guardrails disable rate-limiter");
  });

  it("parses 'turn on pii-redaction' as guardrails enable", () => {
    expect(parseInput("turn on pii-redaction").command).toBe("guardrails enable pii-redaction");
  });
});

describe("REPL parser — explain with capture groups", () => {
  it("parses 'explain AMC-1.1'", () => {
    expect(parseInput("explain AMC-1.1").command).toBe("explain AMC-1.1");
    expect(parseInput("explain AMC-1.1").natural).toBe(true);
  });

  it("parses 'what is AMC-2.3'", () => {
    expect(parseInput("what is AMC-2.3").command).toBe("explain AMC-2.3");
  });

  it("parses bare 'AMC-1.1' as explain", () => {
    expect(parseInput("AMC-1.1").command).toBe("explain AMC-1.1");
  });
});

describe("REPL parser — reports & history", () => {
  it("parses 'report' as report --executive latest", () => {
    expect(parseInput("report").command).toBe("report --executive latest");
  });

  it("parses 'export sarif' as export sarif", () => {
    expect(parseInput("export sarif").command).toBe("export sarif");
  });

  it("parses 'history' as history", () => {
    expect(parseInput("history").command).toBe("history");
  });

  it("parses 'compare' as compare", () => {
    expect(parseInput("compare").command).toBe("history");
  });

  it("parses 'what changed' as compare", () => {
    expect(parseInput("what changed").command).toBe("history");
  });

  it("parses 'how am I progressing' as history", () => {
    expect(parseInput("how am I progressing").command).toBe("history");
  });
});

describe("REPL parser — system commands", () => {
  it("parses 'doctor' as doctor", () => {
    expect(parseInput("doctor").command).toBe("doctor");
  });

  it("parses 'status' as status", () => {
    expect(parseInput("status").command).toBe("status");
  });

  it("parses 'dashboard' as dashboard open", () => {
    expect(parseInput("dashboard").command).toBe("dashboard open");
  });

  it("parses 'up' as up", () => {
    expect(parseInput("up").command).toBe("up");
  });

  it("parses 'down' as down", () => {
    expect(parseInput("down").command).toBe("down");
  });

  it("parses 'version' as --version", () => {
    expect(parseInput("version").command).toBe("--version");
  });

  it("parses 'adapters' as adapters list", () => {
    expect(parseInput("adapters").command).toBe("adapters list");
  });

  it("parses 'tools' as mcp list-tools", () => {
    expect(parseInput("tools").command).toBe("mcp list-tools");
  });

  it("parses 'init' as init", () => {
    expect(parseInput("init").command).toBe("init");
  });

  it("parses 'start studio' as up", () => {
    expect(parseInput("start studio").command).toBe("up");
  });
});

describe("REPL parser — workflows", () => {
  it("parses 'onboard me' as workflow", () => {
    const r = parseInput("onboard me");
    expect(r.workflow).toBe(true);
    expect(r.steps?.length).toBeGreaterThan(2);
    expect(r.steps).toContain("quickscore");
    expect(r.steps).toContain("guide");
  });

  it("parses 'full audit' as workflow", () => {
    const r = parseInput("full audit");
    expect(r.workflow).toBe(true);
    expect(r.steps).toContain("quickscore");
    expect(r.steps).toContain("assurance run --all");
    expect(r.steps).toContain("report --executive latest");
  });

  it("parses 'prepare for production' as workflow", () => {
    const r = parseInput("prepare for production");
    expect(r.workflow).toBe(true);
    expect(r.steps).toContain("guardrails list");
  });

  it("parses 'ci check' as workflow", () => {
    const r = parseInput("ci check");
    expect(r.workflow).toBe(true);
  });

  it("parses 'security audit' as workflow", () => {
    const r = parseInput("security audit");
    expect(r.workflow).toBe(true);
    expect(r.steps).toContain("assurance run security");
  });

  it("parses 'quick check' as workflow", () => {
    const r = parseInput("quick check");
    expect(r.workflow).toBe(true);
    expect(r.steps).toContain("status");
  });

  it("parses 'tutorial' as onboard workflow", () => {
    expect(parseInput("tutorial").workflow).toBe(true);
  });

  it("parses 'getting started' as onboard workflow", () => {
    expect(parseInput("getting started").workflow).toBe(true);
  });
});

describe("REPL parser — passthrough & edge cases", () => {
  it("strips 'amc ' prefix", () => {
    const r = parseInput("amc quickscore");
    expect(r.command).toBe("quickscore");
  });

  it("returns empty for blank input", () => {
    expect(parseInput("").command).toBe("");
  });

  it("passes through unknown commands as-is", () => {
    const r = parseInput("some-obscure-command --flag value");
    expect(r.command).toBe("some-obscure-command --flag value");
    expect(r.natural).toBe(false);
  });

  it("handles mixed case", () => {
    expect(parseInput("Score My Agent").command).toBe("quickscore");
    expect(parseInput("IMPROVE").command).toBe("guide");
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

  it("tracks command history", () => {
    const ctx = createReplContext();
    updateContextFromOutput(ctx, "quickscore", "score: 2.0");
    updateContextFromOutput(ctx, "mechanic gap", "5 gaps");
    expect(ctx.commandHistory).toEqual(["quickscore", "mechanic gap"]);
    expect(ctx.commandCount).toBe(2);
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
    expect(sugs).toContain("onboard me");
  });

  it("suggests improvement when gaps exist", () => {
    const sugs = getSuggestions(3.2, 12, 5);
    expect(sugs).toContain("what are my gaps?");
    expect(sugs).toContain("improve");
  });

  it("suggests testing when no gaps", () => {
    const sugs = getSuggestions(4.5, 0, 5);
    expect(sugs).toContain("run all tests");
  });

  it("suggests production prep when score is high", () => {
    const sugs = getSuggestions(3.5, 2, 3);
    expect(sugs).toContain("prepare for production");
  });

  it("suggests onboarding for very low scores", () => {
    const sugs = getSuggestions(0.5, 20, 0);
    expect(sugs).toContain("onboard me");
  });
});

describe("REPL completions", () => {
  it("returns a comprehensive list", () => {
    const c = getCompletions();
    expect(c.length).toBeGreaterThan(30);
    expect(c).toContain("quickscore");
    expect(c).toContain("score my agent");
    expect(c).toContain("onboard me");
    expect(c).toContain("full audit");
    expect(c).toContain("prepare for production");
    expect(c).toContain("assurance run sycophancy");
    expect(c).toContain("help");
    expect(c).toContain("exit");
  });
});

describe("fuzzy matching", () => {
  it("matches exact prefix", () => {
    expect(fuzzyMatch("score", "score my agent")).toBe(true);
  });

  it("matches subsequence", () => {
    expect(fuzzyMatch("sma", "score my agent")).toBe(true);
  });

  it("rejects non-subsequence", () => {
    expect(fuzzyMatch("xyz", "score my agent")).toBe(false);
  });

  it("handles empty needle", () => {
    expect(fuzzyMatch("", "anything")).toBe(true);
  });
});

describe("find closest (Levenshtein)", () => {
  const candidates = ["quickscore", "improve", "guide", "doctor", "status", "dashboard"];

  it("finds close match for typo 'qucikscore'", () => {
    const matches = findClosest("qucikscore", candidates);
    expect(matches).toContain("quickscore");
  });

  it("finds close match for typo 'improev'", () => {
    const matches = findClosest("improev", candidates);
    expect(matches).toContain("improve");
  });

  it("finds close match for typo 'doctr'", () => {
    const matches = findClosest("doctr", candidates);
    expect(matches).toContain("doctor");
  });

  it("returns empty for very different input", () => {
    const matches = findClosest("zzzzzzzzz", candidates);
    expect(matches).toEqual([]);
  });

  it("returns max 3 results", () => {
    const matches = findClosest("s", ["status", "setup", "score", "summary", "sarif"], 5);
    expect(matches.length).toBeLessThanOrEqual(3);
  });
});
