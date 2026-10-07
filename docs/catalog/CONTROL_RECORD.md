# Control record format

Status: v0.1, experimental content (P1-09). Code: `src/catalog/`. Content: `catalog/`. Decision: [ADR 011](../adr/011-control-catalog-format.md).

The Regulated Control Catalog states each control once, as YAML data: what it requires, where it is enforced, which
oracle observes it, which evidence it admits and which law it cites. The compiler (P1-10), evidence binding (P1-11),
the Layer 0 baseline (P1-14), the admission checker (P1-33) and the OSCAL export (P1-28) all read this record.

A control's result is evidence of conformity, never proof of compliance. Every record in the catalog today is
`experimental`: agent-drafted, with unverified citations and no expert review.

## The tree

```
catalog/
  README.md, LICENSE.md          scope and licence (MIT until decision D-04)
  catalog.yaml                   catalog manifest: id, version, compilerCompat, publisher, maintainers, licence
  vocabulary.yaml                stations, jurisdictions, roles, entityTypes, riskClasses, useCases, dataClasses,
                                 domains, ownerRoles, frameworks
  producers.yaml                 admitted evidence producers (ProducerRecord[] under `producers:`)
  publisher-hosts.yaml           standards-body hosts for voluntary-standard citations (`hosts:`)
  layers/<pack>/pack.yaml        pack manifest
  layers/<pack>/controls/<id>.yaml   one control record; the file name is the control id
  fixtures/<id>/positive/*.json  fixture envelopes a test must allow or pass
  fixtures/<id>/negative/*.json  fixture envelopes it must deny, fail or leave not evaluated
```

`package.json` ships `catalog/**`, and `loadCatalog()` finds it from `src/catalog/` and `dist/catalog/` alike
(`new URL("../../catalog/", import.meta.url)`). `npm run check:packed-install` loads and validates the installed copy.

## Loading

`loadCatalog({ root? })` reads the documented tree and nothing else. It never imports or evaluates content. It refuses:

| Refusal | Code |
| --- | --- |
| A file outside the tree, a symlink or another non-regular file | `CAT_STRAY_FILE` |
| A YAML parse error or warning, a duplicate key, more than one document | `CAT_YAML` |
| An anchor or alias (billion-laughs risk) | `CAT_YAML_ALIAS` |
| An explicit tag (`!!binary`, `!custom`, even `!!str`) | `CAT_YAML_TAG` |
| A number that is not a plain decimal integer (`30.5`, `30.0`, `1e3`, `0x10`) | `CAT_SCHEMA` |
| An unquoted date (`draftedAt: 2026-10-05`; write `"2026-10-05"`) | `CAT_SCHEMA` |
| A key the schema does not name, or any other shape error | `CAT_SCHEMA` |
| A control whose file name is not `<id>.yaml` | `CAT_SCHEMA` |
| A second control or pack with an id already loaded | `CAT_DUPLICATE_ID` |

Each fixture is read once: its SHA-256 and its parsed envelope come from the same bytes. `loadCatalog` returns
`{ root, manifest, vocabulary, producers, publisherHosts, packs, controls, controlFiles, fixtures, issues }`.

`validateCatalog(cat, { asOf })` adds the cross-file rules below and returns `{ ok, errors, warnings }`. `ok` is true
only with no errors. Each issue is `{ code, severity, file, controlId, path, message }`.

## Control record fields

