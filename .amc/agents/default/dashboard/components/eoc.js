function list(items) {
  const lines = items.map((item) => `<li><label><input type="checkbox" /> ${item}</label></li>`).join("");
  return `<ul class="list">${lines}</ul>`;
}

export function renderEoc(container, eoc) {
  if (!eoc) {
    container.textContent = "No E/O/C data available.";
    return;
  }
  container.innerHTML = [
    '<div class="plan-grid">',
    `<div><h3>Education</h3>${list(eoc.education ?? [])}</div>`,
    `<div><h3>Ownership</h3>${list(eoc.ownership ?? [])}</div>`,
    `<div><h3>Commitment (${eoc.days ?? 14}d)</h3>${list(eoc.commitment ?? [])}</div>`,
    "</div>"
  ].join("");
}
