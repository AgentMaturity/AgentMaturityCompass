# OSCAL export (v0, experimental)

`amc export oscal` writes AMC's Regulated Control Catalog, a compiled control plan and that plan's control results as
NIST OSCAL documents, plus a loss report of every AMC field OSCAL could not carry natively.

```
amc export oscal --out <dir> [--plan <plan.json>] [--results <file>]
```

| File | Written when | OSCAL model |
| --- | --- | --- |
| `catalog.json` | always | catalog |
| `profile.json` | `--plan` is given and the plan has at least one applicable control | profile |
| `assessment-results.json` | `--results` is given and holds at least one result | assessment results |
| `oscal-loss-report.json` | always | AMC (`amc.oscal-loss/1`) |

The export carries existing claims and never creates or upgrades one. A not-evaluated control never becomes satisfied,
and a crosswalk never satisfies its target. The output is evidence of conformity, never a compliance statement. The
catalog content is experimental and agent-drafted until a named expert reviews it.

Code: `src/exports/oscal/` (`oscalIds.ts`, `oscalCatalog.ts`, `oscalProfile.ts`, `oscalAssessmentResults.ts`,
`oscalLoss.ts`, `oscalCli.ts`).

## Inputs and refusals

- **Catalog**: the shipped catalog (`catalog/`). It must load without errors and hold at least one control.
- **`--plan <plan.json>`**: a plan from `amc catalog compile` (docs/catalog/COMPILER.md). `plan.json` and the
  `plan.sig.json` beside it are each read once; the plan must hash to its digest and its `CONTROL_PLAN` signature must
  verify against this workspace's auditor keys. That check is a local audit trail, not portable trust (P0-09). The
  shipped catalog must match the plan's catalog lockfile.
- **`--results <file>`**: a JSON array of P1-11 control results (`ControlResult`, `resultVersion: 1`, as
  `evaluateControl` in `src/catalog/evidence/evaluate.ts` returns them). It needs `--plan`. The whole file is refused,
  and nothing is written, unless every result:
  - has the exact P1-11 shape and a claim kind `evaluateControl` can derive (`independently_reviewed` is refused);
  - hashes to its own `digest`, and appears once;
  - names a catalog control at the version and digest the shipped catalog holds;
  - was evaluated under the verified plan (`planDigest`), with the plan's applicability for that control;
  - is coherent: a `synthetic_example` result is always `not_evaluated`, and a `pass` needs applicability
    `applicable` and evidence `sufficient`.

  Control results are not signed yet. Their digest is unkeyed: it shows a result is unchanged since it was hashed, not
  who produced it. The assessment-results metadata remarks say so.
- **No results** (no `--results`, or an empty array): no `assessment-results.json` and the message
  `not evaluated: no control results`. Exit 0; nothing is invented.
- `--out` under `.amc/` is refused. A `profile.json` or `assessment-results.json` left in `--out` by an earlier export
  that this export does not replace is refused before anything is written.
- Exit codes: 0 written, 1 refusal or error.

## Pinned OSCAL version

OSCAL **1.2.3** (NIST release `v1.2.3`, 7 August 2026), `OSCAL_VERSION` in `src/exports/oscal/oscalIds.ts`. Re-pin
deliberately: read the new release's schemas, update this page and the constant, and rerun validation. Never follow
"latest".

| Model | Release asset | Schema `$id` |
| --- | --- | --- |
| catalog | `oscal_catalog_schema.json` | `http://csrc.nist.gov/ns/oscal/1.2.3/oscal-catalog-schema.json` |
| profile | `oscal_profile_schema.json` | `http://csrc.nist.gov/ns/oscal/1.2.3/oscal-profile-schema.json` |
| assessment results | `oscal_assessment-results_schema.json` | `http://csrc.nist.gov/ns/oscal/1.2.3/oscal-ar-schema.json` |

Assets: `https://github.com/usnistgov/OSCAL/releases/download/v1.2.3/<asset>`. The schemas are JSON Schema draft-07.

**Not vendored yet.** `spec/vendor/oscal/1.2.3/` (the three schemas, their source URLs, SHA-256s and NIST's licence
notice) needs a maintainer to download the release assets; this change makes no network download. Until then the
validation command below runs against copies fetched by hand.

