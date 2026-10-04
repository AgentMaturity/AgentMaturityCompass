/**
 * Loader and guard for the industry assurance scenario corpus
 * (tests/fixtures/industry-assurance). The corpus is data for later
 * certification runs; this test only proves it is well-formed, sourced and
 * free of personal data and credential-looking strings. It grades no agent.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const ROOT = join(__dirname, "fixtures", "industry-assurance");
const PACK_SOURCES = join(__dirname, "..", "src", "assurance", "packs");

/**
 * The 17 industry packs and their stations, as listed in
 * src/assurance/packs/industryPackManifest.ts on the S9 track worktree
 * (read 2026-10-04). That manifest is not on this branch, so the list is
 * restated here and each id is checked against the pack source on this branch.
 */
const EXPECTED_PACKS: Readonly<Record<string, { station: string; file: string }>> = {
  educationFERPA: { station: "education", file: "educationFERPAPack.ts" },
  healthcarePHI: { station: "health", file: "healthcarePHIPack.ts" },
  hipaaCompliance: { station: "health", file: "hipaaCompliancePack.ts" },
  financialSOX: { station: "wealth", file: "financialSOXPack.ts" },
  wealthManagementMiFID: { station: "wealth", file: "wealthManagementMiFIDPack.ts" },
  pharmaCompliance: { station: "health", file: "pharmaCompliancePack.ts" },
  mobilityFunctionalSafety: { station: "mobility", file: "mobilityFunctionalSafetyPack.ts" },
  environmentalInfra: { station: "environment", file: "environmentalInfraPack.ts" },
  technologyGDPRSOC: { station: "technology", file: "technologyGDPRSOCPack.ts" },
  euAiActArticle: { station: "cross-framework", file: "euAiActArticlePack.ts" },
  globalAIRegulatory: { station: "cross-framework", file: "globalAIRegulatoryPack.ts" },
  governanceNISTRMF: { station: "governance", file: "governanceNISTRMFPack.ts" },
  iso42005ImpactAssessment: { station: "cross-framework", file: "iso42005Pack.ts" },
  legalCompliance: { station: "cross-framework", file: "legalCompliancePack.ts" },
  safetyCriticalSIL: { station: "cross-framework", file: "safetyCriticalSILPack.ts" },
  "realtime-voice-safety": { station: "technology", file: "realtimeVoiceSafetyPack.ts" },
  "sbom-supply-chain": { station: "technology", file: "sbomSupplyChainPack.ts" }
};

/** Official or primary publishers only; a law-firm or news URL fails the corpus. */
const OFFICIAL_HOSTS = [
  "govinfo.gov", "federalregister.gov", "ecfr.gov", "sec.gov", "fcc.gov", "ntia.gov", "nist.gov",
  "nhtsa.gov", "uscourts.gov", "ed.gov", "europa.eu", "iso.org", "iec.ch", "unece.org",
  "cac.gov.cn", "parl.ca", "camara.leg.br", "americanbar.org", "aicpa-cima.com"
];
const isOfficialUrl = (raw: string): boolean => {
  const url = new URL(raw);
  return url.protocol === "https:" && OFFICIAL_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AnchorSchema = z
  .object({
    citation: z.string().min(3),
    title: z.string().min(10),
    url: z.string().url().refine(isOfficialUrl, "anchor url is not an official or primary source"),
    status: z.enum(["in-force", "pending", "superseded", "lapsed", "unknown"]),
    verified: z.boolean(),
    retrievedAt: z.string().regex(DATE).optional(),
    reason: z.string().min(10).optional(),
    note: z.string().min(10).optional()
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.verified && !a.retrievedAt) ctx.addIssue({ code: "custom", message: "verified anchor needs retrievedAt" });
    if (!a.verified && !a.reason) ctx.addIssue({ code: "custom", message: "unverified anchor needs a reason" });
  });
const AnchorFileSchema = z.object({ anchors: z.record(z.string().regex(/^[a-z0-9-]+$/), AnchorSchema) }).strict();

const nonEmpty = z.array(z.string().min(3)).min(1);
const ScenarioSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    station: z.string(),
    anchors: nonEmpty,
    prompt: z.string().min(40),
    expectedBehaviour: z.enum(["refuse", "comply-with-controls", "escalate"]),
    mustCite: nonEmpty,
    mustNot: nonEmpty,
    evidenceRequired: nonEmpty
  })
  .strict();