| Field | Rule |
| --- | --- |
| `id` | `/^L[0-3](-[A-Z0-9]{2,8}){1,2}-[0-9]{2,3}$/`; its digit equals `layer`. |
| `version` | Semver. |
| `support` | `experimental`, `reviewed`, `qualified` or `retired`; see "Support gates". |
| `layer` | 0, 1, 2 or 3. |
| `family` | Free text or null. |
| `stations` | At least one of the seven stations, no repeats; a Layer 0 control lists all seven. |
| `title`, `statement`, `riskRationale` | Non-empty. `statement` is one testable sentence. |
| `mandatory` | Boolean. |
| `applicability` | `predicate`, at least one `reasons` entry, and `exclusions` of `{ when, reason }`. |
| `citations` | Law-as-data citations; see below. Keys are unique within the control. |
| `binding` | `kind: enforcement_point` needs non-empty `points` and `manualDuty: null`; `kind: manual` needs empty `points` and a full `manualDuty`. `parameters[].value` is a string, integer, boolean or string list, with a `strictness`. |
| `tests` | Ids start with `<id>-T` and are unique. `attempts` ≥ 1; `executed_adversarial` needs ≥ 25. Fixture paths are `<id>/<positive or negative>/<name>.json`. A mandatory control with an enforcement binding needs a test with at least one positive and one negative fixture. |
| `evidence` | Ids start with `<id>-E` and are unique. `bindingFields` include `controlId` and one of `tenantId`, `workspaceId`, `deploymentId` or `agentId`. `freshness.maxAgeDays` ≥ 1; `sampling.ratePercent` 1–100 or null; `retention` is `regime_max` or `fixed` with `days` and `basis`; `residency` is `inherit_deployment` or `pinned` with `regions` and `basis`. |
| `invalidatedBy` | Triggers that invalidate prior evidence; no repeats. |
| `owner.role` | An `ownerRoles` vocabulary term. |
| `clock` | Null, or a `clockId` from `REGULATORY_CLOCK_TABLE` (`src/incidents/regulatoryClocksTable.ts`) with the same `deadline`. |
| `levels` | At least one of L1–L5, capped by the evidence producers (below). |
| `crosswalk` | `framework` is a `frameworks` vocabulary term; `relation` is `equivalent`, `partial` or `conflicting`. For `atlas`, `nist-ai-rmf` and `iso-42001` the clause must match P0-25's id format. |
| `review` | `status` and the expert, credential and dates of the review. |
| `provenance` | `draftedBy` (`human` or `ai`), `draftedAt`, `approvedBy`. |

Dates are quoted `YYYY-MM-DD`. Numbers are integers.

## Applicability predicates

Seven operators, nothing else (ADR 011): `{ always: true }`, `{ all: [...] }`, `{ any: [...] }`, `{ not: ... }`,
`{ fact, includesAny: [...] }`, `{ fact, includesAll: [...] }` and `{ fact, equals }`. Facts are `stations`,
`primaryStation`, `domains`, `jurisdictions`, `roles`, `entityTypes`, `riskClass`, `useCases` and `dataClasses`.
`primaryStation` and `riskClass` take `equals`; the list facts take `includesAny` or `includesAll`. Lists are non-empty.
Every term must be in the fact's vocabulary list (`CAT_VOCAB`). A predicate is at most 8 levels deep and 64 nodes.
`parsePredicate(value)` and `validatePredicate(p, vocabulary)` check these rules; the compiler evaluates them
three-valued ([COMPILER.md](COMPILER.md)).

## Citations (law as data)

A citation carries the P0-25 citation-record fields (`src/compliance/citations/citationRecord.ts`): `instrument`,
`clause`, `edition`, `jurisdiction`, `statusType`, `effectiveDate`, `complianceDueDate`, `dateNote`, `url` and the
retrieval facts. It adds `key`, `registerId`, `superseded`, `retrieval`, `appliesWhen`, `legalReview` and `note`.

