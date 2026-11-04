// PI-025 crash injection: a real agent loop with automatic summary compaction, killed with
// SIGKILL at a chosen point inside AutoCompactor.summarize. Only the ledger survives.
import type { HttpTransport } from "../../src/llm/adapter/transport.js";
import { loopHarness, silentTransport, textStep } from "../helpers/agentLoopHarness.js";

const point = process.argv[2];
if (!["in-summary-step", "after-summary", "complete"].includes(point ?? "")) throw new Error(`unknown crash point ${point}`);
const crash = (): never => { process.kill(process.pid, "SIGKILL"); throw new Error("unreachable after SIGKILL"); };
const answer = (tag: string): string => `${tag}: ${"prior agent work detail. ".repeat(200)}`;

let requests = 0;
// Request 4 is the summary request: dying there leaves the summary step open with its prompt recorded.
const transport: HttpTransport = async request => {
  if (++requests === 4 && point === "in-summary-step") crash();
  return silentTransport(request);
};
const h = loopHarness({
  scripts: [textStep(answer("first"), { inputTokens: 1000 }), textStep(answer("second"), { inputTokens: 1000 }),
    textStep("third answer", { inputTokens: 9000 }), textStep("Synthetic summary of the first two requests.", { inputTokens: 2000 })],
  transport,
  config: { compaction: { contextWindowTokens: 10_000, threshold: 0.8, keepRecentSteps: 1, pruneMinBytes: 4096, summarize: true, maxPerTurn: 3 } }
});
// The summary receipt is committed before the first drop: dying there leaves the earlier run and the summary step live.
if (point === "after-summary") h.session.dropSurfaceRange = crash;
process.send?.({ ready: true, dir: h.dir, sessionId: h.sessionId });
for (const input of ["first request", "second request", "third request"]) {
  h.driver.followup(input);
  await h.driver.whenIdle();
}
h.session.releaseWithoutClosing();
process.send?.({ finished: true });
