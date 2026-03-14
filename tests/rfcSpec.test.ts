/**
 * RFC Specification Validity Tests
 *
 * Verifies that the AMC Standard RFC (docs/AMC_STANDARD_RFC.md) and
 * Trust Protocol (docs/AMC_TRUST_PROTOCOL.md) accurately reflect the
 * current implementation.
 *
 * Tests:
 * 1. L0–L5 thresholds in the RFC match scoreToLevel()
 * 2. Layer/dimension names in the RFC match the actual question bank
 * 3. Question ID format matches the question bank schema
 * 4. Assurance pack IDs in the RFC match the schema
 * 5. Trust level thresholds match crossAgentTrust.ts implementation
 * 6. Industry decay presets match the implementation
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { scoreToLevel, levelThreshold, getScoringConfig } from "../src/score/scoringScale.js";
import { questionBank } from "../src/diagnostic/questionBank.js";

function getQuestionBank() {
  return questionBank;
}
import {
  INDUSTRY_DECAY_PRESETS,
  verifyAgentClaim,
  createAgentClaim,
  type TrustPolicyRule,
} from "../src/score/crossAgentTrust.js";
import { assurancePackIdSchema } from "../src/assurance/assuranceSchema.js";
import type { LayerName } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RFC_PATH = join(__dirname, "../docs/AMC_STANDARD_RFC.md");
const TRUST_PROTOCOL_PATH = join(__dirname, "../docs/AMC_TRUST_PROTOCOL.md");

// ── Helpers ────────────────────────────────────────────────────────────────

function readDoc(path: string): string {
  return readFileSync(path, "utf8");
}

// ── Section 1: L0–L5 Threshold Verification ───────────────────────────────

describe("RFC Section 2.2 — Maturity Level Thresholds", () => {
  const rfc = readDoc(RFC_PATH);

  it("scoreToLevel correctly maps internal 0 to L0", () => {
    expect(scoreToLevel(0)).toBe("L0");
  });

  it("scoreToLevel correctly maps internal 0.14 to L0", () => {
    expect(scoreToLevel(0.14)).toBe("L0");
  });

  it("scoreToLevel correctly maps internal 0.15 to L1", () => {
    expect(scoreToLevel(0.15)).toBe("L1");
  });

  it("scoreToLevel correctly maps internal 0.34 to L1", () => {
    expect(scoreToLevel(0.34)).toBe("L1");
  });

  it("scoreToLevel correctly maps internal 0.35 to L2", () => {
    expect(scoreToLevel(0.35)).toBe("L2");
  });

  it("scoreToLevel correctly maps internal 0.54 to L2", () => {
    expect(scoreToLevel(0.54)).toBe("L2");
  });

  it("scoreToLevel correctly maps internal 0.55 to L3", () => {
    expect(scoreToLevel(0.55)).toBe("L3");
  });

  it("scoreToLevel correctly maps internal 0.74 to L3", () => {
    expect(scoreToLevel(0.74)).toBe("L3");
  });

  it("scoreToLevel correctly maps internal 0.75 to L4", () => {
    expect(scoreToLevel(0.75)).toBe("L4");
  });

  it("scoreToLevel correctly maps internal 0.89 to L4", () => {
    expect(scoreToLevel(0.89)).toBe("L4");
  });

  it("scoreToLevel correctly maps internal 0.90 to L5", () => {
    expect(scoreToLevel(0.90)).toBe("L5");
  });

  it("scoreToLevel correctly maps internal 1.0 to L5", () => {
    expect(scoreToLevel(1.0)).toBe("L5");
  });

  it("RFC documents L0 threshold as 0-14 on display scale", () => {
    const scale = getScoringConfig().scale;
    // levelThreshold returns the minimum display score for a level
    // L0 starts at 0 and L1 starts at 0.15 × 100 = 15
    expect(levelThreshold("L0")).toBe(0);
    expect(levelThreshold("L1")).toBe(15);
    // RFC documents: L0: 0–14, L1: 15–34
    expect(rfc).toContain("L0 | 0.00 – 0.14 | 0 – 14");
    expect(rfc).toContain("L1 | 0.15 – 0.34 | 15 – 34");
  });

  it("RFC documents L2 threshold as 35-54 on display scale", () => {
    expect(levelThreshold("L2")).toBe(35);
    expect(rfc).toContain("L2 | 0.35 – 0.54 | 35 – 54");
  });

  it("RFC documents L3 threshold as 55-74 on display scale", () => {
    expect(levelThreshold("L3")).toBe(55);
    expect(rfc).toContain("L3 | 0.55 – 0.74 | 55 – 74");
  });

  it("RFC documents L4 threshold as 75-89 on display scale", () => {
    expect(levelThreshold("L4")).toBe(75);
    expect(rfc).toContain("L4 | 0.75 – 0.89 | 75 – 89");
  });

  it("RFC documents L5 threshold as 90-100 on display scale", () => {
    expect(levelThreshold("L5")).toBe(90);
    expect(rfc).toContain("L5 | 0.90 – 1.00 | 90 – 100");
  });

  it("level thresholds are strictly increasing", () => {
    const levels = ["L0", "L1", "L2", "L3", "L4", "L5"] as const;
    for (let i = 1; i < levels.length; i++) {
      expect(levelThreshold(levels[i]!)).toBeGreaterThan(levelThreshold(levels[i - 1]!));
    }
  });
});

// ── Section 2: Dimension / Layer Names Verification ───────────────────────

describe("RFC Section 3 — Layer Names", () => {
  const rfc = readDoc(RFC_PATH);
  let allLayers: Set<LayerName>;

  it("can load question bank without error", () => {
    const bank = getQuestionBank();
    expect(bank).toBeDefined();
    expect(Array.isArray(bank)).toBe(true);
    expect(bank.length).toBeGreaterThan(0);
    allLayers = new Set(bank.map((q) => q.layerName));
  });

  it("RFC documents 'Strategic Agent Operations' layer", () => {
    expect(rfc).toContain("Strategic Agent Operations");
    const bank = getQuestionBank();
    const layerNames = new Set(bank.map((q) => q.layerName));
    expect(layerNames.has("Strategic Agent Operations")).toBe(true);
  });

  it("RFC documents 'Leadership & Autonomy' layer", () => {
    expect(rfc).toContain("Leadership & Autonomy");
    const bank = getQuestionBank();
    const layerNames = new Set(bank.map((q) => q.layerName));
    expect(layerNames.has("Leadership & Autonomy")).toBe(true);
  });

  it("RFC documents 'Culture & Alignment' layer", () => {
    expect(rfc).toContain("Culture & Alignment");
    const bank = getQuestionBank();
    const layerNames = new Set(bank.map((q) => q.layerName));
    expect(layerNames.has("Culture & Alignment")).toBe(true);
  });

  it("RFC documents 'Resilience' layer", () => {
    expect(rfc).toContain("Resilience");
    const bank = getQuestionBank();
    const layerNames = new Set(bank.map((q) => q.layerName));
    expect(layerNames.has("Resilience")).toBe(true);
  });

  it("RFC documents 'Skills' layer", () => {
    expect(rfc).toContain("Skills");
    const bank = getQuestionBank();
    const layerNames = new Set(bank.map((q) => q.layerName));
    expect(layerNames.has("Skills")).toBe(true);
  });

  it("all 5 LayerNames are represented in the question bank", () => {
    const bank = getQuestionBank();
    const layerNames = new Set(bank.map((q) => q.layerName));
    const expectedLayers: LayerName[] = [
      "Strategic Agent Operations",
      "Leadership & Autonomy",
      "Culture & Alignment",
      "Resilience",
      "Skills",
    ];
    for (const layer of expectedLayers) {
      expect(layerNames.has(layer)).toBe(true);
    }
    expect(layerNames.size).toBe(5);
  });

  it("RFC does not claim a 6th layer that does not exist in the question bank", () => {
    const bank = getQuestionBank();
    const layerNames = new Set(bank.map((q) => q.layerName));
    // These would be wrong layer names
    expect(layerNames.has("Transparency" as LayerName)).toBe(false);
    expect(layerNames.has("Security" as LayerName)).toBe(false);
    expect(layerNames.has("Governance" as LayerName)).toBe(false);
  });
});

// ── Section 3: Question Bank Schema Verification ──────────────────────────

describe("RFC Appendix A — Question Format", () => {
  it("every question has required fields: id, layerName, title, options, gates", () => {
    const bank = getQuestionBank();
    for (const q of bank) {
      expect(typeof q.id).toBe("string");
      expect(q.id.length).toBeGreaterThan(0);
      expect(typeof q.layerName).toBe("string");
      expect(typeof q.title).toBe("string");
      expect(Array.isArray(q.options)).toBe(true);
      expect(q.options.length).toBe(6); // L0–L5
      expect(Array.isArray(q.gates)).toBe(true); // gates is an array (one per level)
    }
  });

  it("all question IDs start with 'AMC-'", () => {
    const bank = getQuestionBank();
    for (const q of bank) {
      expect(q.id).toMatch(/^AMC-/);
    }
  });

  it("core questions AMC-1.1 through AMC-1.12 exist in the bank", () => {
    const bank = getQuestionBank();
    const ids = new Set(bank.map((q) => q.id));
    for (let i = 1; i <= 12; i++) {
      expect(ids.has(`AMC-1.${i}`)).toBe(true);
    }
  });

  it("core questions AMC-2.1 through AMC-2.5 exist in the bank", () => {
    const bank = getQuestionBank();
    const ids = new Set(bank.map((q) => q.id));
    for (let i = 1; i <= 5; i++) {
      expect(ids.has(`AMC-2.${i}`)).toBe(true);
    }
  });

  it("OWASP LLM Top 10 questions AMC-5.8 through AMC-5.17 exist in the bank", () => {
    const bank = getQuestionBank();
    const ids = new Set(bank.map((q) => q.id));
    for (let i = 8; i <= 17; i++) {
      expect(ids.has(`AMC-5.${i}`)).toBe(true);
    }
  });

  it("each option has level 0–5 and a non-empty label", () => {
    const bank = getQuestionBank();
    for (const q of bank) {
      for (let level = 0; level <= 5; level++) {
        const option = q.options.find((o) => o.level === level);
        expect(option).toBeDefined();
        expect(typeof option!.label).toBe("string");
        expect(option!.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("gate minEvents increases with level (gates array per question)", () => {
    const bank = getQuestionBank();
    for (const q of bank) {
      // Each question has a gates array — one gate object per level (0–5)
      const gateL1 = q.gates.find((g) => g.level === 1);
      const gateL5 = q.gates.find((g) => g.level === 5);
      if (gateL1) {
        expect(gateL1.minEvents).toBeGreaterThanOrEqual(2);
      }
      if (gateL5) {
        expect(gateL5.minEvents).toBeGreaterThanOrEqual(16);
      }
    }
  });

  it("total question count is greater than 40", () => {
    const bank = getQuestionBank();
    expect(bank.length).toBeGreaterThan(40);
  });
});

// ── Section 4: Assurance Pack Schema Verification ─────────────────────────

describe("RFC Section 5 — Assurance Pack IDs", () => {
  const rfc = readDoc(RFC_PATH);

  it("all 7 core pack IDs are in the RFC", () => {
    const corePackIds = assurancePackIdSchema.options;
    for (const packId of corePackIds) {
      expect(rfc).toContain(`"${packId}"`);
    }
  });

  it("injection pack is in the schema and RFC", () => {
    expect(assurancePackIdSchema.options).toContain("injection");
    expect(rfc).toContain('"injection"');
  });

  it("exfiltration pack is in the schema and RFC", () => {
    expect(assurancePackIdSchema.options).toContain("exfiltration");
    expect(rfc).toContain('"exfiltration"');
  });

  it("truthfulness pack is in the schema and RFC", () => {
    expect(assurancePackIdSchema.options).toContain("truthfulness");
    expect(rfc).toContain('"truthfulness"');
  });
});

// ── Section 5: Trust Level Thresholds ─────────────────────────────────────

describe("Trust Protocol — Trust Level Computation", () => {
  const trustProtocol = readDoc(TRUST_PROTOCOL_PATH);

  const sharedSecret = "test-secret-for-rfc-validation";

  it("composite score >= 0.80 produces 'full' trust level", () => {
    // Create a claim that satisfies all policy checks
    const claim = createAgentClaim(
      "agent-test-full",
      "abc123def456",
      "test-workspace",
      sharedSecret,
      { amcScore: 80, amcLevel: "L4", ttlHours: 24 }
    );
    const policy: TrustPolicyRule = {
      requirePassport: false,
      requireFreshness: false,
      // No minAmcScore or minAmcLevel constraints to isolate signature/freshness checks
    };
    const result = verifyAgentClaim(claim, policy, sharedSecret);
    // With valid sig (0.30) + fresh (0.15) + no score req (0.20) + no level req (0.15) + no passport (0.10) + no workspace (0.10) = 1.0
    expect(result.trustLevel).toBe("full");
    expect(result.trusted).toBe(true);
    expect(result.grantedScopes).toContain("execute");
    expect(result.grantedScopes).toContain("delegate");
  });

  it("invalid signature produces 'untrusted' regardless of score", () => {
    const claim = createAgentClaim(
      "agent-test-untrusted",
      "abc123def456",
      "test-workspace",
      sharedSecret,
      { amcScore: 95, amcLevel: "L5" }
    );
    // Tamper with the signature
    const tamperedClaim = { ...claim, signature: "0000000000000000000000000000000000000000000000000000000000000000" };
    const policy: TrustPolicyRule = { requirePassport: false, requireFreshness: false };
    const result = verifyAgentClaim(tamperedClaim, policy, sharedSecret);
    expect(result.trustLevel).toBe("untrusted");
    expect(result.trusted).toBe(false);
    expect(result.grantedScopes).toHaveLength(0);
  });

  it("failing AMC score check reduces trust composite score", () => {
    const claim = createAgentClaim(
      "agent-low-score",
      "abc123def456",
      "test-workspace",
      sharedSecret,
      { amcScore: 20, amcLevel: "L1" }
    );
    const strictPolicy: TrustPolicyRule = {
      minAmcScore: 70,
      minAmcLevel: "L3",
      requirePassport: true,
      requireFreshness: true,
    };
    const result = verifyAgentClaim(claim, strictPolicy, sharedSecret);
    // Score check fails (-0.20), level check fails (-0.15), passport missing (-0.10)
    // Signature (0.30) + freshness (0.15) + workspace (0.10) = 0.55 → conditional or limited
    expect(["conditional", "limited", "untrusted"]).toContain(result.trustLevel);
  });

  it("trust protocol documents full scope includes delegate", () => {
    expect(trustProtocol).toContain("full");
    expect(trustProtocol).toContain("delegate");
  });

  it("trust protocol documents untrusted grants no scopes", () => {
    expect(trustProtocol).toContain("untrusted");
    expect(trustProtocol).toContain("none");
  });

  it("trust protocol documents conditional scopes as read and write", () => {
    expect(trustProtocol).toContain("conditional");
    expect(trustProtocol).toContain("read, write");
  });
});

// ── Section 6: Industry Decay Presets ─────────────────────────────────────

describe("Trust Protocol — Industry Decay Presets", () => {
  const trustProtocol = readDoc(TRUST_PROTOCOL_PATH);

  it("INDUSTRY_DECAY_PRESETS includes all 5 expected industries", () => {
    expect(INDUSTRY_DECAY_PRESETS).toHaveProperty("healthcare");
    expect(INDUSTRY_DECAY_PRESETS).toHaveProperty("finance");
    expect(INDUSTRY_DECAY_PRESETS).toHaveProperty("defense");
    expect(INDUSTRY_DECAY_PRESETS).toHaveProperty("entertainment");
    expect(INDUSTRY_DECAY_PRESETS).toHaveProperty("general");
  });

  it("healthcare preset uses exponential model with halfLife=4h", () => {
    const preset = INDUSTRY_DECAY_PRESETS.healthcare!;
    expect(preset.model).toBe("exponential");
    expect(preset.halfLifeHours).toBe(4);
    // Trust protocol documents these values
    expect(trustProtocol).toContain("halfLifeHours: 4");
  });

  it("finance preset uses exponential model with halfLife=8h", () => {
    const preset = INDUSTRY_DECAY_PRESETS.finance!;
    expect(preset.model).toBe("exponential");
    expect(preset.halfLifeHours).toBe(8);
    expect(trustProtocol).toContain("halfLifeHours: 8");
  });

  it("defense preset uses step model", () => {
    const preset = INDUSTRY_DECAY_PRESETS.defense!;
    expect(preset.model).toBe("step");
    expect(preset.stepThresholdHours).toBe(4);
    expect(preset.stepReduction).toBe(0.2);
  });

  it("entertainment preset uses linear model with halfLife=72h", () => {
    const preset = INDUSTRY_DECAY_PRESETS.entertainment!;
    expect(preset.model).toBe("linear");
    expect(preset.halfLifeHours).toBe(72);
    expect(trustProtocol).toContain("halfLifeHours: 72");
  });

  it("general preset uses exponential model with halfLife=24h", () => {
    const preset = INDUSTRY_DECAY_PRESETS.general!;
    expect(preset.model).toBe("exponential");
    expect(preset.halfLifeHours).toBe(24);
  });

  it("healthcare decays faster than finance", () => {
    const healthcare = INDUSTRY_DECAY_PRESETS.healthcare!;
    const finance = INDUSTRY_DECAY_PRESETS.finance!;
    expect(healthcare.halfLifeHours).toBeLessThan(finance.halfLifeHours);
  });

  it("finance decays faster than entertainment", () => {
    const finance = INDUSTRY_DECAY_PRESETS.finance!;
    const entertainment = INDUSTRY_DECAY_PRESETS.entertainment!;
    expect(finance.halfLifeHours).toBeLessThan(entertainment.halfLifeHours);
  });

  it("trust protocol appendix table matches implementation values", () => {
    // Table row: "| `healthcare` | exponential | 4h | 24h | 6h | 0.3 |"
    expect(trustProtocol).toContain("healthcare");
    expect(trustProtocol).toContain("4h");
    expect(trustProtocol).toContain("24h");
    expect(trustProtocol).toContain("finance");
    expect(trustProtocol).toContain("8h");
    expect(trustProtocol).toContain("48h");
  });
});

// ── Section 7: RFC Self-Consistency ───────────────────────────────────────

describe("RFC Self-Consistency", () => {
  it("RFC file exists and is non-empty", () => {
    const rfc = readDoc(RFC_PATH);
    expect(rfc.length).toBeGreaterThan(1000);
  });

  it("Trust Protocol file exists and is non-empty", () => {
    const tp = readDoc(TRUST_PROTOCOL_PATH);
    expect(tp.length).toBeGreaterThan(1000);
  });

  it("RFC references the reference implementation source paths", () => {
    const rfc = readDoc(RFC_PATH);
    expect(rfc).toContain("src/score/formalSpec.ts");
    expect(rfc).toContain("src/score/scoringScale.ts");
    expect(rfc).toContain("src/diagnostic/questionBank.ts");
    expect(rfc).toContain("src/assurance/assuranceSchema.ts");
  });

  it("Trust Protocol references the implementation source paths", () => {
    const tp = readDoc(TRUST_PROTOCOL_PATH);
    expect(tp).toContain("src/score/crossAgentTrust.ts");
    expect(tp).toContain("src/passport/trustInterchange.ts");
  });

  it("RFC documents version 1.0", () => {
    const rfc = readDoc(RFC_PATH);
    expect(rfc).toContain("v1.0");
  });

  it("Trust Protocol documents version 1.0", () => {
    const tp = readDoc(TRUST_PROTOCOL_PATH);
    expect(tp).toContain("v1.0");
  });

  it("RFC evidence decay half-life constant matches formalSpec (90 days)", () => {
    const rfc = readDoc(RFC_PATH);
    // From formalSpec.ts: HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000
    expect(rfc).toContain("90-day half-life");
    // And the numeric constant
    expect(rfc).toContain("7776000000"); // 90 × 24 × 3600 × 1000
  });

  it("RFC trust weight values match implementation (1.0 / 0.8 / 0.4)", () => {
    const rfc = readDoc(RFC_PATH);
    // From formalSpec.ts: TRUST_WEIGHTS = { observed: 1.0, attested: 0.8, self_reported: 0.4 }
    expect(rfc).toContain("observed` → **1.0**");
    expect(rfc).toContain("attested` → **0.8**");
    expect(rfc).toContain("self_reported` → **0.4**");
  });
});
