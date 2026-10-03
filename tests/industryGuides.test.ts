import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { listAssurancePacks } from "../src/assurance/packs/index.js";
import { DOMAIN_REGISTRY, type Domain } from "../src/domains/domainRegistry.js";
import { getIndustryPacksByStation, listIndustryPacks } from "../src/domains/industryPacks.js";

/**
 * docs/industries/* are hand-written, so nothing regenerates them when source
 * moves. This test is what keeps them honest: every pack, question count and
 * scenario count in a guide is re-derived from source here, and every file:line
 * citation in a guide's verification appendix must land on a line that still
 * contains the quoted token. A citation that drifts fails loudly and prints
 * where the token lives now.
 */

const root = process.cwd();
const dir = join(root, "docs/industries");
const stations = Object.keys(DOMAIN_REGISTRY) as Domain[];
const guideFiles = ["README.md", ...stations.map((s) => `${s}.md`)];
const STATION_SECTIONS = [
  "## Station metadata",
  "## Sector packs",
  "## Frameworks referenced",
  "## Assurance packs",
  "## Deployment controls",
  "## Evidence outputs",
  "## Known gaps at this commit",
  "## Verification appendix"
];
const EMPTY_CTX = {
  agentId: "a", agentName: "a", role: "r", domain: "health",
  primaryTasks: ["t"], stakeholders: ["s"], riskTier: "high" as const
};

const read = (file: string) => readFileSync(join(dir, file), "utf8");

interface Citation { id: string; file: string; line: number; token: string }

/** Rows of the form: | C12 | claim | `path/to/file.ts:123` | `token` | */
function citations(md: string): Citation[] {
  const appendix = md.slice(md.indexOf("## Verification appendix"));
  const rows: Citation[] = [];
  for (const line of appendix.split("\n")) {
    const m = /^\| (C\d+) \|.*\| `([^`\s]+):(\d+)` \| `([^`]+)` \|$/.exec(line);
    if (m) rows.push({ id: m[1]!, file: m[2]!, line: Number(m[3]), token: m[4]! });
  }
  return rows;
}

