import { existsSync, readFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const docsScript = readFileSync(resolve(process.cwd(), "website/docs/docs.js"), "utf8");
const docsRoot = resolve(process.cwd(), "docs");

function declaredSet(name: string): Set<string> {
  const block = docsScript.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`))?.[1] ?? "";
  return new Set(Array.from(block.matchAll(/'([^']+)'/g), match => match[1]));
}

const publicDocs = declaredSet("PUBLIC_DOC_IDS");
const internalDocs = declaredSet("INTERNAL_DOCS");
const allDocs = new Set(Array.from(
  (docsScript.match(/const ALL_DOCS = \[([\s\S]*?)\];/)?.[1] ?? "").matchAll(/'([^']+)'/g),
  match => match[1],
));

function localMarkdownLinks(markdown: string): string[] {
  const inline = Array.from(markdown.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g), match => match[1]);
  const references = Array.from(markdown.matchAll(/^\s*\[[^\]]+\]:\s*(\S+)/gm), match => match[1]);
  const html = Array.from(markdown.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi), match => match[1]);
  return [...inline, ...references, ...html]
    .map(value => value.trim().replace(/^<|>$/g, "").split(/\s+["']/u, 1)[0])
    .filter(Boolean);
}

function resolveGuideLink(sourceDoc: string, href: string): string | null {
  if (/^(?:https?:|mailto:|tel:|data:)/i.test(href) || href.startsWith("#")) return null;
  const path = decodeURIComponent(href.split("#", 1)[0].split("?", 1)[0]).replaceAll("\\", "/");
  if (!path) return null;
  const resolved = posix.normalize(posix.join(posix.dirname(`${sourceDoc}.md`), path));
  if (resolved.startsWith("../") || !resolved.endsWith(".md")) return `INVALID:${resolved}`;
  return resolved.slice(0, -3);
}

describe("AMC public Docs graph", () => {
  test("every promoted guide has a repository Markdown source", () => {
    expect(Array.from(publicDocs).filter(doc => !allDocs.has(doc))).toEqual([]);
    expect(Array.from(publicDocs).filter(doc => internalDocs.has(doc))).toEqual([]);
    const missing = Array.from(publicDocs)
      .filter(doc => !existsSync(resolve(docsRoot, `${doc}.md`)))
      .sort();

    expect(missing).toEqual([]);
  });

  test("every local guide edge resolves to another promoted guide", () => {
    const defects: Array<{ source: string; href: string; target: string }> = [];

    for (const source of publicDocs) {
      const sourcePath = resolve(docsRoot, `${source}.md`);
      if (!existsSync(sourcePath)) continue;
      const markdown = readFileSync(sourcePath, "utf8");
      for (const href of localMarkdownLinks(markdown)) {
        const target = resolveGuideLink(source, href);
        if (target !== null && !publicDocs.has(target)) defects.push({ source, href, target });
      }
    }

    expect(defects).toEqual([]);
  });

  test("intentionally internal planning docs have no incoming public edges", () => {
    const inbound: Array<{ source: string; target: string }> = [];

    for (const source of publicDocs) {
      const sourcePath = resolve(docsRoot, `${source}.md`);
      if (!existsSync(sourcePath)) continue;
      for (const href of localMarkdownLinks(readFileSync(sourcePath, "utf8"))) {
        const target = resolveGuideLink(source, href);
        if (target && internalDocs.has(target)) inbound.push({ source, target });
      }
    }

    expect(inbound).toEqual([]);
  });

  test("linked user workflow guides are promoted instead of becoming dead ends", () => {
    const expected = [
      "AGENT_GUIDE",
      "ASSURANCE_LAB",
      "CLI_COMMAND_INVENTORY",
      "CUSTOM_ADAPTER",
      "DEPLOYMENT_OPTIONS",
      "DOMAIN_PROOF_LANE",
      "EXAMPLES_INDEX",
      "EXECUTIVE_OVERVIEW",
      "PLATFORM_ENGINEER_QUICKSTART",
      "PLATFORM_PATH",
      "QUESTION_BANK",
      "SCORING_METHODOLOGY",
      "SECURITY_COMPLIANCE_QUICKSTART",
      "SECURITY_PATH",
      "SOLO_DEV_PATH",
      "SOLO_DEV_QUICKSTART",
    ];

    expect(expected.filter(doc => !publicDocs.has(doc))).toEqual([]);
  });

  test("every promoted guide appears in one category and the open category stays bounded", () => {
    const categoriesBlock = docsScript.match(/const CATEGORIES = \[([\s\S]*?)\n\];/)?.[1] ?? "";
    const categories = Array.from(
      categoriesBlock.matchAll(/name:\s*'([^']+)'[\s\S]*?docs:\s*\[([^\]]*)\]/g),
      match => ({
        name: match[1],
        docs: Array.from(match[2].matchAll(/'([^']+)'/g), docMatch => docMatch[1]),
      }),
    );
    const memberships = new Map(Array.from(publicDocs, doc => [doc, [] as string[]]));
    for (const category of categories) {
      for (const doc of category.docs) {
        if (publicDocs.has(doc)) memberships.get(doc)?.push(category.name);
      }
    }

    expect(Array.from(memberships).filter(([, groups]) => groups.length !== 1)).toEqual([]);
    expect(categories[0]?.docs.filter(doc => publicDocs.has(doc))).toHaveLength(10);
  });
});
