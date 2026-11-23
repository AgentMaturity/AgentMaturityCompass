function f(num) {
  return Number(num || 0).toFixed(2);
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderEtaCard(container, eta) {
  if (!container) {
    return;
  }
  if (!eta || eta.status !== "OK") {
    const reasons = Array.isArray(eta?.reasons) ? eta.reasons : ["insufficient completion history"];
    container.innerHTML = `<p class="muted"><strong>ETA:</strong> Not known (${htmlEscape(reasons.join("; "))})</p>`;
    return;
  }
  container.innerHTML = `
    <div class="grid">
      <div><div class="muted">Optimistic</div><div class="tile-value">${f(eta.optimisticDays)}d</div></div>
      <div><div class="muted">Expected</div><div class="tile-value">${f(eta.expectedDays)}d</div></div>
      <div><div class="muted">Conservative</div><div class="tile-value">${f(eta.conservativeDays)}d</div></div>
    </div>
  `;
}

