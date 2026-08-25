# ADR-0020 — The `.amc` protection, declared but not lowerable

Status: accepted · Date: 2026-08-25 · Follows [ADR-0019](0019-declaration-driven-tool-policy.md)

## The complaint

ADR-0019 left this open: `pathAllowedByPatterns` refused `.amc` through an
unnamed branch inside itself, before any allow or deny list was consulted.
Right outcome, wrong shape. An operator auditing their signed `tools.yaml` was
reading a complete list of the rules they control and an **incomplete list of
the rules in force** — they could not cite it, explain it to a regulator, or
even know to look for it.

## Declared, deliberately not editable

"Declared" here means **named, reasoned and printed**. It does not mean
removable, and the distinction is the whole decision.

These paths hold the vault, the signing keys and the signed policies
themselves. A tool that could reach them could read the auditor key, rewrite
the allowlist governing it, and re-sign it — so a protection an attacker can
delete is a protection that removes itself under exactly the attack it exists
to stop. Every other guarantee in AMC is downstream of this directory.

So it is a **floor**:

- `PROTECTED_WORKSPACE_PATHS` names each glob with the reason it is protected.
- The shipped `tools.yaml` carries the same globs in its deny lists, which is
  what makes them visible where an operator actually reads policy.
- `amc tools list` prints them under "Always denied, whatever the signed config
  says", with the reason, not only the glob.
- Deleting them from a signed config changes nothing.

That last point has its own test: it edits a workspace's config to allow `**`
and deny nothing, **re-signs it**, asserts the protection really is gone from
the file, and then shows `.amc/vault.amcvault` is still refused. A valid
signature over a permissive config does not lower the floor. The config entry
is documentation of the floor, never the floor.

## Two bugs the move surfaced

**A prefix match was refusing directories nobody protected.** The original test
was `resolved.startsWith(amcRoot)`, which also matches `.amcx` and
`.amc-backup`. Containment is now decided with `relative()`, and a test pins
that a sibling sharing a prefix is *allowed* — an over-broad denial is a
smaller harm than an under-broad one, but it is still the policy doing
something nobody asked for.

**And I wrote another rule that could never fire.** My first version carried a
separate clause for the vault FILE, alongside the directory check. `vaultPaths()`
always places the vault at `<workspace>/.amc/vault.amcvault`, so containment had
already caught it — the clause was unreachable.

That is the third time in this line of work that removing dead policy produced
more of it: the argv deny-patterns that only reached one tool name (ADR-0019),
the cwd deny list whose entries could not match (ADR-0019), and now this. The
pattern is consistent enough to name: **a protection written next to a
protection that already covers the case reads as defence in depth and is
actually decoration** — and it is only ever found by mutating it and watching
nothing break.

## Verification

12 tests, 10 mutations, all caught after two survivors were closed. The
survivors were the unreachable vault clause and a badly-written mutation of my
own that broke the file's syntax rather than its behaviour.

The load-bearing ones: consulting the floor *after* the allow list turns it
red, making it config-dependent turns it red, and inverting containment turns
it red.

## Still open

Nothing from this thread. The remaining `git` protection is the cwd allow
pattern documented in ADR-0019, which is enforced and pinned but is a property
of the glob implementation rather than a named policy — the same shape
complaint, one layer down, and worth the same treatment if it ever grows a
second reader.
