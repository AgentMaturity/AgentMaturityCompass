# Release Runbook (Safer Shipping)

This runbook is the operator checklist for publishing AMC safely and repeatably.

Use it for every production release.

---

## 0) Preconditions

- Release PR merged to `main`
- CI green on the exact release commit (frozen pnpm install, build and tests)
- At least one approved changeset in `.changeset/`
- Release signing key available in CI (`AMC_RELEASE_SIGNING_KEY` or `AMC_RELEASE_SIGNING_KEY_FILE`)
- Rollback owner on-call and aware of release window

---

## 1) Local release readiness (before tagging)

```bash
pnpm install --frozen-lockfile
pnpm run release:gate -- --json --out tmp/release-gate/candidate.json
pnpm run release:prepack-check
```

What this validates:
- the npm artifact can be produced from the built source
- SBOM + license inventory generation works
- secret scan passes on packaged artifact
- `.amcrelease` can be packed and verified offline

### Install persona QA receipt (schema `2026-09-08`)

The gate's `install-persona-qa` step runs `npm run qa:install-personas` (`scripts/install-persona-qa.mjs`): it packs the built package once, then for each persona performs a real `npm install` of that tarball in an isolated temporary workspace (its own HOME, npm cache and npm config files, so no machine-level npm state is reused) and runs that persona's CLI commands and contract assertions against the installed binary. The gate consumes only the step's exit status; the receipt is written to the `--out` path (default `tmp/persona-install-qa/latest.json`, Markdown beside it).

What the receipt is, and is not:

- `measurementType` is `automated-contract-checks`. Every persona result is a count of automated checks (`planned`, `executed`, `passed`, `failed`, `skipped`), never a usability rating. The `rating` and `feedback` fields of the earlier `2026-05-23` schema were retired on 2026-09-08 because they read as human ease-of-use judgements while measuring only exit codes; a receipt still carrying them predates that change and its rating must not be quoted as usability evidence. Human first-use measurements are a separate protocol (`docs/HUMAN_FIRST_USE_STUDY.md`).
- Every planned check is registered before anything runs, so a check that could not run is reported `skipped` with its `reason` (for example `package-install has not passed`), and the planned total never shrinks. A required assertion that fails appears as `failed` in the persona summary even when the command that produced its output exited zero; missing or malformed score output is a failed assertion, never an implied pass.
- An install or command that exits non-zero, cannot be spawned, or outlives its deadline (120 s for the install, 60 s per command) is recorded `failed` with `exitCode` (null when there was no exit) and the spawn error in `stderr`; every consumer of that step stays `skipped`.
- Each step's `durationMs` is command wall time measured by the runner; any `elapsedMs` inside a CLI's own JSON output is that CLI's diagnostic and is reported separately, never substituted for it.
- Consumers of the structured receipt: only this script's own Markdown renderer reads the persona result objects; the release gate reads exit status. A future schema change bumps `schemaVersion` and is described here.

### Secret-scan coverage and refusals

The release scanner inspects every accepted regular file, including files larger
than 1 MB and the extracted members of npm tarballs under `artifacts/npm`.
The outer release and its nested npm members share limits of 16 MiB per file,
512 MiB of content, 10,000 filesystem entries and 500 findings. Empty readable
directories can pass; missing roots, unreadable files, symlinks, unsupported
entries, files that change during reading and exhausted limits cannot.

Complete scans retain the existing v1 `PASS`/`FAIL` report with redacted findings.
Incomplete scans throw `SecretScanIncompleteError` with a reason code and path,
without file contents or underlying filesystem error text. The reason codes are
`INPUT_MISSING`, `UNSUPPORTED_INPUT`, `READ_FAILED`, `INPUT_CHANGED`,
`FILE_TOO_LARGE`, `TOTAL_BYTES_EXCEEDED`, `ENTRY_LIMIT_EXCEEDED` and
`FINDING_LIMIT_EXCEEDED`. An incomplete scan does not produce a passing report.
Resolve the reported packaging, access or resource-limit problem before rerunning
qualification; do not replace a refusal with `PASS` or disable detection rules.

For staged bundles, `scanExtractedReleaseForSecrets(rootDir)` inspects the exact
extracted release root, including its nested npm artifacts. This lets verification
scan the same files whose manifest and hashes it checked. A passing scan is a
result for the supported detection rules and inspected artifact, not proof that
every possible credential format is absent.

Release creation cannot skip the scan or rewrite a failing report to PASS.
The signed scan report covers the staged payload; a second mandatory scan checks
the completed staging directory after provenance, manifest and signing metadata
are added, before the archive is created. Verification validates the report schema,
rejects contradictory HIGH findings and independently scans the complete extracted
bundle and its nested npm members. The manifest must be checked with the trusted
release public key when authenticating a publisher.

---

## 2) Migration safety checkpoint

Before cutting a production tag, run the migration checklist in:

- [`docs/MIGRATION_RUNBOOK.md`](./MIGRATION_RUNBOOK.md)

At minimum:
- signed backup created and verified
- restore drill passes in an isolated path
- `amc verify all --json` baseline captured before rollout

---

## 3) Cut release

1. Confirm `package.json` version is final
2. Create and push tag:

```bash
git tag v<version>
git push origin v<version>
```

3. GitHub Actions `Release` workflow runs automatically

---

## 4) Post-release verification

Validate published assets:

- GitHub Release includes:
  - `*.amcrelease`
  - `sbom.cdx.json`
  - `licenses.json`
  - `provenance.json`
  - `release-verify.txt`
- npm package published successfully
- GHCR image published with expected tag

Offline verification:

```bash
amc release verify dist/amc-<version>.amcrelease
```

---

## 5) Rollback runbook (fail-safe)

Trigger rollback if any of the following happen:
- migration fails or produces integrity mismatch
- release verification fails
- production health checks fail repeatedly after deploy

Rollback sequence:

1. Stop new rollout
2. Re-deploy previous known-good image/tag
3. Restore latest verified backup if persistent-state migration was applied
4. Re-run:

```bash
amc verify all --json
amc retention verify
amc backup verify <backup-file>
```

5. Create incident note with:
- failed version
- rollback version
- root-cause hypothesis
- evidence hashes / report links

---

## 6) Release sign-off template

- Release: `vX.Y.Z`
- Operator:
- Migration owner:
- Backup artifact:
- Restore drill result: PASS / FAIL
- Post-release verify result: PASS / FAIL
- Rollback required: YES / NO
- Notes:
