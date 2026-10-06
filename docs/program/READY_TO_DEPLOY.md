# Ready-to-Deploy program contract

This is the in-repo short form of the contract every contributor and agent follows during the Ready-to-Deploy program. The full plan is the private document "AMC Ready-to-Deploy Implementation Plan" (https://claude.ai/code/artifact/153157e0-0d2f-4374-934b-5f6f360a46e1); its Agent contract tab is the long form of this page. Where an issue and this contract disagree, the contract wins unless the issue says otherwise.

## Truth rules

They bind code, docs, changesets and PR text alike.

1. **Never fabricate a result.** No random, canned, hard-coded or synthetic value reaches a score, level, verdict, status or certificate. Examples live only in a labelled example mode that is never attested.
2. **Missing evidence means "not evaluated"**, never a partial result, a pass or a default score. Unknown authority, legal hold, residency route or applicability means deny or "not evaluated".
3. **Every result carries a claim kind**: `synthetic_example`, `self_reported`, `observed` or `independently_reviewed`. Synthetic values, self-answers, keyword matches, unkeyed checksums, empty streams and coincidental event types never give a positive regulated status.
4. **Never print "certified", "compliant" or "certification ready"** outside a registry-issued attestation, which cannot exist before Gate G3. AMC output is evidence of conformity.
5. **A signature proves who wrote a record and that it is unchanged, not that it is true.** An artifact's own embedded key never vouches for it.
6. **Payment never changes a result**, a trust tier or a verification outcome. Verification and export stay free.
7. **Never present scripted, fixture or stub runs as real-model results**, and never drop failed runs or missing usage from a benchmark record.
8. **Agents draft and refute regulatory content but never approve it.** Anything citing law, regulation or a standard stays "experimental" until a named expert signs off.

## Workflow

- **Own clone only.** Work in a fresh clone or worktree, never in a checkout that holds someone else's uncommitted work.
- **Branch and PR.** Branch `rtd/<key>-<slug>` from `origin/main` unless the issue names a landing-slice branch. Rebase before opening the PR. Title it `[<KEY>] <issue title>` and paste the acceptance checklist into the body (the PR template has the block).
- **Landing slices.** Slices of candidate `37c1466b` follow [`landing/RUNBOOK.md`](landing/RUNBOOK.md) and its commit-to-slice map.
- **One issue, one PR**, under about 800 changed lines excluding generated files and fixtures. Split larger work and say so in the issue.
- **Touch scope.** Change only the files the issue names and explain any other file in the PR. Never delete features, files or docs the issue does not ask for.
- **Stalls.** When blocked, write the exact blocker and the key it depends on, then stop; never work around a missing decision. When an issue states a wrong fact, write the evidence (file, line, command output) and propose a corrected scope. New work becomes a proposed follow-up issue, not scope creep.

## Program pause and WIP limits (D-09)

Sid decided D-09 on 2026-10-05: option A. The decision is recorded as a `DECISION:` comment on D-09 in the plan document:

- No new agent-fleet, apply-round or parallel-track programs until Gate G0. Single agents may work plan issues, one per branch.
- At most 3 PRs may be open per epic and at most 10 PRs may await review in total. Review capacity, not coding speed, is the bottleneck.
- An agent-fleet program may start before Gate G0 only with a dated Sid comment `FREEZE EXCEPTION: <program> — <reason>` on the affected issue's heading. This route is separate from the changeset `freeze-exception` line below, which covers CLI command paths and station-pack questions.

## The freeze (until Gate G0)

No new CLI command paths, no new station-pack questions and no new agent-fleet programs. Citation corrections, confirmed drops and named freeze exceptions are allowed.

`npm run check:freeze` (`scripts/check-freeze.mjs`) enforces it in CI. It measures the live CLI command map (`node dist/cli.js commands --json`), the command inventory row count (`scripts/gen-counts.mjs`) and the station packs and their questions (`listIndustryPacks()`), and compares them with `scripts/freeze-baseline.json`:

- A count above the baseline fails. A count below it fails as a stale baseline; regenerate it.
- Regenerate the baseline only with `node scripts/check-freeze.mjs --write-baseline`. Never type counts.
- A PR that raises any baseline count must add this line to a changeset it adds or changes (an HTML comment `<!-- ... -->` around it is allowed):

  ```
  freeze-exception: <KEY> — <reason>
  ```

  The key must already be in `allowedExceptionKeys` of the base branch's baseline. A PR cannot authorize itself: adding a key to `allowedExceptionKeys` needs Sid's approval in its own PR.
- On a pull request the base is `origin/<base branch>`. On a push to `main` it is the commit before the push, so every commit in a multi-commit push is checked; it falls back to `HEAD^1` when that commit is unknown.
- After Gate G0, Sid sets `freezeActive` to `false` or keeps it on; GATE-G0 records the choice.

## Proof and receipts

- Write the regression test first; it fails on `origin/main`, and the PR shows the failing run.
- Add negative fixtures to evidence, trust, scoring and enforcement code: stale, replayed, contradictory, cross-tenant, empty, forged-key and missing-evidence cases must not pass.
- Run a mutation check on security and evidence guards: break the guard, confirm a test fails, restore it, and record both in the PR.
- Commit receipts under `qualification/<YYYY-MM-DD>-<KEY>/` where the issue asks; see [`qualification/README.md`](../../qualification/README.md). `npm run check:qualification` validates them. Never cite `AMC_OS/` paths: that folder is gitignored and unreachable from a clone.
- Never weaken a test to make it pass. Fix a test that encodes wrong behaviour in the same PR and say why.

## Commands before every PR

All of these pass, or the PR shows the same failure on `origin/main`:

```
pnpm install --frozen-lockfile && pnpm run build
npm run typecheck && npm run typecheck:tests && npm run lint
npm test
npm run check:counts            # if counts changed: npm run gen-counts and commit
npm run check:docs-drift
npm run check:architecture-boundaries
npm run check:clean-source
npm run check:freeze
npm run check:qualification
npm run check:packed-install    # when packaging, bin, exports or the bundled runtime change
npm run release:gate            # when the release path, CI, gate or packaging change
```

## Hand these to Sid

Agents never run `npm publish`, `changeset publish`, `docker push`, a real-cluster `helm install`, a deploy command or anything that uses Sid's credentials. They prepare the change, write in the PR exactly what Sid must run, and mark the item blocked on Sid. Agents never contact partners, regulators or standards bodies; they draft the message in the PR or issue. Secrets are never committed or printed, and test keys live in temporary directories.

## Docs, changesets and counts

Every user-visible change gets a changeset worded to the truth rules, and docs that describe changed behaviour are updated. Public counts come from `scripts/gen-counts.mjs`, never typed by hand. Use the claim vocabulary: "evidence of conformity", "observed", "self-reported", "not evaluated" and "enforced at <boundary>".

## Definition of Done

An issue is done when:

- every acceptance criterion is met and checked off in the PR;
- the regression test failed before the change and passes after it, and mutation checks are recorded where the issue asks;
- the `build-test` CI job passes on Node 22 and 24, including the freeze guard and receipt validation, and the other commands above pass where they apply (some run in their own CI jobs, some only locally);
- the receipt folder, if the issue asks for one, is committed and validates;
- docs and the changeset are updated and follow the truth rules;
- the PR is reviewed and merged, and the merged SHA is recorded on the issue.
