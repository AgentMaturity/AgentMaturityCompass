import chalk from "chalk";
import type { LabComparisonPair } from "./cognitionLab.js";

export function printLabComparison(pairs: ReadonlyArray<Required<LabComparisonPair>>): void {
  console.log("Single-sample descriptive comparison; statistical significance is not assessed.");
  console.log("Repeated probes align by timestamp-ordered occurrence, without shared trial or seed identity.");
  for (const p of pairs) {
    console.log(`  ${p.probeId} sample ${p.sampleIndex} (${p.status}):`);
    for (const side of ["baseline", "candidate"] as const) {
      if (p.missingDimensions[side].length) console.log(chalk.yellow(`    Missing ${side} dimensions: ${p.missingDimensions[side].join(", ")}`));
    }
    for (const [dim, delta] of Object.entries(p.deltas)) {
      const color = delta > 0 ? chalk.green : delta < 0 ? chalk.red : chalk.white;
      console.log(color(`    ${dim}: ${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}%`));
    }
  }
}
