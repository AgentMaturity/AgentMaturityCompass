import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * examples/ and the README tell a new user exactly what to type. Nothing
 * checked that those commands still exist, so a rename anywhere in a 1,175-path
 * CLI would silently turn the onboarding path into an error message — the worst
 * possible place for one.
 *
 * This reads the CLI's own command inventory (`amc commands --json`) rather
 * than a hand-kept list, so it tracks renames automatically.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Words that follow "amc" in prose rather than naming a subcommand. */
const PROSE = new Set([
  "install", "is", "the", "and", "to", "for", "with", "can", "will", "you",
  "has", "a", "an", "in", "on", "as", "at", "by", "or", "it", "its", "was",
  "run", "runs", "uses", "does", "did", "from", "into", "that", "this",
  "cli", "commands", "command", "docs", "here", "now", "then", "also"
]);

describe("documented commands resolve", () => {
  const dist = join(process.cwd(), "dist", "cli.js");
  if (!existsSync(dist)) {
    it.skip("requires a build (npm run build)", () => {});
    return;
  }

  const inventory = JSON.parse(
    execFileSync(process.execPath, [dist, "commands", "--json"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    })
  ) as { total: number; commands: Array<{ path: string; aliases: string[] }> };

  const known = new Set<string>();
  for (const command of inventory.commands) {
    known.add(command.path);
    for (const alias of command.aliases ?? []) {
      const parts = command.path.split(" ");
      parts[parts.length - 1] = alias;
      known.add(parts.join(" "));
    }
  }

  it("exposes a non-trivial command surface to check against", () => {
    expect(inventory.total).toBeGreaterThan(500);
    expect(known.size).toBeGreaterThan(500);
  });

  const USER_FACING_DOCS = [
    "README.md",
    "docs/GETTING_STARTED.md",
    "docs/QUICKSTART.md",
    "docs/INSTALL.md",
    "docs/COMPLIANCE_FRAMEWORKS.md",
    "docs/GDPR_ARTICLE_COMPLIANCE.md",
    "docs/NO_CODE_GOVERNANCE.md",
    "docs/score-history.md",
    "docs/AMC_MASTER_REFERENCE.md"
  ];

  /** Shell words that follow "amc" as an argument, not a subcommand. */
  const SHELL = new Set([
    "curl", "kubectl", "helm", "docker", "rm", "image", "amc", "sudo", "npm",
    "npx", "bash", "sh", "cd", "export", "echo", "cat", "git", "deploy"
  ]);

  const referencedIn = (body: string): Map<string, string> => {
    const found = new Map<string, string>();
    for (const match of body.matchAll(/\bamc\s+([a-z][a-z0-9-]*)(?:\s+([a-z][a-z0-9-]*))?/g)) {
      const [whole, first, second] = match;
      if (PROSE.has(first) || SHELL.has(first)) continue;
      const two = second && !PROSE.has(second) ? `${first} ${second}` : null;
      const path = two && known.has(two) ? two : first;
      if (!found.has(path)) found.set(path, whole);
    }
    return found;
  };

  it("every amc command shown in user-facing docs exists", () => {
    // docs/GETTING_STARTED.md told a new user to run `amc telemetry on` for a
    // feature AMC does not have; docs/score-history.md documented a whole CLI
    // for a module imported only by its own test.
    const missing: string[] = [];
    for (const doc of USER_FACING_DOCS) {
      const path = join(process.cwd(), doc);
      if (!existsSync(path)) continue;
      const body = readFileSync(path, "utf8");
      for (const [command, context] of referencedIn(body)) {
        // A doc may name a command precisely to say it does not exist.
        if (/never existed|there is no|no CLI command|There are none/i.test(body) &&
            !known.has(command)) {
          continue;
        }
        if (!known.has(command)) missing.push(`${doc}: "${context.trim()}"`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every amc command shown in examples/ exists", () => {
    const files = walk(join(process.cwd(), "examples"));
    const referenced = new Map<string, string>();

    for (const file of files) {
      let body: string;
      try {
        body = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const match of body.matchAll(/\bamc\s+([a-z][a-z0-9-]*)(?:\s+([a-z][a-z0-9-]*))?/g)) {
        const [, first, second] = match;
        if (PROSE.has(first)) continue;
        const two = second && !PROSE.has(second) ? `${first} ${second}` : null;
        // Prefer the two-word form when the CLI knows it; fall back to one word.
        const path = two && known.has(two) ? two : first;
        if (!referenced.has(path)) referenced.set(path, file.replace(`${process.cwd()}/`, ""));
      }
    }

    expect(referenced.size).toBeGreaterThan(10);
    const missing = [...referenced.entries()]
      .filter(([path]) => !known.has(path))
      .map(([path, file]) => `${path}  (${file})`);
    expect(missing).toEqual([]);
  });
});
