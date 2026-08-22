---
id: 0006
title: P1.4 — hot reload and runtime invariants
status: implemented
date: 2026-08-22
gates: [P1.4]
implements: [ADR-0001]
---

# ADR-0006 — P1.4: hot reload and invariants

Phase 1's last step. All three verifications hold, each mutation-tested:

| Verification | Where |
|---|---|
| Editing a plugin hot-reloads it without dropping siblings | `tests/core/hotReload.test.ts` |
| A broken reload leaves the prior good tree | same |
| Invariants fire in dev | `tests/core/invariants.test.ts` |

This is AMC's first fs-watch code — the repository previously had none.

## The finding: composition had to be mounted as a loader *entry*

Boot originally plugged `Include` directly with `ctx.plugin(Include, …)`. It
worked, and hot reload did not — with no error anywhere.

`EntryTree.entries()` recurses into an entry's subtree, but only for entries in
the loader's `store`. A directly-plugged Include is not in that store, so the
walk never reached it. HMR builds its reload map from exactly that walk, so
every plugin in the composition was invisible to it: the file watcher fired,
the module reloaded, `hmr/reload` was emitted — and nothing was re-applied.

A silent no-op is the worst available outcome here. Boot succeeded, the watcher
appeared to work, and the only symptom was that edits did nothing. The
composition is now created through `loader.root.create()` with the Include
registered as a `cordis:` builtin, which puts it in the store where the walk
can find it.

Two smaller things fell out of the same investigation:

- `create()` must be awaited *outside* the inject scope that starts it. It
  resolves only once the entry's fiber activates, which waits on the tree that
  scope belongs to — awaiting in place deadlocks the scope against itself, and
  presents as an anonymous plugin stuck in LOADING.
- The workspace must be **realpathed**. HMR realpaths its watch base before
  comparing a changed file against Node's ESM `loadCache`; a workspace reached
  through a symlink (`/tmp` → `/private/tmp` on macOS) produces module URLs
  that never match, and no plugin ever reloads. Nothing reports that either.

## Watching is opt-in

`boot({ watch })` is off by default. A file watcher in production turns an
accidental write — a deploy touching a file, an editor autosave — into a live
reconfiguration of the controls that are enforcing policy. Development wants
it; a governed runtime should have to ask. Pinned by a test.

This also closes P1.2's deferred item: the composition file is registered with
`hmr.registerConfig`, so editing `amc.cordis.yml` reconciles by entry id.
Verified end to end — disabling one entry disposed exactly that plugin.

## Invariants guard evidence, not liveness

The four companions mirror dsh's, and each guards a property whose violation
produces evidence that *looks valid and is not* — which is the failure this
product cannot have, because a corrupted ledger announces itself while a
plausible one does not:

- **session-enclosure** — a leaked event attributes one agent's behaviour to
  another's maturity score.
- **fifo** — the hash chain stays valid across a reordering; it simply
  describes a sequence that never happened. The chain alone cannot catch this.
- **prompt-reconstruction** — if the recorded parts do not reassemble into what
  was sent, the audit is of a fiction. Compared by digest so the check does not
  itself retain the prompt.
- **approval-pairing** — an unpaired approval is an authorisation with no
  question; a duplicate is a replay. Both are the shape a forged authorisation
  takes.

`ctx.invariants` is a plain context property rather than a Cordis service, on
purpose: invariants must be usable *during* a plugin's setup, before service
resolution has settled, and a service that is not yet resolvable cannot check
the thing going wrong right now.

Default is on outside production, off inside, overridable with
`AMC_INVARIANTS`. That default is a judgement about cost, not a law, so it is
stated here and in the code rather than buried — a governance product silently
disabling its own consistency checks in the environment that matters would be
the same unstated trade-off this codebase has spent its recent history removing.

## Phase 1 is complete

The composition kernel runs, boots fail loud, reconciliation is incremental,
seams and scopes exist, hot reload works, and invariants have a harness.
Phase 2 — the evidence spine — is unblocked.
