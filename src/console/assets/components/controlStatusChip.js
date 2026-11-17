import { plainCodeHtml } from "../plainError.js";

function cssForStatus(status) {
  const value = String(status ?? "INSUFFICIENT_EVIDENCE").toUpperCase();
  if (value === "PASS" || value === "OK") {
    return "status-ok";
  }
  if (value === "FAIL") {
    return "status-bad";
  }
  return "status-warn";
}

export function renderControlStatusChip(status) {
  const value = String(status ?? "INSUFFICIENT_EVIDENCE").toUpperCase();
  return `<span class="${cssForStatus(value)}">${plainCodeHtml(value)}</span>`;
}