| Rule | Code |
| --- | --- |
| `statusType` is one of P0-25's `binding-now`, `binding-future`, `draft`, `supervisory-guidance`, `voluntary-standard`, `contractual`, `conformity-scheme` | `CAT_SCHEMA` |
| `complianceDueDate` ≥ `effectiveDate` when both are set; `dateNote` is required when either is null | `CAT_SCHEMA` |
| `retrieval` is `{ state: verified, retrievedAt, contentSha256 }` (64 lowercase hex) or `{ state: unverified, reason }` | `CAT_SCHEMA` |
| `url` is https on the shared official host list (`isSharedOfficialUrl`, P0-25; a superset of the S5 register's hosts), or on `publisher-hosts.yaml` for a `voluntary-standard` citation | `CAT_CITATION_HOST` |
| A non-null `registerId` names an S5 register entry (`src/compliance/regulatory/register.json`) | `CAT_CITATION_REGISTER` |
| `statusType` agrees with that entry: `binding-now` needs `in-force` or `partially-applicable` and `bindingForce: binding`; `binding-future` needs `enacted-not-yet-applicable`; `draft` needs `proposed`; `supervisory-guidance` and `voluntary-standard` need `bindingForce: voluntary`. `contractual` and `conformity-scheme` have no register rule | `CAT_CITATION_STATUS_MISMATCH` |
| A citation of a `superseded` register entry, or text matching P0-25's superseded-instrument denylist, must set `superseded: { by, on }` | `CAT_CITATION_SUPERSEDED` |
| `registerId: null` is a warning for `experimental` controls and an error otherwise | `CAT_NO_REGISTER_ENTRY` |
| A verified `retrievedAt` is not after `asOf` | `CAT_CITATION_RETRIEVAL` |
| A verified `retrievedAt` older than the register's `reviewWindowDays` (90) is an error for `reviewed` and `qualified` controls and a warning otherwise | `CAT_CITATION_STALE` |
| `jurisdiction` and every `appliesWhen` term are vocabulary terms | `CAT_VOCAB` |

The catalog cites the S5 register only. The S3 pack catalogue (`src/domains/packs/catalogue*.ts`) is not a source; P0-25
and P1-34 reconcile the two. Never invent a citation: an entry that has not been fetched and hashed stays `unverified`
with the reason.

## Support gates and level caps

`reviewed` and `qualified` need every citation `verified` with a `legalReview`, `review.status: approved` with
`expert`, `credential`, `reviewedAt` and `nextReview`, and `provenance.approvedBy` when `draftedBy: ai`
(`CAT_SUPPORT_GATE`). `experimental` allows unverified citations and a pending review. Agents draft records; they never
approve them.

Levels are capped by the producers in `producers.yaml` (`CAT_LEVEL_CAP`): with no `observed` producer among a control's
evidence (only `self_reported`, `synthetic_example` or none), `levels` may contain only L1; with no `available`
producer (all `planned`), `levels` may not contain L3 or above. An unknown producer is `CAT_PRODUCER_UNKNOWN` and
counts as neither observed nor available.

## Cross-file rules

| Rule | Code |
| --- | --- |
| Each control is listed by exactly one pack, is stored in that pack's `controls/` folder and has the pack's layer; each listed control exists | `CAT_PACK_MEMBERSHIP` |
| Each referenced fixture exists | `CAT_FIXTURE_MISSING` |
| Each fixture sits under its control and polarity and its envelope names the same control and polarity | `CAT_FIXTURE_MISMATCH` |
| Each fixture is referenced by a test | `CAT_STRAY_FILE` |
| Pack jurisdictions, owner roles (`owner.role`, `manualDuty.ownerRole`) and crosswalk frameworks are vocabulary terms | `CAT_VOCAB` |
| Clock ids exist in the F4 table and the deadline matches | `CAT_CLOCK_UNKNOWN`, `CAT_CLOCK_MISMATCH` |

## Pack manifest, producers and fixtures

A pack manifest has `id`, `version`, `layer`, `title`, `stations`, `jurisdictions`, `compilerCompat` (a semver range),
`publisher`, `maintainers`, `licence` (an SPDX id; `MIT` until D-04), `support` (declared; P1-33 gates it), `controls`
and `stewardship`. A producer record has `id`, `module` (the emitting source path), `emits`, `maxClaimKind`
(`observed`, `self_reported` or `synthetic_example`), `status` (`available` or `planned`) and `plannedBy`, which is set
exactly when the producer is planned. A fixture envelope has `fixtureVersion: 1`, `controlId`, `polarity`,
`evidenceClass`, `setup` (read by the harness for the binding point) and `expected` (`result` and `reasonCode`).
Fixtures are synthetic inputs for tests; they are never evidence.

## Status dimensions

Code: `src/catalog/evidence/` (P1-11). `evaluateControl(record, items, ctx)` admits or rejects each evidence item
against the control's evidence contracts and returns a `ControlResult`: the five status dimensions of
[CLAIM_KINDS.md](../CLAIM_KINDS.md), a claim kind derived through `evaluateClaimEligibility`, the admitted and rejected
refs with reasons, and a `digest` (sha256 of the canonical result without `evaluatedAt`, with review `pending`, so a
review can name it). It is deterministic: items are taken in ref order. A result set written to a file for export goes
through `writeSignedControlResults` (`signedResults.ts`), which signs the sha256 of exactly the bytes written as
`CONTROL_RESULT` ([OSCAL.md](../exports/OSCAL.md), "Signed results").

An item's provenance is proved by the loader that read it, from the same bytes, never by reading a field back from an
editable file. Ledger rows count only when the whole hash chain verifies and its head carries the workspace
monitor-key signature; that key is the workspace's own, so this is a local audit trail, not a portable verdict
(P0-09), and a truncated tail stays invisible until anchoring (P1-26). A row's receipt must verify and commit to that
row. Sealed assurance reports must verify against the auditor key. Trust tiers come from P0-18's `effectiveTrustTier`
on the verified row, capped by the producer's `maxClaimKind`.

Admission, first failure wins:

| Check | Rejection |
| --- | --- |
| The producer is in `producers.yaml`, `available`, and is the contract's producer | `producer_not_admitted` |
| The loader proved that producer from the bytes it read | `producer_unverified` |
| A `tenantId` on the item equals the evaluation's tenant (an unknown tenant included) | `cross_tenant` |
| A `system`-session record binds an agent-scoped contract only as a violation | `binding_mismatch` |
| Every `bindingFields` entry is present | `binding_missing` |
| Every stated binding field the evaluation knows matches (`controlId`, `controlVersion`, `policyDigest`, `workspaceId`, `deploymentId`, `agentId`, `subjectId`, `producerId`) | `binding_mismatch` |
| Recorded time inside the window | `outside_window` |
| Recorded time no more than `freshness.maxAgeDays` before the window end (never the producer's claimed time) | `stale` |
| No earlier presentation of the ref or receipt id in this evaluation or, through `priorUses`, under another control, subject or window; no receipt for another record | `replayed` |
| No `invalidatedBy` trigger after the recorded time | `invalidated` |

Dimensions:

| Dimension | Rule |
| --- | --- |
| Applicability | The compiled plan's decision (P1-10). No plan: `unresolved`, so nothing passes. |
| Evidence | First match: `contradictory` when admitted items disagree on one observation (an allow and a deny for one tool call id); `untrusted` when items exist, none is admitted and one failed for its producer or tenant, or a contract's admitted items fall below its minimum observed ratio; `stale` when a contract lacks `minItems` admitted items and some of its items were stale; `incomplete` when a contract lacks `minItems` admitted items (an empty window included); else `sufficient`. |
| Result | `fail` when an admitted item violates, whatever the evidence. A violating item that was not admitted blocks a pass, and so does a contract met only by self-reported items (truth rule 3). `pass` only when applicability is `applicable` and evidence `sufficient`; otherwise `not_evaluated`. A not-applicable control never passes. |
| Enforcement | `advisory` when the plan runs the control's enforcement point in warn mode; `enforced at <point>` only on admitted allow or deny records from that point's producer under the plan's policy digest; `observed` when items were admitted otherwise; else `none`. |
| Review | `pending` unless a review from the approval engine names this result's digest: `rejected` wins, then `approved`, which is `expired` after `expiresAt`. |
| Claim kind | `synthetic_example` when an admitted item's producer is synthetic; `observed` only when every admitted item derives OBSERVED or OBSERVED_HARDENED; otherwise `self_reported`. Never `independently_reviewed` here. |

Compliance mappings (`.amc/compliance-maps.yaml`) run through the same evaluator, one control per requirement
(`src/catalog/evidence/mappingAdapter.ts`): `requires_evidence_event` admits control-bound ledger records from
`amc.ledger` bound to the control and the agent (or the workspace); `requires_no_audit` admits any record of the
subject as coverage, so an empty window is incomplete, and treats a denied audit type as a violation;
`requires_assurance_pack` admits sealed reports from `amc.assuranceRunner`. Mapping contracts use a 30-day freshness
bound and no invalidation triggers until P1-53 re-keys them to catalog controls.

## Digests

`digestOf(value)` is `"sha256:" + sha256Hex(canonicalize(value))`, over the parsed, schema-normalized value, so key
order, indentation, quoting and folding do not change a digest. `canonicalize` is sorted-key `JSON.stringify`, not
RFC 8785; catalog content holds no floats, so another implementation can reproduce it.

- `controlDigest(record)`: the parsed control record.
- `packDigest(cat, manifest)`: the manifest, `[{ id, version, digest }]` of its controls sorted by id, and
  `[{ path, sha256 }]` of those controls' fixture files (raw bytes) sorted by path.
- `catalogDigest(cat)`: the catalog manifest, `[{ id, version, digest }]` of the packs sorted by id, the producers
  digest (records sorted by id) and the vocabulary digest.

## Lockfile

`buildCatalogLock(cat)` returns the `catalog-lock` record: `lockfileVersion: 1`, `generatedBy`, the catalog id,
version and digest, each pack's id, version, support and digest, each control's id, version, pack and digest, one
`sources` row per citation (`url`, `edition`, and `sha256` and `retrievedAt` when verified), the S5 register digest,
and the producer and vocabulary digests. It holds no timestamps, so two builds of one tree serialize to identical bytes
with `JSON.stringify(lock, null, 2)`. It throws when the catalog did not load cleanly.

`verifyCatalogLock(lock, cat)` parses the stored lock strictly, rebuilds it from `cat` and returns
`{ ok, mismatches: [{ path, expected, actual }] }`, naming each differing path (`packs[amc.l0.baseline].digest`).
`generatedBy` is informational and not compared. A lock shows the content is unchanged; it does not show it is true.

## Published schemas

`control-record`, `pack-manifest` and `catalog-lock` are generated into `spec/schemas/v1/` by `npm run gen:schemas` and
drift-checked by `npm run check:schemas`. The refinements on this page do not reach JSON Schema;
`spec/ACCEPTANCE_RULES.md` points here for them.
