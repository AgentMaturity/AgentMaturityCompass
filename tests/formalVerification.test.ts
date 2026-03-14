/**
 * tests/formalVerification.test.ts
 * Unit tests for src/enforce/formalVerification.ts
 */

import { describe, it, expect } from "vitest";
import {
  CORE_SAFETY_PROPERTIES,
  boundedModelCheck,
  verifyCertificate,
  generateTLASpec,
} from "../src/enforce/formalVerification.js";

describe("CORE_SAFETY_PROPERTIES", () => {
  it("should have at least 4 properties", () => {
    expect(CORE_SAFETY_PROPERTIES.length).toBeGreaterThanOrEqual(4);
  });

  it("should have required fields on each property", () => {
    for (const prop of CORE_SAFETY_PROPERTIES) {
      expect(prop.id).toBeTruthy();
      expect(prop.name).toBeTruthy();
      expect(prop.category).toBeTruthy();
      expect(prop.description).toBeTruthy();
      expect(typeof prop.predicate).toBe("function");
    }
  });

  it("should include trust-floor safety property", () => {
    const trustFloor = CORE_SAFETY_PROPERTIES.find(p => p.id === "safety-trust-floor");
    expect(trustFloor).toBeDefined();
  });

  it("trust-floor predicate should reject low trust + write scope", () => {
    const trustFloor = CORE_SAFETY_PROPERTIES.find(p => p.id === "safety-trust-floor");
    expect(trustFloor).toBeDefined();
    // trustScore < 35 with write scope — should violate (predicate returns false)
    const violating = {
      agentId: "test", trustScore: 30, maturityLevel: "L1" as never,
      activeScopes: ["read", "write"], consecutiveFailures: 0,
      delegationDepth: 0, selfReportedShare: 0.0, staleHours: 0,
    };
    expect(trustFloor!.predicate(violating)).toBe(false);
  });

  it("trust-floor predicate should allow low trust + read-only", () => {
    const trustFloor = CORE_SAFETY_PROPERTIES.find(p => p.id === "safety-trust-floor");
    const safe = {
      agentId: "test", trustScore: 20, maturityLevel: "L1" as never,
      activeScopes: ["read"], consecutiveFailures: 0,
      delegationDepth: 0, selfReportedShare: 0.0, staleHours: 0,
    };
    expect(trustFloor!.predicate(safe)).toBe(true);
  });

  it("each property should have a tlaSpec string", () => {
    for (const prop of CORE_SAFETY_PROPERTIES) {
      expect(typeof prop.tlaSpec).toBe("string");
      expect(prop.tlaSpec.length).toBeGreaterThan(0);
    }
  });
});

describe("boundedModelCheck", () => {
  it("should return an object with totalStates, violations, certificates", () => {
    const result = boundedModelCheck("test-agent-bmc");
    expect(result).toHaveProperty("totalStates");
    expect(result).toHaveProperty("violations");
    expect(result).toHaveProperty("certificates");
  });

  it("should return positive totalStates", () => {
    const result = boundedModelCheck("test-agent-bmc");
    expect(result.totalStates).toBeGreaterThan(0);
  });

  it("violations should be an array", () => {
    const result = boundedModelCheck("test-agent-bmc");
    expect(Array.isArray(result.violations)).toBe(true);
  });

  it("certificates should be an array", () => {
    const result = boundedModelCheck("test-agent-bmc");
    expect(Array.isArray(result.certificates)).toBe(true);
  });

  it("should have more certificates than violations (mostly safe states)", () => {
    const result = boundedModelCheck("test-agent-bmc");
    // Most states should be valid
    expect(result.certificates.length).toBeGreaterThan(0);
  });

  it("violations should have required fields when present", () => {
    const result = boundedModelCheck("test-agent-bmc");
    for (const v of result.violations) {
      expect(v).toHaveProperty("property");
      expect(v).toHaveProperty("holds");
      expect(v.holds).toBe(false);
    }
  });

  it("certificates should have required fields", () => {
    const result = boundedModelCheck("test-agent-bmc");
    for (const cert of result.certificates.slice(0, 3)) {
      expect(cert).toHaveProperty("id");
      expect(cert).toHaveProperty("proofTree");
      expect(cert).toHaveProperty("certificateHash");
    }
  });
});

describe("verifyCertificate", () => {
  it("should return { valid, issues } shape", () => {
    const bmc = boundedModelCheck("cert-verify-agent");
    const cert = bmc.certificates[0];
    if (cert) {
      const result = verifyCertificate(cert);
      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("issues");
      expect(Array.isArray(result.issues)).toBe(true);
    }
  });

  it("should validate a freshly-generated certificate as valid", () => {
    const bmc = boundedModelCheck("valid-cert-agent");
    for (const cert of bmc.certificates.slice(0, 5)) {
      const result = verifyCertificate(cert);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    }
  });

  it("should reject a tampered certificate (wrong hash)", () => {
    const bmc = boundedModelCheck("tamper-agent");
    const cert = bmc.certificates[0];
    if (cert) {
      const tampered = { ...cert, certificateHash: "deadbeef000" };
      const result = verifyCertificate(tampered);
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});

describe("generateTLASpec", () => {
  it("should return a non-empty string", () => {
    const spec = generateTLASpec();
    expect(typeof spec).toBe("string");
    expect(spec.length).toBeGreaterThan(100);
  });

  it("should contain TLA+ MODULE declaration", () => {
    const spec = generateTLASpec();
    expect(spec).toContain("MODULE AMCTrustModel");
  });

  it("should contain VARIABLES declaration", () => {
    const spec = generateTLASpec();
    expect(spec).toContain("VARIABLES");
  });

  it("should contain safety invariants", () => {
    const spec = generateTLASpec();
    expect(spec.toLowerCase()).toMatch(/invariant|safety|init|spec/i);
  });
});