### What the schemas require (checked against 1.2.3)

- `metadata` requires `title`, `last-modified`, `version` and `oscal-version`.
- `UUIDDatatype` is `^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[45][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$`: version 4
  and version 5 UUIDs are accepted.
- A prop requires `name` (`TokenDatatype`, `^(\p{L}|_)(\p{L}|\p{N}|[.\-_])*$`) and `value` (`StringDatatype`,
  `^\S(.*\S)?$`: no line break, no edge whitespace); `ns` is a `URIDatatype`.
- A finding requires `uuid`, `title`, `description` and `target`; `target` requires `type` (`statement-id` or
  `objective-id`), `target-id` and `status`; `status.state` is `satisfied` or `not-satisfied` and is required, and
  `status.reason` is a token (`pass`, `fail`, `other`).
- An observation requires `uuid`, `description`, `methods` (`EXAMINE`, `INTERVIEW`, `TEST`, `UNKNOWN`) and
  `collected`; it references evidence through `relevant-evidence` (requires `description`; `href` optional).
- A back-matter resource requires `uuid`; `rlinks[]` require `href` and may carry `hashes[]` (`algorithm` from
  `SHA-224` … `SHA3-512`, `value`).
- A profile requires `uuid`, `metadata` and `imports`; an import selects with `include-all` or `include-controls`
  (at least one selector).
- Assessment results require `uuid`, `metadata`, `import-ap` (`href`) and `results`; a result requires `uuid`,
  `title`, `description`, `start` and `reviewed-controls` (`control-selections`).
- Patterns use Unicode property classes: validate with Unicode regular expressions on (ajv 8 does by default).

## Ids, namespace and determinism

