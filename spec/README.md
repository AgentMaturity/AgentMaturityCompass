# AMC public contracts

This folder holds the JSON Schemas for the records AMC writes and reads, and the rules a verifier applies to them.
Each schema is generated from the zod schema AMC itself parses with (`src/contracts/`), so a schema here states what
AMC enforces: where AMC refuses unknown fields the schema says `additionalProperties: false`, and where AMC ignores
them the schema does too. Nothing here is hand-edited.

- `schemas/v1/*.schema.json`: one JSON Schema (draft 2020-12) per record, each with a stable `$id`.
- `schemas/index.json`: every schema's file name, `$id` and SHA-256.
- [`ACCEPTANCE_RULES.md`](ACCEPTANCE_RULES.md): the ordered checks a verifier runs per record, the result each
  failure gives, and every rule a JSON Schema cannot express.

Schema validation checks shape only. It does not show who wrote a record, that the record is unchanged, or that it is
true; the acceptance rules cover those checks.

## Records

| Schema | Record | AMC today |
| --- | --- | --- |
| `evidence-event` | One ledger row as `amc evidence export` writes it | Emitted; every export row is parsed with it |
| `receipt` | One state of one execution (`requested` … `outcome_unknown`) | Contract only; P1-03 emits it |
| `legacy-receipt` | The signed receipt payload AMC mints today (a kind, no state) | Emitted |
| `authorization-record` | Who authorized which effect, bound at the enforcement point | Contract only; P1-02 emits it |
| `control-result` | One control's five status dimensions, claim kind and evidence | Contract only; P1-11 emits it |
| `claim-envelope` | What a result may claim (docs/CLAIM_KINDS.md) | Emitted |
| `scoped-attestation` | A signed statement about one deployment, profile and window | Contract only; the registry (P3-04) issues it |
| `trust-list` | A signed list of pinned keys and their purposes (docs/TRUST_LIST.md) | Read by every verifier |
| `verifier-report` | The separate results of one verification | Emitted by the verify commands with `--json` |
| `signature-envelope` | The Ed25519 envelope AMC artifacts carry | Emitted |
| `control-record` | One Regulated Control Catalog control (docs/catalog/CONTROL_RECORD.md) | Read by `loadCatalog`; content under `catalog/` |
| `pack-manifest` | One catalog pack: its controls, layer, stations and declared support | Read by `loadCatalog` |
| `catalog-lock` | The digests that pin one catalog tree | Built by `buildCatalogLock`; P1-10 embeds it in compiled plans |
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
