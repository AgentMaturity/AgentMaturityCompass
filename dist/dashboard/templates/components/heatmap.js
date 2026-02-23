function shade(current, target) {
  const gap = target - current;
  if (gap <= 0) {
    return "#0d2b0d";
  }
  if (gap === 1) {
    return "#1a3a1a";
  }
  if (gap === 2) {
    return "#2a1a0a";
  }
  return "#3a0a0a";
}

function textColor(current, target) {
  const gap = target - current;
  if (gap <= 0) {
    return "#00ff41";
  }
  if (gap === 1) {
    return "#00cc33";
  }
  if (gap === 2) {
    return "#ff9933";
  }
  return "#ff4444";
}

export function renderHeatmap(container, questionScores, targetMapping, onSelect) {
  const table = document.createElement("table");
  table.innerHTML = "<thead><tr><th>QID</th><th>Current</th><th>Target</th><th>Gap</th></tr></thead>";
  const body = document.createElement("tbody");

  for (const score of questionScores) {
    const target = targetMapping[score.questionId] ?? 0;
    const gap = target - score.finalLevel;
    const tr = document.createElement("tr");
    tr.style.background = shade(score.finalLevel, target);
    tr.style.color = textColor(score.finalLevel, target);
    tr.innerHTML = [
      `<td><button type="button" data-qid="${score.questionId}">${score.questionId}</button></td>`,
      `<td>${score.finalLevel}</td>`,
      `<td>${target}</td>`,
      `<td>${gap}</td>`
    ].join("");
    body.appendChild(tr);
  }
  table.appendChild(body);
  container.innerHTML = "";
  container.appendChild(table);

  for (const button of container.querySelectorAll("button[data-qid]")) {
    button.addEventListener("click", () => onSelect(button.dataset.qid));
  }
}
