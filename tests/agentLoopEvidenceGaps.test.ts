import { rmSync } from "node:fs";
import { afterEach, describe, expect, test } from "vitest";
import { verifyAgentRun, renderVerifyReport } from "../src/agent/runReport.js";
import { readEventPayload } from "../src/session/eventPayload.js";
import { toolCallId } from "../src/llm/streamChunk.js";
import type { StreamChunk } from "../src/llm/streamChunk.js";
import {
  loopHarness,
  LOOP_MODEL,
  LOOP_PROVIDER,
  textStep,
  type LoopHarness
} from "./helpers/agentLoopHarness.js";

/**
 * Three gaps the P3.2 review found, each fixed and pinned here.
 *
 * All three are the same family the earlier phases kept shipping: something the
 * model produced or the log claimed escaped the guarantee that was supposed to
 * cover it. None of them broke a test when they were introduced — the suite was
 * fully green with all three present — so each assertion below is written to go
 * RED if its fix is reverted.
 */
describe("P3.2 evidence gaps found by review", () => {
  const open: LoopHarness[] = [];

  afterEach(() => {
    while (open.length > 0) {
      const harness = open.pop();
      if (harness === undefined) continue;
      try {
        harness.finish();
      } catch {
        // A test may have left the driver mid-turn; teardown is best effort.
      }
      rmSync(harness.dir, { recursive: true, force: true });
    }
  });

  test("a dropped tool call records the arguments the model produced, not an empty payload", async () => {
    // A tool_use block cut off by max_tokens is CLOSED by the adapter, so its
    // content lives in `block` and `partial` is null (AssembledBlock's own
    // contract). Reading only `partial` wrote an EMPTY row for exactly these,
    // which meant arguments the consumer's stream had already yielded never
    // reached the signed log — the unsigned side-channel reopening one branch
    // over from where it was closed.
    const truncatedToolCall: StreamChunk[] = [
      { type: "block-start", index: 0, blockKind: "tool_use" },
      {
        type: "tool-call-delta",
        index: 0,
        id: toolCallId("call-1"),
        name: "search_docs",
        argumentsDelta: '{"query":"incident report"}'
      },
      // CLOSED by the adapter — so `block` is set and `partial` is null.
      {
        type: "block-end",
        index: 0,
        block: {
          kind: "tool_use",
          id: toolCallId("call-1"),
          name: "search_docs",
          arguments: '{"query":"incident report"}'
        }
      },
      { type: "usage", usage: { inputTokens: 4, outputTokens: 8, cacheReadTokens: 0, cacheWriteTokens: 0 } },
      // ...and dropped anyway, because a truncated tool call is unsafe to run.
      { type: "finish", reason: { kind: "max_tokens" } }
    ];
    const harness = loopHarness({ scripts: [truncatedToolCall] });
    open.push(harness);

    harness.driver.followup("find the incident report");
    await harness.driver.whenIdle();

    const rows = harness
      .events()
      .filter((event) => event.event_type === "assistant/block");
    const dropped = rows.filter((event) => {
      const meta = JSON.parse(event.meta_json) as { stopReason?: string };
      return typeof meta.stopReason === "string" && meta.stopReason.startsWith("dropped:");
    });

    expect(dropped.length, "a truncated tool call must still be recorded").toBeGreaterThan(0);
    for (const row of dropped) {
      const payload = readEventPayload(harness.dir, row);
      expect(payload.status, "a dropped block's payload must still be readable").toBe("ok");
      const text = payload.status === "ok" ? payload.bytes.toString("utf8") : "";
      // The exact arguments the model emitted, not a placeholder and not "".
      expect(text, "a dropped block must carry what the model produced").not.toBe("");
      expect(text).toContain("incident report");
    }
  });

  test("a turn-start hook that throws still leaves a balanced turn", async () => {
    // The turn/start row is durable before any observer runs, so a throwing
    // hook outside the try/finally produced a turn/start with no turn/end —
    // the truncated turn the finally exists to make impossible. A hook is
    // untrusted code; it must not be able to strand a turn by failing.
    const harness = loopHarness({
      scripts: [textStep("done")],
      hooks: {
        notify: (notification): void => {
          if (notification.kind === "turn-start") throw new Error("hostile observer");
        }
      }
    });
    open.push(harness);

    harness.driver.followup("hello");
    await harness.driver.whenIdle().catch(() => {
      // The throw may surface to the caller; what matters is the log below.
    });

    const events = harness.events();
    const starts = events.filter((event) => event.event_type === "turn/start").length;
    const ends = events.filter((event) => event.event_type === "turn/end").length;
    expect(starts, "the turn opened").toBeGreaterThan(0);
    expect(ends, "every opened turn must be closed, even when an observer throws").toBe(starts);
  });

  test("the run verdict states whether it is anchored, and does not claim authorship when it is not", async () => {
    // "VERIFIED" over an unanchored run means the rows are internally
    // consistent, not that this workspace wrote them: the key they are checked
    // against lives inside the workspace being checked. Four separate surfaces
    // in this project have reported success without saying so.
    const harness = loopHarness({ scripts: [textStep("done")] });
    open.push(harness);
    harness.driver.followup("hello");
    await harness.driver.whenIdle();
    harness.finish();
    open.pop();

    const verdict = await verifyAgentRun(harness.dir, harness.sessionId);
    expect(verdict.trustRoot, "the verdict must carry what it rests on").toBeDefined();
    expect(verdict.trustRoot.anchored, "no fingerprint was pinned, so this is unanchored").toBe(false);

    const rendered = renderVerifyReport(verdict);
    expect(rendered, "an unanchored verdict must say so").toContain("UNANCHORED");
    expect(rendered).toContain("AMC_EXPECTED_MONITOR_FINGERPRINT");

    rmSync(harness.dir, { recursive: true, force: true });
  });
});
