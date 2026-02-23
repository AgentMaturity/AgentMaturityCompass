export function renderQuestionDetail(container, data, questionId) {
  const score = data.latestRun.questionScores.find((item) => item.questionId === questionId);
  if (!score) {
    container.textContent = "No question selected.";
    container.style.color = "#4a7a52";
    return;
  }
  const target = data.targetMapping[score.questionId] ?? 0;
  const reasons = score.flags.length > 0 ? score.flags.join(", ") : "none";
  const evidence = score.evidenceEventIds.length > 0 ? score.evidenceEventIds.join(", ") : "none";

  container.innerHTML = [
    `<h3 style="color:#00ff41">${score.questionId}</h3>`,
    `<p style="color:#00cc33">Current <strong style="color:#00ff41">${score.finalLevel}</strong> vs target <strong style="color:#00ff41">${target}</strong></p>`,
    `<p style="color:#4a7a52">Supported max: ${score.supportedMaxLevel}; claimed: ${score.claimedLevel}; confidence: ${score.confidence.toFixed(2)}</p>`,
    `<p style="color:#4a7a52">Why capped: ${reasons}</p>`,
    `<p style="color:#4a7a52">Evidence events: ${evidence}</p>`,
    `<p style="color:#00cc33">Next step: ${score.narrative}</p>`
  ].join("");
}
