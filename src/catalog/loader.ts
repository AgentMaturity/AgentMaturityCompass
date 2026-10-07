/**
 * Catalog loader (P1-09). Reads the documented tree only, parses YAML as data and refuses anything outside the
 * grammar: YAML errors or warnings, anchors, aliases, explicit tags, floats, unquoted dates, symlinks and stray
 * files. Nothing is imported or evaluated. Each fixture is hashed and parsed from the same bytes.
 */
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import type { z } from "zod";
import { sha256Hex } from "../utils/hash.js";
import {
  catalogManifestSchema, controlRecordSchema, fixtureEnvelopeSchema, packManifestSchema, producersFileSchema,
  publisherHostsSchema, vocabularySchema, zodToCatalogIssues, type CatalogIssue, type CatalogManifest, type Vocabulary
} from "./schema.js";
import type { ControlRecord, FixtureEnvelope, PackManifest, ProducerRecord } from "./types.js";

export interface LoadedFixture {
  /** Catalog-relative path, `fixtures/<controlId>/<polarity>/<name>.json`. */
  path: string;
  /** SHA-256 of the file bytes. */
  sha256: string;
  /** Parsed from the same bytes that were hashed; null when they do not parse. */
  envelope: FixtureEnvelope | null;
}

export interface LoadedCatalog {
  root: string;
  manifest: CatalogManifest | null;
  vocabulary: Vocabulary | null;
  producers: ProducerRecord[];
  publisherHosts: string[];
  /** Keyed by pack id; `dir` is the folder under layers/. */
  packs: Map<string, { dir: string; file: string; manifest: PackManifest }>;
  controls: Map<string, ControlRecord>;
  /** Control id to its catalog-relative file. */
  controlFiles: Map<string, string>;
  /** Keyed by the path relative to catalog/fixtures/, as control tests name them. */
  fixtures: Map<string, LoadedFixture>;
  issues: CatalogIssue[];
}

const TOP_FILES = new Set(["README.md", "LICENSE.md", "catalog.yaml", "vocabulary.yaml", "producers.yaml", "publisher-hosts.yaml"]);
const DECIMAL_INT = /^-?(0|[1-9][0-9]*)$/;
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}/;

/** The shipped catalog: `<package>/catalog/`, from both src/catalog/ and dist/catalog/. */
export function defaultCatalogRoot(): string {
  return fileURLToPath(new URL("../../catalog/", import.meta.url));
}

function issue(code: string, file: string, message: string, path = "", controlId: string | null = null): CatalogIssue {
  return { code, severity: "error", file, controlId, path, message };
}

/** Every regular file under `dir`, catalog-relative with "/" separators; symlinks and other types are issues. */
function listFiles(root: string, dir: string, issues: CatalogIssue[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const rel = relative(root, abs).split(sep).join("/");
    if (entry.isDirectory()) out.push(...listFiles(root, abs, issues));
    else if (entry.isFile()) out.push(rel);
    else issues.push(issue("CAT_STRAY_FILE", rel, "not a regular file (symlinks are refused)"));
  }
  return out;
}

/** YAML as plain data, or undefined with issues. */
function parseYaml(text: string, file: string, issues: CatalogIssue[]): unknown {
  const doc = YAML.parseDocument(text, { uniqueKeys: true });
  const found: CatalogIssue[] = [...doc.errors, ...doc.warnings].map((e) => issue("CAT_YAML", file, e.message));
  YAML.visit(doc, {
    Alias() { found.push(issue("CAT_YAML_ALIAS", file, "aliases are refused")); },
    Node(_, node) {
      if (node.anchor) found.push(issue("CAT_YAML_ALIAS", file, `anchor &${node.anchor} is refused`));
      if (node.tag) found.push(issue("CAT_YAML_TAG", file, `explicit tag ${node.tag} is refused`));
      if (!YAML.isScalar(node)) return;
      if (typeof node.value === "number" && !DECIMAL_INT.test(node.source ?? "")) {
        found.push(issue("CAT_SCHEMA", file, `number ${String(node.source)} is not a decimal integer (no floats in catalog content)`));
      }
      if (typeof node.value === "string" && node.type === "PLAIN" && DATE_LIKE.test(node.value)) {
        found.push(issue("CAT_SCHEMA", file, `date ${node.value} must be quoted`));
      }
    }
  });
  issues.push(...found);
  return found.length ? undefined : doc.toJS();
}

function parseWith<S extends z.ZodType>(schema: S, value: unknown, file: string, issues: CatalogIssue[], controlId: string | null = null): z.output<S> | null {
  if (value === undefined) return null;
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  issues.push(...zodToCatalogIssues(parsed.error, file, controlId));
  return null;
}

