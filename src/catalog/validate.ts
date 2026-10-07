/**
 * Cross-file catalog rules (P1-09): pack membership, fixtures, producers, vocabulary, clocks, citations and the
 * evidence-based level caps. The loader's own issues come first; `ok` is true only with no errors at all.
 */
import { FRAMEWORK_ID_FORMATS, type CitationFramework } from "../compliance/citations/frameworkIds.js";
import { REGULATORY_CLOCK_TABLE } from "../incidents/regulatoryClocksTable.js";
import { validateCitation } from "./citations.js";
import type { LoadedCatalog } from "./loader.js";
import { validatePredicate } from "./predicate.js";
import type { CatalogIssue, Vocabulary } from "./schema.js";
import type { ControlRecord, Level, Predicate } from "./types.js";

export interface CatalogValidation {
  ok: boolean;
  errors: CatalogIssue[];
  warnings: CatalogIssue[];
}

const ABOVE_L1: readonly Level[] = ["L2", "L3", "L4", "L5"];
const L3_AND_ABOVE: readonly Level[] = ["L3", "L4", "L5"];

function predicatesOf(r: ControlRecord): Array<[string, Predicate]> {
  return [
    ["applicability.predicate", r.applicability.predicate],
    ...r.applicability.exclusions.map((e, i): [string, Predicate] => [`applicability.exclusions.${i}.when`, e.when]),
    ...r.citations.flatMap((c, i): Array<[string, Predicate]> => (c.appliesWhen ? [[`citations.${i}.appliesWhen`, c.appliesWhen]] : []))
  ];
}

function checkVocabulary(r: ControlRecord, vocabulary: Vocabulary, add: (code: string, path: string, message: string) => void, file: string): CatalogIssue[] {
  if (!vocabulary.ownerRoles.includes(r.owner.role)) add("CAT_VOCAB", "owner.role", `"${r.owner.role}" is not an ownerRoles term`);
  const duty = r.binding.manualDuty;
  if (duty && !vocabulary.ownerRoles.includes(duty.ownerRole)) add("CAT_VOCAB", "binding.manualDuty.ownerRole", `"${duty.ownerRole}" is not an ownerRoles term`);
  r.citations.forEach((c, i) => {
    if (!vocabulary.jurisdictions.includes(c.jurisdiction)) add("CAT_VOCAB", `citations.${i}.jurisdiction`, `"${c.jurisdiction}" is not a jurisdictions term`);
  });
  r.crosswalk.forEach((x, i) => {
    if (!vocabulary.frameworks.includes(x.framework)) add("CAT_VOCAB", `crosswalk.${i}.framework`, `"${x.framework}" is not a frameworks term`);
    const format = FRAMEWORK_ID_FORMATS[x.framework as CitationFramework] as RegExp | undefined;
    if (format && !format.test(x.clause)) add("CAT_CROSSWALK_ID", `crosswalk.${i}.clause`, `${x.framework} id "${x.clause}" is malformed (P0-25 format ${format.source})`);
  });
  return predicatesOf(r).flatMap(([path, p]) => validatePredicate(p, vocabulary, { file, controlId: r.id, path }));
}

function checkFixtures(cat: LoadedCatalog, r: ControlRecord, add: (code: string, path: string, message: string) => void): void {
  r.tests.forEach((t, i) => {
    for (const polarity of ["positive", "negative"] as const) {
      t.fixtures[polarity].forEach((ref, j) => {
        const path = `tests.${i}.fixtures.${polarity}.${j}`;
        const fixture = cat.fixtures.get(ref);
        if (!ref.startsWith(`${r.id}/${polarity}/`)) add("CAT_FIXTURE_MISMATCH", path, `${ref} must sit under ${r.id}/${polarity}/`);
        else if (!fixture) add("CAT_FIXTURE_MISSING", path, `fixtures/${ref} does not exist`);
        else if (fixture.envelope && (fixture.envelope.controlId !== r.id || fixture.envelope.polarity !== polarity)) {
          add("CAT_FIXTURE_MISMATCH", path, `fixtures/${ref} declares ${fixture.envelope.controlId} ${fixture.envelope.polarity}`);
        }
      });
    }
  });
}

