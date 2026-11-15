// The specification as a readable outline: for the viewed stage's newest revision, what was asked (the answers) and
// what AMC drafted from them, under plain headings, read from the structured data the page already has. The whole
// specification stays, unchanged, under "Show the record" on the Specification card (a4View.renderSpecEditor).
import { QUESTION_LABELS } from "./a4Questions.js";
import { esc, isObject, shown } from "./a4Html.js";
import { answerHtml, say, STAGE_PLAIN } from "./a4Plain.js";

const arr = (value) => (Array.isArray(value) ? value : value === null || value === undefined || value === "" ? [] : [value]);
const text = (value) => (typeof value === "string" ? value : shown(value));
const bullets = (values) => `<ul class="a4-rows">${values.map((value) => `<li>${esc(text(value))}</li>`).join("")}</ul>`;
/** One heading and its value as a list; nothing at all when there is no value. */
const part = (heading, values) => {
  const rows = arr(values).filter((value) => value !== null && value !== undefined && text(value).trim() !== "");
  return rows.length ? `<h5>${esc(heading)}</h5>${rows.length === 1 ? `<p>${esc(text(rows[0]))}</p>` : bullets(rows)}` : "";
};
const files = (build) => arr(build?.files).map((file) => file?.path).filter((path) => typeof path === "string");
const answerOf = (spec, id) => arr(spec.answers).find((answer) => answer?.questionId === id)?.value;
const lines = (value) => (typeof value === "string" ? value.split("\n").map((line) => line.trim()).filter(Boolean) : arr(value));

/** What AMC drafted at each stage, from that stage's specification. */
const DRAFTED = {
  aspire: (spec) => {
    const brief = isObject(spec.brief) ? spec.brief : {};
    return [part("What it is for", [brief.agent, brief.problem]), part("Who it is for", brief.audience), part("Goals", brief.goals),
      part("What it must never do", lines(answerOf(spec, "forbiddenActions"))),
      part("How much could go wrong", brief.riskTier ? `${say("riskTier", brief.riskTier)}${brief.governance === "regulated" ? "; approvals follow the rules for regulated work" : ""}` : null),
      part("Sectors", brief.stations), part("What was built and where", files(spec.build))].join("");
  },
  assemble: (spec) => {
    const preset = isObject(spec.preset) ? spec.preset : {};
    const session = isObject(spec.session) ? spec.session : {};
    const model = session.provider === "stub" || preset.providerId === "stub" ? "the stand-in model (canned replies; it says nothing about a real agent)"
      : [session.provider ?? preset.providerId, session.model ?? preset.model].filter(Boolean).join(", ");
    return [part("What it can do", lines(answerOf(spec, "capabilities"))), part("How much it may do alone", answerOf(spec, "autonomy")),
      part("How it is built", spec.path === "native" ? "inside AMC" : spec.path), part("Which model builds it", model || null),
      part("Tools it may use", session.tools === "none" ? "none" : session.tools),
      part("Limits for each turn", Number.isSafeInteger(session.maxSteps) ? `at most ${session.maxSteps} steps and ${session.maxTokens} tokens` : null),
      part("The build plan", arr(spec.plan).map((task) => task?.title)), part("What was built and where", files(spec.build))].join("");
  },
  adapt: (spec) => {
    const scope = isObject(spec.operatingScope) ? spec.operatingScope : {};
    const requirements = arr(spec.plan?.requirements);
    const applies = requirements.filter((row) => row?.applicability === "applicable");
    const build = isObject(spec.build) ? spec.build : {};
    return [part("What it does", scope.activities), part("Who uses it", scope.audiences), part("Where it operates", scope.jurisdictions),
      part("Languages", scope.languages), part("What it must never be used for", scope.excludedUses), part("Sectors", scope.stations),
      part("Rules worked out", requirements.length ? `${requirements.length} rules looked at; ${applies.length} apply, ${applies.filter((row) => row?.mandatory).length} of them must be met` : null),
      part("Data it handles", isObject(spec.dataHandling) ? [`Data classes: ${arr(spec.dataHandling.dataClasses).join(", ") || "not stated"}`,
        `Where the data stays: ${text(spec.dataHandling.residency ?? "not stated")}`, `How long it is kept: ${text(spec.dataHandling.retention ?? "not stated")}`] : null),
      part("What was built and where", [build.context?.path, build.manifest?.path, build.memoryPolicy?.path])].join("");
  },
  activate: (spec) => [part("Release", isObject(spec.release) ? "a release is drafted (see the Release card)" : null)].join("")
};

/** The outline of `revision` (the viewed stage's newest), or a sentence when the stage has none yet. */
export function renderOutline(stage, revision) {
  const spec = isObject(revision?.spec) ? revision.spec : null;
  if (!spec) return `<p class="muted">Nothing is drafted for ${esc(STAGE_PLAIN[stage] ?? stage)} yet: answer the questions, then Propose drafts it.</p>`;
  const asked = arr(spec.answers).filter((answer) => answer?.value !== null && answer?.value !== undefined && text(answer.value).trim() !== "")
    .map((answer) => `<li><strong>${esc(QUESTION_LABELS[answer.questionId]?.[0] ?? answer.questionId)}</strong> ${answerHtml(answer.questionId, text(answer.value))}</li>`);
  const drafted = DRAFTED[stage]?.(spec) ?? "";
  return `<div class="a4-outline"><h5>What was asked</h5>${asked.length ? `<ul class="a4-rows">${asked.join("")}</ul>` : "<p class=\"muted\">No answers yet.</p>"}
    <h5>What AMC drafted</h5>${drafted || "<p class=\"muted\">Nothing drafted yet: Propose drafts it from the answers.</p>"}</div>`;
}
