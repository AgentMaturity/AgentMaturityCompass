import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderCalendar, validateMilestones } from "../scripts/lib/regulatoryCalendarRender.mjs";
import { EU_AI_ACT_RISK_MATRIX, GLOBAL_FRAMEWORKS } from "../src/compliance/globalRegulatory.js";
import { REGULATORY_REGISTER } from "../src/compliance/regulatory/index.js";
import { questionnaireLabelLines } from "../src/domains/questionnaireLabel.js";

const root = process.cwd();
const script = join(root, "scripts/gen-regulatory-calendar.mjs");
const committed = join(root, "docs/REGULATORY_CALENDAR.md");
const sidecar = JSON.parse(readFileSync(join(root, "docs/industries/_data/regulatory-milestones.json"), "utf8"));
/** What scripts/gen-regulatory-calendar.mjs renders from source: the register, its key dates, the label and the sidecar. */
const fresh = () => renderCalendar(GLOBAL_FRAMEWORKS, { euRiskMatrix: EU_AI_ACT_RISK_MATRIX, milestones: sidecar.milestones,
  registerEntries: REGULATORY_REGISTER.entries, labelLines: questionnaireLabelLines("regulatory-calendar") });
const keyDateCount = REGULATORY_REGISTER.entries.reduce((n, e) => n + e.keyDates.length, 0);

function run(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8", timeout: 60_000 });
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "amc-regcal-"));
}

/** The register as it stands at 8f57ce63: no sources, no lastReviewed, no status. */
const bare = [
  {
    frameworkId: "b-law", name: "B Law", jurisdiction: "Bland", effectiveDate: "2022-01-01",
    mappingStatus: "complete", priorityRank: 2,
    keyRequirements: [
      { requirementId: "b-1", article: "Article 1", title: "Thing", amcMapping: "x.y", evidenceType: "doc", complianceStatus: "mapped" }
    ]
  },
  {
    frameworkId: "a-law", name: "A | Law", jurisdiction: "Aland", effectiveDate: "2020-05-01",
    mappingStatus: "partial", priorityRank: 1, keyRequirements: []
  }
];

/** The same shape with the optional fields a dated register adds. */
const dated = [
  {
    ...bare[0],
    status: "in-force",
    lastReviewed: "2026-10-03",
    verified: true,
    sources: [{ title: "Official text", url: "https://eur-lex.europa.eu/eli/reg/2024/1689/oj", retrievedAt: "2026-10-03" }],
    obligations: [{ appliesFrom: "2027-12-02", title: "Annex III obligations" }]
  },
  { ...bare[1], effectiveDate: null, status: "proposed", verified: false, unverifiedReason: "primary text unreachable 2026-10-03" }
];

