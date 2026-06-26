# Open Compass Standard

Open Compass Standard provides signed JSON Schemas for AMC artifacts so external tools can validate payloads without linking AMC internals.

Generated bundle location:
- `.amc/standard/schemas/*.json`
- `.amc/standard/meta.json`
- `.amc/standard/schemas.sig`
- `.amc/standard/meta.json.sig`

## Included Schemas

- `amcbench.schema.json`
- `amcprompt.schema.json`
- `amccert.schema.json`
- `amcaudit.schema.json`
- `amcpass.schema.json`
- `amcproof.schema.json`
- `registry.bench.schema.json`
- `registry.passport.schema.json`

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

- Schemas are versioned by artifact model version fields (for example `v: 1`).
- Backward-compatible additions should preserve existing required fields.
- Breaking changes must increment artifact version and ship updated schema files.
- Bundle signatures are required for trusted distribution.

Passport compatibility evidence can also use the `amc.passport.compatibility.v1` report contract. That report records the fixture corpus, import/export results, and compatibility matrix for `.amcpass` exchange across AMC and partner systems.

Schema validation and compatibility reporting are separate gates:
- schema validation checks that one artifact matches a generated schema
- compatibility reporting checks that a fixture corpus covers import, export, and round-trip behavior
- artifact verification still checks cryptographic trust, proof bindings, privacy checks, and revocation state
