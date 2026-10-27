import { describe, expect, test } from "vitest";
import { outcomeOf, runConformance } from "./runConformance.js";

describe("runner isolation (P1-32)", () => {
  test("a hanging implementation times out as error", () => {
    const { results, status } = runConformance("verifier", `${process.execPath} -e setInterval(()=>{},1000) {artifact}`, ["--cases", "VER-001", "--timeout", "500"]);
    expect(results?.cases[0]).toMatchObject({ id: "VER-001", outcome: "error", diff: { error: "timed out after 500 ms" } });
    expect(results?.conformant).toBe(false);
    expect(status).toBe(1);
  });

  test("non-JSON stdout is error, never pass", () => {
    const { results } = runConformance("verifier", `${process.execPath} -e process.stdout.write("pass") {artifact}`, ["--cases", "VER-001"]);
    expect(outcomeOf(results, "VER-001")).toBe("error");
  });

  test("JSON that is not a verifier report fails", () => {
    const { results } = runConformance("verifier", `${process.execPath} -e process.stdout.write("{}") {artifact}`, ["--cases", "VER-001"]);
    expect(results?.cases[0]).toMatchObject({ outcome: "fail", diff: { report: expect.stringContaining("not a verifier-report v1") } });
  });

  test("a placeholder the class does not provide is a usage error, not a run", () => {
    const { status, results, stderr } = runConformance("verifier", `${process.execPath} {scenario}`);
    expect(status).toBe(64);
    expect(results).toBeNull();
    expect(stderr).toContain("{scenario}");
  });
});
