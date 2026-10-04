import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { getAssurancePack } from "../../src/assurance/packs/index.js";
import {
  INDUSTRY_PACK_MANIFEST,
  type IndustryRegulationAnchor
} from "../../src/assurance/packs/industryPackManifest.js";
import type { AssurancePromptContext } from "../../src/assurance/validators.js";

/**
 * Regulatory anchors whose legal status changed. Each one is pinned to the
 * status a dated primary source gives it, so flipping a revoked or lapsed
 * instrument back to "verified" fails here rather than shipping silently.
 *
 * - EO 14110: revoked by EO 14148 (20 Jan 2025, 90 FR 8237, item (ggg)).
 * - Canada AIDA: part of Bill C-27 (44-1), which never received Royal Assent.
 * - Brazil PL 2338/2023: still before the Chamber of Deputies.
 */
const PINNED_ANCHORS: ReadonlyArray<{ pack: string; instrument: RegExp; status: IndustryRegulationAnchor["status"] }> = [
  { pack: "globalAIRegulatory", instrument: /Executive Order 14110/, status: "superseded" },
  { pack: "globalAIRegulatory", instrument: /\bAIDA\b/, status: "lapsed" },
  { pack: "globalAIRegulatory", instrument: /PL 2338\/2023/, status: "pending" }
];

/** Phrasings that present a revoked or never-enacted instrument as binding. */
const STALE_CLAIMS = [/EO 14110 requires/i, /Executive Order 14110 requires/i, /AIDA \(when enacted\) will require/i];

const context: AssurancePromptContext = {
  agentId: "anchor-agent",
  agentName: "Anchor Agent",
  role: "regulatory assistant",
  domain: "regulated-industry",
  primaryTasks: ["compliance review"],
  stakeholders: ["compliance"],
  riskTier: "high"
};

function packText(packId: string): string {
  const pack = getAssurancePack(packId);
  const scenarios = pack.scenarios.map((s) => `${s.title}\n${s.buildPrompt(context)}`);
  return [pack.title, pack.description, ...scenarios].join("\n");
}

describe("industry pack regulatory anchors", () => {
  test.each(PINNED_ANCHORS)("$pack anchor $instrument is $status", ({ pack, instrument, status }) => {
    const entry = INDUSTRY_PACK_MANIFEST.find((row) => row.id === pack);
    expect(entry, `${pack} missing from manifest`).toBeDefined();
    const matches = entry!.regulations.filter((anchor) => instrument.test(anchor.instrument));
    expect(matches, `${pack}: exactly one anchor for ${instrument}`).toHaveLength(1);
    expect(matches[0]!.status).toBe(status);
    expect(matches[0]!.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("no superseded or lapsed anchor is presented as binding in scenario text", () => {
    const packDir = join(__dirname, "..", "..", "src", "assurance", "packs");
    for (const entry of INDUSTRY_PACK_MANIFEST) {
      const rendered = packText(entry.id);
      const source = readFileSync(join(packDir, entry.file), "utf8");
      for (const stale of STALE_CLAIMS) {
        expect(stale.test(rendered), `${entry.id} scenario text matches ${stale}`).toBe(false);
        expect(stale.test(source), `${entry.file} source matches ${stale}`).toBe(false);
      }
    }
  });

  test("the global pack tells the agent EO 14110 is revoked and AIDA lapsed", () => {
    // Non-vacuity: the absence check above passes on an empty pack too.
    const text = packText("globalAIRegulatory");
    expect(text).toMatch(/EO 14110 was revoked by EO 14148/);
    expect(text).toMatch(/did not receive Royal Assent/);
  });
});
