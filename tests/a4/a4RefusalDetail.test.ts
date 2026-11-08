import { describe, expect, test } from "vitest";
import { assertAllowed } from "../../src/a4/a4Gates.js";
import type { A4ReadinessV1 } from "../../src/a4/a4Schema.js";

// LIVE-RUNTIME-23 (fix3 A-8): an A4_NOT_READY refusal names its items; reports, evidence and progress stay server-side.
describe("A4_NOT_READY detail", () => {
  test("each refused item carries only its name, section, status, kind and next action", () => {
    const item = {
      id: "build.verified", section: "implementation", status: "blocked", kind: "evidence_missing", reasonCodes: ["build.verified"],
      report: { counters: { done: 3, total: 9 } }, acknowledged: null, nextAction: { label: "Run the build", route: "/a4/build" },
      mandatory: true, bound: true, evidence: [{ refId: "r1", sha256: "a".repeat(64) }], claim: null
    };
    const readiness = { items: [item], allowed: { "stage.complete": { allowed: false, reasonCodes: ["build.verified"] } } } as unknown as A4ReadinessV1;
    let detail: { reasonCodes: string[]; items: Array<Record<string, unknown>> } | undefined;
    try {
      assertAllowed(readiness, "stage.complete" as never);
    } catch (error) {
      detail = (error as { detail?: typeof detail }).detail;
      expect((error as { code?: string }).code).toBe("A4_NOT_READY");
    }
    expect(detail?.reasonCodes).toEqual(["build.verified"]);
    expect(detail?.items).toEqual([{ id: "build.verified", section: "implementation", status: "blocked", kind: "evidence_missing",
      nextAction: { label: "Run the build", route: "/a4/build" } }]);
  });
});
