// Small HTML helpers the A4 console renderers share, moved unchanged from a4View.js (the a4-plain split).

export function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
export const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export const stageTitle = (stage) => (typeof stage === "string" && stage ? stage[0].toUpperCase() + stage.slice(1) : "");
export const time = (ts) => (Number.isSafeInteger(ts) ? `${new Date(ts).toISOString().slice(0, 19).replace("T", " ")} UTC` : "");
export const codes = (list) => (Array.isArray(list) ? list.map((code) => `<code>${esc(code)}</code>`).join(" ") : "");
export const shown = (value) => (typeof value === "string" ? value : JSON.stringify(value));
export const list = (rows, empty) => (rows.length ? `<ul class="a4-rows">${rows.join("")}</ul>` : `<p class="muted">${empty}</p>`);

export const cardLabel = (card) => {
  const [stage, id] = String(card ?? "").split(":");
  return id ? `${stageTitle(stage)} › ${id}` : String(card ?? "");
};
