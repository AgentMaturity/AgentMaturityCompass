# Release Runbook (Safer Shipping)

This runbook is the operator checklist for publishing AMC safely and repeatably.

Use it for every production release.

---

## Weekly release train (P1-41)

After 2.0.0, releases ship through the weekly train in [RELEASE_CADENCE.md](./RELEASE_CADENCE.md). Each release
copies the [release checklist](./program/release-checklist.md) into its `RELEASED` record.

1. Tuesday: `npm-publish.yml` refreshes the "Version Packages" pull request with the output of
   `node scripts/release-prepare.mjs --version-only` (needs `CHANGESETS_GITHUB_TOKEN`). No pending changesets, no
   pull request: the week is skipped.
2. Review it: the changesets, the version, and `docs/releases/<version>.md` (edit the weekly-train summary by hand).
   CI must be green on it, including the release-notes claim-word check. A breaking release needs hand-written notes
   and a Sid decision first.
3. Release day, Sid (B3 below applies): merge the version pull request, then from a fresh clone tag the merge commit
   and push the tag:

   ```bash
   git fetch origin && git rev-parse origin/main          # the merge commit; confirm CI is green on it
   git tag -a vX.Y.Z <sha> -m "AMC X.Y.Z"
   git push origin vX.Y.Z
   ```

4. Approve the `approve`, `sign` and `release` jobs of that tag's Release run in the `release` environment (section 3).
5. `post-publish-verify.yml` runs when the Release run succeeds (section 4). Copy its artifacts into
   `qualification/<YYYY-MM-DD>-release-<version>/`, then record the published version in
   `website/publication-status.json` through the post-publish pins pull request: `release:prepare` plans the next
   version from it.

---

## Phase B gates (B0–B4)

These steps follow `plans/2026-09-09-amc-execution-brief.md` §6. Phase B starts
only after the Phase A queue is Done and the full release gate is green at a
single pinned commit. **B3 and B4 are owner-confirmation gates.** Nothing past
them runs until Sid has said yes in the conversation, and the yes covers only
the exact version, SHA256 or digest that was shown to him.

### B0 — Blocking security gate

A hard blocker on any public exposure. Record the disposition of every B0 item
in the brief: key-rotation proof, trust-root findings, passphrases and
public-repo hygiene. If there is no in-repo proof that the flagged keys were
rotated, **stop and ask Sid**.

### B1 — Credentials check, up front

```bash
node scripts/credentials-presence-check.mjs                      # every credential; exit 1 if any is absent
node scripts/credentials-presence-check.mjs --for publish,sign-release
node scripts/credentials-presence-check.mjs --for deploy-railway  # or deploy-vercel, push-image
gh secret list --repo AgentMaturity/AgentMaturityCompass          # names only; GitHub never returns values
```

The script reports `present`/`absent` for each name, what needs it and where
it is configured, and never a value. `--json` prints
`{ NAME: { present, requiredFor, configureAt } }`. `NPMRC_AUTH_TOKEN_LINE` is
whether `$HOME/.npmrc` has an `_authToken` line; the line is never printed. It
exits 1 and prints `missing for <action>: <names>` when a required credential
is absent. It reads the shell it runs in. CI secrets live in the repository
settings, so check those with `gh secret list`. **If any credential is absent:
stop, list what is needed and where it goes (the script prints both), and
wait.**

### B2 — Release candidate

```bash
npm run release:prepare -- <version>    # version, notes, CHANGELOG, version files; packs once and gates that tarball; never publishes
git rev-parse HEAD                      # the pinned candidate commit, after committing what release:prepare wrote
pnpm release:gate -- --json --out tmp/release-gate/candidate.json
pnpm release:prepack-check
pnpm check:packed-install               # in a fresh clone of the candidate commit
pnpm check:clean-source                 # in a fresh clone of the candidate commit
pnpm release:verify-version
```

Name every skipped gate check with its reason. Produce the signed artifact and
record its SHA256 (`shasum -a 256 dist/amc-<version>.amcrelease`).

