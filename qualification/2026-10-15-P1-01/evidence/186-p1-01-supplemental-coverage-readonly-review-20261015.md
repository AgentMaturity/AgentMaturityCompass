# P1-01 supplemental coverage static review

No blocking static finding. The reviewed final probe is v2 (`0b09ff2ad62cd487bd1cd997024f2464e89de8c4130d400d181fe3658bc093ab`, 8,360 bytes); v1 remains superseded and unexecuted. This review authorizes no runtime and closes no formal acceptance.

The inventory reconciles exactly: 84 JSON files contain 75 direct generator cases (41 core, 34 A4 schema cases), seven separate A4 record verifier fixtures and two A4 trust support files. The latter nine are outside the generator's `valid`/`invalid` layout. They must not be reported as generator passes or altered to force that route.

Closed original raw and observer evidence shows 16 passes: 15 external-evidence cases and one standard-schema case. The original `tests/contracts` directory is absent. Current receipt V2 source remains strict; a missing top-level-extra receipt fixture is a coverage gap, not a demonstrated source defect.

Final v2 reads the actual authorized receipt fixture and the same shape with one extra member through compiled Zod, public `assertContract` and committed-schema Ajv. It emits all observations before assertions. Its first negative assertion is explicit extra-Zod refusal; later negative assertions may be masked on failure. Separate receipt, vector and publication modes retain independent results.

The vector literals match the acceptance rules and source preimage helpers. Publication mode only reads an existing Pages output and compares all 38 fixed schema names, IDs and bytes, the index, and selected HTML markers. No module was imported or probe executed during this review. No new build, hosted deployment, receipt lifecycle, ledger signature/trust, A4 verifier or full acceptance proof follows from this static review.

The prospective first-branch `z.strictObject` to `z.object(...).passthrough()` change has one exact source anchor and preserves a valid discriminator shape by installed declarations. It affects four intermediate states only. A future owned build and actual independent schema-freshness/refusal results are required; no predicted kill is counted here.

All reads finished. Sources, A4, original tests, configs, prior evidence and live Pages output remain untouched. Exact inputs, inventory digest, identities, prospective bytes and limits are pinned in the JSON.
