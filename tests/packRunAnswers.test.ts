import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { getIndustryPack, listIndustryPackIds } from "../src/domains/industryPacks.js";
import { loadResponses } from "../src/domains/packResponses.js";
import { packLevelChoices, promptAborted, saveAnswersOnAbort, SKIP_LEVEL } from "../src/domains/packRunCli.js";

// CLI-29: `domain pack run` had no way to skip a question, and Ctrl-C lost every answer given so far.
const roots: string[] = [];
afterEach(() => { while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe("domain pack run answers", () => {
  test("offers L1 to L5 and a skip", () => {
    const pack = getIndustryPack(listIndustryPackIds()[0]!);
    const choices = packLevelChoices(pack.questions[0]!);
    expect(choices.map((choice) => choice.short)).toEqual(["L1", "L2", "L3", "L4", "L5", "skipped"]);
    expect(choices.at(-1)?.value).toBe(SKIP_LEVEL);
  });

  test("Ctrl-C keeps the answers in a file --responses reads, never over an existing one", () => {
    const dir = mkdtempSync(join(tmpdir(), "amc-pack-abort-"));
    roots.push(dir);
    const abort = Object.assign(new Error("User force closed the prompt with SIGINT"), { name: "ExitPromptError" });
    expect(promptAborted(abort)).toBe(true);
    expect(promptAborted(new Error("other"))).toBe(false);
    expect(saveAnswersOnAbort("p", {}, dir)).toContain("nothing was saved");
    const first = saveAnswersOnAbort("p", { Q1: 3 }, dir);
    expect(first).toContain(`--responses ${join(dir, "p-answers.json")}`);
    expect(loadResponses(join(dir, "p-answers.json"))).toEqual({ Q1: 3 });
    expect(saveAnswersOnAbort("p", { Q1: 4, Q2: 1 }, dir)).toContain("2 answers are saved in " + join(dir, "p-answers-2.json"));
    expect(JSON.parse(readFileSync(join(dir, "p-answers.json"), "utf8"))).toEqual({ Q1: 3 });
  });
});