### B3 — Publish — **CONFIRM WITH SID FIRST**

Publishing is pushing the `v<version>` tag (section 3 below). It runs `release.yml`, the only publisher, whose
`release` job then waits for a required reviewer of the `release` environment. `pnpm release` no longer publishes.
**Do not run it until you have shown Sid the version, the artifact SHA256, the gate result, and the B0 disposition, and he has said yes in this conversation.**
Publishing is irreversible and outward-facing. The tag push and the environment approval are both B3 actions.

### B4 — Live deployment — **CONFIRM WITH SID FIRST**

Before deploying:

```bash
docker build -t amc-studio:<version> .
docker image inspect amc-studio:<version> --format '{{.Id}}'   # record; RepoDigests after push
```

- Record the image digests (`Dockerfile`, `docker/docker-compose.yml`,
  `docker/Dockerfile.quickstart`).
- Prove that no default or demo passphrase is present in the deployed
  configuration.
- Have a tested rollback (section 5).
- **Then show Sid the target, the digest, the rollback, and wait for an explicit yes.**

After deploying, the deploy counts as verified only when a governed turn passes
against it:

```bash
node scripts/credentials-presence-check.mjs --for deploy-verify
node scripts/deploy-verify.mjs --target <studio-url> --gateway <gateway-url> \
  --monitor-pubkey <pinned monitor_ed25519.pub> --out tmp/deploy-verify/<version>.json
```

See [`DEPLOYMENT_CONFIRMATION_RUNBOOK.md`](./DEPLOYMENT_CONFIRMATION_RUNBOOK.md) for what this
proves and what it does not. The `railway.json` and `vercel.json` targets serve
only the lightweight scoring API, which cannot pass this check. Live
deployment health has been an explicitly skipped gate in every prior receipt,
so do not report it as previously qualified. Record the live URL, the deployed
commit, the image digest and the verifier result JSON.

---

## 0) Preconditions

- `npm run release:prepare -- <version>` passed and its result is merged to `main`: no pending changesets, one
  CHANGELOG heading for the version, `docs/releases/<version>.md` present (`node scripts/check-release-candidate.mjs`)
- CI green on the exact release commit (frozen pnpm install, build and tests)
- The `release` environment holds `AMC_RELEASE_SIGNING_KEY` and, for token publishing, `NPM_TOKEN` (P0-38); without them
  the release job fails
- The release public key is committed at `trust/amc-release-signing.pub` (P0-37); the job verifies the bundle only
  against it
- Rollback owner on-call and aware of release window

---

## 1) Local release readiness (before tagging)

```bash
pnpm install --frozen-lockfile
pnpm run release:gate -- --json --out tmp/release-gate/candidate.json
pnpm run release:prepack-check
```

The full gate follows CI's test profiles: the correctness suite runs with coverage and a 45-minute process limit, then performance floors run serially without coverage. Both profiles retain separate JSON reports and fail qualification on test failures, missing or invalid reports, or skipped/todo cases. The per-file coverage ratchet includes `src/` and `packages/verifier/src/`; its existing floors still apply. Quick mode records these checks as omitted and cannot establish complete qualification.

CI's `release-gate` job runs the full gate on macOS with Node 24 for pushes and manual dispatches, with a 120-minute job limit and retained receipts. This host executes the actual Darwin confinement tests; the existing Ubuntu Node 22/24 matrix remains separate platform evidence. Its `e2e-playwright` job installs Chromium and runs the full website suite, retaining an HTML report on failure. Coverage reports are retained even when a correctness test fails; a failed process or report still blocks the dependent per-file coverage check.

Live deployment health requires the D-03-approved AMC health URL in the repository variable `AMC_RELEASE_GATE_LIVE_URL`, or an explicit written D-03 skip until P2-06. On 14 October 2026, Sid approved the written skip until P2-06: "live-deploy-health skipped: no supported deployment until D-03 names one". The receipt retains that omission; it does not qualify a deployment. This decision covers only the health check.

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

