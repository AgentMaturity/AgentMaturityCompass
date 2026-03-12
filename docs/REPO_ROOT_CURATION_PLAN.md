# REPO_ROOT_CURATION_PLAN.md — Public repo cleanup plan

## Why this exists
The repo root currently mixes:
- product-facing files
- internal operating files
- generated/stateful files
- experiments/debug scripts
- sales/ops planning artifacts
- local environment artifacts

That makes the project look busier and more confusing than it needs to.

## Honest current constraint
A blind file move would be reckless.
Many files may be referenced by tests, scripts, docs, workflows, or developer routines.

So the safe path is:
1. improve public-facing routing first
2. inventory root files
3. map references
4. move low-risk internal/planning artifacts into curated locations
5. verify build/tests/docs references after each move

## Public-first root goal
A newcomer should be able to spot these surfaces in under 30 seconds:
- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `SPONSORING.md`
- `docs/`
- `examples/`
- `website/`
- `src/`
- `tests/`
- `package.json`

## Likely cleanup candidates (audit first)
- internal identity/ops files
- handoff/continuation files
- local memory/state files
- debug scripts
- generated DB/state artifacts
- sales/ops planning artifacts not intended for external repo face

## Required rule
No file moves should happen without:
- reference search
- build/test verification
- docs/workflow sanity check

## Status
- public routing docs added
- product/pricing/deployment/support docs added
- homepage/README now give a cleaner public entry path
- reference-safe cleanup started:
  - moved low-risk internal docs to `internal/archive/`
  - moved low-risk debug/test one-offs to `internal/debug/`
- deliberately **not** moved yet:
  - memory/persona/bootstrap files that are rooted in operating conventions or referenced by bootstrap flows
  - anything needing broader reference tracing before relocation
