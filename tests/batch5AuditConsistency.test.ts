import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

function readAudit(): string {
  return readFileSync("docs/AUDIT_50_AGENTS_BATCH5.md", "utf8");
}

describe("Batch 5 audit consistency", () => {
  test("keeps persona table, section headings, and rating lines aligned", () => {
    const audit = readAudit();
    const tableScores = new Map<string, string>();

    for (const match of audit.matchAll(/^\| ([^(|]+) \([^)]+\) \| [^|]+ \| \*\*([^*]+)\*\*/gm)) {
      tableScores.set(match[1]!.trim(), match[2]!.trim());
    }

    expect(tableScores.size).toBe(10);

    const sectionMatches = Array.from(
      audit.matchAll(/^### (4[1-9]|50)\. ([^\n(]+) \([^\n)]+\) — Score: ([^\n]+)$/gm)
    );
    expect(sectionMatches.length).toBe(10);

    for (let index = 0; index < sectionMatches.length; index += 1) {
      const match = sectionMatches[index]!;
      const next = sectionMatches[index + 1];
      const persona = match[2]!.trim();
      const headingScore = match[3]!.trim();
      const bodyStart = (match.index ?? 0) + match[0].length;
      const bodyEnd = next?.index ?? audit.length;
      const body = audit.slice(bodyStart, bodyEnd);
      const expectedScore = tableScores.get(persona);

      if (!expectedScore) {
        continue;
      }

      const ratingScore = body.match(/\*\*Rating: ([^*]+)\*\*/)?.[1]?.trim();
      expect(headingScore, `${persona} heading score`).toBe(expectedScore);
      expect(ratingScore, `${persona} rating score`).toBe(expectedScore);
    }
  });
});
