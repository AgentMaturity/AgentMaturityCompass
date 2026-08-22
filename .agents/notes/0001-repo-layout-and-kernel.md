---
id: 0001
title: Repo layout, superset scope, and kernel sourcing
status: implemented
date: 2026-08-22
supersedes: []
decides: [OQ-1, OQ-2, OQ-3]
gates: [P0.6]
---

# ADR-0001 — Repo layout, superset scope, and kernel sourcing

Resolves the three open questions in `plans/amc-superharness.md` §10 that gate
Phase 1. P0.6 names this note as **Phase 0's exit gate**.

## OQ-1 — Repo layout: **pnpm monorepo**

AMC converts from a single npm package to a dsh-style pnpm workspace
(`packages/*`, `vendor/*`).

**Why.** Cordis composition, per-package invariant companions, and the
host/client two-face build all assume package boundaries. It is also the only
honest way to shrink `src/cli.ts`, which is 24,696 lines and under a descending
line ratchet that a single-package layout gives it no room to satisfy.

**Cost, stated plainly.** A one-time restructure that moves import paths across
1,775 source files. Mitigation: the strangler discipline in ADR-2 — the existing
`amc` entry keeps working throughout, packages are carved out one at a time, and
the full suite (1,151 files / 8,996 tests) gates every step.

**Rejected.** Single package with an internal `src/plugins/` dir. Less churn, but
per-package invariants and the two-face build get awkward, and `cli.ts` keeps its
gravitational pull.

## OQ-2 — Superset scope: **full parity-plus**

All ten phases, including the React web UI, twin TS/Python SDKs, i18n, and the
single-exe runtime — not the strategic subset.

**Why.** The instruction is a genuine superset of DeepSeek Harness, not a
governance-flavoured subset of it. Product surfaces are part of the bar.

**Consequence.** Phases 6–8 stay on the plan rather than being deferred to
demand. The critical path is unchanged (§8) because those lanes parallelise
after Phase 4; total effort is larger than the critical path.

## OQ-3 — Kernel sourcing: **vendor Cordis, credit upstream**

Vendor the Cordis family into `vendor/`, rescoped `@cordisjs/*` → `@amc/*`,
preferring dsh's already-patched tree (18 hardening patches: fiber lifecycle,
transactional loader, lazy `!!js`, `--dump-config`) over upstream.

**Obligations this creates.**
- `VENDOR_DIVERGENCE.md` recording per-patch provenance
  (upstream-cordis / dsh / AMC-local), per ADR-9.
- `THIRD_PARTY_NOTICES` covering the vendored tree. Cordis and dsh are MIT;
  `native/landlock-run` (Phase 4.4) is **BSD-3-Clause** and carries its own
  attribution obligation.
- Public credit to Cordis/Koishi, as dsh does.

**Rejected.** Depending on published `@cordisjs/*` (currently 3.18.1) — cleaner
provenance, but loses the hardening patches. Also rejected: writing AMC's own
kernel, which re-derives a formally-specified system validated by Koishi's
~4,000-plugin ecosystem.

## Sourcing note — the patched tree is not currently reachable

`plans/amc-superharness.md` P1.1 names
`/Users/sid/Downloads/deepseek-harness-master/vendor/` as the source of truth.
That directory exists with normal permissions but sits outside this session's
sandbox, so it cannot be read from here. Until it is copied into the workspace,
P1.1 cannot use the patched tree, and vendoring from upstream npm would silently
drop the 18 patches this ADR chose to keep. Recorded rather than worked around:
the fallback changes what is vendored, so it is a decision, not a detail.
