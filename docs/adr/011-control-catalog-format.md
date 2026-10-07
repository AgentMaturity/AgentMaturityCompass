# ADR 011: Control catalog format

Status: proposed. Implemented in `src/catalog/` and `catalog/` (P1-09). Owner: P1-09. Date: 2026-10-08.
Numbering: 008 is the native shell containment ADR, 009 is reserved for the pi-ai adapter (P1-38) and 010 is MCP
2026-07-28. Decision D-04 (catalog licence) takes its own number when it is written.

## Context

AMC's questions are self-scored and their citations are free text with no edition, dates or hash. Nothing names a
control's enforcement point, oracle or admitted evidence. The compiler (P1-10), evidence binding (P1-11), the Layer 0
baseline (P1-14), the admission checker (P1-33), the OSCAL export (P1-28) and every station overlay need one record
format, and whatever format comes first is copied into every control. Two risks shape it: packs that drift into code,
and digests a second implementation cannot reproduce.

## Decision

- **YAML content, zod schema.** Controls, packs, the vocabulary and the producer registry are YAML files under
  `catalog/`, shipped in the npm package. Strict zod schemas in `src/catalog/schema.ts` define them; unknown keys fail.
  The record, pack manifest and lockfile schemas are published to `spec/schemas/v1/` through P1-01's generator.
- **No code in packs.** The loader parses YAML as data only: no anchors, aliases or explicit tags, no imports, no
  evaluation. Applicability is a declarative grammar of seven operators (`always`, `all`, `any`, `not`,
  `includesAny`, `includesAll`, `equals`) over nine named facts, bounded at 8 levels and 64 nodes, with every term in
  `catalog/vocabulary.yaml`. A new operator needs a new ADR.
- **Digests over normalized records.** A control digest is `sha256` of the canonical JSON of the parsed record, so
  formatting changes nothing. Pack and catalog digests compose control, fixture-byte, producer and vocabulary digests.
  Catalog content holds integers only, because `canonicalize` is not RFC 8785. A timestamp-free lockfile pins them.
- **Law as data.** Citations carry the P0-25 citation-record fields and status-type vocabulary, are checked against
  the shared official host list and the S5 register, and stay `unverified` until fetched and hashed.
- **Support gates in the schema.** `reviewed` and `qualified` require verified, legally reviewed citations and an
  approved expert review; producers cap the levels a control may claim. Agents draft records and never approve them.

## Consequences

- Catalog content can be reviewed as data by people who do not read TypeScript, and diffs show exactly what changed.
- A float, an alias or an unknown key is refused at load time instead of surfacing as a digest mismatch later.
- The record cites the S5 register only. Until P1-18 adds US rows, US citations use `registerId: null` and their
  controls cannot leave `experimental`.
- The licence stays MIT until D-04; the strategy recommends CC BY 4.0, which this ADR does not adopt.
- Evaluating predicates, compiling plans and binding evidence remain P1-10 and P1-11; this format only fixes what they
  read.
