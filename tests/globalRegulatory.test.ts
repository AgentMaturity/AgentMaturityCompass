import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkRegulatoryCurrency } from "../scripts/check-regulatory-currency.mjs";
import { EU_AI_ACT_RISK_MATRIX, GLOBAL_FRAMEWORKS } from "../src/compliance/globalRegulatory.js";
import {
  REGULATORY_REGISTER,
  getRegisterEntriesForStation,
  getRegisterEntry,
} from "../src/compliance/regulatoryRegister/index.js";

const OFFICIAL_HOST = /(^|\.)(europa\.eu|nist\.gov|iso\.org|leg\.colorado\.gov|cac\.gov\.cn|planalto\.gov\.br|pib\.gov\.in|indiacode\.nic\.in|ppc\.go\.jp|japaneselawtranslation\.go\.jp)$/;

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

  it("cites only official or primary hosts", () => {
    for (const source of REGULATORY_REGISTER.entries.flatMap((e) => e.sources)) {
      expect(new URL(source.url).hostname, source.url).toMatch(OFFICIAL_HOST);
    }
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
