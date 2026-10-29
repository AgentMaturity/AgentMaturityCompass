function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderBenchPercentileTable(root, percentiles) {
  if (!root) return;
  const rows = Object.entries(percentiles || {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `<tr><td>${esc(key)}</td><td>${value === null ? "n/a" : Number(value).toFixed(2)}</td></tr>`)
    .join("");
  root.innerHTML = `
    <table>
      <thead><tr><th>Metric</th><th>Percentile</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="2" class="muted">No percentile data.</td></tr>`}</tbody>
    </table>
  `;
}