const PackFileSchema = z.object({ pack: z.string(), scenarios: z.array(ScenarioSchema).min(3) }).strict();

type Anchor = z.infer<typeof AnchorSchema>;
type PackFile = z.infer<typeof PackFileSchema>;

const CREDENTIAL_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["aws-access-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["private-key-block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["vendor-api-key", /\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/-]{12,}/],
  ["assigned-secret", /\b(?:password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*\S{4,}/i],
  ["high-entropy", /(?=[A-Za-z0-9+/_-]{32,})(?=[^\s]*[A-Z])(?=[^\s]*[a-z])(?=[^\s]*\d)[A-Za-z0-9+/_-]{32,}/]
];
const RESERVED_EMAIL_DOMAIN = /(?:^|\.)(?:example\.(?:com|org|net)|example|test|invalid)$/i;
const FICTIONAL_PHONE = /555[-.\s]01\d\d$/;

/** Returns the names of every guard a string trips. Fails closed: a false hit is acceptable. */
function hygieneViolations(text: string): string[] {
  const hits = CREDENTIAL_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => `credential:${name}`);
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) hits.push("personal:ssn");
  if (/\b(?:\d[ -]?){13,19}\b/.test(text)) hits.push("personal:card-or-account-number");
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) {
    if (!RESERVED_EMAIL_DOMAIN.test(m[1]!)) hits.push("personal:email");
  }
  for (const m of text.matchAll(/\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g)) {
    if (!FICTIONAL_PHONE.test(m[0])) hits.push("personal:phone");
  }
  if (/\b(?:Mr|Mrs|Ms|Mx|Dr|Prof)\.?\s+[A-Z][a-z]+/.test(text)) hits.push("personal:named-individual");
  if (/\b(?:DOB|date of birth|MRN)\b\s*[:=]?\s*[A-Za-z0-9-]*\d/i.test(text)) hits.push("personal:record-identifier");
  return hits;
}

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}
/** Parse failures are reported by the anchor test below instead of aborting collection. */
function loadAnchors(): { anchors: Record<string, Anchor>; error?: string } {
  const parsed = AnchorFileSchema.safeParse(loadJson(join(ROOT, "anchors.json")));
  return parsed.success ? { anchors: parsed.data.anchors } : { anchors: {}, error: parsed.error.message };
}
function loadPacks(): Map<string, PackFile> {
  const dir = join(ROOT, "packs");
  const packs = new Map<string, PackFile>();
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const parsed = PackFileSchema.safeParse(loadJson(join(dir, name)));
    if (!parsed.success) throw new Error(`${name}: ${parsed.error.message}`);
    if (name !== `${parsed.data.pack}.json`) throw new Error(`${name}: file name must equal its pack id`);
    packs.set(parsed.data.pack, parsed.data);
  }
  return packs;
}
function stringsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsOf);
  return [];
}

describe("industry assurance scenario corpus", () => {
  const { anchors, error: anchorError } = loadAnchors();
  const packs = loadPacks();
  const scenarios = [...packs.values()].flatMap((p) => p.scenarios.map((s) => ({ pack: p.pack, ...s })));

  it("covers exactly the 17 industry packs, each with at least 3 scenarios", () => {
    expect([...packs.keys()].sort()).toEqual(Object.keys(EXPECTED_PACKS).sort());
    for (const [id, { file }] of Object.entries(EXPECTED_PACKS)) {
      const source = readFileSync(join(PACK_SOURCES, file), "utf8");
      expect(source, `${file} declares pack id ${id}`).toContain(`id: "${id}"`);
      expect(packs.get(id)!.scenarios.length).toBeGreaterThanOrEqual(3);
    }
    process.stdout.write(`packs=${packs.size} scenarios=${scenarios.length}\n`);
  });

  it("gives every scenario a unique id and its pack's station", () => {
    const ids = scenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of scenarios) expect(s.station, s.id).toBe(EXPECTED_PACKS[s.pack]!.station);
  });

  it("resolves every scenario anchor to a source, and every mustCite to a live anchor of that scenario", () => {
    for (const s of scenarios) {
      const own = s.anchors.map((key) => {
        expect(anchors[key], `${s.id}: anchor ${key} must exist in anchors.json`).toBeDefined();
        return anchors[key]!;
      });
      for (const cite of s.mustCite) {
        const match = own.find((a) => a.citation === cite);
        expect(match, `${s.id}: mustCite "${cite}" must be the citation of one of its anchors`).toBeDefined();
        expect(["superseded", "lapsed"], `${s.id}: "${cite}" is not live law`).not.toContain(match!.status);
      }
    }
  });

  it("sources every anchor officially: url plus retrievedAt, or verified:false with a reason", () => {
    // AnchorSchema enforces the official-host allowlist and the retrievedAt / reason rule.
    expect(anchorError, "anchors.json must match AnchorSchema").toBeUndefined();
    const used = new Set(scenarios.flatMap((s) => s.anchors));
    for (const key of Object.keys(anchors)) {
      expect(used.has(key), `anchor ${key} is not used by any scenario`).toBe(true);
    }
  });

  it("contains no personal data and no credential-looking string", () => {
    const offending: string[] = [];
    for (const s of scenarios) {
      for (const text of stringsOf(s)) for (const hit of hygieneViolations(text)) offending.push(`${s.id}: ${hit}`);
    }
    for (const [key, a] of Object.entries(anchors)) {
      const { url: _url, ...rest } = a;
      for (const text of stringsOf(rest)) for (const hit of hygieneViolations(text)) offending.push(`anchor ${key}: ${hit}`);
    }
    expect(offending).toEqual([]);
  });
});

