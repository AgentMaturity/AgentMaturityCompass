/**
 * P1-38: a matrix cell is supported or unsupported only when the contract test that claims it PASSED in the vitest
 * report of the same run. A failed claim is unknown, a claim that did not run is "not run", and the committed matrix is
 * the rendering of that result.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildMatrix, checkMatrix, MATRIX_JSON, MATRIX_MD, renderMatrix } from "../scripts/gen-capability-matrix.mjs";

const ROOT = "/fixture-root";
const TITLE = "openai: proves text input";
const claimFiles = [{ schemaVersion: 2, source: "native",
  routes: [{ route: "openai", protocol: "openai-chat-completions", adapter: "openai-chat@4", encoder: "openai-chat@4",
    declared: { "text-input": "supported", "image-input": "supported", "audio-input": "unsupported" } }],
  claims: [{ route: "openai", features: ["text-input"], support: "supported", file: "tests/fixture.test.ts", title: TITLE }] }];
const report = (status: string | null) => ({ testResults: status === null ? [] : [{ name: join(ROOT, "tests/fixture.test.ts"),
  assertionResults: [{ title: TITLE, fullName: `suite ${TITLE}`, status }] }] });
const textInput = (status: string | null) => buildMatrix(claimFiles, report(status), ROOT).routes[0].features["text-input"];

describe("capability matrix generator (P1-38)", () => {
  test("a cited test that fails flips its cell to unknown, and one that did not run is not run", () => {
    expect(textInput("passed")).toEqual({ support: "supported", declared: "supported",
      tests: [{ test: `tests/fixture.test.ts > ${TITLE}`, status: "passed" }] });
    expect(textInput("failed")).toMatchObject({ support: "unknown", tests: [{ status: "failed" }] });
    expect(textInput("skipped")).toMatchObject({ support: "not run", tests: [{ status: "skipped" }] });
    expect(textInput(null)).toMatchObject({ support: "not run", tests: [{ status: "absent" }] });
  });

  test("a feature with no claim is unknown whatever the adapter declares, and the rendering says what was declared", () => {
    const matrix = buildMatrix(claimFiles, report("passed"), ROOT);
    expect(matrix.routes[0].features["image-input"]).toEqual({ support: "unknown", declared: "supported", tests: [] });
    expect(matrix.routes[0].features["audio-input"].support).toBe("unknown");
    expect(renderMatrix(matrix)).toContain("| image-input | unknown (declared supported) |");
    expect(renderMatrix(buildMatrix(claimFiles, report("skipped"), ROOT))).toContain("| text-input | not run |");
  });

  test("the check refuses a committed matrix that differs from the run, cites a test that did not pass, or is rendered stale", () => {
    const passed = buildMatrix(claimFiles, report("passed"), ROOT);
    expect(checkMatrix(passed, renderMatrix(passed), passed)).toEqual([]);
    const failedRun = buildMatrix(claimFiles, report("failed"), ROOT);
    expect(checkMatrix(passed, renderMatrix(passed), failedRun)).toEqual([
      `openai text-input: committed supported, this run gives unknown`,
      `openai text-input: cites a test that did not pass: tests/fixture.test.ts > ${TITLE} (failed)`]);
    expect(checkMatrix(passed, `${renderMatrix(passed)}edited\n`, passed))
      .toEqual([`${MATRIX_MD} is not the rendering of ${MATRIX_JSON}; run npm run gen:capability-matrix`]);
  });

  test("contradictory claims for one cell fail the generator instead of picking one", () => {
    const contradicted = [{ ...claimFiles[0]!, claims: [...claimFiles[0]!.claims, { ...claimFiles[0]!.claims[0]!, support: "unsupported" }] }];
    expect(() => buildMatrix(contradicted, report("passed"), ROOT)).toThrow("contradictory claims for openai text-input");
  });

  test("the committed matrix is its own rendering, covers native and pi routes, and every claimed cell's test passed", () => {
    const matrix = JSON.parse(readFileSync(MATRIX_JSON, "utf8"));
    expect(renderMatrix(matrix)).toBe(readFileSync(MATRIX_MD, "utf8"));
    expect(matrix.liveProvider).toBe("not run");
    expect(matrix.routes.map((route: { route: string }) => route.route)).toEqual(["anthropic", "openai", "openai-responses", "deepseek",
      "gemini", "gemini-audio", "ollama", "pi-ai:groq", "pi-ai:huggingface", "pi-ai:together"]);
    for (const route of matrix.routes) {
      for (const cell of Object.values(route.features) as { support: string; tests: { status: string }[] }[]) {
        if (cell.support === "supported" || cell.support === "unsupported") expect(cell.tests.every((t) => t.status === "passed")).toBe(true);
      }
    }
  });
});
