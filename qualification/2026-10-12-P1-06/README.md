# P1-06 receipt: standalone pinned-issuer verifier, normative fixtures and shared admission rule

Environment: local macOS arm64 (Darwin 25.6.0), Node v25.5.0, pnpm 10.33.0. Not CI. Container runs used the local colima
VM `amc-s7f` (aarch64) with `--network none`. Other sessions kept the load average between 11 and 44.

Branch `rtd/p1-06-pinned-issuer-verifier`. `int` was merged three times, last at its P1-58 head; the published counts and
the source-quality baseline were taken from int, counts regenerated, P1-06's three findings re-accepted and stale entries
shrunk with the tool. The checks ran at `6b0d755cd`. The receipt commit adds only this folder.

## Coordinator decisions applied

1. Scoped attestation: v1 (`src/contracts/v1/scopedAttestation.ts`, its schema and its contract fixtures) is
   byte-identical to int. The verifier's record is `scoped-attestation` v2 (`src/contracts/v2/`,
   `spec/schemas/v2/scoped-attestation.schema.json`, listed in `spec/schemas/index.json`, published by `copySpec`). The
   verifier refuses v1 as `UNSUPPORTED_VERSION` (fixture `scoped-attestation-v1`).
2. `revoked-superseded-earlier-claim` fails with `ISSUER_REVOKED`. This deviates from the P1-06 spec, which expected a
   pass with a warning: a signing time an artifact claims for itself can be backdated. Seam: once P1-25 adds RFC 3161
   timestamps to these records, a signature that a pinned TSA proves earlier than the revocation becomes a pass with a
   warning, by passing the attested time to the shared rule. This is documented in docs/STANDALONE_VERIFIER.md,
   docs/TRUST_LIST.md, docs/TRUSTED_TIME.md and spec/fixtures/v1/README.md.
3. Package name: `agent-maturity-compass-verifier` (unscoped), still `private: true`; nothing was published.
4. AMC admission (`src/trust/admission.ts`) now judges distrust, validity and revocation at the verification time
   through one rule, `src/trust/admissionRule.ts`, which the package compiles too (it imports only `node:` built-ins,
   and check:architecture-boundaries enforces that). Verdicts that change are listed in
   `.changeset/issuer-admission-at-verification-time.md` (major). The one AMC test that encoded the old rule
   (`embeddedKeyForgery`, bundle sealed before a supersession) now expects refusal.
5. The P1-08 parsers report an impossible date as a schema error (`isExactIsoTime` in `src/utils/json.ts`), with a test.

## What was checked

- `checks.txt` at `6b0d755cd`: build, typecheck, typecheck:tests, lint, check:counts, check:docs-drift,
  check:architecture-boundaries, check:gates, check:schemas (39 schemas, 80 contract fixtures incl. v2), check:api-ref,
  check:threat-model, check:duplicates, check:dead-code, check:clean-source, check:packed-install,
  `npx vitest run tests/verifier` (7 files, 129 tests), the conformance runner (55/55) and `needs-snapshot.mjs int`
  (`none`) exit 0. check:freeze exits 1 on int's own P1-65 exception (the `amc a4` CLI, merged into int at
  `c85019416`), which origin/main's baseline does not list; P1-06 adds no command path.
- Quality ratchet acceptances, each with a reason: `mkfifo` in the CLI test; `CONTRACTS_V2`, read by gen-spec-schemas
  through dist; the shared rule's constant-time compare, which cannot reuse a private AMC helper.
- `conformance-results.json`: 55 of 55 cases, including the 19 the spec names.
- `containers.txt`: the packed tarball, installed offline into an empty directory with no other dependency, passes
  55/55 on Node 22 and Node 24. Node 20 was not evaluated locally; the `verifier-conformance` CI job, set up for
  Node 20, 22 and 24, has not run yet.
- Fixture determinism: regeneration is byte-identical (`tests/verifier/fixturesDeterministic.test.ts`); no randomness is
  involved, so bytes and verdicts are both fixed.
- Parity with AMC (`tests/verifier/parityWithAmc.test.ts`):
  - validators agree on the corpus and 584 single-field mutations, and an exhaustive one-off sweep of 31,572 agreed;
  - the package's reports parse as AMC verifier reports;
  - constants and the built-in distrust list are equal;
  - verify-level differentials agree with `verifySignedTrustList` and `verifyExternalEvidence`.
- `mutations.txt`: 30 deliberate breaks, all killed.
- `red/`: new tests failing before each security fix. `self-audit.txt` precedes `9ccb71250`, `review.txt` precedes
  `1f5de52ff`, `amc-admission.txt` precedes `7fd866b40` and `p108-times.txt` precedes `ddbffd94e`.
- `full-suite.txt`: the full suite at `35c491d30` (24,194 tests, 46 failed) with every failure triaged. One was caused
  by P1-06 (`apiRouters`, fixed in `5652c8249`). After the last merge, the 20 trust-consuming test files pass (452 tests).

## Not done here

Publishing, moving the a4-record fixtures (coordinated later), and the CI run itself.

## Reproduce

```bash
npm run build
npx vitest run tests/verifier tests/trust/admission.test.ts tests/keys/rotationStatement.test.ts
npm run test:verifier-conformance
npm run check:schemas
```
