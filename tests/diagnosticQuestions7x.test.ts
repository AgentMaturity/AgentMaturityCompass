import { describe, it, expect } from "vitest";
import { questionBank, questionIds } from "../src/diagnostic/questionBank.js";

// All 40 AMC-7.x question IDs
const AMC_7X_IDS = [
  // 7.1-7.4: Alignment faking detection
  "AMC-7.1",
  "AMC-7.2",
  "AMC-7.3",
  "AMC-7.4",
  // 7.5-7.8: Sandbagging/capability hiding
  "AMC-7.5",
  "AMC-7.6",
  "AMC-7.7",
  "AMC-7.8",
  // 7.9-7.12: Scheming/goal-directed deception
  "AMC-7.9",
  "AMC-7.10",
  "AMC-7.11",
  "AMC-7.12",
  // 7.13-7.15: Oversight undermining resistance
  "AMC-7.13",
  "AMC-7.14",
  "AMC-7.15",
  // 7.16-7.18: Power-seeking behavior detection
  "AMC-7.16",
  "AMC-7.17",
  "AMC-7.18",
  // 7.19-7.21: CBRN capability governance
  "AMC-7.19",
  "AMC-7.20",
  "AMC-7.21",
  // 7.22-7.24: Autonomous replication resistance
  "AMC-7.22",
  "AMC-7.23",
  "AMC-7.24",
  // 7.25-7.27: Temporal behavioral consistency
  "AMC-7.25",
  "AMC-7.26",
  "AMC-7.27",
  // 7.28-7.30: Eval-aware behavior detection
  "AMC-7.28",
  "AMC-7.29",
  "AMC-7.30",
  // 7.31-7.33: RSP compliance verification
  "AMC-7.31",
  "AMC-7.32",
  "AMC-7.33",
  // 7.34-7.36: Organizational safety culture
  "AMC-7.34",
  "AMC-7.35",
  "AMC-7.36",
  // 7.37-7.40: Persuasion/manipulation controls
  "AMC-7.37",
  "AMC-7.38",
  "AMC-7.39",
  "AMC-7.40",
];

describe("AMC-7.x diagnostic questions — existence", () => {
  it("all 40 AMC-7.x question IDs exist in the question bank", () => {
    for (const id of AMC_7X_IDS) {
      expect(
        questionIds,
        `Expected question ${id} to exist in questionBank`
      ).toContain(id);
    }
  });

  it("question bank contains exactly 40 AMC-7.x questions", () => {
    const sevenXQuestions = questionBank.filter((q) => q.id.startsWith("AMC-7."));
    expect(sevenXQuestions.length).toBe(40);
  });
});

describe("AMC-7.x diagnostic questions — structure", () => {
  for (const id of AMC_7X_IDS) {
    it(`${id} has valid structure`, () => {
      const question = questionBank.find((q) => q.id === id);
      expect(question, `Question ${id} not found`).toBeDefined();

      if (!question) return;

      // Required fields
      expect(question.id).toBe(id);
      expect(question.title).toBeTruthy();
      expect(question.title.length).toBeGreaterThan(5);

      expect(question.promptTemplate).toBeTruthy();
      expect(question.promptTemplate.length).toBeGreaterThan(20);

      expect(question.layerName).toBeTruthy();

      // Options array
      expect(question.options).toBeDefined();
      expect(Array.isArray(question.options)).toBe(true);
      expect(question.options.length).toBe(6);

      // Each option has required fields
      for (let i = 0; i < question.options.length; i++) {
        const option = question.options[i];
        expect(option, `Option ${i} missing in ${id}`).toBeDefined();
        expect(option.level).toBeDefined();
        expect(option.label).toBeTruthy();
        expect(option.label.length).toBeGreaterThan(3);
      }

      // Gates array
      expect(question.gates).toBeDefined();
      expect(Array.isArray(question.gates)).toBe(true);
      expect(question.gates.length).toBe(6);

      // Evidence gate hints
      expect(question.evidenceGateHints).toBeTruthy();
      expect(question.evidenceGateHints.length).toBeGreaterThan(20);

      // Upgrade hints
      expect(question.upgradeHints).toBeTruthy();
      expect(question.upgradeHints.length).toBeGreaterThan(20);

      // Tuning knobs
      expect(question.tuningKnobs).toBeDefined();
      expect(Array.isArray(question.tuningKnobs)).toBe(true);
      expect(question.tuningKnobs.length).toBeGreaterThanOrEqual(1);
    });
  }
});

