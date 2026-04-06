/**
 * Tests for Major (P1) Gap implementations — MF-08, MF-09, MF-13, MF-15
 */
import { describe, expect, test } from "vitest";

// MF-08: Offline mode
import {
  defaultOfflineConfig, offlineModeConfig, liteModeConfig,
  checkOfflineCapability, validateOfflineEnvironment, offlineConfigSchema,
} from "../src/cli/offlineMode.js";

// MF-09: Deep industry packs
import {
  getAllDeepIndustryQuestions, getDeepQuestionsByIndustry,
  getDeepQuestionsByRegulation, getDeepIndustryPackStats,
  DEEP_HEALTHCARE_QUESTIONS, DEEP_FINANCE_QUESTIONS, DEEP_GOVERNMENT_QUESTIONS,
} from "../src/domains/deepIndustryPacks.js";

// MF-13: Risk tiers
import {
  RISK_TIER_PROFILES, getRiskTierProfile, autoDetectRiskTier,
  shouldEscalateTier, riskTierConfigSchema,
} from "../src/diagnostic/riskTiers.js";

// MF-15: Multilingual attacks
import {
  MULTILINGUAL_ATTACKS, getAttacksByLanguage, getAttacksByType,
  getMultilingualAttackStats,
} from "../src/redteam/multilingualAttacks.js";

// ─── MF-08: Offline mode ────────────────────────────

