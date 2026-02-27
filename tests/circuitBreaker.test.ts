import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { initWorkspace } from "../src/workspace.js";
import {
  configureCircuitBreaker,
  registerCircuit,
  getCircuit,
  listCircuits,
  resetCircuit,
  resetAllCircuits,
  withCircuitBreaker,
  addDeadLetter,
  getDeadLetters,
  resolveDeadLetter,
  retryDeadLetter,
  reportWritePending,
  reportWriteComplete,
  getBackpressureStatus,
  reportStuckSession,
  reportOrphanedProcess,
  getWatchdogAlerts,
  clearWatchdogAlerts,
  generateCircuitBreakerReport,
  saveCircuitBreakerPolicy,
  loadCircuitBreakerPolicy,
  renderCircuitBreakerMarkdown,
  CircuitOpenError,
  TimeoutError,
} from "../src/ops/circuitBreaker.js";

const roots: string[] = [];

function newWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "amc-cb-test-"));
  roots.push(dir);
  initWorkspace({ workspacePath: dir, trustBoundaryMode: "isolated" });
  return dir;
}

beforeEach(() => {
  resetAllCircuits();
  configureCircuitBreaker({
    globalTimeoutMs: 10_000,
    perHookTimeoutMs: 2_000,
    failureThreshold: 3,
    recoveryWindowMs: 50, // Short for test speed — avoids 1100ms wall-clock wait
    halfOpenMaxAttempts: 2,
    backpressure: { maxPendingWrites: 5, maxQueueLatencyMs: 1000, degradeOnExceed: true },
    deadLetter: { enabled: true, maxEntries: 10, retryIntervalMs: 1000, maxRetries: 2 },
    watchdog: { enabled: true, checkIntervalMs: 1000, stuckSessionThresholdMs: 5000 },
  });
});

