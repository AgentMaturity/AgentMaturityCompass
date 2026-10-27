# Conformance suite

The AMC conformance suite lets anyone check an implementation of the spec, in any language, by running it through its
command line. It is unrelated to the industry-pack "conformance runs" in [CONFORMANCE_RUNS.md](CONFORMANCE_RUNS.md),
which check evidence sets.

- Classes, cases and what each class must do: [spec/conformance/v1/README.md](../spec/conformance/v1/README.md).
- The runner, its options and what "conformant" means: [packages/amc-conformance/README.md](../packages/amc-conformance/README.md).
- The results record: `conformance-results` v1 ([spec/schemas/v1/conformance-results.schema.json](../spec/schemas/v1/conformance-results.schema.json)), with its rules in [spec/ACCEPTANCE_RULES.md](../spec/ACCEPTANCE_RULES.md).

Four classes exist. `verifier` is normative and has one case per normative fixture in `spec/fixtures/v1/`. `producer`
and `adapter` are normative with initial cases. `compiler` is informative until P1-10's golden outputs exist.

## AMC's own verifier

```bash
node packages/amc-conformance/bin/amc-conformance.mjs run --class verifier \
  --impl "node packages/verifier/bin/amc-verify.mjs verify {artifact} {verifierArgs}" \
  --name amc-verify --impl-version 0.1.0 --out spec/conformance/results/amc-verify-0.1.0.json
```

CI runs the same command against the packed `amc-verify` on Node 20, 22 and 24. The committed results are in
[spec/conformance/results/](../spec/conformance/results/). They are AMC's own run of its own verifier, so they are
self-reported. Interoperability may be claimed only once a second, independently built verifier passes (P3-03).
