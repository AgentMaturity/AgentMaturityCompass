/** Markdown helpers for the diagnostic report (moved out of runner.ts to keep it within its line budget). */
export function markdownHeatmap(diff: Array<{ questionId: string; current: number; target: number; gap: number }>): string {
  const header = "| Question | Current | Target | Gap |\n|---|---:|---:|---:|";
  const rows = diff
    .map((row) => `| ${row.questionId} | ${row.current} | ${row.target} | ${row.gap} |`)
    .join("\n");
  return `${header}\n${rows}`;
}

export function markdownCell(input: string): string {
  return input.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}
