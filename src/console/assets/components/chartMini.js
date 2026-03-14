import { renderLine } from "../charts.js";

export function renderChartMini(canvas, values, color = "#4AEF79") {
  const safe = Array.isArray(values) && values.length > 0 ? values : [0];
  renderLine(canvas, safe.map((value) => Number(value || 0)), color);
}

