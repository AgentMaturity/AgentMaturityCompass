/**
 * P1-38: the published capability matrix is the rendering of its committed evidence, and a cell is supported or
 * unsupported only while a test result says so.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildMatrix, checkMatrix, MATRIX_JSON, MATRIX_MD, renderMatrix } from "../scripts/gen-capability-matrix.mjs";

const readFile = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : null);
const committed = () => JSON.parse(readFileSync(MATRIX_JSON, "utf8"));

function fixture(results: { route: string; feature: string; support: string; test: string }[]) {
  return [{ source: "native", environment: { node: "22.0.0" }, results,
    routes: [{ route: "openai", protocol: "openai-chat-completions", adapter: "openai-chat@4", encoder: "openai-chat@4",
      declared: { "text-input": "supported", "image-input": "supported", "audio-input": "unsupported" } }] }];
}
const proved = { route: "openai", feature: "text-input", support: "supported", test: "tests/capabilityMatrix.test.ts > fixture proof" };

describe("capability matrix generator (P1-38)", () => {
  test("the committed matrix is the generator's rendering of its committed evidence, and every cited test exists", () => {
    const matrix = committed();
    expect(renderMatrix(matrix)).toBe(readFileSync(MATRIX_MD, "utf8"));
    expect(checkMatrix(matrix, readFileSync(MATRIX_MD, "utf8"), readFile)).toEqual([]);
    expect(matrix.liveProvider).toBe("not run");
    const routes = matrix.routes.map((route: { route: string }) => route.route);
    expect(routes).toEqual(expect.arrayContaining(["anthropic", "openai", "openai-responses", "deepseek", "gemini", "gemini-audio", "ollama",
      "pi-ai:groq", "pi-ai:huggingface", "pi-ai:together"]));
  });

  test("removing a test result turns that cell unknown, and the declaration is shown beside it", () => {
    const with_ = buildMatrix(fixture([proved]));
    expect(with_.routes[0].features["text-input"]).toEqual({ support: "supported", declared: "supported", tests: [proved.test] });
    const without = buildMatrix(fixture([]));
    expect(without.routes[0].features["text-input"]).toEqual({ support: "unknown", declared: "supported", tests: [] });
    expect(renderMatrix(without)).toContain("| text-input | unknown (declared supported) |");
    // A declaration alone never becomes a claim, in either direction.
    expect(without.routes[0].features["audio-input"].support).toBe("unknown");
  });

  test("the check refuses a cell whose cited test does not exist, a claim without a test, and a stale rendering", () => {
    const missing = `tests/capabilityMatrix.test.ts > ${["a test", "nobody wrote"].join(" ")}`;
    const matrix = buildMatrix(fixture([{ ...proved, test: missing }]));
    expect(checkMatrix(matrix, renderMatrix(matrix), readFile)).toEqual([`openai text-input: cited test not found: ${missing}`]);
    const claimed = buildMatrix(fixture([]));
    claimed.routes[0].features["image-input"].support = "supported";
    expect(checkMatrix(claimed, renderMatrix(claimed), readFile)).toEqual(["openai image-input: supported must cite the test that proved it"]);
    const good = buildMatrix(fixture([{ ...proved, test: "tests/capabilityMatrix.test.ts > removing a test result turns that cell unknown" }]));
    expect(checkMatrix(good, renderMatrix(good), readFile)).toEqual([]);
    expect(checkMatrix(good, `${renderMatrix(good)}edited\n`, readFile)).toEqual([`${MATRIX_MD} is not the rendering of ${MATRIX_JSON}; run npm run gen:capability-matrix`]);
  });

  test("contradictory results for one cell fail the generator instead of picking one", () => {
    expect(() => buildMatrix(fixture([proved, { ...proved, support: "unsupported" }]))).toThrow("contradictory results for openai text-input");
  });
});