1. Confirm `package.json` version is final, and that the B3 owner confirmation
   (above) has been given for this exact version
2. Create and push tag:

```bash
git tag -a v<version> <merge commit sha> -m "AMC <version>"
git push origin v<version>
```

3. GitHub Actions `Release` workflow runs automatically, and only for a tag push. Its `approve` job, then its `sign`
   job and then its `release` job each wait in the `release` environment: approve all three only for the version Sid
   confirmed. `approve` refuses to continue when the environment has no required reviewers or no tag rule
   ([environment setup](PUBLISHING.md#needs-sid-the-release-environment-p0-38)). To retry, re-run the tag's jobs;
   a re-run of `sign` or `release` waits for approval again. It publishes only the tarball the `gate` job packed and gated at the
   commit the tag named (`tmp/npm-release/record.json`), and refuses when the tag moved during the run. Without the
   signing key, the committed release public key or an npm credential the job fails; it never skips publishing silently.

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

Offline verification, pinned to the release key committed at the tag (check its fingerprint against the copies
P0-37 publishes outside the repository first). Never verify against a key the bundle carries:

```bash
git show v<version>:trust/amc-release-signing.pub > amc-release-signing.pub
amc release verify amc-<version>.amcrelease --pubkey amc-release-signing.pub
```

Then record the new npm version in `website/publication-status.json` (with the evidence of the check):
`release:prepare` plans the next version from it.

### Post-publish workflow (P1-41)

`post-publish-verify.yml` runs after every successful Release run from a tag push, and on dispatch
(`gh workflow run post-publish-verify.yml -f version=<version>`). It holds `contents: read` only and no secret, and
reads public endpoints only:

- `verify` (`node scripts/check-published-release.mjs <version>`): npm has the version with an integrity and a SLSA
  provenance attestation, dist-tag `latest` is that version, the GitHub release has every asset release.yml attaches,
  and `ghcr.io/agentmaturity/amc-studio:v<version>` resolves for an anonymous client. Compare the digest it records
  with `image-digests.json` on the release.
- `distribution` (`node scripts/distribution-metrics.mjs --write`): one dated row with npm's last-week downloads and
  the cumulative GitHub release asset downloads per release. It also runs every Monday for the weekly status.

Each check is pass, fail or "not measured" (its endpoint could not be read); only all-pass is green, and a figure is
never filled in. Copy the `post-publish-receipt` and `distribution-metrics` artifacts into
`qualification/<YYYY-MM-DD>-release-<version>/`, and add the row to the Monday status. P0-40 adds the install smoke
on clean machines to this workflow.

---

## 5) Rollback and deprecation policy

### A bad npm release (P1-41)

- **Never unpublish** a version people may have installed. npm allows an unpublish only within 72 hours and with no
  dependents, or later under narrower conditions; re-read <https://docs.npmjs.com/policies/unpublish> before relying on
  it. AMC does not use it: an unpublished version breaks every lockfile that names it.
- **Deprecate it** with the reason and the fixed version:
  `npm deprecate agent-maturity-compass@<bad> "<reason>. Upgrade to <fixed>."`
- **Fix forward:** ship the fix as the next patch through the train, out of band when it is a security fix.
- **When the fix needs more than a day,** move `latest` back:
  `npm dist-tag add agent-maturity-compass@<good> latest`, and record it in `website/publication-status.json`.
- **Images:** point the tags back at the previous digest:
  `docker buildx imagetools create -t ghcr.io/agentmaturity/amc-studio:<tag> ghcr.io/agentmaturity/amc-studio@<previous digest>`,
  for `latest` and for the bad version's tag, and record both digests.
- **GitHub release:** add a warning to the top of its notes (`gh release edit v<bad> --notes-file <file>`), naming the
  fixed version.
- **Installers:** pin them back to the last good release through a post-publish pins pull request
  (`website/install-channel.json`, `website/publication-status.json`, `install.sh`, `website/install.sh`,
  `website/install.ps1`).

### A bad deployment

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
amc backup verify <backup-file> --pubkey <recorded-auditor.pub>
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
