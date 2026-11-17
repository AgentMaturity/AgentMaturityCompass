import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import YAML from "yaml";

// Claim words the generated and public references must not use in a description. Command names, flags, route paths
// and field names (`amc session proof`, `--include-immutable`, `/v1/proof/check`, `includeImmutable`) are contracts
// and are never checked here: only description and summary text is.
// "Inclusion proof" (RFC 9162) and "safe proof" (the Shield artifact) are names of things, not claims, and stay.
const CLAIM_WORDS = [/\btamper[- ]proof\b/i, /\bproves?\b/i, /\bimmutable\b/i];

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");
// Route paths and `code` are contracts, so they are blanked before the check.
const prose = (text: string): string => text.replace(/`[^`]*`|\/[\w/{}.-]+/g, " ");
const offending = (texts: string[]): string[] => texts.filter(text => CLAIM_WORDS.some(word => word.test(prose(text))));

function openApiTexts(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) for (const item of node) openApiTexts(item, out);
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if ((key === "summary" || key === "description") && typeof value === "string") out.push(value);
      else openApiTexts(value, out);
    }
  }
  return out;
}

describe("reference wording", () => {
  test("command descriptions in the generated inventory use no claim words", () => {
    const descriptions = read("docs/CLI_COMMAND_INVENTORY.md").split("\n")
      .filter(line => line.startsWith("| `amc "))
      .map(line => line.split(" | ")[1] ?? "");
    expect(descriptions.length).toBeGreaterThan(1000);
    expect(offending(descriptions)).toEqual([]);
  });

  test("public OpenAPI summaries and descriptions use no claim words", () => {
    const texts = openApiTexts(YAML.parse(read("website/openapi.yaml")));
    expect(texts.length).toBeGreaterThan(500);
    expect(offending(texts)).toEqual([]);
  });

  test("the public command reference uses no claim words", () => {
    const cells = [...read("website/docs/cli.html").matchAll(/<\/code><\/td><td>([^<]*(?:<code>[^<]*<\/code>[^<]*)*)<\/td>/g)]
      .map(match => match[1] ?? "");
    expect(cells.length).toBeGreaterThan(100);
    expect(offending(cells)).toEqual([]);
  });
});
