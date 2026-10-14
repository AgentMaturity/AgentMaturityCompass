import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { AgentCapabilities, EuAiActRiskTier } from "../src/compliance/euAiActClassifier.js";

// These are local integrity controls for experimental corrections. They do not
// establish current law, expert approval, applicability, or release acceptance.
const root = fileURLToPath(new URL("..", import.meta.url));
const privateRoot = process.env.AMC_P024_PRIVATE_ROOT;
if (privateRoot && (!isAbsolute(privateRoot) || !privateRoot.startsWith("/private/tmp/p0-24-emotion-"))) {
  throw new Error("AMC_P024_PRIVATE_ROOT must identify the owned private emotion fixture");
}
const phase = process.env.AMC_P024_PHASE ?? "ordinary";
if (!/^[a-z0-9-]+$/.test(phase)) throw new Error("Invalid P0-24 evidence phase");
const evidence = mkdtempSync(join(tmpdir(), `p0-24-citations-${phase}-`));
const observations: Array<{ name: string; actual: unknown }> = [];
let classifier: typeof import("../src/compliance/euAiActClassifier.js");
let catalogue: typeof import("../src/domains/packs/regulatoryCatalogue.js");
let schema: typeof import("../src/domains/packs/regulatorySchema.js");
let rubric: typeof import("../src/score/domainPacks.js");
let audit: typeof import("../src/domains/industryPackAudit.js");
let hosts: typeof import("../src/compliance/citations/officialHosts.js");
let findings: import("../src/compliance/citations/lint.js").CitationFinding[];

const correctedIds = [
  "us-qmsr", "us-omb-m-25-21", "us-omb-m-24-10", "us-sr-26-2", "us-sr-11-7",
  "us-eo-14110", "us-eo-13985", "us-eeoc-ai-ta", "us-ugesp-1607-4",
  "us-ada-1630-11", "us-ada-12112", "eu-ai-act-prohibited-practices-guidelines",
] as const;
const experimentalNote = "experimental: P0-24 correction, awaiting expert sign-off.";
const modules = [
  "compliance/euAiActClassifier.js", "domains/packs/regulatoryCatalogue.js",
  "domains/packs/regulatorySchema.js", "score/domainPacks.js",
  "domains/industryPackAudit.js", "compliance/citations/officialHosts.js",
];
function pin(path: string) {
  const bytes = readFileSync(path);
  return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}
function record(name: string, actual: unknown) { observations.push({ name, actual }); }

beforeAll(async () => {
  const selected = privateRoot ?? root;
  [classifier, catalogue, schema, rubric, audit, hosts] = privateRoot
    ? await Promise.all(modules.map((relative) => import(pathToFileURL(join(selected, "dist", relative)).href)))
    : await Promise.all([
      import("../src/compliance/euAiActClassifier.js"), import("../src/domains/packs/regulatoryCatalogue.js"),
      import("../src/domains/packs/regulatorySchema.js"), import("../src/score/domainPacks.js"),
      import("../src/domains/industryPackAudit.js"), import("../src/compliance/citations/officialHosts.js"),
    ]);
  const collectorPath = join(selected, "scripts/check-citations.mjs");
  const collector = await import(pathToFileURL(collectorPath).href) as typeof import("../scripts/check-citations.mjs");
  findings = await collector.collectFindings();
  writeFileSync(join(evidence, "inputs.json"), JSON.stringify({
    phase, privateRoot: privateRoot ?? null, sourceRoot: root,
    runtime: { version: process.version, executable: process.execPath },
    test: pin(fileURLToPath(import.meta.url)), collector: pin(collectorPath),
    compiledInputs: modules.map((relative) => pin(join(selected, "dist", relative))),
    scope: "Local experimental correction integrity; no current-law or expert acceptance claim",
  }, null, 2) + "\n");
  writeFileSync(join(evidence, "actual-collector-findings.json"), JSON.stringify(findings, null, 2) + "\n");
  if (process.env.AMC_P024_EVIDENCE_LOCATION) {
    writeFileSync(process.env.AMC_P024_EVIDENCE_LOCATION, JSON.stringify({ phase, evidence }, null, 2) + "\n");
  }
});
afterAll(() => {
  writeFileSync(join(evidence, "observations.json"), JSON.stringify(observations, null, 2) + "\n");
});

interface ClassifierCase {
  name: string;
  capabilities: AgentCapabilities;
  tier: EuAiActRiskTier;
  articles: string[];
  titles: string[];
}
const classifierCases: ClassifierCase[] = [
  { name: "workplace or education emotion recognition is prohibited", capabilities: { emotionRecognition: true },
    tier: "UNACCEPTABLE", articles: ["Art. 5(1)(f)"], titles: ["Emotion recognition in the workplace or education"] },
  { name: "emotion prohibition precedes employment and chatbot tiers", capabilities: { emotionRecognition: true, employment: true, chatbot: true },
    tier: "UNACCEPTABLE", articles: ["Art. 5(1)(f)"], titles: ["Emotion recognition in the workplace or education"] },
  { name: "social scoring and emotion prohibitions both survive", capabilities: { socialScoring: true, emotionRecognition: true },
    tier: "UNACCEPTABLE", articles: ["Art. 5(1)(c)", "Art. 5(1)(f)"], titles: ["Social scoring", "Emotion recognition in the workplace or education"] },
  { name: "social scoring precedes employment and chatbot tiers", capabilities: { socialScoring: true, employment: true, chatbot: true },
    tier: "UNACCEPTABLE", articles: ["Art. 5(1)(c)"], titles: ["Social scoring"] },
  { name: "false emotion flag leaves the chatbot transparency tier", capabilities: { emotionRecognition: false, chatbot: true },
    tier: "LIMITED", articles: ["Art. 50(1)"], titles: ["Chatbot transparency obligation"] },
  { name: "false social flag leaves the interaction transparency tier", capabilities: { socialScoring: false, humanInteraction: true },
    tier: "LIMITED", articles: ["Art. 50(1)"], titles: ["Disclosure of interaction with an AI system"] },
  { name: "empty capabilities produce no prohibition or obligation", capabilities: {},
    tier: "MINIMAL", articles: [], titles: [] },
];