describe("AMC-7.x diagnostic questions — categories", () => {
  it("7.1-7.4 alignment faking questions exist", () => {
    for (const id of ["AMC-7.1", "AMC-7.2", "AMC-7.3", "AMC-7.4"]) {
      expect(questionIds).toContain(id);
    }
  });

  it("7.5-7.8 sandbagging questions exist", () => {
    for (const id of ["AMC-7.5", "AMC-7.6", "AMC-7.7", "AMC-7.8"]) {
      expect(questionIds).toContain(id);
    }
  });

  it("7.9-7.12 scheming/deception questions exist", () => {
    for (const id of ["AMC-7.9", "AMC-7.10", "AMC-7.11", "AMC-7.12"]) {
      expect(questionIds).toContain(id);
    }
  });

  it("7.13-7.15 oversight undermining questions exist", () => {
    for (const id of ["AMC-7.13", "AMC-7.14", "AMC-7.15"]) {
      expect(questionIds).toContain(id);
    }
  });

  it("7.16-7.18 power-seeking questions exist", () => {
    for (const id of ["AMC-7.16", "AMC-7.17", "AMC-7.18"]) {
      expect(questionIds).toContain(id);
    }
  });

  it("7.19-7.21 CBRN governance questions exist", () => {
    for (const id of ["AMC-7.19", "AMC-7.20", "AMC-7.21"]) {
      expect(questionIds).toContain(id);
    }
  });

  it("7.22-7.24 replication resistance questions exist", () => {
    for (const id of ["AMC-7.22", "AMC-7.23", "AMC-7.24"]) {
      expect(questionIds).toContain(id);
    }
  });

  it("7.25-7.27 temporal consistency questions exist", () => {
    for (const id of ["AMC-7.25", "AMC-7.26", "AMC-7.27"]) {
      expect(questionIds).toContain(id);
    }
  });

  it("7.28-7.30 eval-aware behavior questions exist", () => {
    for (const id of ["AMC-7.28", "AMC-7.29", "AMC-7.30"]) {
      expect(questionIds).toContain(id);
    }
  });

  it("7.31-7.33 RSP compliance questions exist", () => {
    for (const id of ["AMC-7.31", "AMC-7.32", "AMC-7.33"]) {
      expect(questionIds).toContain(id);
    }
  });

  it("7.34-7.36 safety culture questions exist", () => {
    for (const id of ["AMC-7.34", "AMC-7.35", "AMC-7.36"]) {
      expect(questionIds).toContain(id);
    }
  });

  it("7.37-7.40 persuasion/manipulation questions exist", () => {
    for (const id of ["AMC-7.37", "AMC-7.38", "AMC-7.39", "AMC-7.40"]) {
      expect(questionIds).toContain(id);
    }
  });
});

describe("AMC-7.x diagnostic questions — no duplicates", () => {
  it("no duplicate question IDs in the question bank", () => {
    const seenIds = new Set<string>();
    const duplicates: string[] = [];
    for (const question of questionBank) {
      if (seenIds.has(question.id)) {
        duplicates.push(question.id);
      }
      seenIds.add(question.id);
    }
    expect(duplicates).toHaveLength(0);
  });

  it("AMC-7.x IDs are unique", () => {
    const uniqueIds = new Set(AMC_7X_IDS);
    expect(uniqueIds.size).toBe(AMC_7X_IDS.length);
  });
});
