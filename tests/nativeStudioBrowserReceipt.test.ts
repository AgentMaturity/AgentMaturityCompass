import { describe, expect, test } from "vitest";
import { NATIVE_STUDIO_SCENARIOS, nativeStudioBrowserReceiptPassed } from "../scripts/lib/nativeStudioBrowserReceipt.mjs";

function complete() {
  return {
    planned: [...NATIVE_STUDIO_SCENARIOS],
    checks: NATIVE_STUDIO_SCENARIOS.map(name => ({ name, status: "passed" })),
    cleanup: [{ resource: "owned browser", ok: true }],
    notes: [] as { kind: string }[]
  };
}

describe("native browser acceptance receipt", () => {
  test("requires the retry and archive scenarios in a complete result", () => {
    const receipt = complete();
    expect(nativeStudioBrowserReceiptPassed(receipt)).toBe(true);
    for (const name of ["unreceived-create-explicit-identical-retry", "unreceived-turn-explicit-identical-retry", "explicit-closed-task-archive-retains-inspection"]) {
      expect(receipt.planned).toContain(name);
      expect(nativeStudioBrowserReceiptPassed({ ...receipt, checks: receipt.checks.filter(check => check.name !== name) })).toBe(false);
    }
  });

  test("a duplicate pass cannot conceal an omitted scenario", () => {
    const receipt = complete();
    receipt.checks[1] = { ...receipt.checks[0] };
    expect(nativeStudioBrowserReceiptPassed(receipt)).toBe(false);
  });

  test.each(["failed", "not-exercised"])("preserves a %s result even beside every planned pass", status => {
    const receipt = complete();
    receipt.checks.push({ name: "unexpected-scenario", status });
    expect(nativeStudioBrowserReceiptPassed(receipt)).toBe(false);
  });

  test.each(["page-error", "run-stopped"])("a %s note prevents acceptance after passing scenarios", kind => {
    const receipt = complete(); receipt.notes.push({ kind });
    expect(nativeStudioBrowserReceiptPassed(receipt)).toBe(false);
  });

  test("requires positive browser cleanup and a nonempty distinct plan", () => {
    const receipt = complete();
    expect(nativeStudioBrowserReceiptPassed({ ...receipt, cleanup: [] })).toBe(false);
    expect(nativeStudioBrowserReceiptPassed({ ...receipt, cleanup: [{ resource: "owned browser", ok: false }] })).toBe(false);
    expect(nativeStudioBrowserReceiptPassed({ ...receipt, planned: [], checks: [] })).toBe(false);
    expect(nativeStudioBrowserReceiptPassed({ ...receipt, planned: [receipt.planned[0], receipt.planned[0]], checks: [receipt.checks[0], receipt.checks[0]] })).toBe(false);
  });
});
