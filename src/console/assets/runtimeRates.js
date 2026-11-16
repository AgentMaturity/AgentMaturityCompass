// Tool-call error and denial rates on the Live runs page (GET /api/v1/runtime/tool-rates). Every value is escaped.
import { esc } from "./pageKit.js";

const percent = (value) => typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "not recorded";
const whole = (value) => Number.isFinite(Number(value)) ? String(Math.max(0, Math.round(Number(value)))) : "0";

function line(label, value) {
  return `<div class="studio-terminal-line"><strong>${esc(label)}</strong><span>${esc(value)}</span></div>`;
}

export function toolRatesHtml(rates) {
  if (!rates || typeof rates !== "object") return `<p class="muted">${esc("No tool-call numbers yet.")}</p>`;
  const decisions = rates.toolDecisions || {}, outcomes = rates.toolOutcomes || {}, replies = rates.modelReplies || {};
  return [
    `<p class="muted">${esc(`Last 24 hours, from ${whole(rates.rowsRead)} recorded row(s). Counts from records, not a judgement of the agent.`)}</p>`,
    line("Denied tool calls", `${whole(decisions.denied)} of ${whole(decisions.total)} (${percent(decisions.denialRate)})`),
    line("Sent to a person", whole(decisions.asked)),
    line("Failed tool calls", `${whole(outcomes.failed)} of ${whole(outcomes.total)} (${percent(outcomes.errorRate)})`),
    line("Outcome not reported", whole(outcomes.outcomeUnknown)),
    line("Refused replies", `${whole(replies.refusals)} of ${whole(replies.total)} (${percent(replies.refusalRate)})`)
  ].join("");
}
