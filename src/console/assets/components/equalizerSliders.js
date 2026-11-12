function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderEqualizerSliders(container, rows) {
  if (!container) {
    return;
  }
  const items = Array.isArray(rows) ? rows : [];
  container.innerHTML = items
    .map((row) => {
      const coveragePct = Number((Number(row.evidenceCoverage || 0) * 100).toFixed(1));
      const reasons = Array.isArray(row.reasons) ? row.reasons : [];
      return `
      <div class="card">
        <div class="row spaced">
          <strong>${esc(row.qId)}</strong>
          <span class="pill">${esc(row.status || "OK")}</span>
        </div>
        <div class="row wrap">
          <label>Measured <strong>${Number(row.measured || 0).toFixed(2)}</strong></label>
          <label>Target <output data-target-out="${esc(row.qId)}">${Number(row.desired || 0).toFixed(2)}</output></label>
          <label>Coverage <strong>${coveragePct}%</strong></label>
        </div>
        <input type="range" min="0" max="5" step="1" value="${Math.max(0, Math.min(5, Number(row.desired || 0)))}" data-qid="${esc(row.qId)}"
          aria-label="Target level for ${esc(row.qId)}${row.title ? `: ${esc(row.title)}` : ""}" />
        ${reasons.length > 0 ? `<div class="muted">${esc(reasons.join("; "))}</div>` : ""}
      </div>
    `;
    })
    .join("");

  container.querySelectorAll("input[type=range][data-qid]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const el = event.currentTarget;
      const qid = el.getAttribute("data-qid");
      const out = container.querySelector(`[data-target-out="${qid}"]`);
      if (out) {
        out.textContent = Number(el.value || 0).toFixed(2);
      }
    });
  });
}

export function collectEqualizerTargets(container) {
  const out = {};
  if (!container) {
    return out;
  }
  container.querySelectorAll("input[type=range][data-qid]").forEach((input) => {
    const qid = input.getAttribute("data-qid");
    if (!qid) {
      return;
    }
    out[qid] = Number(input.value || 0);
  });
  return out;
}

