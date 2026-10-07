# Open Compass Standard

Open Compass Standard provides signed JSON Schemas for AMC artifacts so external tools can validate payloads without linking AMC internals.

Every schema is generated from the zod schema AMC itself parses with, so it states what AMC enforces. The same files are committed under [`spec/schemas/v1/`](../spec/README.md) and served at their `$id` (`https://agentmaturity.co/spec/schemas/v1/<name>.schema.json`); `amc standard generate` writes identical bytes. [`spec/ACCEPTANCE_RULES.md`](../spec/ACCEPTANCE_RULES.md) lists the checks a verifier runs beyond shape.

Generated bundle location:
- `.amc/standard/schemas/*.json`
- `.amc/standard/meta.json`
- `.amc/standard/schemas.sig`
- `.amc/standard/meta.json.sig`

## Included Schemas

- `external-evidence.schema.json` — [producer-neutral evidence, explicit unknowns and independent authority verification](EXTERNAL_EVIDENCE_PROFILE.md)
- `amcbench.schema.json`
- `amcprompt.schema.json`
- `amccert.schema.json`
- `amcaudit.schema.json`
- `amcpass.schema.json`
- `amcproof.schema.json`
- `registry.bench.schema.json`
- `registry.passport.schema.json`

Public record contracts in the same folder: `evidence-event`, `receipt`, `legacy-receipt`, `authorization-record`, `control-result`, `claim-envelope`, `scoped-attestation`, `trust-list`, `verifier-report` and `signature-envelope` (see [spec/README.md](../spec/README.md) for which AMC emits today).

## What changed in P1-01

Before P1-01 the eight `amc*` and `registry.*` schemas were hand-written: `additionalProperties: true`, a bare list of required fields, and a `$comment` saying a valid file did not mean AMC would accept it. They are now generated, which tightens them:

- Every field AMC checks is in the schema with its type, enum, length and range. A file that passed the old schema but fails AMC's check now fails the schema too.
- Unknown keys: these artifacts' schemas still accept them, because AMC ignores them. The new record contracts refuse unknown keys, because AMC refuses them.
- `registry.passport` is checked by a zod schema instead of a hand check: `registry` must be an object (an array or `null` passed before).
- The files are pretty-printed with sorted keys (they were one canonical line), so their digests and the signed bundle manifest change; regenerate and re-verify a bundle you pinned.
- `amc evidence export` checks each row against `evidence-event` and refuses the export on a violating row (for example an event type outside the published list). Rows now carry `claimKind`.

## Why It Exists

- Deterministic interoperability for CI/CD, marketplaces, registries, and internal GRC systems.
- Offline validation in constrained environments.
- Tamper-evident exchange through signed schema manifests.

## Commands

```bash
amc standard generate
amc standard verify
amc standard schemas
amc standard print --id amcpass
amc standard validate --schema amcpass --file ./agent.amcpass
```

## Validation Flow

1. Generate or load schema bundle.
2. Verify bundle signatures and manifest digests.
3. Validate artifact JSON against schema ID.
4. Keep artifact verification separate (`amc passport verify`, `amc bench verify`, etc.).

Schema validation checks shape; artifact verification checks cryptographic trust/proofs.

`amcproof.schema.json` validates the portable Domain Proof Lane artifact shape. It distinguishes evidence integrity, runtime policy, and domain correctness proof classes, but schema validation alone is not a correctness claim. Domain correctness is only proven when an artifact carries `result: "proven"`, source rule refs, checked constraints, and valid proof bindings.

## Compatibility + Versioning

- A published v1 `$id` never changes meaning; a breaking change goes to `spec/schemas/v2/`. `npm run check:schemas` fails when a committed schema is stale.
- Schemas are versioned by artifact model version fields (for example `v: 1`).
- Backward-compatible additions should preserve existing required fields.
- Breaking changes must increment artifact version and ship updated schema files.
- Bundle signatures are required for trusted distribution.

Passport compatibility evidence can also use the `amc.passport.compatibility.v1` report contract. That report records the fixture corpus, import/export results, and compatibility matrix for `.amcpass` exchange across AMC and partner systems.

Schema validation and compatibility reporting are separate gates:
- schema validation checks that one artifact matches a generated schema
- compatibility reporting checks that a fixture corpus covers import, export, and round-trip behavior
- artifact verification still checks cryptographic trust, proof bindings, privacy checks, and revocation state
