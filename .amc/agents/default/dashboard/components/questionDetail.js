export function renderQuestionDetail(container, data, questionId) {
  const score = data.latestRun.questionScores.find((item) => item.questionId === questionId);
  if (!score) {
    container.textContent = "No question selected.";
    return;
  }
  const target = data.targetMapping[score.questionId] ?? 0;
  const reasons = score.flags.length > 0 ? score.flags.join(", ") : "none";
  const evidence = score.evidenceEventIds.length > 0 ? score.evidenceEventIds.join(", ") : "none";

  container.innerHTML = [
    `<h3>${score.questionId}</h3>`,
    `<p>Current <strong>${score.finalLevel}</strong> vs target <strong>${target}</strong></p>`,
    `<p>Supported max: ${score.supportedMaxLevel}; claimed: ${score.claimedLevel}; confidence: ${score.confidence.toFixed(2)}</p>`,
    `<p>Why capped: ${reasons}</p>`,
    `<p>Evidence events: ${evidence}</p>`,
    `<p>Next step: ${score.narrative}</p>`
  ].join("");
}
