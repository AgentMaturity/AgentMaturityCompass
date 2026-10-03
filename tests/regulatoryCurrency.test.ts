import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkRegulatoryCurrency, parseRegisterDate } from "../scripts/check-regulatory-currency.mjs";
import { EU_AI_ACT_RISK_MATRIX, GLOBAL_FRAMEWORKS } from "../src/compliance/globalRegulatory.js";
import {
  OFFICIAL_SOURCE_HOSTS,
  REGULATORY_REGISTER,
  getRegisterEntriesForStation,
  getRegisterEntry,
  isOfficialSourceUrl,
} from "../src/compliance/regulatory/index.js";

const SCRIPT = "scripts/check-regulatory-currency.mjs";
const REGISTER_PATH = "src/compliance/regulatory/register.json";
// Pinned so these tests do not change verdict with the wall clock; the script
// itself (no --as-of) is the dated gate.
const AS_OF = "2026-10-03";
const register = () => JSON.parse(readFileSync(REGISTER_PATH, "utf8"));
const dir = mkdtempSync(join(tmpdir(), "amc-regcurrency-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function runScript(registerObj?: unknown, asOf = AS_OF, extra: string[] = []) {
  const args = [SCRIPT, "--as-of", asOf, ...extra];
  if (registerObj !== undefined) {
    const path = join(dir, `register-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(path, JSON.stringify(registerObj));
    args.push("--register", path);
  }
  return spawnSync(process.execPath, args, { encoding: "utf8" });
}

describe("check-regulatory-currency script", () => {
  it("passes on the committed register and prints the counts", () => {
    const run = runScript();
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    const r = register();
    const verified = r.entries.filter((e: { verified: boolean }) => e.verified).length;
    expect(run.stdout).toContain(`entries=${r.entries.length} verified=${verified} unverified=${r.entries.length - verified}`);
  });

  it("exits 1 when an entry's lastReviewed lapses past the policy window", () => {
    const r = register();
    r.entries[0].lastReviewed = "2024-01-01";
    const run = runScript(r);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/lastReviewed 2024-01-01 is \d+ days old; policy window is 90 days/);
  });

  it("goes stale on its own once the window passes", () => {
    const run = runScript(undefined, "2027-06-01");
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("policy window is 90 days");
  });

  it("accepts --now as an alias of --as-of", () => {
    const run = spawnSync(process.execPath, [SCRIPT, "--now", "2027-06-01"], { encoding: "utf8" });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("policy window is 90 days");
  });

  it("rejects unknown flags and flags without a value", () => {
    const unknown = spawnSync(process.execPath, [SCRIPT, "--asof", "2027-06-01"], { encoding: "utf8" });
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain('unknown argument "--asof"');
    const missing = spawnSync(process.execPath, [SCRIPT, "--now"], { encoding: "utf8" });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("--now needs a value");
  });

  it("--json lists every entry with status, lastReviewed, windowDays and sources", () => {
    const run = runScript(undefined, AS_OF, ["--json"]);
    expect(run.status).toBe(0);
    const out = JSON.parse(run.stdout);
    const r = register();
    expect(out.ok).toBe(true);
    expect(out.allowedHosts).toEqual(r.policy.officialHosts);
    expect(out.entries.map((e: { id: string }) => e.id)).toEqual(r.entries.map((e: { id: string }) => e.id));
    for (const e of out.entries) {
      expect(e.status, e.id).toBeTruthy();
      expect(e.lastReviewed, e.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.windowDays, e.id).toBe(90);
      expect(e.currency, e.id).toBe("current");
      expect(e.sources.length, e.id).toBeGreaterThan(0);
      for (const s of e.sources) expect(s.retrievedAt, `${e.id} ${s.url}`).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
  });

  it("exits 1 when a source cites a non-official host", () => {
    const r = register();
    r.entries[0].sources.push({ title: "Commentary", url: "https://artificialintelligenceact.eu/", publisher: "Future of Life Institute", retrievedAt: AS_OF, fetched: true });
    const run = runScript(r);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("https://artificialintelligenceact.eu/ is not on an official host");
  });

  it("exits 1 when an entry has no source", () => {
    const r = register();
    r.entries[1].sources = [];
    const run = runScript(r);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("has no source");
  });
});

describe("register validation rules", () => {
  it("requires retrievedAt on every source", () => {
    const r = register();
    delete r.entries[0].sources[0].retrievedAt;
    const result = checkRegulatoryCurrency(r, { asOf: AS_OF });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("lacks a valid retrievedAt");
  });

  it("rejects verified=true over an unverified date", () => {
    const r = register();
    r.entries[0].keyDates[0].verified = false;
    expect(r.entries[0].verified).toBe(true);
    const result = checkRegulatoryCurrency(r, { asOf: AS_OF });
    expect(result.errors.join("\n")).toContain("verified=true but it has unverified");
  });

  it("rejects an unfetched source without a reason", () => {
    const r = register();
    const unfetched = r.entries.flatMap((e: { sources: Array<{ fetched: boolean; note?: string }> }) => e.sources).find((s: { fetched: boolean }) => !s.fetched);
    delete unfetched.note;
    expect(checkRegulatoryCurrency(r, { asOf: AS_OF }).errors.join("\n")).toContain("was not fetched and needs a note");
  });

  it("parses only real calendar dates", () => {
    expect(Number.isNaN(parseRegisterDate("2026-02-30"))).toBe(true);
    expect(Number.isNaN(parseRegisterDate("2023-12"))).toBe(false);
    expect(Number.isNaN(parseRegisterDate("2026-10-03T16:22:05Z"))).toBe(false);
  });
});

describe("regulatory register schema", () => {
  it("validates cleanly as of its review date", () => {
    const result = checkRegulatoryCurrency(REGULATORY_REGISTER, { asOf: "2026-10-03" });
    expect(result.errors).toEqual([]);
    expect(result.entries).toBe(REGULATORY_REGISTER.entries.length);
  });

  it("every entry has at least one source with a URL and retrievedAt", () => {
    for (const entry of REGULATORY_REGISTER.entries) {
      expect(entry.sources.length, entry.id).toBeGreaterThan(0);
      for (const source of entry.sources) {
        expect(source.url, entry.id).toMatch(/^https:\/\//);
        expect(source.retrievedAt, entry.id).toMatch(/^\d{4}-\d{2}-\d{2}/);
      }
    }
  });

  it("cites only official or primary hosts (allowlist exported by the register module)", () => {
    for (const source of REGULATORY_REGISTER.entries.flatMap((e) => e.sources)) {
      expect(isOfficialSourceUrl(source.url), source.url).toBe(true);
    }
    expect(isOfficialSourceUrl("https://artificialintelligenceact.eu/")).toBe(false);
    expect(isOfficialSourceUrl("https://eur-lex.europa.eu.example.net/")).toBe(false);
    expect(isOfficialSourceUrl("http://eur-lex.europa.eu/")).toBe(false);
    expect(OFFICIAL_SOURCE_HOSTS).not.toContain("artificialintelligenceact.eu");
  });

  it("covers every station", () => {
    for (const station of ["health", "education", "environment", "mobility", "governance", "technology", "wealth"] as const) {
      expect(getRegisterEntriesForStation(station).length, station).toBeGreaterThan(0);
    }
  });

  it("docs/COMPLIANCE_FRAMEWORKS.md cites every entry with a URL and retrieved date", () => {
    const doc = readFileSync("docs/COMPLIANCE_FRAMEWORKS.md", "utf8");
    for (const entry of REGULATORY_REGISTER.entries) {
      const row = doc.split("\n").find((line) => line.startsWith(`| ${entry.instrument} — `));
      expect(row, entry.id).toBeDefined();
      expect(entry.sources.some((s) => row!.includes(`(${s.url})`) && row!.includes(s.retrievedAt.slice(0, 10))), entry.id).toBe(true);
    }
  });

  it("states what it could not verify instead of asserting it", () => {
    const unverified = REGULATORY_REGISTER.entries.filter((e) => !e.verified);
    expect(unverified.length).toBeGreaterThan(0);
    for (const entry of unverified) {
      const open = entry.openQuestions.length + entry.keyDates.filter((k) => !k.verified).length + entry.agentObligations.filter((o) => !o.verified).length;
      expect(open, entry.id).toBeGreaterThan(0);
    }
  });
});

describe("legacy GLOBAL_FRAMEWORKS view", () => {
  it("links each legacy framework to its register entry", () => {
    for (const framework of GLOBAL_FRAMEWORKS) {
      expect(framework.registerId, framework.frameworkId).toBeDefined();
      expect(getRegisterEntry(framework.registerId!), framework.frameworkId).toBeDefined();
    }
  });

  it("uses the article numbers the register verified", () => {
    const articles = (id: string) => GLOBAL_FRAMEWORKS.find((f) => f.frameworkId === id)!.keyRequirements.map((r) => r.article);
    expect(articles("japan-appi").sort()).toEqual(["Article 20", "Article 27", "Article 28"]);
    expect(articles("india-dpdp")).toContain("Section 10");
    expect(articles("india-dpdp")).not.toContain("Section 9");
    const genai12 = GLOBAL_FRAMEWORKS.find((f) => f.frameworkId === "china-genai")!.keyRequirements.find((r) => r.article === "Article 12");
    expect(genai12?.title).toMatch(/label/i);
  });

  it("EU risk matrix cites the enacted article and Annex III points", () => {
    const ref = (useCase: string) => EU_AI_ACT_RISK_MATRIX.find((m) => m.useCase === useCase)!.annexRef;
    expect(ref("Chatbot")).toBe("Article 50");
    expect(ref("Student assessment scoring")).toBe("Annex III, 3(b)");
    expect(ref("Predictive policing")).toBe("Annex III, 6(d)");
    expect(ref("Energy grid management")).toBe("Annex III, 2");
    expect(ref("Clinical decision support")).toBe("Art. 6(1) + Annex I (Regulation (EU) 2017/745)");
    expect(ref("Resume screening")).toBe("Annex III, 4(a)");
  });
});