afterEach(() => {
  resetAllCircuits();
  while (roots.length > 0) {
    const dir = roots.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("Circuit Registration", () => {
  test("register and get circuit", () => {
    const circuit = registerCircuit("test-hook");
    expect(circuit.name).toBe("test-hook");
    expect(circuit.state).toBe("CLOSED");
    expect(circuit.consecutiveFailures).toBe(0);

    const retrieved = getCircuit(circuit.circuitId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.name).toBe("test-hook");
  });

  test("registering same name returns same circuit", () => {
    const a = registerCircuit("test-hook");
    const b = registerCircuit("test-hook");
    expect(a.circuitId).toBe(b.circuitId);
  });

  test("list circuits", () => {
    registerCircuit("hook-a");
    registerCircuit("hook-b");
    const list = listCircuits();
    expect(list).toHaveLength(2);
  });

  test("reset circuit", () => {
    const circuit = registerCircuit("test");
    circuit.state = "OPEN";
    circuit.consecutiveFailures = 5;
    resetCircuit(circuit.circuitId);
    expect(circuit.state).toBe("CLOSED");
    expect(circuit.consecutiveFailures).toBe(0);
  });
});

describe("Circuit Breaker State Machine", () => {
  test("success keeps circuit CLOSED", async () => {
    const result = await withCircuitBreaker("test", async () => "ok");
    expect(result).toBe("ok");

    const circuit = getCircuit(registerCircuit("test").circuitId)!;
    expect(circuit.state).toBe("CLOSED");
    expect(circuit.totalSuccesses).toBe(1);
  });

  test("failures below threshold keep circuit CLOSED", async () => {
    for (let i = 0; i < 2; i++) {
      try {
        await withCircuitBreaker("test", async () => {
          throw new Error("fail");
        });
      } catch {
        /* expected */
      }
    }

    const circuit = getCircuit(registerCircuit("test").circuitId)!;
    expect(circuit.state).toBe("CLOSED");
    expect(circuit.consecutiveFailures).toBe(2);
  });

  test("failures at threshold open circuit", async () => {
    for (let i = 0; i < 3; i++) {
      try {
        await withCircuitBreaker("test", async () => {
          throw new Error("fail");
        });
      } catch {
        /* expected */
      }
    }

    const circuit = getCircuit(registerCircuit("test").circuitId)!;
    expect(circuit.state).toBe("OPEN");
  });

  test("open circuit rejects immediately", async () => {
    // Force circuit open
    for (let i = 0; i < 3; i++) {
      try {
        await withCircuitBreaker("test", async () => {
          throw new Error("fail");
        });
      } catch {
        /* expected */
      }
    }

    await expect(
      withCircuitBreaker("test", async () => "should not run"),
    ).rejects.toThrow(CircuitOpenError);
  });

  test("open circuit transitions to half-open after recovery window", async () => {
    // Force open
    for (let i = 0; i < 3; i++) {
      try {
        await withCircuitBreaker("test", async () => {
          throw new Error("fail");
        });
      } catch {
        /* expected */
      }
    }

    // Wait for recovery window (50ms in test config)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // This should succeed in half-open
    const result = await withCircuitBreaker("test", async () => "recovered");
    expect(result).toBe("recovered");

    const circuit = getCircuit(registerCircuit("test").circuitId)!;
    expect(circuit.state).toBe("CLOSED");
  });

  test("timeout triggers failure", async () => {
    await expect(
      withCircuitBreaker(
        "test",
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          return "too late";
        },
        { timeoutMs: 100 },
      ),
    ).rejects.toThrow(TimeoutError);

    const circuit = getCircuit(registerCircuit("test").circuitId)!;
    expect(circuit.consecutiveFailures).toBe(1);
  });

  test("success resets consecutive failure count", async () => {
    // 2 failures
    for (let i = 0; i < 2; i++) {
      try {
        await withCircuitBreaker("test", async () => {
          throw new Error("fail");
        });
      } catch {
        /* expected */
      }
    }

    // 1 success
    await withCircuitBreaker("test", async () => "ok");

    const circuit = getCircuit(registerCircuit("test").circuitId)!;
    expect(circuit.consecutiveFailures).toBe(0);
    expect(circuit.totalFailures).toBe(2);
    expect(circuit.totalSuccesses).toBe(1);
  });
});

describe("Dead Letter Queue", () => {
  test("add and retrieve dead letters", () => {
    addDeadLetter("cb_test", '{"event":"lost"}', "connection timeout");
    const entries = getDeadLetters();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.error).toBe("connection timeout");
    expect(entries[0]!.resolved).toBe(false);
  });

  test("resolve dead letter", () => {
    const entry = addDeadLetter("cb_test", "{}", "error");
    resolveDeadLetter(entry.id);
    const unresolved = getDeadLetters({ unresolvedOnly: true });
    expect(unresolved).toHaveLength(0);
  });

  test("retry increments count", () => {
    const entry = addDeadLetter("cb_test", "{}", "error");
    const retried = retryDeadLetter(entry.id);
    expect(retried).not.toBeNull();
    expect(retried!.retryCount).toBe(1);
  });

  test("retry respects max retries", () => {
    const entry = addDeadLetter("cb_test", "{}", "error");
    retryDeadLetter(entry.id);
    retryDeadLetter(entry.id);
    const third = retryDeadLetter(entry.id);
    expect(third).toBeNull(); // maxRetries=2
  });

  test("max entries enforcement", () => {
    for (let i = 0; i < 15; i++) {
      addDeadLetter("cb_test", `event-${i}`, "error");
    }
    const all = getDeadLetters();
    expect(all.length).toBeLessThanOrEqual(10); // maxEntries=10
  });
});

describe("Backpressure", () => {
  test("tracks pending writes", () => {
    reportWritePending();
    reportWritePending();
    const status = getBackpressureStatus();
    expect(status.pendingWrites).toBe(2);
    expect(status.degraded).toBe(false);
  });

  test("degrades on exceeding threshold", () => {
    for (let i = 0; i < 6; i++) {
      reportWritePending();
    }
    const status = getBackpressureStatus();
    expect(status.degraded).toBe(true);
  });

  test("reports latency", () => {
    reportWritePending();
    reportWriteComplete(500);
    const status = getBackpressureStatus();
    expect(status.currentLatencyMs).toBe(500);
    expect(status.pendingWrites).toBe(0);
  });
});

describe("Watchdog", () => {
  test("reports stuck session", () => {
    reportStuckSession("sess-123", 400_000);
    const alerts = getWatchdogAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.alertType).toBe("STUCK_SESSION");
    expect(alerts[0]!.sessionId).toBe("sess-123");
  });

  test("reports orphaned process", () => {
    reportOrphanedProcess("sess-456", 12345);
    const alerts = getWatchdogAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.alertType).toBe("ORPHANED_PROCESS");
  });

  test("circuit open creates watchdog alert", async () => {
    for (let i = 0; i < 3; i++) {
      try {
        await withCircuitBreaker("test", async () => {
          throw new Error("fail");
        });
      } catch {
        /* expected */
      }
    }
    const alerts = getWatchdogAlerts();
    expect(alerts.some((a) => a.alertType === "CIRCUIT_OPEN")).toBe(true);
  });

  test("clear watchdog alerts", () => {
    reportStuckSession("sess-1", 100_000);
    expect(getWatchdogAlerts()).toHaveLength(1);
    clearWatchdogAlerts();
    expect(getWatchdogAlerts()).toHaveLength(0);
  });
});

describe("Report Generation", () => {
  test("generates comprehensive report", async () => {
    registerCircuit("hook-a");
    registerCircuit("hook-b");
    addDeadLetter("cb_test", "{}", "error");
    reportWritePending();

    const report = generateCircuitBreakerReport();
    expect(report.reportId).toMatch(/^cbr_/);
    expect(report.circuits).toHaveLength(2);
    expect(report.deadLetterCount).toBe(1);
    expect(report.deadLetterUnresolved).toBe(1);
    expect(report.overallHealthy).toBe(false); // has unresolved dead letter
  });

  test("healthy when no issues", () => {
    registerCircuit("hook-a");
    const report = generateCircuitBreakerReport();
    expect(report.overallHealthy).toBe(true);
  });

  test("renders markdown", () => {
    registerCircuit("hook-a");
    const report = generateCircuitBreakerReport();
    const md = renderCircuitBreakerMarkdown(report);
    expect(md).toContain("Circuit Breaker Report");
    expect(md).toContain("hook-a");
  });
});

describe("Policy Persistence", () => {
  test("save and load policy", () => {
    const ws = newWorkspace();
    const policy = configureCircuitBreaker({ globalTimeoutMs: 15_000 });
    saveCircuitBreakerPolicy(ws, policy);
    const loaded = loadCircuitBreakerPolicy(ws);
    expect(loaded.globalTimeoutMs).toBe(15_000);
  });
});
