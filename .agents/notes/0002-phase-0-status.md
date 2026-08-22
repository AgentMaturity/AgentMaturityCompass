---
id: 0002
title: Phase 0 status — what landed, what needs Sid
status: implemented
date: 2026-08-22
gates: [P0.1, P0.2, P0.3, P0.4, P0.6]
---

# ADR-0002 — Phase 0 status

| Step | State | Note |
|---|---|---|
| P0.1 ship the release | **prepared, not published** | 1.1.1 → 1.2.0 versioned, 33 changesets consumed, all 12 release-gate checks pass, every version reference consistent. **Publishing needs npm credentials.** |
| P0.2 security follow-up | **done, one item open** | Strays removed; `security-scan-lite` already gates CI; no token-hint findings remain in `claudeCli.ts`. **Open: whether the 2026-02-23 keys were rotated — unanswerable from the repo.** |
| P0.3 repo hygiene | **done** | Strays untracked, `.gitignore` filename bug fixed, debug scratch removed, synthetic testimonials labelled, npm cache moved out of `.amc` (1.3GB → 124MB). `qa/` left in place — extracting it to its own repo is Sid's call, and it neither ships nor builds. |
| P0.4 one source of truth | **done** | `gen-counts` + `--check` in CI. Extended since: `evidence-path-check`, `compliance-artifact-freshness`, `gen-api-ref --check`, `gen-changelog-page --check`. |
| P0.5 vault checkpoint | **not started** | `/Users/sid/Documents/AMC` is outside this sandbox. |
| P0.6 resolve OQ-1 | **done** | ADR-0001. **Phase 0's exit gate is met.** |

## Phase 1 is blocked on a sandbox boundary, not a decision

ADR-0001 chose to vendor dsh's already-patched Cordis tree. P1.1 names
`/Users/sid/Downloads/deepseek-harness-master/vendor/` as the source of truth.
That directory exists with normal permissions but is outside this session's
sandbox: `ls` returns `Operation not permitted`.

Vendoring from upstream npm instead (`@cordisjs/core` is at 3.18.1) would
silently drop the 18 hardening patches — fiber lifecycle, transactional loader,
lazy `!!js`, `--dump-config` — that ADR-0001 chose the dsh tree specifically to
keep. That is a different decision, not a workaround, so it is not being taken
unilaterally.

**To unblock:** copy the tree into the workspace, e.g.

    cp -R /Users/sid/Downloads/deepseek-harness-master/vendor \
          /Users/sid/AgentMaturityCompass/vendor-src

Then P1.1 proceeds: rescope `@cordisjs/*` → `@amc/*`, start
`VENDOR_DIVERGENCE.md` with per-patch provenance, generate
`THIRD_PARTY_NOTICES` (MIT for Cordis/dsh; BSD-3-Clause for `native/landlock-run`
used later in P4.4), and stand up the pnpm workspace.
