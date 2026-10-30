# Conformance suite

The AMC conformance suite lets anyone check an implementation of the spec, in any language, by running it through its
command line. It is unrelated to the industry-pack "conformance runs" in [CONFORMANCE_RUNS.md](CONFORMANCE_RUNS.md),
which check evidence sets.

- Classes, cases and what each class must do: [spec/conformance/v1/README.md](../spec/conformance/v1/README.md).
- The runner, its options and what "conformant" means: [packages/amc-conformance/README.md](../packages/amc-conformance/README.md).
- The results record: `conformance-results` v1 ([spec/schemas/v1/conformance-results.schema.json](../spec/schemas/v1/conformance-results.schema.json)), with its rules in [spec/ACCEPTANCE_RULES.md](../spec/ACCEPTANCE_RULES.md).

Five classes exist. `verifier` is normative and has one case per normative fixture in `spec/fixtures/v1/`. `producer`
and `adapter` are normative with initial cases. `compiler` is informative until P1-10's golden outputs exist.
`a4-record` (P3-24) is normative and runs the seven A4 project record fixtures (P1-63); it is a class of its own, so the
`verifier` result never depends on it.

## AMC's own verifier

```bash
node packages/amc-conformance/bin/amc-conformance.mjs run --class verifier \
  --impl "node packages/verifier/bin/amc-verify.mjs verify {artifact} {verifierArgs}" \
  --name amc-verify --impl-version 0.1.0 --out spec/conformance/results/amc-verify-0.1.0.json
```

CI runs the same command against the packed `amc-verify` on Node 20, 22 and 24. The committed results are in
[spec/conformance/results/](../spec/conformance/results/). They are AMC's own run of its own verifier, so they are
self-reported. Interoperability may be claimed only once a second, independently built verifier passes (P3-03).

## AMC's own A4 record verifier

```bash
node packages/amc-conformance/bin/amc-conformance.mjs run --class a4-record \
  --impl "env AMC_A4_PREVIEW=1 node dist/cli.js a4 verify {record} --trust-list {trustList} --trust-root {trustRoot} --json" \
  --name "amc a4 verify" --impl-version 1.2.0 --out spec/conformance/results/amc-a4-verify-1.2.0.json
```

## Side by side

One row per class, one column per implementation, each cell from that implementation's committed results file. The
`verifier` row decides "interoperable at suite version 1.0.0" (P3-03); the `a4-record` row is a separate claim, "A4
record interoperable", and never counts toward the `verifier` row.

| Class | AMC (`amc-verify` 0.1.0, `amc a4 verify` 1.2.0) | Second verifier (P3-03) |
| --- | --- | --- |
| `verifier` | conformant ([results](../spec/conformance/results/amc-verify-0.1.0.json)) | not run |
| `a4-record` | conformant ([results](../spec/conformance/results/amc-a4-verify-1.2.0.json)) | not run |

Both AMC columns are AMC's own runs of its own code: self-reported evidence of conformity, not interoperability.