/** Non-integer numbers anywhere in a JSON value. */
function hasFloat(value: unknown): boolean {
  if (typeof value === "number") return !Number.isSafeInteger(value);
  if (value && typeof value === "object") return Object.values(value).some(hasFloat);
  return false;
}

function loadFixture(root: string, rel: string, issues: CatalogIssue[]): LoadedFixture {
  const bytes = readFileSync(join(root, rel));
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (err) {
    issues.push(issue("CAT_SCHEMA", rel, `not JSON: ${(err as Error).message}`));
  }
  if (value !== undefined && hasFloat(value)) issues.push(issue("CAT_SCHEMA", rel, "fixtures hold integers only (no floats in catalog content)"));
  return { path: rel, sha256: sha256Hex(bytes), envelope: parseWith(fixtureEnvelopeSchema, value, rel, issues) };
}

function emptyCatalog(root: string): LoadedCatalog {
  return {
    root, manifest: null, vocabulary: null, producers: [], publisherHosts: [], packs: new Map(), controls: new Map(),
    controlFiles: new Map(), fixtures: new Map(), issues: []
  };
}

export function loadCatalog(opts: { root?: string } = {}): LoadedCatalog {
  const root = opts.root ?? defaultCatalogRoot();
  const cat = emptyCatalog(root);
  const { issues } = cat;
  const read = (rel: string) => parseYaml(readFileSync(join(root, rel), "utf8"), rel, issues);
  let files: string[];
  try {
    if (!lstatSync(root).isDirectory()) throw new Error("not a directory");
    files = listFiles(root, root, issues).sort();
  } catch (err) {
    issues.push(issue("CAT_SCHEMA", ".", `catalog root ${root} cannot be read: ${(err as Error).message}`));
    return cat;
  }
  const present = new Set(files);
  for (const required of ["catalog.yaml", "vocabulary.yaml", "producers.yaml", "publisher-hosts.yaml"]) {
    if (!present.has(required)) issues.push(issue("CAT_SCHEMA", required, "required catalog file is missing"));
  }

  for (const rel of files) {
    const parts = rel.split("/");
    if (parts.length === 1 && TOP_FILES.has(rel)) {
      if (rel === "catalog.yaml") cat.manifest = parseWith(catalogManifestSchema, read(rel), rel, issues);
      else if (rel === "vocabulary.yaml") cat.vocabulary = parseWith(vocabularySchema, read(rel), rel, issues);
      else if (rel === "producers.yaml") cat.producers = parseWith(producersFileSchema, read(rel), rel, issues)?.producers ?? [];
      else if (rel === "publisher-hosts.yaml") cat.publisherHosts = parseWith(publisherHostsSchema, read(rel), rel, issues)?.hosts.map((h) => h.host) ?? [];
    } else if (parts.length === 3 && parts[0] === "layers" && parts[2] === "pack.yaml") {
      const manifest = parseWith(packManifestSchema, read(rel), rel, issues);
      if (!manifest) continue;
      if (cat.packs.has(manifest.id)) issues.push(issue("CAT_DUPLICATE_ID", rel, `pack id ${manifest.id} is also declared in ${cat.packs.get(manifest.id)?.file}`));
      else cat.packs.set(manifest.id, { dir: parts[1] as string, file: rel, manifest });
    } else if (parts.length === 4 && parts[0] === "layers" && parts[2] === "controls" && rel.endsWith(".yaml")) {
      const record = parseWith(controlRecordSchema, read(rel), rel, issues);
      if (!record) continue;
      if (parts[3] !== `${record.id}.yaml`) issues.push(issue("CAT_SCHEMA", rel, `file name must be ${record.id}.yaml`, "id", record.id));
      const other = cat.controlFiles.get(record.id);
      if (other) issues.push(issue("CAT_DUPLICATE_ID", rel, `control id ${record.id} is also declared in ${other}`, "id", record.id));
      else {
        cat.controls.set(record.id, record);
        cat.controlFiles.set(record.id, rel);
      }
    } else if (parts.length === 4 && parts[0] === "fixtures" && (parts[2] === "positive" || parts[2] === "negative") && rel.endsWith(".json")) {
      cat.fixtures.set(parts.slice(1).join("/"), loadFixture(root, rel, issues));
    } else {
      issues.push(issue("CAT_STRAY_FILE", rel, "outside the documented catalog tree (docs/catalog/CONTROL_RECORD.md)"));
    }
  }
  return cat;
}
