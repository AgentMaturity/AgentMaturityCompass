// Independent of the runner, configuration, trial side and casebook validators.
// Check actual governed fs.read output, never a candidate label or digest.
const expected = new Map([
  ["demo-only-1", "DEMO ONLY: amber\n"], ["demo-only-2", "DEMO ONLY: birch\n"],
  ["demo-only-3", "DEMO ONLY: coral\n"], ["demo-only-4", "DEMO ONLY: dune\n"],
  ["demo-only-5", "DEMO ONLY: elm\n"], ["demo-only-6", "DEMO ONLY: fern\n"]
]);

export function oracle(caseId, results) {
  return expected.has(caseId) && results.length === 1 && results[0].outcome === "OK"
    && results[0].content === expected.get(caseId);
}
