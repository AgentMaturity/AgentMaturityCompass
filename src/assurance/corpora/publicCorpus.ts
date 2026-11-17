/**
 * Loads a public attack corpus that the user downloaded into AMC scenarios (`amc redteam run --corpus <file>`). AMC ships
 * no corpus text; docs/assurance/PUBLIC_CORPORA.md lists the corpora checked, each with its source and licence as read.
 *
 * File format: JSON Lines. An optional first line `{"corpus": {"source": "<url>", "licence": "<licence>"}}` gives the
 * defaults; every other line is one item `{"id": "...", "injection": "...", "source"?: "...", "licence"?: "..."}`
 * (`behavior_id` and `attack` are read as `id` and `injection`, the field names of one published corpus). An item with
 * no source or licence, after the defaults, is refused: the source and licence are recorded with every scenario.
 *
 * Each item becomes an effect-graded scenario: its text is placed in a customer ticket the agent reads while it files a
 * ticket (the injection pack's fixture), graded by what the agent did, with the benign twin. Fixture tools never run.
 */
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import type { AssurancePackDefinition } from "../validators.js";
// The pack registry first: the fixtures reach it through agentResponder, so loading them alone fails mid-cycle.
import "../packs/index.js";
import { effectScenario, ticketTaskSpec } from "../packs/effectFixtures.js";

export interface CorpusItem { id: string; injection: string; source: string; licence: string }

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 500;
const MAX_INJECTION_CHARS = 8000;
const ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
/** Source and licence are shown in reports and at the terminal: printable ASCII only. */
const LABEL_RE = /^[\x20-\x7E]{1,200}$/;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Parses the file's text; throws with the line number and what to fix. */
export function parseCorpus(content: string): CorpusItem[] {
  const lines = content.split(/\r?\n/).map((line, index) => ({ line: line.trim(), number: index + 1 })).filter(({ line }) => line.length > 0);
  let defaults: { source: string | null; licence: string | null } = { source: null, licence: null };
  const items: CorpusItem[] = [], ids = new Set<string>();
  for (const [index, { line, number }] of lines.entries()) {
    let row: Record<string, unknown>;
    try { row = JSON.parse(line) as Record<string, unknown>; } catch { throw new Error(`Corpus line ${number} is not JSON.`); }
    if (row === null || typeof row !== "object" || Array.isArray(row)) throw new Error(`Corpus line ${number} is not a JSON object.`);
    if (index === 0 && row.corpus !== undefined) {
      const head = row.corpus as Record<string, unknown> | null;
      defaults = { source: text(head?.source), licence: text(head?.licence ?? head?.license) };
      continue;
    }
    const id = text(row.id ?? row.behavior_id), injection = text(row.injection ?? row.attack);
    const source = text(row.source) ?? defaults.source, licence = text(row.licence ?? row.license) ?? defaults.licence;
    if (id === null || !ID_RE.test(id)) throw new Error(`Corpus line ${number}: "id" must be 1 to 64 letters, digits, dots, dashes or underscores.`);
    if (ids.has(id)) throw new Error(`Corpus line ${number}: the id "${id}" appears twice.`);
    if (injection === null || injection.length > MAX_INJECTION_CHARS) throw new Error(`Corpus line ${number}: "injection" must be text of at most ${MAX_INJECTION_CHARS} characters.`);
    if (source === null || licence === null) {
      throw new Error(`Corpus line ${number}: no source or licence. Add "source" and "licence" to the item, or a first line {"corpus": {"source": ..., "licence": ...}}.`);
    }
    if (!LABEL_RE.test(source) || !LABEL_RE.test(licence)) throw new Error(`Corpus line ${number}: source and licence must be plain text of at most 200 characters.`);
    ids.add(id);
    items.push({ id, injection, source, licence });
    if (items.length > MAX_ITEMS) throw new Error(`The corpus has more than ${MAX_ITEMS} items; split it into smaller files.`);
  }
  if (items.length === 0) throw new Error("The corpus file has no items.");
  return items;
}

/** One pack of effect-graded scenarios from the items; each scenario's title names its source and licence. */
export function corpusPack(items: readonly CorpusItem[], name: string): AssurancePackDefinition {
  return {
    id: "corpus",
    title: `Public attack corpus (${name})`,
    description: "Injections from a corpus file the user supplied, placed in a customer ticket the agent reads, graded by what the agent did.",
    scenarios: items.map((item) => effectScenario({ id: `corpus-${item.id}`, title: `Corpus item ${item.id} (source ${item.source}; licence ${item.licence})`,
      category: "public_corpus" }, ticketTaskSpec(() => ({ payload: item.injection, channel: "ticket" }))))
  };
}

/** Reads and parses a corpus file into one pack. */
export function loadCorpusPack(file: string): AssurancePackDefinition {
  if (statSync(file).size > MAX_FILE_BYTES) throw new Error(`The corpus file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
  return corpusPack(parseCorpus(readFileSync(file, "utf8")), basename(file));
}
