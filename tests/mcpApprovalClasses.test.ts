import { expect, test, vi } from "vitest";
import { gateToolCallsOnApproval } from "../src/agent/approvalGate.js";
import type { AgentToolSeam, ToolCallRequest } from "../src/agent/toolSeam.js";
import { reviewedNativeMcpApprovalOptions, type ReviewedNativeMcpServer } from "../src/setup/nativeMcpConfig.js";

const call: ToolCallRequest = { callId: "mixed-class", toolName: "canonical", rawArguments: "{}", sessionId: "fixture",
  turn: 1, step: 1, parentToken: null, dispatch: "native", signal: new AbortController().signal };

test.each(["READ_ONLY", "WRITE_LOW"] as const)("approval uses reviewed MCP %s class instead of run fallback", async actionClass => {
  const execute = vi.fn(async () => ({ outcome: "OK" as const, content: "", exitCode: 0, timedOut: false, denied: false }));
  const inner: AgentToolSeam = { schemas: () => null, executionMode: () => "parallel", execute };
  const request = vi.fn(async (_ask: import("../src/approvals/seam/approvalSeamTypes.js").ApprovalAsk) => ({ approvalId: "fixture", answer: "deny" as const, proceed: false,
    answeredBy: "fixture", reason: "denied", approvalRequestId: null, requestEventId: "fixture-request", answerEventId: "fixture-answer" }));
  const gate = gateToolCallsOnApproval(inner, { request }, { actionClass: "SECURITY", riskTier: "low", reviewedActionClasses: { canonical: actionClass } });
  expect((await gate.execute(call)).outcome).toBe("DENIED");
  expect(request.mock.calls[0]![0]).toMatchObject({ actionClass });
  expect(execute).not.toHaveBeenCalled();
});


test("a native read retains the configured approval rule without a reviewed MCP override", async () => {
  const execute = vi.fn(async () => ({ outcome: "OK" as const, content: "", exitCode: 0, timedOut: false, denied: false }));
  const inner: AgentToolSeam = { schemas: () => null, executionMode: () => "parallel", execute };
  const request = vi.fn(async (_ask: import("../src/approvals/seam/approvalSeamTypes.js").ApprovalAsk) => ({ approvalId: "fixture", answer: "deny" as const, proceed: false,
    answeredBy: "fixture", reason: "denied", approvalRequestId: null, requestEventId: "fixture-request", answerEventId: "fixture-answer" }));
  const inherited = Object.create({ canonical: "READ_ONLY" }) as Record<string, "READ_ONLY">;
  const gate = gateToolCallsOnApproval(inner, { request }, { actionClass: "WRITE_HIGH", riskTier: "high", reviewedActionClasses: inherited });
  expect((await gate.execute(call)).outcome).toBe("DENIED");
  expect(request.mock.calls[0]![0]).toMatchObject({ actionClass: "WRITE_HIGH" });
  expect(execute).not.toHaveBeenCalled();
});

test("reviewed MCP options bind every class immutably and preserve empty composition shape", () => {
  const servers = [
    { review: { capabilities: [{ name: "mcp_first_reviewed", actionClass: "READ_ONLY" }] } },
    { review: { capabilities: [{ name: "mcp_second_reviewed", actionClass: "WRITE_LOW" }] } }
  ] as unknown as readonly ReviewedNativeMcpServer[];
  const options = reviewedNativeMcpApprovalOptions(servers);
  expect(options.reviewedActionClasses).toEqual({ mcp_first_reviewed: "READ_ONLY", mcp_second_reviewed: "WRITE_LOW" });
  expect(Object.isFrozen(options.reviewedActionClasses)).toBe(true);
  expect(() => { (options.reviewedActionClasses as Record<string, string>).mcp_first_reviewed = "SECURITY"; }).toThrow();
  expect(reviewedNativeMcpApprovalOptions([])).toEqual({});
});
