<!-- SPDX-License-Identifier: MIT -->
# AMC specification

Draft. Not a standard. AMC output is evidence of conformity, never proof of compliance.

## AMC Core Spec 1.0 (draft)

Version 1.0.0-draft.1. Chapters 2 to 10 are normative; the rest is informative.

1. [Scope, status and terms](core/01-scope.md)
2. [Conformance classes](core/02-conformance-classes.md)
3. [Claim kinds and vocabulary](core/03-claim-kinds.md)
4. [Evidence model](core/04-evidence-model.md)
5. [Control results](core/05-control-results.md)
6. [Maturity levels](core/06-maturity-levels.md)
7. [Authorization records, receipt states and failure behaviour](core/07-authorization-and-receipts.md)
8. [Scoped attestations](core/08-scoped-attestations.md)
9. [Verification](core/09-verification.md)
10. [Versioning and change process](core/10-versioning.md)

- [Annex A. Levels and EU AI Act articles](annex/eu-ai-act-levels.md) (informative, experimental; expert sign-off open)
- [Annex B. Reading AMC 1.x results](annex/legacy-1x.md)
- [Changelog](CHANGELOG.md) and the [RFC process](rfcs/README.md)

The spec's tables of levels, claim kinds, banned wording, schema `$id`s and receipt states are generated from the code
(`node scripts/check-spec-sync.mjs --write`); CI runs `--check`. It supersedes `docs/AMC_STANDARD_RFC.md` and
`docs/OPEN_RUBRIC_STANDARD.md`, which stay for history.

### Licence

The spec files carry an SPDX licence line. Until the maintainer records decision D-04 (licences for the spec, catalog
content and code), the spec ships under the repository licence, MIT (`LICENSE`). D-04's recommended option would put
the spec under CC BY 4.0; when D-04 is recorded the licence line changes in `scripts/check-spec-sync.mjs` and every
file is regenerated. Code samples in the spec follow the code licence.

## Public contracts

This folder holds the JSON Schemas for the records AMC writes and reads, and the rules a verifier applies to them.
Each schema is generated from the zod schema AMC itself parses with (`src/contracts/`), so a schema here states what
AMC enforces: where AMC refuses unknown fields the schema says `additionalProperties: false`, and where AMC ignores
them the schema does too. Nothing here is hand-edited.

- `schemas/v1/*.schema.json`: one JSON Schema (draft 2020-12) per record, each with a stable `$id`.
- `schemas/index.json`: every schema's file name, `$id` and SHA-256.
- [`ACCEPTANCE_RULES.md`](ACCEPTANCE_RULES.md): the ordered checks a verifier runs per record, the result each
  failure gives, and every rule a JSON Schema cannot express.
- [`fixtures/v1/`](fixtures/v1/README.md): normative verifier fixtures, each with its expected verdict and reason
  codes, and the runner any implementation can be checked with (docs/STANDALONE_VERIFIER.md).
- [`conformance/v1/`](conformance/v1/README.md): the conformance classes (verifier, producer, adapter, compiler),
  their cases, and AMC's own results under `conformance/results/` (P1-32).

Schema validation checks shape only. It does not show who wrote a record, that the record is unchanged, or that it is
true; the acceptance rules cover those checks.

## Records

| Schema | Record | AMC today |
| --- | --- | --- |
| `evidence-event` | One ledger row as `amc evidence export` writes it | Emitted; every export row is parsed with it |
| `receipt` | One state of one execution (`requested` … `outcome_unknown`) | Contract only; P1-03 emits it |
| `legacy-receipt` | The signed receipt payload AMC mints today (a kind, no state) | Emitted |
| `authorization-record` | Who authorized which effect, bound at the enforcement point | Contract only; P1-02 emits it |
| `redaction-receipt` | One redaction of protected data before a native session row was committed (P2-02) | Emitted in workspaces with a processor registry, as the payload of `PROTECTED_DATA_REDACTED` audit rows |
| `detokenization-receipt` | One release of restored protected values to a processor at egress (P2-02) | Emitted in workspaces with a processor registry, as the `receipt` member of `PROTECTED_DATA_DETOKENIZED` ops audit rows |
| `control-result` | One control's five status dimensions, claim kind and evidence | Contract only; P1-11 emits it |
| `claim-envelope` | What a result may claim (docs/CLAIM_KINDS.md) | Emitted |
| `scoped-attestation` | A signed statement about one deployment, profile and window | Contract only; the registry (P3-04) issues it |
| `v2/scoped-attestation` | Version 2 of it: also one tenant, workspace, subject and sequence, with fixed signed bytes | Contract only; `amc-verify` (P1-06) checks it |
| `trust-list` | A signed list of pinned keys and their purposes (docs/TRUST_LIST.md) | Read by every verifier |
| `verifier-report` | The separate results of one verification | Emitted by the verify commands and `amc-verify` with `--json` |
| `signature-envelope` | The Ed25519 envelope AMC artifacts carry | Emitted |
| `conformance-results` | One conformance-suite run for one implementation and class (P1-32) | Written by `amc-conformance` (spec/conformance/v1/README.md) |
| `control-record` | One Regulated Control Catalog control (docs/catalog/CONTROL_RECORD.md) | Read by `loadCatalog`; content under `catalog/` |
| `pack-manifest` | One catalog pack: its controls, layer, stations and declared support | Read by `loadCatalog` |
| `catalog-lock` | The digests that pin one catalog tree | Built by `buildCatalogLock`; P1-10 embeds it in compiled plans |
| `register-entry` | One clause of a jurisdiction's register as law-as-data (docs/catalog/REGISTER.md) | Read by `loadCatalog` from `catalog/registers/` |
| `a4-project`, `a4-revision`, `a4-gate`, `a4-decision`, `a4-transition`, `a4-intent`, `a4-readiness` and the other `a4-*` records | One A4 Forge project's views (docs/A4_FORGE.md) | Emitted behind `AMC_A4_PREVIEW=1` |
| `a4-record` | One A4 project exported as stored, for a verifier without SQLite | Checked by `verifyA4Bundle`; fixtures in `tests/fixtures/contracts/a4-record/` |
| `amcbench`, `amcprompt`, `amccert`, `amcaudit`, `amcpass`, `amcproof`, `registry.bench`, `registry.passport` | The `amc standard` artifacts | Emitted; `amc standard generate` writes these same files |
| `external-evidence` | The producer-neutral evidence profile (docs/EXTERNAL_EVIDENCE_PROFILE.md) | Hand-written strict schema; its `$id` predates this folder and is unchanged |

## Versioning

A published v1 `$id` (`https://agentmaturity.co/spec/schemas/v1/<name>.schema.json`) never changes meaning. A
compatible addition (a new optional field, a new enum value AMC accepts) regenerates the v1 file; a breaking change
goes to `v2/`. `npm run check:schemas` fails when a committed schema differs from a fresh generation, and when a
fixture under `tests/fixtures/contracts/` is judged differently by zod and by the published schema.

```bash
npm run build && npm run gen:schemas   # regenerate after changing a contract
npm run check:schemas                  # what CI runs
```
