# AMC Release Cadence

AMC ships through a weekly release train (P1-41), so the published package stays days, not months, behind the source. The [release runbook](RELEASE_RUNBOOK.md) has the commands and the [release checklist](program/release-checklist.md) the per-release record.

## Weekly train

The train starts with the first release after 2.0.0 (2.0.0 itself ships through P0-39).

- **Tuesday 09:00 UTC:** `npm-publish.yml` opens or refreshes the "Version Packages" pull request from the pending changesets (`node scripts/release-prepare.mjs --version-only`). It also refreshes on every push to `main` and on manual dispatch.
- **Wednesday, release day:** Sid reviews and merges the version pull request, tags the merge commit and approves the `release` environment. A gated release with provenance ships within two working days of the version pull request.
- **Monday 06:00 UTC:** `post-publish-verify.yml` records the weekly distribution figure for the Monday status (P0-41).

Sid confirms the weekday and UTC times; until then these are the defaults in the two workflows ([Needs Sid](PUBLISHING.md#needs-sid-the-weekly-release-train-p1-41)).

A week without pending changesets is skipped: no version pull request opens. Review capacity, not automation, limits the cadence. Skip a week rather than bypass a gate, and fix a red gate forward before releasing; never waive it.

**Single-maintainer scope (D-01 option B):** the cadence is monthly. The version pull request still refreshes every Tuesday; Sid merges and tags it on the first Wednesday of the month.

## What a release may contain

- **Patch:** fixes.
- **Minor:** features and other new behaviour.
- **Major:** only with a Sid decision recorded in the plan, hand-written notes in `docs/releases/<version>.md` and migration steps that cite every breaking changeset. `release:prepare` refuses a breaking release without hand-written notes.
- **Security fixes ship out of band:** the same gates, without waiting for release day. Publish the advisory only after npm serves the fixed version (P0-39 order).

A minor or patch release without hand-written notes gets weekly-train notes: a summary that names no change, the changesets as generated lists, and the verification steps. Edit the summary in the version pull request.

## Per-release gates, in order

1. CI is green on the merged version pull request, which is the commit the tag names. CI checks every `docs/releases/*.md` for banned claim words.
2. `release.yml`'s gate job runs `check-release-candidate.mjs` (P0-34): one CHANGELOG heading, notes present, no pending changesets.
3. The same job runs `check-release-notes.mjs` on the tag's notes. It fails on `certified`, `certification ready`, `compliant`, `guaranteed`, `exactly once`, `10x` or `10×` outside inline code, negated or not.
4. The full release gate runs on the packed tarball; then, after environment approval, the `release` job publishes that tarball with provenance.
5. After every successful Release run, `post-publish-verify.yml` checks npm, the GitHub release and the Studio image from public endpoints and records the distribution figure. Its receipts go to `qualification/<YYYY-MM-DD>-release-<version>/`.

## Side packages (D-12)

The Python SDK `amc-sdk`, the VS Code extension `amc-vscode` and the GitHub Action are held. The PyPI lane is held per D-12: no workflow publishes to PyPI. When D-12 changes, Python and npm versions stay independent, and one tag never serves both.

## User expectation

- Follow the latest minor release; read its notes before upgrading.
- Treat a major release as a migration: its notes list every breaking change and how to move.
- A bad release is deprecated, never unpublished, and `latest` may move back to the last good version ([rollback and deprecation policy](RELEASE_RUNBOOK.md#5-rollback-and-deprecation-policy)).
