import { describe, test, expect } from "vitest";
import { artifactProvenanceManifestSchema, artifactProvenanceSignatureSchema, artifactEvidenceRefSchema } from "../src/artifact/artifactProvenance.js";

describe("artifact provenance schemas", () => {
  test("artifactEvidenceRefSchema validates correct input", () => {
    const valid = artifactEvidenceRefSchema.parse({
      eventId: "evt-123",
      eventHash: "a".repeat(64),
      note: "test evidence ref",
    });
    expect(valid.eventId).toBe("evt-123");
  });

  test("artifactEvidenceRefSchema allows null hash and note", () => {
    const valid = artifactEvidenceRefSchema.parse({
      eventId: "evt-456",
      eventHash: null,
      note: null,
    });
    expect(valid.eventId).toBe("evt-456");
    expect(valid.eventHash).toBeNull();
  });

  test("artifactEvidenceRefSchema rejects missing eventId", () => {
    expect(() => artifactEvidenceRefSchema.parse({ eventHash: null, note: null })).toThrow();
  });

  test("artifactEvidenceRefSchema rejects empty eventId", () => {
    expect(() => artifactEvidenceRefSchema.parse({ eventId: "", eventHash: null, note: null })).toThrow();
  });
});
