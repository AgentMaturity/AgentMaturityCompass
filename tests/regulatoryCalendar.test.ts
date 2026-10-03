import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { renderCalendar } from "../scripts/gen-regulatory-calendar.mjs";
import { GLOBAL_FRAMEWORKS } from "../src/compliance/globalRegulatory.js";

const root = process.cwd();
const script = join(root, "scripts/gen-regulatory-calendar.mjs");
const committed = join(root, "docs/REGULATORY_CALENDAR.md");

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

  test("the committed calendar is exactly the render of the source register", () => {
    expect(readFileSync(committed, "utf8")).toBe(renderCalendar(GLOBAL_FRAMEWORKS));
    expect(readFileSync(committed, "utf8")).toContain(`${GLOBAL_FRAMEWORKS.length} frameworks`);
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

  test("malformed --data fails closed with exit 2", () => {
    const dir = scratch();
    const data = join(dir, "bad.json");
    writeFileSync(data, JSON.stringify({ frameworks: "nope" }));
    const r = run(["--check", "--data", data, "--out", join(dir, "x.md")]);
    expect(r.status).toBe(2);
  });
});