/** Level caps from the admitted producers: no observed producer caps at L1; no available producer caps at L2. */
function checkLevels(cat: LoadedCatalog, r: ControlRecord, add: (code: string, path: string, message: string) => void): void {
  const producers = r.evidence.map((e) => cat.producers.find((p) => p.id === e.producer));
  r.evidence.forEach((e, i) => { if (!producers[i]) add("CAT_PRODUCER_UNKNOWN", `evidence.${i}.producer`, `producer ${e.producer} is not in catalog/producers.yaml`); });
  if (!producers.some((p) => p?.maxClaimKind === "observed") && r.levels.some((l) => ABOVE_L1.includes(l))) {
    add("CAT_LEVEL_CAP", "levels", "no evidence producer is observed (only self-reported, synthetic or none), so levels may contain only L1");
  }
  if (!producers.some((p) => p?.status === "available") && r.levels.some((l) => L3_AND_ABOVE.includes(l))) {
    add("CAT_LEVEL_CAP", "levels", "every evidence producer is planned, so levels may not contain L3 or above");
  }
}

function checkControl(cat: LoadedCatalog, r: ControlRecord, asOf: string): CatalogIssue[] {
  const file = cat.controlFiles.get(r.id) ?? "";
  const out: CatalogIssue[] = [];
  const add = (code: string, path: string, message: string) => out.push({ code, severity: "error", file, controlId: r.id, path, message });

  const packs = [...cat.packs.values()].filter((p) => p.manifest.controls.includes(r.id));
  if (packs.length !== 1) add("CAT_PACK_MEMBERSHIP", "id", `listed by ${packs.length} packs; a control belongs to exactly one`);
  const pack = packs[0];
  if (pack && packs.length === 1) {
    if (!file.startsWith(`layers/${pack.dir}/controls/`)) add("CAT_PACK_MEMBERSHIP", "id", `listed by ${pack.manifest.id} but stored outside layers/${pack.dir}/controls/`);
    if (pack.manifest.layer !== r.layer) add("CAT_PACK_MEMBERSHIP", "layer", `layer ${r.layer} differs from pack ${pack.manifest.id} layer ${pack.manifest.layer}`);
  }
  if (cat.vocabulary) out.push(...checkVocabulary(r, cat.vocabulary, add, file));
  checkFixtures(cat, r, add);
  checkLevels(cat, r, add);
  if (r.clock) {
    const clock = REGULATORY_CLOCK_TABLE.find((c) => c.clockId === r.clock?.clockId);
    if (!clock) add("CAT_CLOCK_UNKNOWN", "clock.clockId", `${r.clock.clockId} is not in REGULATORY_CLOCK_TABLE (src/incidents/regulatoryClocksTable.ts)`);
    else if (clock.deadline.amount !== r.clock.deadline.amount || clock.deadline.unit !== r.clock.deadline.unit) {
      add("CAT_CLOCK_MISMATCH", "clock.deadline", `deadline differs from ${clock.clockId} (${clock.deadline.amount} ${clock.deadline.unit})`);
    }
  }
  r.citations.forEach((c, i) => out.push(...validateCitation(c, {
    file, controlId: r.id, support: r.support, path: `citations.${i}`, asOf, publisherHosts: cat.publisherHosts
  })));
  return out;
}

function checkPacksAndFixtures(cat: LoadedCatalog): CatalogIssue[] {
  const out: CatalogIssue[] = [];
  for (const { file, manifest } of cat.packs.values()) {
    manifest.controls.forEach((id, i) => {
      if (!cat.controls.has(id)) out.push({ code: "CAT_PACK_MEMBERSHIP", severity: "error", file, controlId: id, path: `controls.${i}`, message: `control ${id} has no file` });
    });
    const vocabulary = cat.vocabulary;
    if (!vocabulary) continue;
    manifest.jurisdictions.forEach((j, i) => {
      if (!vocabulary.jurisdictions.includes(j)) out.push({ code: "CAT_VOCAB", severity: "error", file, controlId: null, path: `jurisdictions.${i}`, message: `"${j}" is not a jurisdictions term` });
    });
  }
  const referenced = new Set([...cat.controls.values()].flatMap((r) => r.tests.flatMap((t) => [...t.fixtures.positive, ...t.fixtures.negative])));
  for (const [ref, fixture] of cat.fixtures) {
    if (!referenced.has(ref)) out.push({ code: "CAT_STRAY_FILE", severity: "error", file: fixture.path, controlId: null, path: "", message: "no control test references this fixture" });
  }
  return out;
}

export function validateCatalog(cat: LoadedCatalog, opts: { asOf?: Date } = {}): CatalogValidation {
  const asOf = (opts.asOf ?? new Date()).toISOString().slice(0, 10);
  const all = [
    ...cat.issues,
    ...[...cat.controls.values()].flatMap((r) => checkControl(cat, r, asOf)),
    ...checkPacksAndFixtures(cat)
  ];
  const errors = all.filter((i) => i.severity === "error");
  return { ok: errors.length === 0, errors, warnings: all.filter((i) => i.severity === "warning") };
}