describe("regulatory calendar renderer", () => {
  test("renders a register that lacks every optional field, marking dates unverified", () => {
    const md = renderCalendar(bare);
    expect(md).toContain("2 frameworks, 1 key requirements");
    // Sorted by date, earliest first.
    expect(md.indexOf("`a-law`")).toBeLessThan(md.indexOf("`b-law`"));
    expect(md).toMatch(/\| 2020-05-01 \| A \\\| Law \(`a-law`\) \| Aland \|[^\n]*unverified/);
    expect(md).toContain("none recorded");
    expect(md).not.toContain("undefined");
    expect(md).not.toContain("null");
  });

  test("renders the optional dated fields when the register carries them", () => {
    const md = renderCalendar(dated);
    expect(md).toContain("https://eur-lex.europa.eu/eli/reg/2024/1689/oj");
    expect(md).toContain("retrieved 2026-10-03");
    expect(md).toContain("| in-force |");
    expect(md).toContain("2027-12-02");
    expect(md).toContain("Annex III obligations");
    expect(md).toContain("primary text unreachable 2026-10-03");
    // A null effective date is unknown, never a date, and sorts last.
    expect(md).toMatch(/\| unknown \| A \\\| Law/);
    expect(md.indexOf("| 2022-01-01 |")).toBeLessThan(md.indexOf("| unknown |"));
  });

  test("is deterministic: no clock, no commit, no environment in the output", () => {
    expect(renderCalendar(bare)).toBe(renderCalendar(structuredClone(bare)));
    expect(renderCalendar(bare)).not.toMatch(/\b[0-9a-f]{40}\b/);
  });

  test("rejects input that is not a framework list", () => {
    expect(() => renderCalendar({} as never)).toThrow(/array/);
    expect(() => renderCalendar([{ name: "no id" }] as never)).toThrow(/frameworkId/);
  });

  test("the committed calendar is exactly the render of the source register and the sidecar", () => {
    expect(readFileSync(committed, "utf8")).toBe(fresh());
  });

  test.each([
    ["the committed calendar", () => readFileSync(committed, "utf8")],
    ["a fresh render", fresh]
  ])("%s has one register-section row per key date in the sourced register, with its verified flag", (_name, load) => {
    const section = load().split("## Sourced register key dates")[1]!.split("\n## ")[0]!;
    const rows = section.split("\n").filter((l) => /^\| \d{4}(-\d{2}){0,2} \|/.test(l));
    expect(keyDateCount).toBeGreaterThan(0);
    expect(rows).toHaveLength(keyDateCount);
    expect(rows.filter((r) => r.includes("| yes |"))).toHaveLength(REGULATORY_REGISTER.entries.flatMap((e) => e.keyDates).filter((k) => k.verified).length);
    expect(load()).toContain(`Register key dates: ${keyDateCount} `);
  });

  test.each([
    ["the committed calendar", () => readFileSync(committed, "utf8")],
    ["a fresh render", fresh]
  ])("the header of %s states counts derived from the imported register, not literals", (_name, load) => {
    const md = load();
    const reqs = GLOBAL_FRAMEWORKS.reduce((n, f) => n + f.keyRequirements.length, 0);
    const header = md.split("\n").find((l) => l.startsWith("Source:")) ?? "";
    expect(header).toContain(`${GLOBAL_FRAMEWORKS.length} frameworks, ${reqs} key requirements, ${EU_AI_ACT_RISK_MATRIX.length} EU AI Act risk-matrix rows`);
    expect(header).toContain(`Curated milestones: ${sidecar.milestones.length}`);
    expect(header).toContain("src/compliance/globalRegulatory.ts");
    const matrixRows = md.split("## EU AI Act risk matrix")[1].split("\n## ")[0].split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| Sector"));
    expect(matrixRows).toHaveLength(EU_AI_ACT_RISK_MATRIX.length);
  });

  test("no marketing or superiority language in the rendered calendar", () => {
    expect(readFileSync(committed, "utf8")).not.toMatch(/10x|industry[- ]standard|superior|better than|best[- ]in[- ]class|world[- ]class|unmatched|leading /i);
  });
});

type Row = { instrument: string; status: string; date: string; source: { retrievedAt: string } };
/** The sidecar's own as-of date: its latest source read. Deterministic, so the check cannot start failing on a calendar day. */
const curatedAsOf = (rows: Row[]) => rows.map((m) => m.source.retrievedAt).sort().at(-1)!;
const pastDue = (rows: Row[], asOf: string) =>
  rows.filter((m) => /^scheduled/.test(m.status) && m.date < asOf).map((m) => `${m.date} ${m.instrument}`);

const official = {
  instrument: "Test Act", date: "2025-11-14", label: "Rules notified", status: "notified",
  source: { title: "Official page", url: "https://www.pib.gov.in/x", retrievedAt: "2026-10-03" }
};

