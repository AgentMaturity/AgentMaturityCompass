---
id: 0005
title: P1.3 — capability seams, typed events, agent scopes
status: implemented
date: 2026-08-22
gates: [P1.3]
implements: [ADR-0001]
---

# ADR-0005 — P1.3: the seam, event and scope substrate

All three stated verifications hold, each mutation-tested:

| Verification | Where |
|---|---|
| Two-service graph: unloading the provider tears down the consumer | `tests/core/seam.test.ts` |
| Events up / visibility down | same |
| A `ctx.effect` resource is released on unload | same |

## Dispatch mode is a correctness choice, not a style one

Cordis offers four. AMC's event map names which each declared event uses and
why, because picking wrong is a bug:

- `emit` — notification; nothing may veto. Scope lifecycle uses it.
- `bail` — first non-nullish return wins. `amc/guard-action` uses it so **one
  control's denial ends the question**; a unanimous-allow model would let a
  control be silently outvoted, which is the wrong default for enforcement.
- `serial` — all listeners run and must resolve.
- `waterfall` — each transforms the value for the next. `amc/redact-evidence`
  uses it so redaction composes rather than races.

## Events up, visibility down

Cordis gives visibility-down through `isolate()`, but its bus is **global in
both directions** — a listener registered by agent A fires for agent B. In a
product that attributes evidence to an agent, that is not noise, it is
misattribution, and a control that fires for the wrong agent is worse than one
that does not fire.

Scoped events therefore travel as one typed `amc/scoped-dispatch` envelope
carrying its origin. The platform observes every dispatch with a single
listener (up), while `scope.on()` drops anything from a sibling. Platform-wide
events carry a null origin, so a fleet freeze still reaches everyone — a freeze
that misses an agent is not a freeze.

Encoding the event name in a synthesized bus key was the first attempt and is
rejected: it put the entire scoped surface outside the type system.

## The disposal check does less than first written, deliberately

The first version instrumented `ctx.effect` to count acquisitions against
releases. Two things were wrong with it, and the second is the interesting one:

1. It patched the context *instance*, so it only ever saw root-level effects
   and reported every plugin as clean. Patching the prototype does not work
   either — Cordis resolves `effect` through a proxy, so there is no method to
   wrap without reaching into internals.
2. It counted the release *attempt* rather than its success, so a cleanup that
   threw still counted as released — reporting a leaking plugin as clean.

Rather than reach deeper, the check now observes what it can observe reliably:
service withdrawal, plus teardown the plugin reports through a probe. That is
also what the convention asks of a service — to *prove* disposal, not to have
it inferred.

**Stated limit, pinned by a test:** a resource acquired outside `ctx.effect()`
is invisible to this check. A clean report means "everything it tracked was
released", never "it tracked everything". `AmcSeam.track()` is what closes the
gap. A check that appeared to catch untracked resources would be exactly the
false assurance this codebase has spent the last phase removing.

## Not yet done

`Scoped<T>` brands the context but nothing yet consumes the brand — it earns
its keep when P5 folds enforcement onto per-agent scopes and platform APIs must
refuse a scope, or vice versa. The seam definitions here are conventions with
one demonstration provider; real seams (ledger, enforce, budget) arrive with
the subsystems that implement them in P2 and P5.