- Every UUID is `oscalUuid(kind, amcId)`: a version 5 UUID of `"<kind>:<amcId>"` under the fixed namespace
  `502e72b2-14be-4507-8154-dcf6aa03f245` committed in `oscalIds.ts`. Document UUIDs use content digests (catalog
  digest, plan digest, the results' digests), so the same inputs give the same ids and changed content gives new ones.
- Every AMC prop and part uses one namespace: `https://agentmaturity.co/spec/oscal/v0`.
- Files are canonical JSON (keys sorted, two-space indent, final newline). `last-modified` comes from the inputs, never
  the clock: the catalog's latest `draftedAt` or `reviewedAt` date, the plan's `compiledAt`, the results' latest
  `evaluatedAt`. The same inputs give byte-identical files.
- Structured AMC fields are carried as canonical JSON in one prop value (`U+2028` and `U+2029` escaped), so a value
  never breaks `StringDatatype`; free text is collapsed to one line where OSCAL needs a line.

## Catalog (`catalog.json`)

| OSCAL field (schema definition) | AMC source |
| --- | --- |
| `catalog.uuid` (`oscal-catalog-oscal-catalog:catalog`) | `oscalUuid("catalog", catalogDigest)` |
| `metadata.title`, `version`, `oscal-version`, `last-modified`, `remarks` (`oscal-catalog-oscal-metadata:metadata`) | fixed title, catalog version, `1.2.3`, latest control date, the experimental notice |
| `metadata.props` | `catalog-id`, `catalog-digest`, `catalog-manifest` |
| `groups[].id`, `title`, `props`, `controls` (`oscal-catalog-oscal-catalog:group`) | one group per pack (a pack is one layer for its stations): pack id and title; props `layer`, `station`, `pack` |
| `controls[]` | a control in no pack (a valid catalog has none) |
| `control.id`, `title`, `props`, `links`, `parts` (`oscal-catalog-oscal-catalog:control`) | control id and title; the props below; one link per citation; two parts |
| `part.id`, `name`, `prose` (`oscal-catalog-oscal-control-common:part`) | `<controlId>_smt`, `statement`, the statement |
| `part.name`, `ns`, `prose` | `risk-rationale` in the AMC namespace, the risk rationale |
| `link.href`, `rel`, `text` (`oscal-catalog-oscal-metadata:link`) | `#<citation resource uuid>`, `reference`, instrument, clause and edition |
| `back-matter.resources[].uuid`, `title`, `props`, `rlinks[].href`, `rlinks[].hashes[]` (`oscal-catalog-oscal-metadata:back-matter`, `…:hash`) | one per citation: `oscalUuid("citation", "<controlId>/<key>")`, instrument and clause, props `control-id` and `citation`, the URL, and `SHA-256` of the retrieved content once the citation is verified (none while unverified) |

Control props: `version`, `support`, `layer`, `family`, `station` (one per station), `mandatory`, `level` (one per
level), `applicability`, `test` (one per test), `evidence-contract` (one per contract), `binding`, `invalidated-by`
(one per trigger), `owner-role`, `clock`, `crosswalk` (one per entry; informational), `review`, `provenance`,
`control-digest`. `applicability`, `test`, `evidence-contract`, `binding`, `clock`, `crosswalk`, `review`,
`provenance`, `citation`, `pack` and `catalog-manifest` hold canonical JSON. AMC binding parameters are not OSCAL
params, because an OSCAL param value asserts a setting.

## Profile (`profile.json`)

| OSCAL field (schema definition) | AMC source |
| --- | --- |
| `profile.uuid` (`oscal-profile-oscal-profile:profile`) | `oscalUuid("profile", planDigest)` |
| `metadata.title`, `version`, `last-modified`, `remarks` | `AMC control plan <profileId>`, the plan digest, `compiledAt` from `plan.sig.json` (not covered by the signature), the planning notice |
| `metadata.props` | `plan-digest`, `policy-digest`, `plan-status`, `deployment-profile-id`, `deployment-profile-sha256`, `fact-provenance`, `compiler`, `catalog-digest`, `requirement` (one per decision), `conflict`, `unsupported`, `crosswalk-link` |
| `imports[].href`, `include-controls[].with-ids` (`oscal-profile-oscal-profile:import`, `…:select-control-by-id`) | `catalog.json`; exactly the plan's `applicable` control ids |
| `back-matter.resources[]` | the plan (`oscalUuid("plan", planDigest)`; props `plan-digest`, `policy-digest`, `plan-status`) and the lockfile (`oscalUuid("catalog-lock", catalogDigest)`; props `catalog-digest`, `catalog-lock`) |

v0 emits no `merge` and no `modify`. Not-applicable and unresolved controls are absent from `include-controls`; their
decisions, with the exclusion reason or the missing facts, are `requirement` props and loss-report entries. A plan with
no applicable control writes no profile, because `include-controls` needs at least one id.

## Assessment results (`assessment-results.json`)

| OSCAL field (schema definition) | AMC source |
| --- | --- |
| `assessment-results.uuid` (`oscal-ar-oscal-ar:assessment-results`) | `oscalUuid("assessment-results", digest of the plan digest and the results' digests)` |
| `metadata.title`, `version`, `last-modified`, `props`, `remarks` | fixed title, that digest, the latest `evaluatedAt`, `plan-digest`, the notice on claims and unsigned results |
| `import-ap.href`, `remarks` (`oscal-ar-oscal-ar:import-ap`) | `#<plan resource uuid>`: AMC has no OSCAL assessment plan, so this points at the compiled plan in back-matter and says so |
| `results[].uuid`, `title`, `description`, `start`, `end`, `props` (`oscal-ar-oscal-ar:result`) | one result per assessment window: `oscalUuid("result", "<planDigest>|<start>|<end>")`, the window, `plan-digest` |
| `reviewed-controls.control-selections[].include-controls[].control-id` (`oscal-ar-oscal-assessment-common:reviewed-controls`) | the control ids with a result in that window |
| `observations[].uuid`, `title`, `description`, `props`, `methods`, `relevant-evidence[]`, `collected` (`oscal-ar-oscal-assessment-common:observation`) | one per control result: `oscalUuid("observation", resultDigest)`, control id with result and claim kind, the result's reasons, the props below, `EXAMINE`, the admitted and rejected evidence refs, `evaluatedAt` |
| `relevant-evidence[].description`, `props`, `remarks` | kind, id, producer and tier or rejection; props `evidence-kind`, `evidence-id`, `evidence-sha256`, `admission`, `producer`, `trust-tier`, `rejection-reason`; rejection detail. Evidence content is never embedded. |
| `findings[].uuid`, `title`, `description`, `props`, `target.type`, `target.target-id`, `target.status.state`, `target.status.reason`, `related-observations[].observation-uuid` (`oscal-ar-oscal-assessment-common:finding`, `…:finding-target`) | see the mapping below; `statement-id` and `<controlId>_smt` (the catalog's statement part) |
| `back-matter.resources[]` | the plan resource, as in the profile |

Observation and finding props: `control-id`, `result`, `claim-kind`, `applicability` (the not-applicable rationale or
unresolved reason in its `remarks`), `evidence`, `enforcement`, `enforcement-boundary` (when enforced), `review`,
`claim-reason` (one per reason code), `control-version`, `control-digest`, `plan-digest`, `result-digest`, `subject`
(canonical JSON), `evaluator`.

### Results to findings

| AMC result | Claim kind | OSCAL |
| --- | --- | --- |
| `pass` | `observed` | finding `satisfied`, reason `pass`, and its observation |
| `pass` | `self_reported` | observation only, no finding: `satisfied` would upgrade a self-reported claim (truth rule 3); loss entry |
| `fail` | any | finding `not-satisfied`, reason `fail`, and its observation |
| `not_evaluated` | any | observation only (prop `result = not_evaluated`), no finding: OSCAL's required finding state has no not-evaluated value; loss entry |

## Loss report (`oscal-loss-report.json`)

```
{ "schemaVersion": "amc.oscal-loss/1", "oscalVersion": "1.2.3",
  "inputs": [{ "kind": "catalog" | "plan" | "results", "digest": "sha256:…" }],
  "losses": [{ "model": "catalog" | "profile" | "assessment-results", "amcField": "…", "count": 0,
               "disposition": "prop" | "remarks" | "omitted", "note": "…" }] }
```

`count` is how many values of that field the inputs held; fields with none are left out. Dispositions: `prop` (an AMC
prop or AMC-namespaced part, often canonical JSON that OSCAL tools see as an opaque string), `remarks`, `omitted`.

| Model | Fields |
| --- | --- |
| catalog | `controls[].version`, `support`, `layer`, `family`, `stations`, `mandatory`, `levels`, `riskRationale`, `applicability`, `tests`, `evidence`, `binding`, `invalidatedBy`, `owner`, `clock`, `crosswalk`, `review`, `provenance`, `citations` (beyond title, URL and hash); `manifest`, `packs[]` (prop); `fixtures[]`, `producers[]`, `vocabulary`, `publisherHosts[]` (omitted; the catalog digest covers them) |
| profile | one `requirements[<controlId>]` entry per not-applicable control (with its exclusion source and reason) and per unresolved control (with its missing facts); `requirements[]`, `conflicts[]`, `unsupported[]`, `crosswalkLinks[]`, `profile`, `compiler`, `status`, `lock`, `digest` (prop); `runtimePolicy`, `evidencePlan`, `signature.signature`, `signature.review` (not covered by the signature), `signature.diff` (omitted) |
| assessment-results | `results[].dimensions.result=not_evaluated` and `results[].dimensions.result=pass (self_reported)` with the control ids; `results[].claimKind`, `dimensions`, `claimReasons`, `admitted`, `rejected`, `subject`, the digests, `evaluator` (prop); `plan (as assessment plan)` (remarks) |

## Validation

With the three schemas in `spec/vendor/oscal/1.2.3/` (or copies fetched from the release assets above):

```
node --input-type=module -e '
import Ajv from "ajv"; import addFormats from "ajv-formats"; import { readFileSync } from "node:fs";
const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv);
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
for (const [schema, doc] of [["oscal_catalog_schema.json", "catalog.json"], ["oscal_profile_schema.json", "profile.json"],
  ["oscal_assessment-results_schema.json", "assessment-results.json"]]) {
  const validate = ajv.compile(read(`spec/vendor/oscal/1.2.3/${schema}`));
  console.log(doc, validate(read(`out/${doc}`)) ? "valid" : validate.errors);
}'
```

ajv and ajv-formats are development dependencies; the CLI does not validate at run time.

## Not in v0

Component definitions, POA&M, OSCAL control mappings, profile modifications and merge directives,
OTLP, AIBOM and AICM exports (P2-18). `amc export grc` and its SARIF output are unchanged (docs/GRC_EXPORT.md).