describe("corpus hygiene guard", () => {
  // Samples are assembled at runtime so no credential-shaped literal sits in the source.
  const bad: ReadonlyArray<readonly [string, string]> = [
    ["credential:aws-access-key", "AKIA" + "Q".repeat(16)],
    ["credential:private-key-block", "-----BEGIN RSA " + "PRIVATE KEY-----"],
    ["credential:vendor-api-key", "sk" + "-" + "a1B2".repeat(6)],
    ["credential:github-token", "gh" + "p_" + "x9".repeat(15)],
    ["credential:slack-token", "xo" + "xb-" + "1234567890-abc"],
    ["credential:jwt", "ey" + "JhbGciOiJI.eyJzdWIiOiIx.sig"],
    ["credential:bearer-token", "Authorization: Bearer " + "abc.def-ghi_jkl"],
    ["credential:assigned-secret", "pass" + "word=hunter22"],
    ["credential:high-entropy", "Zx9" + "kQ2mP7vR4tW8yB3nL6hJ1fD5sG0cA2eQ"],
    ["personal:ssn", "id " + "123-45-" + "6789"],
    ["personal:card-or-account-number", "card " + "4111 1111 " + "1111 1111"],
    ["personal:email", "write to someone@" + "gmail.com"],
    ["personal:phone", "call 212-" + "867-5309"],
    ["personal:named-individual", "ask Dr. " + "Smith"],
    ["personal:record-identifier", "DOB: " + "1990-01-01"]
  ];
  it.each(bad)("flags %s", (guard, sample) => {
    expect(hygieneViolations(sample)).toContain(guard);
  });
  it("accepts reserved placeholders", () => {
    expect(hygieneViolations("Email reviewer@example.com or call 212-555-0142 about student S-104.")).toEqual([]);
  });
});

describe("anchor sourcing guard", () => {
  const base = { citation: "45 CFR 164.502(b)", title: "HIPAA minimum necessary standard", status: "in-force" };
  const govinfo = "https://www.govinfo.gov/content/pkg/CFR-2024-title45-vol2/xml/CFR-2024-title45-vol2-sec164-502.xml";
  it.each([
    "https://www.examplelawfirm.com/hipaa-summary",
    "https://news.example.org/hipaa",
    "http://www.govinfo.gov/plain-http",
    "https://govinfo.gov.attacker.example/lookalike"
  ])("rejects non-official source %s", (url) => {
    expect(isOfficialUrl(url)).toBe(false);
  });
  it("accepts an official source", () => {
    expect(isOfficialUrl(govinfo)).toBe(true);
  });
  it("requires retrievedAt when verified and a reason when not", () => {
    expect(AnchorSchema.safeParse({ ...base, url: govinfo, verified: true }).success).toBe(false);
    expect(AnchorSchema.safeParse({ ...base, url: govinfo, verified: false }).success).toBe(false);
    expect(AnchorSchema.safeParse({ ...base, url: govinfo, verified: true, retrievedAt: "2026-10-04" }).success).toBe(true);
    expect(AnchorSchema.safeParse({ ...base, url: govinfo, verified: false, reason: "source returned HTTP 403" }).success).toBe(true);
  });
});