describe("curated milestones sidecar", () => {
  test("no row still marked scheduled is past its date as of the sidecar's latest read (never the wall clock)", () => {
    expect(pastDue(sidecar.milestones, curatedAsOf(sidecar.milestones))).toEqual([]);
  });

  test("the past-due check flags a scheduled row older than the as-of date, and only that row", () => {
    const rows = [{ ...official, status: "scheduled", date: "2026-06-30" }, { ...official, status: "scheduled", date: "2027-01-01" },
      { ...official, status: "enacted", date: "2024-05-17" }];
    expect(pastDue(rows, "2026-10-04")).toEqual(["2026-06-30 Test Act"]);
  });

  test("Colorado SB26-189 and the Art. 50(2) grace end are present, each flagged for re-verification", () => {
    const rows = sidecar.milestones as Array<{ instrument: string; date: string; status: string; source: { url: string; retrievedAt: string } }>;
    const colorado = rows.find((m) => m.instrument.startsWith("Colorado SB26-189"));
    expect(colorado).toMatchObject({ date: "2027-01-01", source: { url: "https://leg.colorado.gov/bills/sb26-189" } });
    const art50 = rows.find((m) => m.date === "2026-12-02" && m.instrument.includes("Art. 111(4)"));
    expect(art50?.source.url).toBe("https://publications.europa.eu/resource/celex/32026R1744");
    for (const m of [colorado, art50]) expect(m?.status).toContain("re-verify against the primary source before publishing");
    expect(rows.some((m) => m.instrument.includes("SB25B-004") && m.date === "2026-06-30")).toBe(false);
  });

  test("every committed milestone has an official-host source and an ISO retrievedAt, and each renders one row", () => {
    expect(() => validateMilestones(sidecar.milestones)).not.toThrow();
    expect(sidecar.milestones.length).toBeGreaterThan(0);
    const section = readFileSync(committed, "utf8").split("## Externally sourced milestones (curated)")[1].split("\n## ")[0];
    const rows = section.split("\n").filter((l) => /^\| \d{4}-\d{2}-\d{2} \|/.test(l));
    expect(rows).toHaveLength(sidecar.milestones.length);
    for (const m of sidecar.milestones) expect(section).toContain(`retrieved ${m.source.retrievedAt}`);
  });

  test.each([
    ["missing retrievedAt", { ...official, source: { ...official.source, retrievedAt: undefined } }, /retrievedAt/],
    ["non-ISO retrievedAt", { ...official, source: { ...official.source, retrievedAt: "3 Oct 2026" } }, /retrievedAt/],
    ["non-official host", { ...official, source: { ...official.source, url: "https://example.com/law" } }, /official host/],
    ["look-alike host", { ...official, source: { ...official.source, url: "https://nist.gov.example.com/x" } }, /official host/],
    ["plain http", { ...official, source: { ...official.source, url: "http://www.nist.gov/x" } }, /official host/],
    ["missing date", { ...official, date: "" }, /ISO date/],
    ["no instrument or frameworkId", { ...official, instrument: undefined }, /neither/]
  ])("render() fails closed on a milestone with %s", (_name, bad, message) => {
    expect(() => renderCalendar(bare, { milestones: [official, bad] })).toThrow(message);
  });

  test("a register obligation wins over the same sidecar milestone, which is marked superseded by source", () => {
    const register = [{ ...bare[0], obligations: [{ appliesFrom: "2025-11-14", title: "Rules apply" }] }];
    const same = { ...official, frameworkId: "b-law" };
    const other = { ...official, frameworkId: "b-law", date: "2026-01-01", label: "Other" };
    const md = renderCalendar(register, { milestones: [same, other] });
    expect(md).toMatch(/\| 2025-11-14 \| Test Act \| Rules notified \| superseded by source \(`b-law` obligation\) \|/);
    expect(md).toMatch(/\| 2026-01-01 \| Test Act \| Other \| notified \|/);
    expect(md).toContain("| 2025-11-14 | `b-law` | Rules apply |");
  });
});

describe("gen-regulatory-calendar CLI", () => {
  test("--check passes on the committed calendar", () => {
    const r = run(["--check"]);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  test("--check fails when the calendar is edited by hand", () => {
    const dir = scratch();
    const edited = join(dir, "REGULATORY_CALENDAR.md");
    writeFileSync(edited, `${readFileSync(committed, "utf8")}\n<!-- hand edit -->\n`);
    const r = run(["--check", "--out", edited]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/stale/);
  });

  test("--check fails when the calendar is missing", () => {
    const r = run(["--check", "--out", join(scratch(), "absent.md")]);
    expect(r.status).toBe(1);
  });

  test("--data renders a fixture, and --check then passes on what it wrote", () => {
    const dir = scratch();
    const data = join(dir, "register.json");
    const out = join(dir, "cal.md");
    writeFileSync(data, JSON.stringify(dated));
    expect(run(["--data", data, "--out", out]).status).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(renderCalendar(dated));
    expect(run(["--check", "--data", data, "--out", out]).status).toBe(0);
  });

  test("--milestones with an unsourced entry fails closed with exit 2", () => {
    const dir = scratch();
    const bad = join(dir, "milestones.json");
    writeFileSync(bad, JSON.stringify({ milestones: [{ ...official, source: { ...official.source, url: "https://example.com" } }] }));
    const r = run(["--check", "--milestones", bad, "--out", join(dir, "x.md")]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/official host/);
  });

  test("malformed --data fails closed with exit 2", () => {
    const dir = scratch();
    const data = join(dir, "bad.json");
    writeFileSync(data, JSON.stringify({ frameworks: "nope" }));
    const r = run(["--check", "--data", data, "--out", join(dir, "x.md")]);
    expect(r.status).toBe(2);
  });
});