/** Table rows whose first cell is a backticked id: | `id` | a | b | ... */
function idRows(section: string): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  for (const line of section.split("\n")) {
    const m = /^\| `([^`]+)` \|(.*)\|$/.exec(line);
    if (m) rows.set(m[1]!, m[2]!.split("|").map((c) => c.trim()));
  }
  return rows;
}

function section(md: string, heading: string): string {
  const start = md.indexOf(heading);
  if (start < 0) return "";
  const rest = md.slice(start + heading.length);
  const next = rest.search(/\n#{2,3} /);
  return md.slice(start, next < 0 ? undefined : start + heading.length + next);
}

describe("industry deployment guides", () => {
  test("a README and one guide per station exist, and nothing else is unaccounted for", () => {
    for (const f of guideFiles) expect(existsSync(join(dir, f)), f).toBe(true);
    const extra = readdirSync(dir).filter((f) => !guideFiles.includes(f));
    expect(extra).toEqual([]);
  });

  test.each(stations)("%s guide has every required section", (station) => {
    const md = read(`${station}.md`);
    for (const h of STATION_SECTIONS) expect(md, h).toContain(`\n${h}\n`);
  });

  test.each(stations)("%s sector-pack table matches source exactly", (station) => {
    const packs = getIndustryPacksByStation(station);
    const rows = idRows(section(read(`${station}.md`), "## Sector packs"));
    expect([...rows.keys()].sort()).toEqual(packs.map((p) => p.id).sort());
    for (const p of packs) {
      const [name, questions, tier, threshold] = rows.get(p.id)!;
      expect({ name, questions: Number(questions), tier, threshold: Number(threshold) }, p.id).toEqual({
        name: p.name, questions: p.questions.length, tier: p.riskTier, threshold: p.certificationThreshold
      });
    }
    const total = packs.reduce((n, p) => n + p.questions.length, 0);
    expect(read(`${station}.md`)).toContain(`Total: ${packs.length} packs, ${total} questions.`);
  });

  test.each(stations)("%s assurance-pack table matches source exactly", (station) => {
    const md = read(`${station}.md`);
    const registered = new Map(listAssurancePacks().map((p) => [p.id, p] as const));
    const linked = idRows(section(md, "### Linked by the station registry"));
    expect([...linked.keys()]).toEqual(DOMAIN_REGISTRY[station].assurancePacks);
    const named = idRows(section(md, "### Registered but not linked"));
    for (const [id, [title, scenarios, emptyPasses]] of [...linked, ...named]) {
      const pack = registered.get(id);
      expect(pack, `${id} is registered`).toBeDefined();
      const passes = pack!.scenarios.filter((s) => s.validate("", s.buildPrompt(EMPTY_CTX), EMPTY_CTX).pass).length;
      expect({ title, scenarios: Number(scenarios), emptyPasses: Number(emptyPasses) }, id).toEqual({
        title: pack!.title, scenarios: pack!.scenarios.length, emptyPasses: passes
      });
    }
    for (const id of named.keys()) expect(DOMAIN_REGISTRY[station].assurancePacks).not.toContain(id);
  });

  test.each(stations)("%s guide names every framework string the station registry declares", (station) => {
    const fw = section(read(`${station}.md`), "## Frameworks referenced");
    const meta = DOMAIN_REGISTRY[station];
    for (const f of [...meta.regulatoryBasis, ...meta.complianceFrameworks]) expect(fw, f).toContain(`\`${f}\``);
    const packStrings = new Set(getIndustryPacksByStation(station).flatMap((p) => [...p.regulatoryBasis, ...p.complianceFrameworks]));
    expect(fw).toContain(`${packStrings.size} distinct framework strings`);
  });

  test("README index totals match source", () => {
    const md = read("README.md");
    const rows = idRows(section(md, "## Stations"));
    expect([...rows.keys()]).toEqual(stations);
    for (const s of stations) {
      const packs = getIndustryPacksByStation(s);
      const [, nPacks, nQuestions] = rows.get(s)!;
      expect([Number(nPacks), Number(nQuestions)], s).toEqual([packs.length, packs.reduce((n, p) => n + p.questions.length, 0)]);
    }
    const all = listIndustryPacks();
    expect(md).toContain(`Total: ${all.length} packs, ${all.reduce((n, p) => n + p.questions.length, 0)} questions.`);
  });

  test.each(guideFiles)("%s: every appendix citation resolves to a line containing its token", (file) => {
    const md = read(file);
    const rows = citations(md);
    expect(rows.length, "appendix has citations").toBeGreaterThan(0);
    const failures: string[] = [];
    for (const c of rows) {
      const path = join(root, c.file);
      if (!existsSync(path)) { failures.push(`${c.id}: ${c.file} does not exist`); continue; }
      const lines = readFileSync(path, "utf8").split("\n");
      if (!(lines[c.line - 1] ?? "").includes(c.token)) {
        const now = lines.flatMap((l, i) => (l.includes(c.token) ? [i + 1] : []));
        failures.push(`${c.id}: ${c.file}:${c.line} lacks \`${c.token}\` (token now at: ${now.join(", ") || "nowhere"})`);
      }
    }
    expect(failures).toEqual([]);
  });

  test.each(guideFiles)("%s: body references and appendix rows correspond one to one", (file) => {
    const md = read(file);
    const at = md.indexOf("## Verification appendix");
    const body = md.slice(0, at);
    const ids = citations(md).map((c) => c.id);
    expect(new Set(ids).size, "citation ids are unique").toBe(ids.length);
    const refs = new Set([...body.matchAll(/\[(C\d+)\]/g)].map((m) => m[1]!));
    expect([...refs].filter((r) => !ids.includes(r)), "body refs without an appendix row").toEqual([]);
    expect(ids.filter((id) => !refs.has(id)), "appendix rows no claim refers to").toEqual([]);
    // Every source location goes through the checked appendix, never raw in prose.
    expect(body.match(/[\w/.-]+\.(?:ts|mjs|js):\d+/g) ?? []).toEqual([]);
  });

  test("no marketing or superiority language", () => {
    for (const f of guideFiles) {
      expect(read(f), f).not.toMatch(/10x|industry[- ]standard|superior|better than|best[- ]in[- ]class|world[- ]class|unmatched/i);
    }
  });
});
