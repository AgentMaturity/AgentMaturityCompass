# P1-06 receipt: standalone pinned-issuer verifier and normative fixtures

Environment: local macOS arm64 (Darwin 25.6.0), Node v25.5.0, pnpm 10.33.0. Not CI. Container runs used the local colima
VM `amc-s7f` (aarch64) with `--network none`. Other sessions kept the load average between 16 and 44.

Branch `rtd/p1-06-pinned-issuer-verifier`, from `int` at `8d1e8e7d7` (`git merge int`: already up to date). The checks
ran at `bbd3f2b9a`. `770cd7977` changes only `scripts/quality/source-quality-baseline.json` (dead-code accept and
shrink); the receipt commit adds only this folder.

## What was checked

- `checks.txt`: build, typecheck (now also the package), typecheck:tests, lint, check:counts, check:docs-drift,
  check:freeze, check:architecture-boundaries (now also refuses any import in `packages/verifier` that is not `node:` or
  inside the package), check:gates, check:schemas, check:api-ref, check:threat-model, check:duplicates, check:dead-code
  (first exit 1 on a new `mkfifo` test-binary finding; accepted with a reason and stale entries shrunk, then exit 0),
  check:clean-source, check:packed-install, `npx vitest run tests/verifier` (7 files, 128 tests passed), the
  conformance runner (54/54) and `needs-snapshot.mjs int` (`none`).
- `conformance-results.json`: `node packages/verifier/conformance/run.mjs --cmd "node packages/verifier/bin/amc-verify.mjs"`
  at `bbd3f2b9a`, 54 of 54 cases pass, including the 19 the spec names.
- `containers.txt`: the packed tarball installed offline into an empty directory, no other dependency, 54/54 on Node 22
  and Node 24. Node 20 was not evaluated locally (no offline image or binary); the `verifier-conformance` CI job, set up
  for Node 20, 22 and 24, has not run yet.
- Fixture determinism: `tests/verifier/fixturesDeterministic.test.ts` regenerates the corpus into a temp directory and
  compares every byte. Ed25519 is deterministic and all times are constants, so the bytes are fixed, not only the
  verdicts.
- Parity with AMC (`tests/verifier/parityWithAmc.test.ts`): shape validators agree with AMC's zod schemas on every corpus
  record and 584 single-field mutations (a one-off exhaustive sweep of 31,572 mutations also agreed); the package's
  reports parse as AMC verifier reports; reason codes, purposes, event types, receipt states, rotation reasons, claim
  kinds, the overlap limit and the built-in distrust list are equal; a trust list counts for the package exactly when
  AMC's `verifySignedTrustList` accepts it; external-evidence signatures verify alike, including a non-canonical base64
  spelling.
- `mutations.txt`: 25 deliberate breaks, every one failed at least one test: the spec's four (admit a key carried in
  the artifact, skip the tenant comparison, ignore known sequences, let empty evidence pass), five more guards, four
  for the coordinator's self-audit and twelve for the independent review.
- `red/`: the new tests failing before each security fix (`self-audit.txt` before `9ccb71250`, `review.txt` before
  `1f5de52ff`). Two review tests were added after their fix: the FIFO test (a FIFO open blocks the test worker before the
  fix) and the pinned-threshold `allowDecrease` test; their mutations are in `mutations.txt`.
- `full-suite.txt`: the full suite at `0fcd97035` (24,154 tests, 58 failed) and the triage of every failure: none is
  caused by P1-06; the verifier failures in that run come from edits made while it ran.

## Not done here

Publishing, naming the package (still "not yet"; `@amc/verifier` is a private working name), making
`src/trust/admission.ts` call the package's `admit()`, and moving the a4-record fixtures into `spec/fixtures/v1/`
are left for Sid and the integrator.

## Reproduce

```bash
npm run build
npx vitest run tests/verifier
npm run test:verifier-conformance
node spec/fixtures/v1/generate.mjs --out /tmp/fixtures && diff -r /tmp/fixtures/valid-attestation spec/fixtures/v1/valid-attestation
```
