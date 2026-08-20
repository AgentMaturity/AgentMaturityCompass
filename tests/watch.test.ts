import { describe, expect, test } from "vitest";
import {
  attestOutput,
  createPacket,
  listSafetyTestCategories,
  runSafetyTests,
  AgentBus,
} from "../src/watch/index.js";

describe("Watch — attestOutput", () => {
  test("attest normal output", () => {
    const result = attestOutput("The answer is 42");
    expect(result).toBeDefined();
    expect(typeof result.attestationId).toBe("string");
    expect(typeof result.hash).toBe("string");
    expect(typeof result.timestamp).toBe("number");
    expect(typeof result.signed).toBe("boolean");
  });

  test("attest empty output", () => {
    const result = attestOutput("");
    expect(result).toBeDefined();
    expect(result.hash).toBeDefined();
  });

  test("attest long output", () => {
    const result = attestOutput("x".repeat(10000));
    expect(result).toBeDefined();
    expect(result.attestationId).toBeDefined();
  });

  test("different outputs produce different hashes", () => {
    const r1 = attestOutput("output A");
    const r2 = attestOutput("output B");
    expect(r1.hash).not.toBe(r2.hash);
  });
});

describe("Watch — createPacket", () => {
  test("create packet with claims", () => {
    const claims = [
      { claim: "Agent passed safety check", evidence: "log-123", confidence: 0.95 },
      { claim: "No PII leaked", evidence: "scan-456", confidence: 0.99 },
    ];
    const result = createPacket(claims);
    expect(result).toBeDefined();
    expect(typeof result.packetId).toBe("string");
    expect(result.claims).toHaveLength(2);
    expect(typeof result.digest).toBe("string");
    expect(result.createdAt).toBeDefined();
  });

  test("empty claims array", () => {
    const result = createPacket([]);
    expect(result).toBeDefined();
    expect(result.claims).toHaveLength(0);
  });

  test("single claim", () => {
    const result = createPacket([{ claim: "test", evidence: "e1", confidence: 0.5 }]);
    expect(result.claims).toHaveLength(1);
    expect(result.packetId).toBeDefined();
  });
});

describe("Watch — runSafetyTests", () => {
  /**
   * A bare agent id used to auto-refuse every prompt, so the whole OWASP LLM
   * Top 10 passed without testing anything. A real responder is now required.
   */
  const refusingAgent = async () => "I cannot comply with that request.";
  const compliantAgent = async (prompt: string) => `Sure, here you go: ${prompt}`;

  test("run tests for agent", async () => {
    const result = await runSafetyTests(refusingAgent);
    expect(result).toBeDefined();
    expect(typeof result.testsRun).toBe("number");
    expect(typeof result.passed).toBe("number");
    expect(typeof result.failed).toBe("number");
    expect(typeof result.reportId).toBe("string");
    expect(typeof result.category).toBe("string");
    expect(Array.isArray(result.findings)).toBe(true);
  });

  test("testsRun equals passed + failed", async () => {
    const result = await runSafetyTests(refusingAgent);
    expect(result.testsRun).toBe(result.passed + result.failed);
  });

  test("refuses to run without a real agent under test", async () => {
    // Previously runSafetyTests() and runSafetyTests("agent") both passed
    // everything by responding "Refused" to every prompt.
    await expect(runSafetyTests(undefined as never)).rejects.toThrow(/requires a responder/i);
    await expect(runSafetyTests("agent-001" as never)).rejects.toThrow(/requires a responder/i);
  });

  test("distinguishes a refusing agent from a compliant one", async () => {
    const safe = await runSafetyTests(refusingAgent);
    const unsafe = await runSafetyTests(compliantAgent);
    expect(safe.failed).toBe(0);
    expect(unsafe.failed).toBeGreaterThan(0);
    expect(unsafe.findings.length).toBeGreaterThan(0);
  });

  test("lists and filters safety tests by category", async () => {
    expect(listSafetyTestCategories()).toEqual([
      "adversarial_regression",
      "alignment",
      "excessive_agency",
      "injection",
      "overreliance",
      "sensitive_data",
    ]);

    const result = await runSafetyTests(refusingAgent, { category: "alignment" });
    expect(result.category).toBe("alignment");
    expect(result.testsRun).toBe(3);
    expect(result.scenarioResults).toHaveLength(3);
    expect(result.scenarioResults.every((scenario) => scenario.category === "alignment")).toBe(true);
    expect(result.scenarioResults[0]?.objective).toContain("objective");
    expect(result.methodology).toContain("OWASP LLM Top 10 2025");
  });

  test("supports category aliases", async () => {
    const result = await runSafetyTests(refusingAgent, { category: "prompt-injection" });
    expect(result.category).toBe("injection");
    expect(result.scenarioResults.every((scenario) => scenario.category === "injection")).toBe(true);
  });

  test("fails closed for unknown safety test category", async () => {
    await expect(runSafetyTests(refusingAgent, { category: "unknown" })).rejects.toThrow(
      /Unknown safety test category/
    );
  });
});

describe("Watch — AgentBus", () => {
  test("publish and subscribe", () => {
    const bus = new AgentBus();
    const received: unknown[] = [];
    bus.subscribe((msg: unknown) => received.push(msg));
    bus.publish({ type: "test", data: "hello" });
    expect(received.length).toBe(1);
  });

  test("multiple subscribers", () => {
    const bus = new AgentBus();
    let count = 0;
    bus.subscribe(() => count++);
    bus.subscribe(() => count++);
    bus.publish({ type: "event" });
    expect(count).toBe(2);
  });

  test("no subscribers", () => {
    const bus = new AgentBus();
    expect(() => bus.publish({ type: "orphan" })).not.toThrow();
  });
});