describe("P0-24 bounded citation corrections", () => {
  for (const item of classifierCases) {
    test(item.name, () => {
      const result = classifier.classifyEuAiActRisk(item.capabilities);
      record(item.name, { capabilities: item.capabilities, result });
      expect(result.riskTier).toBe(item.tier);
      expect(result.articles).toEqual(item.articles);
      expect(result.findings.map((finding) => finding.article)).toEqual(item.articles);
      expect(result.findings.map((finding) => finding.title)).toEqual(item.titles);
      if (item.tier === "UNACCEPTABLE") {
        expect(result.findings.every((finding) => finding.severity === "CRITICAL")).toBe(true);
      }
    });
  }
  test("the complete changed catalogue cohort is present without duplicate IDs", () => {
    const actual = catalogue.REGULATORY_CATALOGUE.filter((item) => correctedIds.includes(item.id as typeof correctedIds[number])).map((item) => item.id);
    record("changed catalogue cohort", actual);
    expect([...actual].sort()).toEqual([...correctedIds].sort());
  });
  for (const id of correctedIds) {
    test(`${id} retains recorded source metadata and the expert-signoff hold`, () => {
      const matches = catalogue.REGULATORY_CATALOGUE.filter((item) => item.id === id);
      expect(matches).toHaveLength(1);
      const instrument = matches[0]!;
      record(id, instrument);
      expect(instrument.citation.trim().length).toBeGreaterThan(0);
      expect(instrument.aliases.length).toBeGreaterThan(0);
      expect(instrument.aliases.every((alias) => alias.trim().length > 0)).toBe(true);
      expect(instrument.note).toContain(experimentalNote);
      expect(instrument.url).toMatch(/^https:\/\//);
      expect(hosts.isSharedOfficialUrl(instrument.url!)).toBe(true);
      // Pin existing recorded dates; this test neither fetches nor refreshes them.
      expect(instrument.retrievedAt).toBe(id === "us-qmsr" ? "2026-10-03" : "2026-10-07");
    });
  }
  test("actual HC-1 uses the QMSR citation and resolves its first reference", () => {
    const questions = rubric.getDomainPackQuestions("health").filter((item) => item.id === "HC-1");
    expect(questions).toHaveLength(1);
    const question = questions[0]!;
    const resolved = schema.resolveRegulatoryRefParts(question.regulatoryRef);
    record("HC-1", { question, resolved });
    expect(question.regulatoryRef).toContain("FDA 21 CFR §820.10");
    expect(question.regulatoryRef).not.toContain("820.30");
    expect(resolved[0]?.instrument?.id).toBe("us-qmsr");
  });
  test("actual FIN-1 scopes SR 26-2 to traditional models with separate agentic governance", () => {
    const questions = rubric.getDomainPackQuestions("wealth").filter((item) => item.id === "FIN-1");
    expect(questions).toHaveLength(1);
    const question = questions[0]!;
    const resolved = schema.resolveRegulatoryInstrument(question.regulatoryRef);
    record("FIN-1", { question, resolved });
    expect(question.regulatoryRef).toContain("SR 26-2");
    expect(question.regulatoryRef).not.toContain("SR 11-7");
    expect(question.text).toContain("traditional models the agent calls");
    expect(question.text).toContain("generative or agentic parts governed separately");
    expect(question.l5).toContain("SR 26-2 validation record exportable");
    expect(resolved?.id).toBe("us-sr-26-2");
  });
  test("strict correction criterion excludes ISO A.5 policy labels from actual audit anchors and collector", () => {
    const anchors = audit.INDUSTRY_PACK_AUDIT_ANCHORS;
    expect(anchors).toHaveLength(9);
    expect(anchors.every((item) => item.iso.trim().length > 0)).toBe(true);
    const invalidAnchors = anchors.flatMap((item, index) => {
      const separator = item.iso.indexOf(" — ");
      const id = separator < 0 ? item.iso.trim() : item.iso.slice(0, separator).trim();
      const label = separator < 0 ? "" : item.iso.slice(separator + 3).trim();
      return (id === "A.5" || id.startsWith("A.5.")) && /\bpolic(?:y|ies)\b/i.test(label) ? [{ index, id, label }] : [];
    });
    const invalidFindings = findings.filter((item) => item.rule === "CIT002" && item.file === "src/domains/industryPackAudit.ts" && item.message.includes("must not be labelled as AI policy"));
    record("strict ISO A.5 policy criterion", { anchors, invalidAnchors, invalidFindings });
    // Both independent emitted records and the real collector must satisfy the
    // strict spec. A held ratchet does not turn an uncorrected pair into a pass.
    expect({ invalidAnchors, invalidFindings }).toEqual({ invalidAnchors: [], invalidFindings: [] });
  });
});
