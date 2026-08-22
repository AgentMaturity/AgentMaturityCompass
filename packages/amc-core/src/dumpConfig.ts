/**
 * Renders the composed boot tree with provenance.
 *
 * The point is not to pretty-print YAML — the file is already readable. It is
 * to answer "what is actually running, and where did each part come from",
 * which a layered composition (base file + profile + patches + env) cannot be
 * read off any single source. dsh ships `--dump-config` for the same reason.
 *
 * AMC adds attestation to the output: an operator inspecting the runtime should
 * see, in the same breath, whether the file that produced it was signed.
 */
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import type { CompositionSource } from "./composition.ts";

export interface DumpedEntry {
  id: string;
  name: string;
  disabled: boolean;
  /** Where this entry came from — the composition file, or a patch over it. */
  source: string;
  config: unknown;
  children?: DumpedEntry[];
}

export interface CompositionDump {
  composition: {
    path: string;
    sha256: string;
    signed: boolean;
    signatureReason: string | null;
  };
  entries: DumpedEntry[];
}

interface RawEntry {
  id?: string;
  name?: string;
  disabled?: boolean;
  config?: unknown;
  group?: boolean;
  [key: string]: unknown;
}

function normalize(raw: RawEntry, source: string, index: number): DumpedEntry {
  const nested = Array.isArray(raw.config) && raw.group === true ? (raw.config as RawEntry[]) : null;
  return {
    id: String(raw.id ?? `#${index}`),
    name: String(raw.name ?? "(unnamed)"),
    disabled: raw.disabled === true,
    source,
    config: nested ? undefined : raw.config,
    ...(nested ? { children: nested.map((child, i) => normalize(child, source, i)) } : {})
  };
}

/**
 * Reads the composition file and describes the tree it declares.
 *
 * Deliberately reads the file rather than the live context: `--dump-config`
 * must work without booting, so an operator can inspect a composition that does
 * not currently start.
 */
export function dumpComposition(composition: CompositionSource): CompositionDump {
  const parsed = load(readFileSync(composition.path, "utf8"));
  const entries = Array.isArray(parsed) ? (parsed as RawEntry[]) : [];
  const source = composition.path;

  return {
    composition: {
      path: composition.path,
      sha256: composition.sha256,
      signed: composition.signature.valid,
      signatureReason: composition.signature.reason
    },
    entries: entries.map((entry, index) => normalize(entry, source, index))
  };
}

/** Human-readable form, for the CLI's non-JSON output. */
export function renderCompositionDump(dump: CompositionDump): string {
  const lines: string[] = [];
  lines.push(`Composition: ${dump.composition.path}`);
  lines.push(`  sha256:    ${dump.composition.sha256}`);
  lines.push(
    `  signature: ${dump.composition.signed ? "VALID" : `UNSIGNED — ${dump.composition.signatureReason ?? "unknown"}`}`
  );
  lines.push("");

  const walk = (entries: readonly DumpedEntry[], depth: number): void => {
    for (const entry of entries) {
      const indent = "  ".repeat(depth + 1);
      const state = entry.disabled ? " [disabled]" : "";
      lines.push(`${indent}${entry.name}${state}  (id ${entry.id}, from ${entry.source})`);
      if (entry.children) walk(entry.children, depth + 1);
    }
  };
  walk(dump.entries, 0);

  if (dump.entries.length === 0) lines.push("  (no entries)");
  return lines.join("\n");
}
