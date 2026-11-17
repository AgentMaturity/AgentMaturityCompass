/**
 * A4-10 (2026-11-15): the console's Industry Pack answers were scored and then lost on reload. A signed-in person's last
 * scored answers are now kept per pack and shown checked when the pack is opened again.
 */
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { industryPackDetailHtml } from "../../src/console/assets/industryPackView.js";
import { loadConsoleResponses, saveConsoleResponses } from "../../src/domains/packResponses.js";
import { listIndustryPacks } from "../../src/domains/industryPacks.js";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("kept Industry Pack answers", () => {
  test("are kept per person and pack, and named by a hash, not the person's id", () => {
    const workspace = mkdtempSync(join(tmpdir(), "amc-pack-answers-"));
    dirs.push(workspace);
    saveConsoleResponses(workspace, "user-a", "digital-payments", { q1: 3, q2: 5 });
    expect(loadConsoleResponses(workspace, "user-a", "digital-payments")).toEqual({ q1: 3, q2: 5 });
    expect(loadConsoleResponses(workspace, "user-b", "digital-payments")).toBeNull();
    expect(loadConsoleResponses(workspace, "user-a", "k12")).toBeNull();
    expect(readdirSync(join(workspace, ".amc", "studio", "industry-pack-answers")).join(" ")).not.toContain("user-a");
  });

  test("are shown checked when the pack opens again", () => {
    const pack = listIndustryPacks()[0]!;
    const question = pack.questions[0]!;
    const html = industryPackDetailHtml(pack, { [question.id]: 4 } as never);
    expect(html).toMatch(new RegExp(`value="4" data-question="${question.id}" checked`));
    expect(industryPackDetailHtml(pack)).not.toMatch(/" checked \/>/);
  });
});
