// Dumps the mobility station's pack questions as JSON. Run from the repo root: npx tsx <this file> <out.json>
import { writeFileSync } from "node:fs";
import { INDUSTRY_PACKS } from "../../../../../src/domains/industryPacks.js";
const out = Object.fromEntries(Object.values(INDUSTRY_PACKS).filter((p) => p.stationId === "mobility").map((p) => [p.id, p.questions]));
writeFileSync(process.argv[2]!, JSON.stringify(out, null, 2) + "\n");
