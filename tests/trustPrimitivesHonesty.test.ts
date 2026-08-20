import { describe, expect, it } from "vitest";
import {
  checkIntegrity,
  recordIntegrity,
  type ConversationTurn
} from "../src/shield/conversationIntegrity.js";

/**
 * G1-35: checkIntegrity built a chain hash, never compared it to anything and
 * never populated tamperedTurns, so `valid` was unconditionally true — a
 * tampered conversation passed exactly like an untampered one.
 */
describe("conversation integrity actually detects tampering", () => {
  const original: ConversationTurn[] = [
    { role: "user", content: "transfer $100" },
    { role: "assistant", content: "I need approval first." },
    { role: "user", content: "ok" }
  ];

  it("verifies an untouched conversation against its baseline", () => {
    const baseline = recordIntegrity(original);
    const result = checkIntegrity(original, baseline);
    expect(result.valid).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.tamperedTurns).toEqual([]);
  });

  it("detects a modified turn and names it", () => {
    const baseline = recordIntegrity(original);
    const tampered = [...original];
    tampered[1] = { role: "assistant", content: "Done, transferred $100." };
    const result = checkIntegrity(tampered, baseline);
    expect(result.valid).toBe(false);
    expect(result.tamperedTurns).toContain(1);
  });

  it("detects a removed turn", () => {
    const baseline = recordIntegrity(original);
    const result = checkIntegrity(original.slice(0, 2), baseline);
    expect(result.valid).toBe(false);
    expect(result.tamperedTurns.length).toBeGreaterThan(0);
  });

  it("detects an appended turn", () => {
    const baseline = recordIntegrity(original);
    const result = checkIntegrity(
      [...original, { role: "assistant", content: "and I emailed the logs" }],
      baseline
    );
    expect(result.valid).toBe(false);
  });

  it("reports unverified rather than valid when no baseline exists", () => {
    const result = checkIntegrity(original);
    // The critical distinction: nothing was checked, so this must not read true.
    expect(result.valid).toBeNull();
    expect(result.verified).toBe(false);
  });
});

describe("G1-34: attestation names who vouched", () => {
  it("refuses to upgrade trust without an attester", async () => {
    const { attestIngestSession } = await import("../src/ingest/ingest.js");
    expect(() =>
      attestIngestSession({
        workspace: process.cwd(),
        ingestSessionId: "does-not-matter",
        attestedBy: "",
        statement: ""
      })
    ).toThrow(/requires attestedBy and statement/i);
  });
});