describe("MF-08 Offline Mode", () => {
  test("default config has offline=false", () => { expect(defaultOfflineConfig().offline).toBe(false); });
  test("offline mode config enables all offline flags", () => {
    const c = offlineModeConfig();
    expect(c.offline).toBe(true);
    expect(c.skipRemoteEvidence).toBe(true);
    expect(c.bundledQuestionBank).toBe(true);
  });
  test("lite mode reduces memory", () => {
    const c = liteModeConfig();
    expect(c.lite).toBe(true);
    expect(c.maxMemoryMb).toBeLessThanOrEqual(100);
    expect(c.reportFormat).toBe("minimal");
  });
  test("capability check returns valid result", () => {
    const check = checkOfflineCapability(offlineModeConfig());
    expect(check.canRunOffline).toBe(true);
    expect(check.questionBankAvailable).toBe(true);
  });
  test("validation catches errors", () => {
    const result = validateOfflineEnvironment(offlineConfigSchema.parse({ offline: true, bundledQuestionBank: false }));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
  test("validation produces warnings for offline", () => {
    const result = validateOfflineEnvironment(offlineModeConfig());
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ─── MF-09: Deep industry packs ─────────────────────

describe("MF-09 Deep Industry Packs", () => {
  test("healthcare has 50+ questions", () => { expect(DEEP_HEALTHCARE_QUESTIONS.length).toBeGreaterThanOrEqual(50); });
  test("finance has 50+ questions", () => { expect(DEEP_FINANCE_QUESTIONS.length).toBeGreaterThanOrEqual(50); });
  test("government has 50+ questions", () => { expect(DEEP_GOVERNMENT_QUESTIONS.length).toBeGreaterThanOrEqual(50); });
  test("total deep questions 150+", () => { expect(getAllDeepIndustryQuestions().length).toBeGreaterThanOrEqual(150); });
  test("filter by industry works", () => {
    expect(getDeepQuestionsByIndustry("healthcare").length).toBeGreaterThanOrEqual(50);
    expect(getDeepQuestionsByIndustry("finance").length).toBeGreaterThanOrEqual(50);
    expect(getDeepQuestionsByIndustry("government").length).toBeGreaterThanOrEqual(50);
  });
  test("filter by regulation works", () => {
    expect(getDeepQuestionsByRegulation("HIPAA").length).toBeGreaterThanOrEqual(20);
    expect(getDeepQuestionsByRegulation("SOX").length).toBeGreaterThanOrEqual(10);
    expect(getDeepQuestionsByRegulation("FedRAMP").length).toBeGreaterThanOrEqual(10);
  });
  test("all questions have required fields", () => {
    for (const q of getAllDeepIndustryQuestions()) {
      expect(q.id).toBeTruthy();
      expect(q.industry).toBeTruthy();
      expect(q.regulation).toBeTruthy();
      expect(q.question).toBeTruthy();
      expect(Object.keys(q.levels).length).toBeGreaterThanOrEqual(5);
    }
  });
  test("stats show all industries", () => {
    const stats = getDeepIndustryPackStats();
    expect(stats["healthcare"]).toBeDefined();
    expect(stats["finance"]).toBeDefined();
    expect(stats["government"]).toBeDefined();
  });
  test("all IDs are unique", () => {
    const ids = getAllDeepIndustryQuestions().map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── MF-13: Risk tiers ──────────────────────────────

describe("MF-13 Risk Tiers", () => {
  test("4 tier profiles defined", () => { expect(Object.keys(RISK_TIER_PROFILES).length).toBe(4); });
  test("critical tier has most questions", () => { expect(RISK_TIER_PROFILES["critical"]!.maxQuestions).toBe(235); });
  test("low tier has fewest questions", () => { expect(RISK_TIER_PROFILES["low"]!.maxQuestions).toBe(50); });
  test("getRiskTierProfile returns correct tier", () => {
    expect(getRiskTierProfile("critical").tier).toBe("critical");
    expect(getRiskTierProfile("low").tier).toBe("low");
  });
  test("getRiskTierProfile defaults to med", () => { expect(getRiskTierProfile("unknown").tier).toBe("med"); });
  test("auto-detect: financial data → critical", () => {
    const result = autoDetectRiskTier({ handlesFinancialData: true, hasSafetyControls: true });
    expect(result.detectedTier).toBe("critical");
  });
  test("auto-detect: PII → high", () => {
    const result = autoDetectRiskTier({ handlesPII: true, hasSafetyControls: true });
    expect(result.detectedTier).toBe("high");
  });
  test("auto-detect: network only → med", () => {
    const result = autoDetectRiskTier({ hasNetworkAccess: true, hasSafetyControls: true });
    expect(result.detectedTier).toBe("med");
  });
  test("auto-detect: no safety controls → critical", () => {
    const result = autoDetectRiskTier({ hasSafetyControls: false });
    expect(result.detectedTier).toBe("critical");
  });
  test("auto-detect: minimal → low", () => {
    const result = autoDetectRiskTier({ hasSafetyControls: true });
    expect(result.detectedTier).toBe("low");
  });
  test("tier escalation on regression", () => {
    const r = shouldEscalateTier("med", 1.5, 3);
    expect(r.escalate).toBe(true);
    expect(["high", "critical"]).toContain(r.newTier);
  });
  test("no escalation when stable", () => {
    const r = shouldEscalateTier("med", 0.1, 0);
    expect(r.escalate).toBe(false);
  });
  test("schema validates", () => {
    const result = riskTierConfigSchema.parse(RISK_TIER_PROFILES["critical"]);
    expect(result.tier).toBe("critical");
  });
});

// ─── MF-15: Multilingual attacks ────────────────────

describe("MF-15 Multilingual Attacks", () => {
  test("50+ attack patterns", () => { expect(MULTILINGUAL_ATTACKS.length).toBeGreaterThanOrEqual(50); });
  test("all attacks have required fields", () => {
    for (const a of MULTILINGUAL_ATTACKS) {
      expect(a.id).toBeTruthy();
      expect(a.language).toBeTruthy();
      expect(a.attackType).toBeTruthy();
      expect(a.prompt.length).toBeGreaterThan(5);
      expect(a.description).toBeTruthy();
    }
  });
  test("all IDs are unique", () => {
    const ids = MULTILINGUAL_ATTACKS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  test("covers Chinese attacks", () => { expect(getAttacksByLanguage("zh").length).toBeGreaterThanOrEqual(3); });
  test("covers Russian attacks", () => { expect(getAttacksByLanguage("ru").length).toBeGreaterThanOrEqual(3); });
  test("covers Arabic attacks", () => { expect(getAttacksByLanguage("ar").length).toBeGreaterThanOrEqual(3); });
  test("covers Hindi attacks", () => { expect(getAttacksByLanguage("hi").length).toBeGreaterThanOrEqual(2); });
  test("covers homoglyph attacks", () => { expect(getAttacksByType("homoglyph").length).toBeGreaterThanOrEqual(3); });
  test("covers RTL injection", () => { expect(getAttacksByType("rtl_injection").length).toBeGreaterThanOrEqual(2); });
  test("covers encoding exploits", () => { expect(getAttacksByType("encoding").length).toBeGreaterThanOrEqual(3); });
  test("covers code-switching", () => { expect(getAttacksByType("code_switch").length).toBeGreaterThanOrEqual(3); });
  test("covers cultural exploitation", () => { expect(getAttacksByType("cultural").length).toBeGreaterThanOrEqual(3); });
  test("covers zero-width attacks", () => { expect(getAttacksByType("zero_width").length).toBeGreaterThanOrEqual(2); });
  test("stats are comprehensive", () => {
    const stats = getMultilingualAttackStats();
    expect(stats.totalAttacks).toBeGreaterThanOrEqual(50);
    expect(stats.languages.length).toBeGreaterThanOrEqual(10);
    expect(stats.attackTypes.length).toBeGreaterThanOrEqual(6);
  });
});
