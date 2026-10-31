import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { experimentSchema } from "../src/experiments/experimentSchema.js";

/**
 * The Studio console interpolates experimentId into data-* attributes and the registry `<pre>` through innerHTML, so
 * an experiment.yaml a workspace writer controls could inject markup. The id is constrained and every sink escapes.
 */
const record = (experimentId: string) => ({ experiment: { version: 1, experimentId, agentId: "default", name: "n", casebookId: "b",
  createdTs: 1, baselineConfig: { id: "current", kind: "current" }, candidateConfig: null } });

describe("experiment ids cannot carry markup", () => {
  it("the schema admits generated ids and refuses markup, quotes and separators", () => {
    expect(experimentSchema.safeParse(record("exp_0123abcd4567")).success).toBe(true);
    for (const id of ['x" onmouseover="alert(1)', "<img src=x onerror=alert(1)>", "a/b", "../x", "", "a b"]) {
      expect(experimentSchema.safeParse(record(id)).success, id).toBe(false);
    }
  });

  it("the console escapes experimentId in every attribute and the registry dump", () => {
    const app = readFileSync(join(process.cwd(), "src", "console", "assets", "app.js"), "utf8");
    expect(app).not.toMatch(/data-(?:run|analyze|gate)="\$\{row\.experimentId\}"/);
    expect(app).toMatch(/<pre class="scroll">\$\{htmlEscape\(JSON\.stringify\(listed\.experiments/);
  });
});
