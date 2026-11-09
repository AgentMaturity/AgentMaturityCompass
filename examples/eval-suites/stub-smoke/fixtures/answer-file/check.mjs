// The task's own test: the agent must have written answer.txt containing 42. It runs in a pristine copy of this
// fixture plus the declared outputs, under AMC's OS sandbox (or is refused when none is available).
import { readFileSync } from "node:fs";
const answer = readFileSync(new URL("./answer.txt", import.meta.url), "utf8").trim();
if (answer !== "42") { console.error(`expected 42, got ${JSON.stringify(answer)}`); process.exit(1); }
console.log("ok");
