import { rmSync } from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import { renderNotification } from "../src/cli-agent-options.js";
import { projectNativeRunDiagnostics, renderNativeRunDiagnostics } from "../src/agent/nativeFailureGuidance.js";
import type { LoopNotification } from "../src/agent/loopTypes.js";
import { initProcessorRegistry } from "../src/dataflow/processorRegistry.js";
import type { HttpTransport } from "../src/llm/adapter/transport.js";
import { loopHarness, silentTransport, textStep, type LoopHarness } from "./helpers/agentLoopHarness.js";

/**
 * P2-02: a protected-data refusal in the native loop is classified, not a generic failure. The retry layer records it
 * by code, reason and the registry identifiers it names, never retries it, and the run's diagnostics name it.
 */
const EMAIL = "odalys.fenwick@example.com";

/** Opted in, with the loop's route bound to a purpose that allows PHI only, so a PII request is class_not_permitted. */
function phiOnlyRegistry(dir: string): void {
  initProcessorRegistry(dir, { schemaVersion: "amc.dataflow-processors/v1", experimental: true,
    processors: [{ processorId: "proc-clinic", legalName: "Fixture Clinic Processor",
      contracts: [{ kind: "BAA", reference: "BAA-CLINIC-1", effective: "2026-01-01", expires: null, dataClasses: ["phi"] }] }],
    purposes: [{ purposeId: "triage", allowedDataClasses: ["phi"], allowedTools: ["model.request"], allowedProcessors: ["proc-clinic"] }],
    bindings: [{ providerId: "anthropic", baseUrl: "https://api.anthropic.invalid", processorId: "proc-clinic", purposeId: "triage" }] });
}

describe("P2-02 — DataFlowRefused in the native loop", () => {
  const open: LoopHarness[] = [];
  afterEach(() => {
    for (const h of open.splice(0)) {
      try { h.finish(); } catch { /* already closed */ }
      rmSync(h.dir, { recursive: true, force: true });
    }
  });

  test("a refused request is recorded by its typed reason, never retried, and named by the run diagnostics", async () => {
    let sent = 0;
    const transport: HttpTransport = async (request) => { sent += 1; return silentTransport(request); };
    const notifications: LoopNotification[] = [];
    const h = loopHarness({ scripts: [textStep("never sent")], transport, hooks: { notify: (item) => notifications.push(item) } });
    open.push(h);
    phiOnlyRegistry(h.dir);

    h.driver.followup(`Reply to ${EMAIL} about the invoice.`);
    await h.driver.whenIdle();

    const rows = h.events();
    const refusals = rows.filter((row) => row.event_type === "audit" && JSON.parse(row.meta_json).auditType === "DATA_FLOW_REFUSED");
    expect(refusals).toHaveLength(1);
    expect(JSON.parse(refusals[0]!.meta_json)).toMatchObject({ code: "DATA_FLOW_REFUSED", reason: "class_not_permitted",
      processorId: "proc-clinic", purposeId: "triage" });
    expect(refusals[0]!.meta_json).not.toContain(EMAIL);
    expect(sent, "nothing reaches the provider").toBe(0);
    expect(rows.filter((row) => row.event_type === "request/header"), "admission refuses before a header").toEqual([]);
    expect(rows.filter((row) => row.event_type === "loop/retry"), "a refusal is never retried").toEqual([]);

    const diagnostics = projectNativeRunDiagnostics(rows, h.sessionId);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ source: "turn-error", guidance: { code: "DATA_FLOW_REFUSED" },
      dataFlow: { reason: "class_not_permitted", processorId: "proc-clinic", purposeId: "triage" } });
    const report = renderNativeRunDiagnostics(diagnostics);
    expect(report).toContain("DATA_FLOW_REFUSED: Protected-data admission refused");
    expect(report).toContain("refused: class_not_permitted; processor proc-clinic; purpose triage");

    // A later request in the same turn supersedes the refusal: the turn's error is then not diagnosed as one.
    const end = rows.findIndex((row) => row.event_type === "turn/end");
    const laterHeader = { ...refusals[0]!, id: "later-request-header", event_type: "request/header" };
    expect(projectNativeRunDiagnostics([...rows.slice(0, end), laterHeader, ...rows.slice(end)], h.sessionId)
      .map((item) => item.guidance.code)).toEqual(["UNKNOWN"]);

    const error = notifications.find((item) => item.kind === "error");
    expect(error).toBeDefined();
    expect(renderNotification(error!)).toContain("DATA_FLOW_REFUSED");
  });
});
