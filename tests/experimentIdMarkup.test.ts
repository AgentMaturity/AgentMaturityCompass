import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { experimentSchema } from "../src/experiments/experimentSchema.js";
import { recordRows } from "../src/console/assets/pageKit.js";

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
    // The console-pages lane (f093c7918) moved the registry dump into pageKit's recordRows, whose raw record is the
    // escaped `<pre class="scroll">` of recordDetails: the dump must still go through it and it must still escape.
    expect(app).toMatch(/card\("Experiment registry", recordRows\(listed\.experiments \|\| listed\)\)/);
    const kit = readFileSync(join(process.cwd(), "src", "console", "assets", "pageKit.js"), "utf8");
    expect(kit).toMatch(/<pre class="scroll">\$\{esc\(jsonText\(value\)\)\}<\/pre>/);
    const hostile = 'x" onmouseover="alert(1)<img src=x onerror=alert(1)>';
    for (const html of [recordRows([{ experimentId: hostile }]), recordRows({ experiments: [{ experimentId: hostile }] }), recordRows({ experimentId: hostile })]) {
      expect(html).not.toContain("<img");
      expect(html).not.toContain('" onmouseover');
    }
  });
});
