import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Seven packs shipped under ids like `harmbench-research-dataset`, titled
 * "HarmBench Research Dataset Integration", describing "scenarios from the
 * HarmBench dataset" — while loading no dataset at all. Every prompt was
 * hand-written in the pack file. A run produced an evidence record whose
 * `packId` read as HarmBench provenance to anyone auditing it.
 *
 * The prompts themselves were fine. The label was the defect, and a label is
 * exactly what an evidence product cannot get wrong. These tests fail if a pack
 * names a public benchmark it does not load without saying so.
 */

const PACK_DIR = join(__dirname, "..", "src", "assurance", "packs");

/** Public benchmarks whose names carry provenance if you print them. */
const BENCHMARK_NAMES = [
  "HarmBench", "XSTest", "BeaverTails", "DoNotAnswer", "Do-Not-Answer",
  "Aegis", "ToxicChat", "CyberSecEval", "GPQA", "FrontierMath", "SWE-bench",
  "TruthfulQA", "MMLU", "AdvBench", "JailbreakBench"
];

/** Anything that reads data from outside the file. */
const LOADS_DATA = /\bfetch\s*\(|readFileSync|readFile\s*\(|from\s+"[^"]+\.(?:json|jsonl|csv)"|createReadStream/;

/**
 * An affirmative claim that the prompts came from a named collection.
 * Deliberately keyed on "from <Name> <dataset|corpus|…>": that is the sentence
 * shape that asserts provenance, and it does not match a disclaimer saying the
 * collection is NOT loaded.
 */
const CLAIMS_PROVENANCE =
  /\bfrom\s+(?:the\s+)?(?:[A-Z][\w'’]*'s\s+)?[\w'’-]+(?:\s+[\w'’-]+){0,2}\s+(?:dataset|corpus|benchmark|suite)\b/i;

/** An explicit statement that the named benchmark is not being run. */
const DISCLAIMS =
  /\b(?:not\s+(?:downloaded|executed|run)|does\s+not\s+(?:run|download|execute)|is\s+not\s+a\s+\S+\s+score)\b/i;

interface PackMeta {
  file: string;
  id: string;
  title: string;
  description: string;
  loadsData: boolean;
}

/** Read the exported pack literal's metadata straight from source. */
function readPacks(): PackMeta[] {
  const packs: PackMeta[] = [];
  for (const file of readdirSync(PACK_DIR).filter((f) => f.endsWith(".ts") && f !== "index.ts")) {
    const source = readFileSync(join(PACK_DIR, file), "utf8");
    const start = source.lastIndexOf("export const");
    if (start < 0) continue;
    const block = source.slice(start);
    const id = /\n {2}id: "([^"]*)"/.exec(block)?.[1];
    const title = /\n {2}title: "([^"]*)"/.exec(block)?.[1];
    if (id === undefined || title === undefined) continue;
    // Descriptions are written both as one string and as concatenated lines.
    const raw = /\n {2}description:([\s\S]*?)\n {2}\w+:/.exec(block)?.[1] ?? "";
    const description = [...raw.matchAll(/"([^"]*)"/g)].map((m) => m[1]).join("");
    packs.push({ file, id, title, description, loadsData: LOADS_DATA.test(source) });
  }
  return packs;
}

const PACKS = readPacks();

describe("assurance pack provenance", () => {
  it("finds the packs to check", () => {
    // Non-vacuity: a broken parser would make every test below pass silently.
    expect(PACKS.length).toBeGreaterThan(50);
    expect(PACKS.map((p) => p.id)).toContain("harmbench-style-probes");
  });

  it.each(PACKS)("$file does not claim prompts come from a dataset it never loads", (pack) => {
    if (pack.loadsData) return;
    const claim = CLAIMS_PROVENANCE.exec(`${pack.title} ${pack.description}`);
    expect(
      claim?.[0],
      `${pack.file} says "${claim?.[0]}" but loads no data; the prompts are written in the file`
    ).toBeUndefined();
  });

  it.each(PACKS)("$file keeps dataset words out of the id and title unless it loads one", (pack) => {
    if (pack.loadsData) return;
    // The id and title are what land in an evidence record and in `--pack`, so
    // they must not read as provenance even in passing.
    expect(
      /dataset|corpus/i.exec(`${pack.id} ${pack.title}`)?.[0],
      `${pack.file}: id/title must not use dataset language without a dataset`
    ).toBeUndefined();
  });

  it.each(PACKS)("$file that names a public benchmark says it does not run it", (pack) => {
    if (pack.loadsData) return;
    const text = `${pack.id} ${pack.title} ${pack.description}`;
    const named = BENCHMARK_NAMES.filter((name) =>
      new RegExp(`\\b${name.replace(/[-]/g, "[-\\\\s]")}\\b`, "i").test(text)
    );
    if (named.length === 0) return;
    expect(
      DISCLAIMS.test(pack.description),
      `${pack.file} names ${named.join(", ")} but never says AMC does not run it`
    ).toBe(true);
  });

  it("no pack still carries a retired research-dataset id", () => {
    expect(PACKS.filter((p) => p.id.endsWith("-research-dataset"))).toEqual([]);
  });
});
