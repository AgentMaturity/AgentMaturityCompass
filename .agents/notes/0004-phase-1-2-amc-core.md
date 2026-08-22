---
id: 0004
title: P1.2 — amc-core boot, composition, settings
status: implemented
date: 2026-08-22
gates: [P1.2]
implements: [ADR-0001]
---

# ADR-0004 — P1.2: the composition core

All three stated verifications hold, each mutation-tested:

| Verification | Where |
|---|---|
| `--dump-config` shows the boot tree with provenance | `amc composition [--json]` |
| Changing one entry reconciles only that fiber | `tests/core/reconciliation.test.ts` |
| A PENDING plugin fails loud, naming the service | `tests/core/boot.test.ts` |

## What `amc-core` owns

`boot()` composes the runtime from `amc.cordis.yml` and refuses to return a
half-composed tree. `reload()` re-reads the file and reconciles by entry id.
`SettingsStore` resolves schema → base → user with per-value provenance,
optimistic concurrency and secret redaction.

## Deviations from the plan, and why

**The `packages/*` restructure did not happen wholesale.** ADR-0001 accepted a
one-time move of 1,775 files. Doing it now would mean rewriting every import
path in the repository *before* anything depends on the new layout, for no
behavioural gain and considerable risk. `amc-core` is instead the first package
carved out, which is the strangler discipline ADR-0001 itself describes:
packages get carved one at a time, with the full suite gating each. The
workspace already declares `packages/*`, so no further workspace change is
needed. Recorded because the ADR reads as though the move is atomic; it is not.

**Config file watching is deferred to P1.4.** Include only reads at mount; the
watcher comes from HMR, which is P1.4's subject. `reload()` exposes the
reconciliation semantics now, and P1.4 wires the watcher to call it. The
distinction matters: P1.2's verification is about *id-diff reconciliation*, not
about what triggers it, and the test drives `reload()` directly rather than
racing a filesystem event.

**Settings persistence is deferred.** `SettingsStore` owns resolution and
concurrency; the file format, comment preservation and watcher belong with the
config surface in P1.4. Splitting it this way keeps the rules in one place
rather than reimplemented per writer.

## Four things the vendored kernel taught us

Each cost a debugging cycle and is worth not rediscovering:

1. `export *` does not re-export a default binding. The entry shims built from
   it left `import Loader from "@amc/cordis-plugin-loader"` undefined, and
   Cordis rejected it as `invalid plugin ... received undefined`.
2. Plugin application is deferred — `ctx.loader` is not available on the line
   after `ctx.plugin(Loader)`. Composition happens inside `ctx.inject`.
3. Include mounts asynchronously. Awaiting the inject scope proves only that
   the callback ran; the settled-tree audit observed Include mid-`LOADING` and
   reported a boot that was still happening as one that had failed.
4. Include resolves its path as a URL against `ctx.baseUrl`, and Loader sets
   that on *its own* context, which the Include scope does not inherit. Both
   the base and the specifier need URL form.

Cordis also keeps no instance reference on a fiber, and Include is not a named
service, so `boot()` captures it with a subclass rather than reaching through
guarded context properties.

## Not yet done in P1.2

Profile/patch layering over an empty root, and source-tracked env layers.
`applyEntryPatches` is exported by the vendored Include for exactly this, and
`SettingsStore` already models layering with provenance — the remaining work is
wiring profiles and env into the same resolution, which pairs naturally with
P1.4's watcher.
