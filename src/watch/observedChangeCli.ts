/** `amc drift check --against observed`: the observed numbers for one agent and any observed change notes, in plain words. */
import { escapeTerminalControls } from "../tools/builtin/askUserTool.js";
import { resolveAgentId } from "../fleet/paths.js";
import { parseWindowToMs } from "../utils/time.js";
import { observedChangeNotes } from "./observedChange.js";
import { observedRates, readObservedRows } from "./observedTraffic.js";

const percent = (value: number | null) => value === null ? "not recorded" : `${(value * 100).toFixed(1)}%`;

/** Prints the report; returns the exit code: 0 when the rows were read, 3 when there were none to compare. */
export function printObservedDriftCheck(input: { workspace: string; agentId?: string; window: string; json?: boolean; now?: number }): number {
  const agentId = resolveAgentId(input.workspace, input.agentId);
  const untilTs = input.now ?? Date.now();
  const sinceTs = untilTs - parseWindowToMs(input.window);
  const { rows, truncated } = readObservedRows(input.workspace, { agentId, sinceTs, untilTs });
  const rates = observedRates(rows);
  const notes = observedChangeNotes(rows, { sinceTs, untilTs });
  if (input.json) {
    console.log(JSON.stringify({ agentId, window: { since: new Date(sinceTs).toISOString(), until: new Date(untilTs).toISOString() },
      rowsRead: rows.length, truncated, rates, observedChanges: notes, label: "observed change, not a diagnosis" }, null, 2));
    return rows.length === 0 ? 3 : 0;
  }
  const out = (line: string) => console.log(escapeTerminalControls(line));
  out(`What AMC recorded for agent ${agentId} in the last ${input.window} (${rows.length} row(s)${truncated ? ", only the newest 200,000 read" : ""}):`);
  out(`  Tool calls decided: ${rates.toolDecisions.total}; denied ${rates.toolDecisions.denied} (${percent(rates.toolDecisions.denialRate)}); sent to a person ${rates.toolDecisions.asked}`);
  out(`  Tool calls reported back: ${rates.toolOutcomes.total}; failed ${rates.toolOutcomes.failed} (${percent(rates.toolOutcomes.errorRate)}); outcome not reported ${rates.toolOutcomes.outcomeUnknown}`);
  out(`  Model replies through the gateway: ${rates.modelReplies.total}; refusals ${rates.modelReplies.refusals} (${percent(rates.modelReplies.refusalRate)}); no stop reason recorded ${rates.modelReplies.refusalUnknown}`);
  out(`  Tokens per task: ${rates.modelReplies.tokensPerTask ?? "not recorded"} over ${rates.modelReplies.tasks} task(s)`);
  if (rows.length === 0) {
    out("Nothing to compare yet: AMC has no gateway replies or hook reports for this agent in this window.");
    return 3;
  }
  if (notes.length === 0) out("No observed change in these numbers.");
  for (const note of notes) out(`- ${note.text}`);
  out("Counts come from recorded rows; each row's signature is not re-checked here. Run amc verify to check the records.");
  return 0;
}
